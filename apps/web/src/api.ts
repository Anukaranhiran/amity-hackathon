/** Typed client for the Shulker backend. */

export interface EndpointModel {
  id: string; method: string; path: string; summary: string; description: string;
  tags: string[]; auth: string;
  params: Array<{ name: string; in: string; type: string; required: boolean }>;
  responseProps: string[]; resource?: string; idParam?: string;
  adminLikely: boolean; modifiesData: boolean; isAuthEndpoint: boolean;
}

export interface Finding {
  id: string; title: string; type: string; severity: string; confidence: string; status: string;
  endpoint: string; method: string; param?: string;
  description: string; impact: string; expectedBehavior: string; actualBehavior: string;
  evidenceIds: string[]; testIds?: string[]; poc: { curl: string; http: string };
  recommendation: string; affectedResource?: string;
  requestingIdentity?: string; resourceOwner?: string; objectId?: string;
  severityReason: string; createdAt: string;
}

export interface EvidenceRecord {
  id: string; findingId: string; timestamp: string; endpoint: string; method: string;
  actorLabel: string;
  request: { method: string; url: string; headers: Record<string, string>; body?: string };
  response: { status: number; headers: Record<string, string>; body: string };
  expected: string; actual: string; reason: string; confidence: string; testId: string;
  durationMs: number;
}

export interface TestRecord {
  id: string; endpointId: string; method: string; path: string; detector: string;
  objective: string; actor?: string; status: string; expected?: string; actual?: string;
  request?: { method: string; url: string; headers: Record<string, string>; body?: string };
  responseStatus?: number; responseSnippet?: string; durationMs?: number; createdAt: string;
  findingId?: string;
}

export interface Summary {
  endpointsDiscovered: number; endpointsTested: number; testsTotal: number; testsPassed: number;
  testsFailed: number; testsInconclusive: number; confirmed: number; potential: number;
  inconclusive: number; durationMs: number;
  bySeverity: Record<string, number>; byType: Record<string, number>;
}

export interface ScanResult {
  id?: string; title: string; target: string; startedAt: string; finishedAt: string;
  aiStatus: string; aiNote?: string;
  endpoints: EndpointModel[]; tests: TestRecord[]; findings: Finding[];
  evidence: EvidenceRecord[]; summary: Summary; error?: string;
}

export interface ScanListItem {
  id: string; title: string; target: string; status: string; phase: string;
  aiStatus: string; aiNote?: string; startedAt: string; finishedAt?: string;
  durationMs: number; error?: string; summary?: Summary;
}

export interface ScanEvent {
  seq: number; scanId: string; ts: string; phase: string; type: string; message: string;
  data?: unknown;
}

export interface Settings {
  ai: { provider: string; configured: boolean; model: string; note: string };
  defaults: { budget: number; timeoutMs: number; concurrency: number; rateLimitProbeCount: number };
  safety: {
    localTargetsOnly: boolean;
    externalTargetsAllowed: boolean;
    authorizationConfirmationRequired: boolean;
    tokenRedaction: string;
  };
}

export interface ScanAuthConfig {
  mode: 'none' | 'api-key' | 'bearer' | 'basic';
  apiKeyName?: string;
  apiKeyValue?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  customHeaders?: Array<{ k: string; v: string }>;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => req<{ status: string; gemini: { configured: boolean; note: string } }>('/health'),
  settings: () => req<Settings>('/api/settings'),
  saveSettings: (defaults: Settings['defaults'], allowExternalTargets?: boolean) =>
    req<{ ok: boolean }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ defaults, ...(allowExternalTargets !== undefined ? { allowExternalTargets } : {}) }),
    }),
  scans: () => req<ScanListItem[]>('/api/scans'),
  scan: (id: string) => req<ScanResult>(`/api/scans/${id}`),
  startScan: (payload: {
    target: string; spec: string; confirmAuthorized: boolean;
    budget: number; timeoutMs?: number; rateLimitProbeCount: number; aiEnabled: boolean;
    useSandboxSpec?: boolean;
    allowExternal?: boolean;
    auth?: ScanAuthConfig;
  }) => req<{ id: string; authNote?: string }>('/api/scan', { method: 'POST', body: JSON.stringify(payload) }),
  cancelScan: (id: string) => req<{ ok: boolean }>(`/api/scan/${id}/cancel`, { method: 'POST' }),
  demo: () => req<{ id: string; target: string; note: string }>('/api/demo', { method: 'POST' }),
  validateSpec: (spec: string) =>
    req<{ valid: boolean; error?: string; title?: string; endpointCount?: number; endpoints?: Array<{ method: string; path: string; auth: string }> }>(
      '/api/spec/validate',
      { method: 'POST', body: JSON.stringify({ spec }) },
    ),
  report: (scanId: string, format: 'json' | 'md' | 'html') =>
    req<{ id: string; path: string; format: string; content?: string; findings?: number; potential?: number; createdAt?: string }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ scanId, format }),
    }),
  reports: () => req<Array<{ id: string; scan_id: string; format: string; path: string; created_at: string }>>('/api/reports'),
  clearHistory: () => req<{ ok: boolean }>('/api/history/clear', { method: 'POST' }),
  /* ---- API Discovery & Intelligence ---- */
  inventoryImport: (content: string, name: string) =>
    req<{ id: string; source: string; kind: string; endpoints: number; warnings: string[] }>('/api/inventory/import', {
      method: 'POST', body: JSON.stringify({ content, name }),
    }),
  inventoryImportUrl: (url: string, allowExternal = false) =>
    req<{ id: string; source: string; kind: string; endpoints: number; warnings: string[]; url: string }>('/api/inventory/import-url', {
      method: 'POST', body: JSON.stringify({ url, allowExternal }),
    }),
  inventoryManual: (name: string, endpoints: Array<{ method: string; path: string; baseUrl?: string; auth?: string; summary?: string }>) =>
    req<{ id: string; source: string; endpoints: number }>('/api/inventory/manual', {
      method: 'POST', body: JSON.stringify({ name, endpoints }),
    }),
  inventory: () => req<InventoryResponse>('/api/inventory'),
  inventoryDelete: (id: string) => req<{ ok: boolean }>(`/api/inventory/${id}`, { method: 'DELETE' }),
  graph: () => req<GraphResponse>('/api/graph'),
  coverage: () => req<CoverageResponse>('/api/coverage'),
  activity: () => req<ActivityEvent[]>('/api/activity'),
};

export interface InventoryEndpointItem {
  id: string; sourceId: string; method: string; path: string; baseUrl: string;
  auth: string; resource: string; parentResource: string; idParam: string | null;
  tags: string[]; summary: string; fields: string[]; exampleUrl: string;
  via: string; lastSeen: string;
}

export interface InventorySourceItem {
  id: string; name: string; kind: string; endpointCount: number;
  meta: Record<string, unknown>; createdAt: string;
}

export interface InventoryResponse {
  sources: InventorySourceItem[];
  endpoints: InventoryEndpointItem[];
}

export interface GraphNode {
  id: string; kind: 'actor' | 'resource' | 'collection' | 'endpoint'; label: string;
  meta?: Record<string, unknown>;
  finding: { severity: string; status: string; count: number } | null;
  tested: boolean;
}

export interface GraphEdge {
  from: string; to: string; label: string;
  kind: 'owns' | 'accesses' | 'contains' | 'manages' | 'modifies';
}

export interface GraphResponse { nodes: GraphNode[]; edges: GraphEdge[] }

export interface CoverageResponse {
  totals: { discovered: number; tested: number; coveragePct: number; withFindings: number; untested: number };
  byResource: Array<{ resource: string; total: number; tested: number; coveragePct: number }>;
  endpoints: Array<{ method: string; path: string; resource: string; auth: string; source: string; tested: boolean; failed: boolean; findings: number }>;
  scansCompared: number;
}

export interface ActivityEvent {
  ts: string; kind: string; title: string; detail: string;
}

/** Subscribe to live scan events over SSE. Returns a close function. */
export function subscribeScanEvents(
  scanId: string,
  onEvent: (e: ScanEvent) => void,
  onDone: () => void,
): () => void {
  const es = new EventSource(`/api/scan/${scanId}/events`);
  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as ScanEvent;
      if (event.type === 'STREAM_END' || event.type === 'REPLAY_COMPLETE') {
        onDone();
        es.close();
        return;
      }
      onEvent(event);
    } catch { /* ignore malformed */ }
  };
  es.onerror = () => {
    // Backend closes the stream when done; treat error as end.
    onDone();
    es.close();
  };
  return () => es.close();
}
