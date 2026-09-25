/**
 * Excessive data exposure detector.
 *
 * Hybrid approach per the challenge spec:
 *   1. Response schema analysis (documented contract).
 *   2. Sensitive-field heuristics (password/secret/token/ssn/internal...).
 *   3. OpenAPI documentation cross-check.
 *   4. Confidence scoring — HIGH for credential material, MEDIUM for internal
 *      metadata, LOW for generic extras. Potential findings are surfaced as
 *      "potential", never confirmed, unless credential material is exposed.
 */
import type { Actor, EndpointModel, EvidenceData, Finding, TestRecord } from '@shulker/shared';
import { computeSeverity } from '@shulker/shared';
import { classifyField, flattenFields } from '@shulker/shared';
import { SafeHttpClient } from '../http.ts';
import { joinUrl } from '../http.ts';
import { EvidenceEngine, buildPoc } from '../evidence.ts';
import type { EndpointHypothesis } from '../ai.ts';
import { safeJson } from '../resources.ts';

export interface ExposureResult {
  findings: Finding[];
  tests: TestRecord[];
  evidence: EvidenceData[];
}

interface FieldFinding {
  key: string;
  level: 'high' | 'medium' | 'low';
  label: string;
}

export class ExposureDetector {
  private readonly client: SafeHttpClient;
  private readonly evidence: EvidenceEngine;
  constructor(client: SafeHttpClient, evidence: EvidenceEngine) {
    this.client = client;
    this.evidence = evidence;
  }

  async testEndpoint(
    endpoint: EndpointModel,
    actors: Actor[],
    hypothesis?: EndpointHypothesis,
  ): Promise<ExposureResult> {
    const out: ExposureResult = { findings: [], tests: [], evidence: [] };
    if (endpoint.method !== 'GET') return out;
    const actor = actors.find((a) => a.token && a.role !== 'admin') ?? actors.find((a) => a.token);
    if (!actor?.token) return out;

    // Concrete path: substitute the first actor's id for identity path params
    // (/users/me style endpoints need no substitution).
    let concrete = endpoint.path;
    if (endpoint.idParam) {
      const id = pickIdForEndpoint(endpoint, actor);
      if (id === undefined) return out;
      concrete = endpoint.path.replace(`{${endpoint.idParam}}`, String(id));
    }
    const res = await this.client.request(endpoint.method, concrete, {
      headers: { authorization: `Bearer ${actor.token}` },
    });
    if (res.status !== 200) {
      out.tests.push(makeTest(endpoint, actor, concrete, res, 'expected 200 to analyze response body', false));
      return out;
    }
    const parsed = safeJson(res.bodyText);
    if (!parsed || typeof parsed !== 'object') {
      out.tests.push(makeTest(endpoint, actor, concrete, res, 'response body could not be parsed as JSON', true));
      return out;
    }

    const fields = flattenFields(parsed, '', 0, 2);
    const documented = new Set(endpoint.responseProps);
    const hits: FieldFinding[] = [];
    for (const f of fields) {
      const leafKey = f.key.split('.').pop() ?? f.key;
      if (documented.has(leafKey)) continue;
      const hit = classifyField(leafKey);
      if (!hit) continue;
      // Authentication endpoints legitimately return tokens.
      if (endpoint.isAuthEndpoint) continue;
      hits.push(hit);
    }
    out.tests.push(
      makeTest(
        endpoint,
        actor,
        concrete,
        res,
        hits.length > 0 ? `found ${hits.length} undocumented sensitive field(s)` : 'no undocumented sensitive fields',
        hits.length === 0,
      ),
    );
    if (hits.length === 0) return out;

    const worst = hits.reduce((acc, h) => (h.level === 'high' ? 'high' : h.level === 'medium' && acc !== 'high' ? 'medium' : acc), 'low' as 'high' | 'medium' | 'low');
    const sev = computeSeverity({
      type: 'excessive_data_exposure',
      confidence: worst === 'high' ? 'high' : 'medium',
      sensitiveFieldLevel: worst,
    });
    const testId = `t_${endpoint.id}_exposure`;
    const findingId = `F-EXPOSURE-${endpoint.id}`.replace(/[^A-Za-z0-9-]/g, '-');
    const credentialMaterial = worst === 'high';
    const evidence = this.evidence.build({
      findingId,
      testId,
      endpoint: endpoint.path,
      method: endpoint.method,
      actorLabel: actor.label,
      pathTemplate: endpoint.path,
      concretePath: concrete,
      headers: { authorization: `Bearer ${actor.token}` },
      response: res,
      expected: 'Response limited to fields documented in the OpenAPI schema',
      actual: `200 with undocumented sensitive fields: ${hits.map((h) => h.key).join(', ')}`,
      reason: `Response includes field(s) absent from the documented schema and matching sensitive-field heuristics (${hits.map((h) => h.label).join(', ')}).`,
      confidence: credentialMaterial ? 'high' : 'medium',
    });
    const poc = buildPoc({
      type: 'excessive_data_exposure',
      baseUrl: this.client['baseUrl'],
      method: endpoint.method,
      concretePath: concrete,
      actorLabel: actor.label,
    });

    out.findings.push({
      id: findingId,
      title: `Excessive Data Exposure on ${endpoint.method} ${endpoint.path}`,
      type: 'excessive_data_exposure',
      severity: sev.severity,
      confidence: credentialMaterial ? 'high' : 'medium',
      status: credentialMaterial ? 'confirmed' : 'potential',
      endpoint: endpoint.path,
      method: endpoint.method,
      description: `The response includes fields that are not part of the documented API contract and are not needed by clients: ${hits.map((h) => `${h.key} (${h.label})`).join(', ')}.`,
      impact: credentialMaterial
        ? 'Credential material in API responses can be replayed or cracked offline; exposure at this layer frequently leads to account takeover.'
        : 'Internal metadata leaks implementation details that help attackers map the system and plan targeted attacks.',
      expectedBehavior: 'Response limited to fields documented in the OpenAPI schema',
      actualBehavior: `200 with undocumented fields: ${hits.map((h) => h.key).join(', ')}`,
      evidenceIds: [evidence.id],
      testIds: [testId],
      poc,
      recommendation:
        'Map response objects to explicit DTOs that whitelist only fields the client needs. Never serialize raw persistence entities or include credential/internal metadata in API responses.',
      affectedResource: endpoint.resource,
      requestingIdentity: actor.label,
      severityReason: sev.reason,
      createdAt: new Date().toISOString(),
    });
    out.evidence.push(evidence);
    return out;
  }
}

function makeTest(
  endpoint: EndpointModel,
  actor: Actor,
  concrete: string,
  res: SafeResponseLike,
  note: string,
  passed: boolean,
): TestRecord {
  return {
    id: `t_${endpoint.id}_exposure_${Math.random().toString(36).slice(2, 6)}`,
    endpointId: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    detector: 'excessive_data_exposure',
    objective: `Analyze ${endpoint.method} ${concrete} response fields against the documented schema`,
    actor: actor.label,
    status: res.error ? 'error' : passed ? 'pass' : 'fail',
    expected: 'no undocumented sensitive fields',
    actual: res.error ? res.error : note,
    request: SafeHttpClient.evidenceRequest(endpoint.method, joinUrl('', concrete), { authorization: 'Bearer x' }),
    responseStatus: res.status,
    responseSnippet: (res.redactedBody ?? res.bodyText).slice(0, 400),
    durationMs: res.durationMs,
    createdAt: new Date().toISOString(),
  };
}

type SafeResponseLike = {
  status: number;
  bodyText: string;
  redactedBody?: string;
  durationMs: number;
  error?: string;
};

/** Choose a plausible id for identity-path GETs during exposure analysis. */
function pickIdForEndpoint(endpoint: EndpointModel, actor: Actor): number | string | undefined {
  if (/users\/\{/.test(endpoint.path)) return actor.userId ?? 1;
  return 1;
}
