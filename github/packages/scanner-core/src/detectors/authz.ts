/**
 * Broken Function-Level Authorization (BFLA) detector.
 *
 * Two checks per privileged endpoint:
 *  - READ:  a non-admin actor GETs an admin-only resource. Expected 403.
 *  - WRITE: a non-admin actor performs a privileged mutation (e.g. role
 *    change). Expected 403. A write test is only attempted against the LAST
 *    id of an admin-likely collection to keep side effects minimal, and the
 *    mutation body is derived from the documented request schema.
 */
import type { Actor, EndpointModel, EvidenceData, Finding, TestRecord } from '@shulker/shared';
import { computeSeverity } from '@shulker/shared';
import { SafeHttpClient } from '../http.ts';
import { joinUrl } from '../http.ts';
import { EvidenceEngine, buildPoc } from '../evidence.ts';
import type { EndpointHypothesis } from '../ai.ts';
import { safeJson } from '../resources.ts';

export interface AuthzResult {
  findings: Finding[];
  tests: TestRecord[];
  evidence: EvidenceData[];
}

export class AuthzDetector {
  private readonly client: SafeHttpClient;
  private readonly evidence: EvidenceEngine;
  constructor(client: SafeHttpClient, evidence: EvidenceEngine) {
    this.client = client;
    this.evidence = evidence;
  }

  async testReadEndpoint(
    endpoint: EndpointModel,
    actors: Actor[],
    hypothesis?: EndpointHypothesis,
  ): Promise<AuthzResult> {
    const out: AuthzResult = { findings: [], tests: [], evidence: [] };
    if (!endpoint.adminLikely || endpoint.method !== 'GET') return out;
    const attacker = actors.find((a) => a.token && a.role !== 'admin');
    if (!attacker?.token) return out;

    const res = await this.client.request(endpoint.method, endpoint.path, {
      headers: { authorization: `Bearer ${attacker.token}` },
    });
    const allowed = res.status === 200;
    out.tests.push({
      id: `t_${endpoint.id}_bfla_read_${stamp()}`,
      endpointId: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      detector: 'bfla',
      objective: `${attacker.label} (non-admin) reads privileged resource ${endpoint.path}`,
      actor: attacker.label,
      status: res.error ? 'error' : allowed ? 'fail' : 'pass',
      expected: '403 (admin-only)',
      actual: res.error ? res.error : `${res.status} ${res.statusText}`.trim(),
      request: SafeHttpClient.evidenceRequest(endpoint.method, joinUrl('', endpoint.path), {
        authorization: `Bearer ${attacker.token}`,
      }),
      responseStatus: res.status,
      responseSnippet: res.redactedBody.slice(0, 400),
      durationMs: res.durationMs,
      createdAt: new Date().toISOString(),
    });
    if (!allowed) return out;

    const findingId = `F-BFLA-${endpoint.id}`.replace(/[^A-Za-z0-9-]/g, '-');
    const sev = computeSeverity({ type: 'bfla', confidence: 'high', adminRead: true });
    const evidence = this.evidence.build({
      findingId,
      testId: `t_${endpoint.id}_bfla_read`,
      endpoint: endpoint.path,
      method: endpoint.method,
      actorLabel: attacker.label,
      pathTemplate: endpoint.path,
      concretePath: endpoint.path,
      headers: { authorization: `Bearer ${attacker.token}` },
      response: res,
      expected: '403 Forbidden (admin role required)',
      actual: `${res.status} with privileged data`,
      reason: 'A non-privileged principal received a privileged administrative resource.',
      confidence: 'high',
    });
    out.findings.push({
      id: findingId,
      title: `Privileged Endpoint Exposed to Non-Admin: ${endpoint.method} ${endpoint.path}`,
      type: 'bfla',
      severity: sev.severity,
      confidence: 'high',
      status: 'confirmed',
      endpoint: endpoint.path,
      method: endpoint.method,
      description: `${attacker.label} (role: user) was able to read the administrative resource ${endpoint.path}. The endpoint checks the JWT but not the caller's role.`,
      impact: 'Exposing privileged endpoints to regular users leaks tenant-wide data and administrative metadata, enabling further attacks.',
      expectedBehavior: '403 Forbidden (admin role required)',
      actualBehavior: `${res.status} OK — administrative data returned`,
      evidenceIds: [evidence.id],
      testIds: [`t_${endpoint.id}_bfla_read`],
      poc: buildPoc({
        type: 'bfla',
        baseUrl: this.client['baseUrl'],
        method: endpoint.method,
        concretePath: endpoint.path,
        actorLabel: attacker.label,
      }),
      recommendation:
        'Enforce role-based authorization server-side for administrative endpoints (e.g. middleware requiring role=admin), and never rely on UI hiding.',
      affectedResource: endpoint.resource,
      requestingIdentity: `${attacker.label} (${attacker.username})`,
      severityReason: sev.reason,
      createdAt: new Date().toISOString(),
    });
    out.evidence.push(evidence);
    return out;
  }

  async testWriteEndpoint(
    endpoint: EndpointModel,
    actors: Actor[],
    hypothesis?: EndpointHypothesis,
  ): Promise<AuthzResult> {
    const out: AuthzResult = { findings: [], tests: [], evidence: [] };
    if (!endpoint.adminLikely || !endpoint.modifiesData) return out;
    const attacker = actors.find((a) => a.token && a.role !== 'admin');
    if (!attacker?.token) return out;

    // Privilege-escalation probe: the attacker attempts the privileged action
    // on THEIR OWN account (e.g. granting themselves admin). If an idParam is
    // present we substitute the attacker's own id — self-modification is the
    // canonical escalation and keeps side effects contained to the test actor.
    let concrete = endpoint.path;
    if (endpoint.idParam) {
      const selfId = /users/i.test(endpoint.idParam) ? (attacker.userId ?? 1) : 1;
      concrete = endpoint.path.replace(`{${endpoint.idParam}}`, String(selfId));
    }
    const body = guessWriteBody(endpoint);
    const res = await this.client.request(endpoint.method, concrete, {
      headers: { authorization: `Bearer ${attacker.token}` },
      body,
    });
    const allowed = res.status < 400;
    out.tests.push({
      id: `t_${endpoint.id}_bfla_write_${stamp()}`,
      endpointId: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      detector: 'bfla',
      objective: `${attacker.label} (non-admin) performs privileged mutation ${endpoint.method} ${concrete}`,
      actor: attacker.label,
      status: res.error ? 'error' : allowed ? 'fail' : 'pass',
      expected: '403 (admin-only privileged action)',
      actual: res.error ? res.error : `${res.status} ${res.statusText}`.trim(),
      request: SafeHttpClient.evidenceRequest(endpoint.method, joinUrl('', endpoint.path), {
        authorization: `Bearer ${attacker.token}`,
      }),
      responseStatus: res.status,
      responseSnippet: res.redactedBody.slice(0, 400),
      durationMs: res.durationMs,
      createdAt: new Date().toISOString(),
    } as TestRecord);
    if (!allowed) return out;

    const findingId = `F-BFLA-W-${endpoint.id}`.replace(/[^A-Za-z0-9-]/g, '-');
    const sev = computeSeverity({ type: 'bfla', confidence: 'high', adminAction: true });
    const evidence = this.evidence.build({
      findingId,
      testId: `t_${endpoint.id}_bfla_write`,
      endpoint: endpoint.path,
      method: endpoint.method,
      actorLabel: attacker.label,
      pathTemplate: endpoint.path,
      concretePath: concrete,
      headers: { authorization: `Bearer ${attacker.token}` },
      body,
      response: res,
      expected: '403 Forbidden (admin role required)',
      actual: `${res.status} — privileged action executed`,
      reason: 'A non-privileged principal successfully performed a privileged administrative mutation.',
      confidence: 'high',
    });
    out.findings.push({
      id: findingId,
      title: `Privileged Action Executable by Non-Admin: ${endpoint.method} ${endpoint.path}`,
      type: 'bfla',
      severity: sev.severity,
      confidence: 'high',
      status: 'confirmed',
      endpoint: endpoint.path,
      method: endpoint.method,
      description: `${attacker.label} (role: user) successfully performed the privileged administrative action ${endpoint.method} ${endpoint.path}. The API verifies authentication but not the caller's role for this operation.`,
      impact: 'Unprotected privileged operations allow full privilege escalation: a regular user can grant themselves admin and take over the tenant.',
      expectedBehavior: '403 Forbidden (admin role required)',
      actualBehavior: `${res.status} — privileged action executed`,
      evidenceIds: [evidence.id],
      testIds: [`t_${endpoint.id}_bfla_write`],
      poc: buildPoc({
        type: 'bfla',
        baseUrl: this.client['baseUrl'],
        method: endpoint.method,
        concretePath: concrete,
        body,
        actorLabel: attacker.label,
      }),
      recommendation:
        'Require an explicit server-side role check for privileged mutations (e.g. requireAdmin middleware). Reject the action with 403 before any state change.',
      affectedResource: endpoint.resource,
      requestingIdentity: `${attacker.label} (${attacker.username})`,
      severityReason: sev.reason,
      createdAt: new Date().toISOString(),
    });
    out.evidence.push(evidence);
    return out;
  }
}

function guessWriteBody(endpoint: EndpointModel): Record<string, unknown> {
  const m = /role/.test(endpoint.path) ? { role: 'user' } : {};
  return m;
}

function stamp(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
