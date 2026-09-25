export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'high' | 'medium' | 'low';
export type FindingType =
  | 'bola'
  | 'excessive_data_exposure'
  | 'bfla'
  | 'weak_rate_limiting';
export type FindingStatus =
  | 'confirmed'
  | 'potential'
  | 'inconclusive'
  | 'open'
  | 'false_positive'
  | 'fixed';
export type TestStatus = 'pass' | 'fail' | 'inconclusive' | 'error' | 'skipped';

export interface ActorConfig {
  key: string;
  label: string;
  username: string;
  password: string;
  registerIfMissing?: boolean;
}

export interface Actor extends ActorConfig {
  token?: string;
  userId?: number;
  role?: string;
  error?: string;
}

export interface ParamModel {
  name: string;
  in: string;
  type: string;
  required: boolean;
}

export interface EndpointModel {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  auth: 'bearer' | 'none' | 'other';
  params: ParamModel[];
  requestSchemaRef?: string;
  responseProps: string[];
  resource?: string;
  idParam?: string;
  adminLikely: boolean;
  modifiesData: boolean;
  isAuthEndpoint: boolean;
}

export interface ApiSpecModel {
  title: string;
  version: string;
  serverUrl?: string;
  endpoints: EndpointModel[];
}

export interface RedactedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface EvidenceData {
  id: string;
  findingId: string;
  timestamp: string;
  endpoint: string;
  method: string;
  actorLabel: string;
  request: RedactedRequest;
  response: { status: number; headers: Record<string, string>; body: string };
  expected: string;
  actual: string;
  reason: string;
  confidence: Confidence;
  testId: string;
  durationMs: number;
}

export interface Poc {
  curl: string;
  http: string;
}

export interface Finding {
  id: string;
  title: string;
  type: FindingType;
  severity: Severity;
  confidence: Confidence;
  status: FindingStatus;
  endpoint: string;
  method: string;
  param?: string;
  description: string;
  impact: string;
  expectedBehavior: string;
  actualBehavior: string;
  evidenceIds: string[];
  testIds?: string[];
  poc: Poc;
  recommendation: string;
  affectedResource?: string;
  requestingIdentity?: string;
  resourceOwner?: string;
  objectId?: string;
  severityReason: string;
  createdAt: string;
}

export interface TestRecord {
  id: string;
  endpointId: string;
  method: string;
  path: string;
  detector: FindingType | 'control';
  objective: string;
  actor?: string;
  status: TestStatus;
  expected?: string;
  actual?: string;
  request?: RedactedRequest;
  responseStatus?: number;
  responseSnippet?: string;
  durationMs?: number;
  createdAt: string;
  findingId?: string;
}

export type ScanPhase =
  | 'init'
  | 'parse'
  | 'auth'
  | 'hypotheses'
  | 'testing'
  | 'analysis'
  | 'findings'
  | 'report'
  | 'done'
  | 'cancelled'
  | 'error';

export interface ScanEvent {
  seq: number;
  scanId: string;
  ts: string;
  phase: ScanPhase;
  type: string;
  message: string;
  data?: unknown;
}

export interface ScanSummary {
  endpointsDiscovered: number;
  endpointsTested: number;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  testsInconclusive: number;
  confirmed: number;
  potential: number;
  inconclusive: number;
  durationMs: number;
  bySeverity: Record<Severity, number>;
  byType: Record<string, number>;
}

export interface ScanResult {
  id?: string;
  title: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  aiStatus: 'ok' | 'unavailable' | 'disabled';
  aiNote?: string;
  endpoints: EndpointModel[];
  tests: TestRecord[];
  findings: Finding[];
  evidence: EvidenceData[];
  summary: ScanSummary;
  error?: string;
}

export interface ScanConfig {
  target: string;
  spec: string;
  actors: ActorConfig[];
  budget: number;
  timeoutMs: number;
  concurrency: number;
  aiEnabled: boolean;
  rateLimitProbeCount: number;
  /** Static auth headers (API key / bearer / basic / custom) sent with EVERY request.
   *  Used when the target does not expose a login endpoint (typical external APIs). */
  authHeaders?: Record<string, string>;
  /** True when the user enabled scanning of public/external targets. */
  externalTargetsAllowed?: boolean;
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function emptySummary(): ScanSummary {
  return {
    endpointsDiscovered: 0,
    endpointsTested: 0,
    testsTotal: 0,
    testsPassed: 0,
    testsFailed: 0,
    testsInconclusive: 0,
    confirmed: 0,
    potential: 0,
    inconclusive: 0,
    durationMs: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    byType: {},
  };
}
