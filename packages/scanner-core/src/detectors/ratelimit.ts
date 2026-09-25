/**
 * Safe, bounded rate-limit analysis for authentication endpoints.
 *
 * Never floods: sends at most `probeCount` controlled requests (default 12)
 * over a real HTTP connection, then classifies:
 *  - 429 responses or explicit rate-limit headers -> limiting detected (PASS)
 *  - otherwise -> POTENTIAL weak rate limiting (never a confirmed vuln),
 *    with careful wording: "not observed under the configured test conditions".
 */
import type { Actor, EndpointModel, EvidenceData, Finding, TestRecord } from '@shulker/shared';
import { computeSeverity } from '@shulker/shared';
import { SafeHttpClient } from '../http.ts';
import { joinUrl } from '../http.ts';
import { EvidenceEngine, buildPoc } from '../evidence.ts';

export interface RateLimitResult {
  findings: Finding[];
  tests: TestRecord[];
  evidence: EvidenceData[];
  requestsUsed: number;
}

export class RateLimitDetector {
  private readonly client: SafeHttpClient;
  private readonly evidence: EvidenceEngine;
  constructor(client: SafeHttpClient, evidence: EvidenceEngine) {
    this.client = client;
    this.evidence = evidence;
  }

  async testEndpoint(
    endpoint: EndpointModel,
    actors: Actor[],
    probeCount: number,
  ): Promise<RateLimitResult> {
    const out: RateLimitResult = { findings: [], tests: [], evidence: [], requestsUsed: 0 };
    if (!endpoint.isAuthEndpoint || endpoint.method !== 'POST') return out;
    const n = Math.max(1, Math.min(probeCount, 25));

    let saw429 = false;
    let sawHeaders = false;
    let lastStatus = 0;
    for (let i = 0; i < n; i++) {
      const res = await this.client.request(endpoint.method, endpoint.path, {
        headers: {},
        body: { email: 'shulker-probe@example.com', password: 'shulker-bounded-probe-123' },
      });
      out.requestsUsed += 1;
      lastStatus = res.status;
      if (res.status === 429) {
        saw429 = true;
        break;
      }
      if (/ratelimit|retry-after/i.test(JSON.stringify(res.headers))) sawHeaders = true;
    }

    const limited = saw429 || sawHeaders;
    out.tests.push({
      id: `t_${endpoint.id}_ratelimit_${stamp()}`,
      endpointId: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      detector: 'weak_rate_limiting',
      objective: `Bounded rate-limit probe (${n} controlled requests) against ${endpoint.method} ${endpoint.path}`,
      actor: 'scanner',
      status: limited ? 'pass' : 'fail',
      expected: '429 or rate-limit headers after bounded burst',
      actual: limited ? (saw429 ? `429 observed on request ${out.requestsUsed}` : 'rate-limit headers observed') : `no limiting behavior in ${n} requests (last status ${lastStatus})`,
      request: SafeHttpClient.evidenceRequest(endpoint.method, joinUrl('', endpoint.path), {}, {
        email: 'shulker-probe@example.com',
        password: 'shulker-bounded-probe-123',
      }),
      responseStatus: lastStatus,
      responseSnippet: '',
      durationMs: 0,
      createdAt: new Date().toISOString(),
    });

    if (limited) return out;

    const findingId = `F-RATELIMIT-${endpoint.id}`.replace(/[^A-Za-z0-9-]/g, '-');
    const sev = computeSeverity({ type: 'weak_rate_limiting', confidence: 'medium' });
    const evidence = this.evidence.build({
      findingId,
      testId: `t_${endpoint.id}_ratelimit`,
      endpoint: endpoint.path,
      method: endpoint.method,
      actorLabel: 'scanner',
      pathTemplate: endpoint.path,
      concretePath: endpoint.path,
      headers: {},
      body: { email: 'shulker-probe@example.com', password: 'shulker-bounded-probe-123' },
      response: {
        ok: false,
        status: lastStatus,
        statusText: '',
        headers: {},
        bodyText: '(last bounded probe response)',
        redactedBody: '(last bounded probe response)',
        bodyTruncated: false,
        durationMs: 0,
      },
      expected: '429 Too Many Requests or rate-limit headers under bounded burst',
      actual: `No limiting behavior in ${n} controlled requests (last status ${lastStatus})`,
      reason: 'No 429 response and no rate-limit headers were observed within the configured test budget.',
      confidence: 'medium',
    });
    out.findings.push({
      id: findingId,
      title: `Rate Limiting Not Observed: ${endpoint.method} ${endpoint.path}`,
      type: 'weak_rate_limiting',
      severity: sev.severity,
      confidence: 'medium',
      status: 'potential',
      endpoint: endpoint.path,
      method: endpoint.method,
      description: `Rate limiting was not observed under the configured test conditions (${n} controlled requests to ${endpoint.path}). The endpoint accepted repeated authentication attempts without a 429 or rate-limit headers.`,
      impact: 'Unthrottled authentication endpoints permit brute-force and credential-stuffing attacks against user accounts.',
      expectedBehavior: '429 Too Many Requests or rate-limit headers under bounded burst',
      actualBehavior: `No limiting behavior in ${n} controlled requests (last status ${lastStatus})`,
      evidenceIds: [evidence.id],
      testIds: [`t_${endpoint.id}_ratelimit`],
      poc: buildPoc({
        type: 'weak_rate_limiting',
        baseUrl: this.client['baseUrl'],
        method: endpoint.method,
        concretePath: endpoint.path,
        body: { email: 'shulker-probe@example.com', password: 'shulker-bounded-probe-123' },
        actorLabel: 'scanner',
      }),
      recommendation:
        'Apply server-side rate limiting (per-IP and per-account) to authentication endpoints. Return 429 with Retry-After and consider progressive delays or lockouts.',
      affectedResource: endpoint.resource,
      requestingIdentity: 'unauthenticated probe',
      severityReason: sev.reason,
      createdAt: new Date().toISOString(),
    });
    out.evidence.push(evidence);
    return out;
  }
}

function stamp(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
