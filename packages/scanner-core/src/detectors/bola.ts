/**
 * Deterministic BOLA (IDOR) detector.
 *
 * Workflow (from the challenge spec):
 *   1. Authenticate actors A and B.
 *   2. Enumerate each actor's owned object IDs (via safe list endpoints).
 *   3. Actor A requests own object  -> expected: allowed (control).
 *   4. Actor A requests B's object  -> expected: denied (401/403/404).
 *   5. Compare. Cross-user success = confirmed BOLA finding.
 * Ownership ground truth comes from the target's own list endpoints, so the
 * scanner never relies on ID guessing.
 */
import type { Actor, EndpointModel, EvidenceData, Finding, TestRecord } from '@shulker/shared';
import { computeSeverity } from '@shulker/shared';
import { SafeHttpClient, type SafeResponse } from '../http.ts';
import { ResourceIndex, collectionOf } from '../resources.ts';
import { joinUrl } from '../http.ts';
import { EvidenceEngine, buildPoc } from '../evidence.ts';
import type { EndpointHypothesis } from '../ai.ts';

export interface BolaResult {
  findings: Finding[];
  tests: TestRecord[];
  evidence: EvidenceData[];
  endpointTested: boolean;
}

const DENIED_STATUSES = new Set([401, 403, 404]);

export class BolaDetector {
  private readonly client: SafeHttpClient;
  private readonly evidence: EvidenceEngine;
  constructor(client: SafeHttpClient, evidence: EvidenceEngine) {
    this.client = client;
    this.evidence = evidence;
  }

  async testEndpoint(
    endpoint: EndpointModel,
    actors: Actor[],
    resources: ResourceIndex,
    hypothesis?: EndpointHypothesis,
  ): Promise<BolaResult> {
    const result: BolaResult = { findings: [], tests: [], evidence: [], endpointTested: false };
    const idParam = endpoint.idParam;
    if (!idParam || endpoint.method !== 'GET') return result;

    // Ownership ground truth comes from the resource index: the collection
    // this detail endpoint belongs to must have been enumerable per actor.
    const collection = collectionOf(endpoint.path);
    const ownerActor = actors.find((a) => a.token && a.role !== 'admin');
    const otherActor = actors.find((a) => a.token && a.role !== 'admin' && a !== ownerActor);
    if (!ownerActor || !otherActor) return result;

    const ownIds = resources.idsForList(ownerActor.userId ?? -1, collection);
    const otherIds = resources.idsForList(otherActor.userId ?? -1, collection);
    if (ownIds.length === 0 || otherIds.length === 0) return result;

    const ownId = ownIds[0]!;
    const crossId = otherIds[0]!;
    result.endpointTested = true;

    // Step 1: control — owner reads own object.
    const ownPath = endpoint.path.replace(`{${idParam}}`, String(ownId));
    const ownRes = await this.client.request(endpoint.method, ownPath, {
      headers: { authorization: `Bearer ${ownerActor.token}` },
    });
    result.tests.push(
      record({
        endpoint,
        detector: 'control',
        objective: `Control: ${ownerActor.label} reads own ${endpoint.resource} (id ${ownId})`,
        actor: ownerActor.label,
        res: ownRes,
        expected: '200 (owner access allowed)',
        passWhen: (s) => s === 200,
      }),
    );

    // Step 2: cross-user probe — owner reads the other user's object.
    const crossPath = endpoint.path.replace(`{${idParam}}`, String(crossId));
    const crossRes = await this.client.request(endpoint.method, crossPath, {
      headers: { authorization: `Bearer ${ownerActor.token}` },
    });
    const crossOk = crossRes.status === 200;
    result.tests.push(
      record({
        endpoint,
        detector: 'bola',
        objective: `Cross-user: ${ownerActor.label} reads ${otherActor.label}'s ${endpoint.resource} (id ${crossId})`,
        actor: ownerActor.label,
        res: crossRes,
        expected: '401/403/404 (cross-user access denied)',
        passWhen: (s) => DENIED_STATUSES.has(s),
        findingId: crossOk ? 'pending' : undefined,
      }),
    );

    if (crossOk) {
      const isCrossUserObject = resources.isOwnedBy(crossId, otherActor.userId ?? -1);
      const { finding, evidence } = makeBolaFinding({
        endpoint,
        ownerActor,
        otherActor,
        ownId,
        crossId,
        crossRes,
        hypothesis,
        client: this.client,
        evidence: this.evidence,
        isCrossUserObject,
      });
      result.findings.push(finding);
      result.evidence.push(evidence);
    }
    return result;
  }
}

interface BolaFindingArgs {
  endpoint: EndpointModel;
  ownerActor: Actor;
  otherActor: Actor;
  ownId: number | string;
  crossId: number | string;
  crossRes: SafeResponse;
  hypothesis?: EndpointHypothesis;
  client: SafeHttpClient;
  evidence: EvidenceEngine;
  isCrossUserObject: boolean;
}

function makeBolaFinding(args: BolaFindingArgs): { finding: Finding; evidence: EvidenceData } {
  const { endpoint, ownerActor, otherActor, crossId, crossRes } = args;
  const testId = `t_${endpoint.id}_bola`;
  const findingId = `F-BOLA-${endpoint.id}-${crossId}`.replace(/[^A-Za-z0-9-]/g, '-');
  const expected = '401/403/404 (cross-user access denied)';
  const actual = `${crossRes.status} ${crossRes.statusText || ''}`.trim();

  const sev = computeSeverity({ type: 'bola', confidence: 'high', crossUser: args.isCrossUserObject });
  const evidence = args.evidence.build({
    findingId,
    testId,
    endpoint: endpoint.path,
    method: endpoint.method,
    actorLabel: ownerActor.label,
    pathTemplate: endpoint.path,
    concretePath: endpoint.path.replace(`{${endpoint.idParam!}}`, String(crossId)),
    headers: { authorization: `Bearer ${ownerActor.token}` },
    response: crossRes,
    expected,
    actual,
    reason: `Response returned the object with id ${crossId} instead of a denial status.`,
    confidence: 'high',
  });

  const poc = buildPoc({
    type: 'bola',
    baseUrl: args.client['baseUrl'],
    method: endpoint.method,
    concretePath: endpoint.path.replace(`{${endpoint.idParam!}}`, String(crossId)),
    actorLabel: ownerActor.label,
  });

  return {
    finding: {
    id: findingId,
    title: `Broken Object-Level Authorization on ${endpoint.method} ${endpoint.path}`,
    type: 'bola',
    severity: sev.severity,
    confidence: 'high',
    status: args.isCrossUserObject ? 'confirmed' : 'potential',
    endpoint: endpoint.path,
    method: endpoint.method,
    param: endpoint.idParam,
    description: args.isCrossUserObject
      ? `${ownerActor.label} was able to retrieve a ${endpoint.resource} (id ${crossId}) owned by ${otherActor.label}. The API verifies the JWT but never checks whether the requesting user owns the requested object.`
      : `${ownerActor.label} could read ${endpoint.resource} id ${crossId}, which could not be attributed to ${ownerActor.label}'s ownership. Manual verification is recommended.`,
    impact:
      'Any authenticated user can enumerate identifiers and read other users\u2019 private records. In production this exposes personal and financial data at scale.',
    expectedBehavior: expected,
    actualBehavior: actual,
    evidenceIds: [evidence.id],
    testIds: [testId],
    poc,
    recommendation:
      'Before returning an object, verify that the authenticated principal owns or is authorized to access it. Enforce the ownership check in the data-access layer (e.g. WHERE owner_id = :currentUser) rather than hiding the object from the UI.',
    affectedResource: endpoint.resource,
    requestingIdentity: `${ownerActor.label} (${ownerActor.username})`,
    resourceOwner: `${otherActor.label} (${otherActor.username})`,
    objectId: String(crossId),
    severityReason: sev.reason,
    createdAt: new Date().toISOString(),
    },
    evidence,
  };
}

function record(opts: {
  endpoint: EndpointModel;
  detector: TestRecord['detector'];
  objective: string;
  actor: string;
  res: SafeResponse;
  expected: string;
  passWhen: (status: number) => boolean;
  findingId?: string;
}): TestRecord {
  const passed = opts.passWhen(opts.res.status);
  return {
    id: `t_${opts.endpoint.id}_${opts.detector}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    endpointId: opts.endpoint.id,
    method: opts.endpoint.method,
    path: opts.endpoint.path,
    detector: opts.detector,
    objective: opts.objective,
    actor: opts.actor,
    status: opts.res.error ? 'error' : passed ? 'pass' : 'fail',
    expected: opts.expected,
    actual: opts.res.error ? `${opts.res.error}` : `${opts.res.status} ${opts.res.statusText}`.trim(),
    request: SafeHttpClient.evidenceRequest(opts.endpoint.method, joinUrl('', opts.endpoint.path), {
      authorization: `Bearer x`,
    }),
    responseStatus: opts.res.status,
    responseSnippet: opts.res.redactedBody.slice(0, 400),
    durationMs: opts.res.durationMs,
    createdAt: new Date().toISOString(),
    findingId: opts.findingId === 'pending' ? undefined : opts.findingId,
  };
}
