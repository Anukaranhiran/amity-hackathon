/**
 * Shulker backend — scan manager HTTP API.
 *
 * Endpoints:
 *   POST /api/scan          start a scan (spec text or sandbox defaults)
 *   POST /api/scan/:id/cancel
 *   GET  /api/scan/:id/events   SSE live scan events
 *   GET  /api/scans            scan history
 *   GET  /api/scans/:id        full scan result
 *   POST /api/spec/validate   validate an uploaded OpenAPI file
 *   GET  /api/targets         known targets
 *   GET  /api/settings / POST /api/settings
 *   POST /api/reports         generate report for a scan (json|md|html)
 *   GET  /api/reports         list generated reports
 *   POST /api/demo            one-click demo (starts sandbox, configures, scans)
 *   GET  /health
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import {
  ScanEngine,
  parseSpecText,
  InvalidOpenApiError,
  aiStatusNote,
} from '@shulker/scanner-core';
import type { ScanConfig, ScanResult, ScanEvent, ActorConfig } from '@shulker/shared';
import { SEVERITY_ORDER } from '@shulker/shared';
import * as store from './db.ts';
import { writeReport } from './reports.ts';
import { startSandbox, SANDBOX_PORT } from '../../sandbox/src/server.ts';
import { OPENAPI_SPEC } from '../../sandbox/src/openapi.ts';
import {
  detectAndParse, fromManual, validateSourceUrl,
} from './discovery.ts';

const PORT = Number(process.env.PORT || 8600);

// In-memory registry of running scans: id -> engine + event buffer.
interface RunningScan {
  id: string;
  engine: ScanEngine;
  events: ScanEvent[];
  result?: ScanResult;
  done: boolean;
}
const running = new Map<string, RunningScan>();
const sseClients = new Map<string, Set<ServerResponse>>();

const DEFAULT_ACTORS: ActorConfig[] = [
  { key: 'alice', label: 'User A (Alice)', username: 'alice@example.com', password: 'alice-password-1' },
  { key: 'bob', label: 'User B (Bob)', username: 'bob@example.com', password: 'bob-password-2' },
];

// ---------------------------- helpers -------------------------------------

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(text);
}

async function readJsonBody(req: IncomingMessage, limit = 8 * 1024 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('payload too large');
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('invalid JSON body');
  }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Validate that a target URL is a scan-permissible, explicit target.
 *  Local (loopback/private) targets are always allowed. Public targets are
 *  only accepted when the user explicitly enabled external-target mode —
 *  an authorized-testing acknowledgement is required separately. */
export function validateTarget(raw: string, allowExternal = false): { ok: boolean; reason?: string; url?: string; external?: boolean } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'Target must be a valid absolute URL.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'Target protocol must be http or https.' };
  }
  const host = u.hostname;
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
  const isPrivate =
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
  if (!isLoopback && !isPrivate) {
    if (!allowExternal) {
      return {
        ok: false,
        reason: 'Refusing to scan a non-local target. Enable "Allow External Targets" and confirm you are authorized to test this API.',
      };
    }
    return { ok: true, url: u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')), external: true };
  }
  return { ok: true, url: u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')) };
}

/** Build static auth headers from the client-supplied auth config.
 *  Values are sent with every request; redaction still applies to stored
 *  evidence, reports and events. */
export function buildAuthHeaders(auth: unknown): { headers: Record<string, string>; note: string } {
  const headers: Record<string, string> = {};
  const a = (auth ?? {}) as {
    mode?: string;
    apiKeyName?: string;
    apiKeyValue?: string;
    bearerToken?: string;
    basicUser?: string;
    basicPass?: string;
    customHeaders?: Array<{ k?: string; v?: string; key?: string; value?: string }>;
  };
  const mode = a.mode ?? 'none';
  if (mode === 'api-key' && a.apiKeyValue && a.apiKeyValue.trim()) {
    headers[(a.apiKeyName ?? 'x-api-key').trim()] = a.apiKeyValue.trim();
  } else if (mode === 'bearer' && a.bearerToken && a.bearerToken.trim()) {
    headers['authorization'] = `Bearer ${a.bearerToken.trim()}`;
  } else if (mode === 'basic' && a.basicUser && a.basicPass) {
    headers['authorization'] = `Basic ${Buffer.from(`${a.basicUser}:${a.basicPass}`).toString('base64')}`;
  }
  for (const h of Array.isArray(a.customHeaders) ? a.customHeaders : []) {
    const k = String(h?.k ?? h?.key ?? '').trim();
    const v = String(h?.v ?? h?.value ?? '').trim();
    if (k && v && k.toLowerCase() !== 'host' && k.toLowerCase() !== 'content-length') headers[k] = v;
  }
  const note = headers['authorization']
    ? 'static credentials (redacted)'
    : Object.keys(headers).length > 0
      ? 'custom auth headers (redacted)'
      : '';
  return { headers, note };
}

// ---------------------------- scan runner ---------------------------------

export interface StartScanInput {
  target: string;
  specText: string;
  actors?: ActorConfig[];
  budget?: number;
  timeoutMs?: number;
  concurrency?: number;
  aiEnabled?: boolean;
  rateLimitProbeCount?: number;
  title?: string;
  allowExternal?: boolean;
  authHeaders?: Record<string, string>;
}

export function startScan(input: StartScanInput): { id: string } | { error: string } {
  const tv = validateTarget(input.target, input.allowExternal === true);
  if (!tv.ok || !tv.url) return { error: tv.reason ?? 'invalid target' };

  let specModel;
  try {
    specModel = parseSpecText(input.specText);
  } catch (err) {
    if (err instanceof InvalidOpenApiError) return { error: `INVALID_OPENAPI: ${err.message}` };
    return { error: 'INVALID_OPENAPI: specification could not be parsed' };
  }

  const id = `scan_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const config: ScanConfig = {
    target: tv.url,
    spec: input.specText,
    actors: input.actors && input.actors.length > 0 ? input.actors : DEFAULT_ACTORS,
    budget: Math.min(Math.max(input.budget ?? 120, 10), 400),
    timeoutMs: Math.min(Math.max(input.timeoutMs ?? 10_000, 2_000), 30_000),
    concurrency: Math.min(Math.max(input.concurrency ?? 4, 1), 8),
    aiEnabled: input.aiEnabled ?? Boolean(process.env.GEMINI_API_KEY),
    rateLimitProbeCount: Math.min(Math.max(input.rateLimitProbeCount ?? 12, 5), 25),
    authHeaders: input.authHeaders,
    externalTargetsAllowed: input.allowExternal === true,
  };

  const scan: RunningScan = { id, engine: null as unknown as ScanEngine, events: [], done: false };
  running.set(id, scan);
  sseClients.set(id, new Set());

  const engine = new ScanEngine(config, {
    onEvent: (event) => {
      scan.events.push(event);
      const clients = sseClients.get(id);
      if (clients) {
        for (const client of clients) {
          try {
            client.write(`data: ${JSON.stringify(event)}\n\n`);
          } catch { /* client gone */ }
        }
      }
    },
    isCancelled: () => scan.done,
  });
  scan.engine = engine;

  // Persist scan shell immediately.
  store.saveTarget(tv.url, specModel.title);
  store.saveScan({
    id,
    target_url: tv.url,
    title: input.title ?? specModel.title,
    status: 'running',
    phase: 'init',
    ai_status: config.aiEnabled ? 'requested' : 'disabled',
    ai_note: aiStatusNote().note,
    started_at: new Date().toISOString(),
    finished_at: null,
    duration_ms: 0,
    spec_title: specModel.title,
    spec_version: specModel.version,
    error: null,
    config_json: JSON.stringify({ ...config, spec: `<${input.specText.length} chars>` }),
    summary_json: '{}',
    endpoints_json: '[]',
    tests_json: '[]',
    findings_json: '[]',
    evidence_json: '[]',
    events_json: '[]',
  });

  // Run asynchronously; the SSE stream and polling endpoints deliver progress.
  void engine.run().then((result) => {
    scan.result = result;
    scan.done = true;
    store.saveScan({
      id,
      target_url: result.target,
      title: input.title ?? result.title,
      status: result.error ? 'error' : 'complete',
      phase: result.error ? 'error' : 'done',
      ai_status: result.aiStatus,
      ai_note: result.aiNote ?? '',
      started_at: result.startedAt,
      finished_at: result.finishedAt,
      duration_ms: result.summary.durationMs,
      spec_title: result.title,
      spec_version: '',
      error: result.error ?? null,
      config_json: JSON.stringify({ ...config, spec: `<${input.specText.length} chars>` }),
      summary_json: JSON.stringify(result.summary),
      endpoints_json: JSON.stringify(result.endpoints),
      tests_json: JSON.stringify(result.tests),
      findings_json: JSON.stringify(result.findings),
      evidence_json: JSON.stringify(result.evidence),
      events_json: JSON.stringify(scan.events.slice(-500)),
    });
    for (const f of result.findings) {
      store.saveFinding(id, {
        id: f.id, type: f.type, severity: f.severity, status: f.status,
        method: f.method, endpoint: f.endpoint, title: f.title, createdAt: f.createdAt,
      });
    }
  }).catch((err: unknown) => {
    scan.done = true;
    store.updateScanFields(id, { status: 'error', phase: 'error', error: err instanceof Error ? err.message : 'scan crashed' });
  });

  return { id };
}

// ---------------------------- demo mode -----------------------------------

let sandboxServer: Server | undefined;
let sandboxBase = '';

export async function ensureSandbox(): Promise<string> {
  if (sandboxServer && sandboxBase) return sandboxBase;
  const { server, port } = await startSandbox(0);
  sandboxServer = server;
  sandboxBase = `http://127.0.0.1:${port}`;
  return sandboxBase;
}

// ---------------------------- routes --------------------------------------

type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void> | void;

const routes: Array<{ method: string; pattern: RegExp; handler: RouteHandler }> = [];
function route(method: string, pattern: RegExp, handler: RouteHandler): void {
  routes.push({ method, pattern, handler });
}

route('GET', /^\/health$/, (_req, res) => {
  json(res, 200, { status: 'ok', service: 'shulker', gemini: aiStatusNote() });
});

route('POST', /^\/api\/spec\/validate$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const specText = str(body.spec);
    if (!specText) { json(res, 400, { error: 'Provide "spec" (OpenAPI text).' }); return; }
    const model = parseSpecText(specText);
    json(res, 200, {
      valid: true,
      title: model.title,
      version: model.version,
      endpointCount: model.endpoints.length,
      endpoints: model.endpoints.map((e) => ({ method: e.method, path: e.path, auth: e.auth })),
    });
  } catch (err) {
    if (err instanceof InvalidOpenApiError) json(res, 200, { valid: false, error: err.message });
    else json(res, 400, { valid: false, error: err instanceof Error ? err.message : 'invalid request' });
  }
});

route('POST', /^\/api\/scan$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const target = str(body.target);
    let specText = str(body.spec);
    if (body.useSandboxSpec === true || (!specText && body.useSandboxSpec !== false)) {
      specText = JSON.stringify(OPENAPI_SPEC);
    }
    if (!target) { json(res, 400, { error: 'Provide "target" (base URL of the authorized API).' }); return; }
    if (!specText) { json(res, 400, { error: 'Provide "spec" (OpenAPI JSON/YAML text) or set useSandboxSpec=true.' }); return; }
    if (body.confirmAuthorized !== true) {
      json(res, 403, { error: 'Scan refused: set confirmAuthorized=true to confirm you own or are authorized to test this target.' });
      return;
    }
    const actors = Array.isArray(body.actors) ? (body.actors as ActorConfig[]) : undefined;
    const { headers: authHeaders, note: authNote } = buildAuthHeaders(body.auth);
    const out = startScan({
      target,
      specText,
      actors,
      budget: typeof body.budget === 'number' ? body.budget : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      concurrency: typeof body.concurrency === 'number' ? body.concurrency : undefined,
      aiEnabled: typeof body.aiEnabled === 'boolean' ? body.aiEnabled : undefined,
      rateLimitProbeCount: typeof body.rateLimitProbeCount === 'number' ? body.rateLimitProbeCount : undefined,
      title: str(body.title) || undefined,
      allowExternal: body.allowExternal === true,
      authHeaders,
    });
    if ('error' in out) json(res, 400, out);
    else json(res, 202, { ...out, authNote });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'invalid request' });
  }
});

route('POST', /^\/api\/scan\/(?<id>[\w-]+)\/cancel$/, async (req, res, params) => {
  const scan = running.get(params.id!);
  if (scan && !scan.done) {
    scan.engine.cancel();
    json(res, 200, { ok: true, cancelled: params.id });
  } else {
    json(res, 404, { error: 'Scan not found or already finished.' });
  }
});

route('GET', /^\/api\/scan\/(?<id>[\w-]+)\/events$/, async (req, res, params) => {
  const scan = running.get(params.id!);
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
  const send = (payload: unknown): void => {
    try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { /* ignore */ }
  };
  if (!scan) {
    // Replay events from a finished scan in storage.
    const row = store.getScan(params.id!);
    if (row) {
      const events = JSON.parse(row.events_json) as ScanEvent[];
      for (const e of events) send(e);
      send({ seq: -1, scanId: params.id, ts: new Date().toISOString(), phase: 'done', type: 'REPLAY_COMPLETE', message: 'Replayed stored events.' });
    }
    res.end();
    return;
  }
  let cursor = 0;
  const timer = setInterval(() => {
    for (; cursor < scan.events.length; cursor++) send(scan.events[cursor]);
    if (scan.done && cursor >= scan.events.length) {
      send({ seq: -1, scanId: params.id, ts: new Date().toISOString(), phase: 'done', type: 'STREAM_END', message: 'Scan stream complete.' });
      clearInterval(timer);
      res.end();
    }
  }, 150);
  req.on('close', () => {
    clearInterval(timer);
  });
});

route('GET', /^\/api\/scans$/, async (_req, res) => {
  const rows = store.listScans().map((r) => ({
    id: r.id,
    title: r.title,
    target: r.target_url,
    status: r.status,
    phase: r.phase,
    aiStatus: r.ai_status,
    aiNote: r.ai_note,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    error: r.error,
    summary: safeJson(r.summary_json),
  }));
  json(res, 200, rows);
});

route('GET', /^\/api\/scans\/(?<id>[\w-]+)$/, async (_req, res, params) => {
  const scan = running.get(params.id!);
  if (scan?.result) { json(res, 200, scan.result); return; }
  const row = store.getScan(params.id!);
  if (!row) { json(res, 404, { error: 'scan not found' }); return; }
  json(res, 200, {
    id: row.id,
    title: row.title,
    target: row.target_url,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    aiStatus: row.ai_status,
    aiNote: row.ai_note,
    error: row.error,
    summary: safeJson(row.summary_json),
    endpoints: safeJson(row.endpoints_json),
    tests: safeJson(row.tests_json),
    findings: safeJson(row.findings_json),
    evidence: safeJson(row.evidence_json),
  });
});

route('POST', /^\/api\/reports$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const scanId = str(body.scanId);
    const formatRaw = str(body.format, 'md');
    const format = ['json', 'md', 'html'].includes(formatRaw) ? (formatRaw as 'json' | 'md' | 'html') : 'md';
    const scan = running.get(scanId)?.result ?? rowToScanResult(store.getScan(scanId));
    if (!scan) { json(res, 404, { error: 'scan not found or not finished' }); return; }
    const path = writeReport(scan, format);
    const id = `rpt_${Date.now()}_${randomUUID().slice(0, 4)}`;
    store.saveReport(id, scanId, format, path);
    // Include content inline (redacted by the evidence engine already) so the
    // dashboard can View/Download/Copy without any filesystem access.
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(path, 'utf8');
    json(res, 200, { id, path, format, content, findings: scan.summary.confirmed, potential: scan.summary.potential, createdAt: new Date().toISOString() });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : 'report failed' });
  }
});

route('GET', /^\/api\/reports$/, async (_req, res) => {
  json(res, 200, store.listReports());
});

route('GET', /^\/api\/targets$/, async (_req, res) => {
  json(res, 200, store.listTargets());
});

route('GET', /^\/api\/settings$/, async (_req, res) => {
  json(res, 200, {
    ai: { provider: 'gemini', configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash', note: aiStatusNote().note },
    defaults: store.getSettingJson('defaults', { budget: 120, timeoutMs: 10000, concurrency: 4, rateLimitProbeCount: 12 }),
    safety: {
      localTargetsOnly: !store.getSetting('allowExternalTargets'),
      externalTargetsAllowed: Boolean(store.getSetting('allowExternalTargets')),
      authorizationConfirmationRequired: true,
      tokenRedaction: 'always',
    },
  });
});

route('POST', /^\/api\/settings$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    if (body.defaults && typeof body.defaults === 'object') {
      store.setSetting('defaults', JSON.stringify(body.defaults));
    }
    if (typeof body.allowExternalTargets === 'boolean') {
      // The scan request itself must still carry allowExternal=true AND
      // confirmAuthorized=true — this toggle only records the operator choice.
      store.setSetting('allowExternalTargets', body.allowExternalTargets ? '1' : '');
    }
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'invalid settings' });
  }
});

route('POST', /^\/api\/history\/clear$/, async (_req, res) => {
  store.clearHistory();
  json(res, 200, { ok: true });
});

route('POST', /^\/api\/demo$/, async (_req, res) => {
  try {
    const base = await ensureSandbox();
    const out = startScan({
      target: base,
      specText: JSON.stringify(OPENAPI_SPEC),
      title: 'ShulkerLab demo scan',
      aiEnabled: Boolean(process.env.GEMINI_API_KEY),
    });
    if ('error' in out) { json(res, 500, out); return; }
    json(res, 202, { ...out, target: base, sandboxPort: (new URL(base)).port, note: 'Demo scan started against the local ShulkerLab sandbox.' });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : 'demo failed' });
  }
});

route('GET', /^\/api\/sandbox\/spec$/, async (_req, res) => {
  json(res, 200, { spec: OPENAPI_SPEC, note: `ShulkerLab spec — run POST /api/demo or start the sandbox on :${SANDBOX_PORT}` });
});

/* ------------------------- API Discovery & Inventory ------------------------- */

function persistDiscovery(result: ReturnType<typeof detectAndParse>): { id: string; endpointCount: number } {
  const id = `src_${Date.now()}_${randomUUID().slice(0, 6)}`;
  store.addInventorySource({
    id,
    name: result.sourceName,
    kind: result.sourceKind,
    endpointCount: result.endpoints.length,
    meta: { ...result.meta, warnings: result.warnings },
  });
  for (const ep of result.endpoints) {
    store.upsertInventoryEndpoint({ ...ep, sourceId: id });
  }
  return { id, endpointCount: result.endpoints.length };
}

// Import from an uploaded OpenAPI / Postman / HAR file (auto-detected).
route('POST', /^\/api\/inventory\/import$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const text = str(body.content);
    const name = str(body.name, 'uploaded-source');
    if (!text) { json(res, 400, { error: 'Provide "content" (file text).' }); return; }
    const result = detectAndParse(text, name);
    const saved = persistDiscovery(result);
    json(res, 200, {
      id: saved.id,
      source: result.sourceName,
      kind: result.sourceKind,
      endpoints: saved.endpointCount,
      warnings: result.warnings,
    });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'import failed' });
  }
});

// Import from an OpenAPI/Postman/HAR URL. Local URLs always allowed;
// public URLs require the caller to pass allowExternal=true.
route('POST', /^\/api\/inventory\/import-url$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const url = str(body.url);
    const check = validateSourceUrl(url, body.allowExternal === true);
    if (!check.ok) { json(res, 400, { error: check.reason }); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const fetchRes = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!fetchRes.ok) { json(res, 502, { error: `Fetch failed with HTTP ${fetchRes.status}` }); return; }
    const text = await fetchRes.text();
    if (text.length > 8 * 1024 * 1024) { json(res, 413, { error: 'Spec larger than 8MB' }); return; }
    const result = detectAndParse(text, url);
    const saved = persistDiscovery(result);
    json(res, 200, { id: saved.id, source: result.sourceName, kind: result.sourceKind, endpoints: saved.endpointCount, warnings: result.warnings, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    json(res, 400, { error: /abort/i.test(msg) ? 'Spec fetch timed out (10s)' : msg });
  }
});

// Manual endpoint entry.
route('POST', /^\/api\/inventory\/manual$/, async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const name = str(body.name, 'manual-entry');
    const rawList = body.endpoints;
    if (!Array.isArray(rawList) || rawList.length === 0) { json(res, 400, { error: 'Provide "endpoints" array.' }); return; }
    const result = fromManual(rawList as Array<{ method?: string; path?: string; baseUrl?: string; auth?: string; summary?: string }>, name);
    const saved = persistDiscovery(result);
    json(res, 200, { id: saved.id, source: result.sourceName, kind: 'manual', endpoints: saved.endpointCount, warnings: [] });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'manual import failed' });
  }
});

// Inventory listing (sources + merged endpoints).
route('GET', /^\/api\/inventory$/, async (_req, res) => {
  const sources = store.listInventorySources().map((s) => ({
    id: s.id, name: s.name, kind: s.kind, endpointCount: s.endpoint_count,
    meta: safeJson(s.meta_json) ?? {}, createdAt: s.created_at,
  }));
  const endpoints = store.listInventoryEndpoints().map((e) => ({
    id: e.id, sourceId: e.source_id, method: e.method, path: e.path, baseUrl: e.base_url,
    auth: e.auth, resource: e.resource, parentResource: e.parent_resource, idParam: e.id_param,
    tags: safeJson(e.tags_json) ?? [], summary: e.summary, fields: safeJson(e.fields_json) ?? [],
    exampleUrl: e.example_url, via: e.discovered_via, lastSeen: e.last_seen,
  }));
  json(res, 200, { sources, endpoints });
});

route('DELETE', /^\/api\/inventory\/(?<id>[\w-]+)$/, async (_req, res, params) => {
  store.deleteInventorySource(params.id!);
  json(res, 200, { ok: true });
});

/* ------------------------- Intelligence: graph & coverage ------------------------- */

// Resource relationship graph built ONLY from discovered inventory + scan results.
route('GET', /^\/api\/graph$/, async (_req, res) => {
  const endpoints = store.listInventoryEndpoints();
  const scans = store.listScans(10);

  type Node = { id: string; kind: 'actor' | 'resource' | 'collection' | 'endpoint'; label: string; meta?: Record<string, unknown> };
  type Edge = { from: string; to: string; label: string; kind: 'owns' | 'accesses' | 'contains' | 'manages' | 'modifies' };
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIds = new Set<string>();
  const add = (n: Node): string => {
    if (!nodeIds.has(n.id)) { nodeIds.add(n.id); nodes.push(n); }
    return n.id;
  };

  const actor = add({ id: 'actor:user', kind: 'actor', label: 'User (owner)' });
  const admin = add({ id: 'actor:admin', kind: 'actor', label: 'Admin', meta: { privileged: true } });

  // Group endpoints by resource; infer relationships from path shape + methods.
  const byResource = new Map<string, typeof endpoints>();
  for (const e of endpoints) {
    const res = e.resource || 'root';
    if (!byResource.has(res)) byResource.set(res, []);
    byResource.get(res)!.push(e);
  }

  for (const [resource, eps] of byResource) {
    const resId = add({ id: `res:${resource}`, kind: 'resource', label: resource });
    for (const e of eps) {
      const epId = add({ id: `ep:${e.method}:${e.path}`, kind: 'endpoint', label: `${e.method} ${e.path}`, meta: { auth: e.auth, idParam: e.id_param } });
      edges.push({ from: epId, to: resId, label: e.method === 'GET' ? 'reads' : 'modifies', kind: e.method === 'GET' ? 'accesses' : 'modifies' });
      // Detail endpoints with an id param imply ownership link: User -> resource
      if (e.id_param && !/admin/i.test(e.path)) {
        edges.push({ from: actor, to: resId, label: 'owns', kind: 'owns' });
      }
      // Parent chain: /vehicles/{id}/parts -> Vehicle contains Part
      if (e.parent_resource && e.parent_resource !== resource) {
        const parentId = add({ id: `res:${e.parent_resource}`, kind: 'resource', label: e.parent_resource });
        edges.push({ from: parentId, to: resId, label: 'has many', kind: 'contains' });
      }
      if (/admin/i.test(e.path)) {
        edges.push({ from: admin, to: epId, label: 'manages', kind: 'manages' });
      }
    }
  }

  // Overlay actual scan findings onto endpoint nodes.
  const findingByEp = new Map<string, { severity: string; status: string; count: number }>();
  for (const s of scans) {
    const findings = safeJson(s.findings_json) as Array<{ method: string; endpoint: string; severity: string; status: string }> | undefined;
    if (!Array.isArray(findings)) continue;
    for (const f of findings) {
      if (f.status !== 'confirmed' && f.status !== 'potential') continue;
      const key = `ep:${f.method}:${f.endpoint}`;
      const prev = findingByEp.get(key);
      findingByEp.set(key, {
        severity: prev ? worstSeverity(prev.severity, f.severity) : f.severity,
        status: f.status,
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  const testedEpIds = new Set<string>();
  for (const s of scans) {
    const tests = safeJson(s.tests_json) as Array<{ endpointId: string; status: string }> | undefined;
    if (Array.isArray(tests)) for (const t of tests) testedEpIds.add(`ep:${t.endpointId}`);
  }

  json(res, 200, {
    nodes: nodes.map((n) => ({
      ...n,
      finding: findingByEp.get(n.id) ?? null,
      tested: testedEpIds.has(n.id) || n.kind !== 'endpoint',
    })),
    edges,
  });
});

function worstSeverity(a: string, b: string): string {
  const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return (rank[b] ?? 0) > (rank[a] ?? 0) ? b : a;
}

// Coverage report: endpoints discovered vs tested, per-source and per-resource.
route('GET', /^\/api\/coverage$/, async (_req, res) => {
  const endpoints = store.listInventoryEndpoints();
  const scans = store.listScans(20);

  // endpointId in test records is `METHOD /path` from scan-engine models.
  const testedKeys = new Set<string>();
  const failKeys = new Set<string>();
  for (const s of scans) {
    const tests = safeJson(s.tests_json) as Array<{ method: string; path: string; status: string }> | undefined;
    if (!Array.isArray(tests)) continue;
    for (const t of tests) {
      const key = `${t.method} ${t.path}`;
      testedKeys.add(key);
      if (t.status === 'fail') failKeys.add(key);
    }
  }

  const rows = endpoints.map((e) => {
    const key = `${e.method} ${e.path}`;
    const tested = testedKeys.has(key);
    const failed = failKeys.has(key);
    return {
      method: e.method, path: e.path, resource: e.resource, auth: e.auth,
      source: e.discovered_via, tested, failed,
      findings: 0, // filled below
    };
  });
  for (const s of scans) {
    const findings = safeJson(s.findings_json) as Array<{ method: string; endpoint: string; status: string }> | undefined;
    if (!Array.isArray(findings)) continue;
    for (const f of findings) {
      if (f.status !== 'confirmed' && f.status !== 'potential') continue;
      const row = rows.find((r) => `${r.method} ${r.path}` === `${f.method} ${f.endpoint}`);
      if (row) row.findings += 1;
    }
  }

  const byResource = new Map<string, { total: number; tested: number }>();
  for (const r of rows) {
    const b = byResource.get(r.resource || 'root') ?? { total: 0, tested: 0 };
    b.total += 1;
    if (r.tested) b.tested += 1;
    byResource.set(r.resource || 'root', b);
  }
  const testedCount = rows.filter((r) => r.tested).length;
  json(res, 200, {
    totals: {
      discovered: rows.length,
      tested: testedCount,
      coveragePct: rows.length === 0 ? 0 : Math.round((testedCount / rows.length) * 100),
      withFindings: rows.filter((r) => r.findings > 0).length,
      untested: rows.length - testedCount,
    },
    byResource: [...byResource.entries()].map(([resource, v]) => ({
      resource,
      total: v.total,
      tested: v.tested,
      coveragePct: v.total === 0 ? 0 : Math.round((v.tested / v.total) * 100),
    })).sort((a, b) => b.total - a.total),
    endpoints: rows.sort((a) => (a.tested ? 1 : -1)),
    scansCompared: scans.length,
  });
});

// Recent activity feed derived from stored scans (no fake data).
route('GET', /^\/api\/activity$/, async (_req, res) => {
  const scans = store.listScans(10);
  const events: Array<{ ts: string; kind: string; title: string; detail: string }> = [];
  for (const s of scans) {
    const summary = safeJson(s.summary_json) as { confirmed?: number; potential?: number; testsTotal?: number } | undefined;
    events.push({
      ts: s.finished_at ?? s.started_at,
      kind: s.status === 'complete' ? 'scan' : 'error',
      title: s.status === 'complete' ? 'Scan completed' : 'Scan failed',
      detail: `${s.title} — ${summary?.confirmed ?? 0} confirmed, ${summary?.potential ?? 0} potential, ${summary?.testsTotal ?? 0} tests`,
    });
    const findings = safeJson(s.findings_json) as Array<{ method: string; endpoint: string; severity: string; created_at: string }> | undefined;
    if (Array.isArray(findings)) {
      for (const f of findings.slice(0, 4)) {
        events.push({ ts: f.created_at, kind: 'finding', title: `${f.severity.toUpperCase()} finding`, detail: `${f.method} ${f.endpoint}` });
      }
    }
    const reports = store.listReports().filter((r) => r.scan_id === s.id);
    for (const r of reports.slice(0, 3)) {
      events.push({ ts: r.created_at, kind: 'report', title: 'Report generated', detail: `${s.title} — ${r.format.toUpperCase()}` });
    }
  }
  events.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  json(res, 200, events.slice(0, 30));
});

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

function rowToScanResult(row: store.ScanRow | undefined): ScanResult | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    target: row.target_url,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? row.started_at,
    aiStatus: row.ai_status as ScanResult['aiStatus'],
    aiNote: row.ai_note ?? undefined,
    endpoints: safeJson(row.endpoints_json) as ScanResult['endpoints'],
    tests: safeJson(row.tests_json) as ScanResult['tests'],
    findings: safeJson(row.findings_json) as ScanResult['findings'],
    evidence: safeJson(row.evidence_json) as ScanResult['evidence'],
    summary: (safeJson(row.summary_json) as ScanResult['summary']) ?? {
      endpointsDiscovered: 0, endpointsTested: 0, testsTotal: 0, testsPassed: 0, testsFailed: 0,
      testsInconclusive: 0, confirmed: 0, potential: 0, inconclusive: 0, durationMs: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, byType: {},
    },
    error: row.error ?? undefined,
  };
}

export function createScanApiServer(): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      });
      res.end();
      return;
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(path);
      if (m) {
        try {
          await r.handler(req, res, m.groups ?? {});
        } catch (err) {
          if (!res.headersSent) {
            json(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
          }
        }
        return;
      }
    }
    // Serve the built dashboard (apps/web/dist) if present — single-process demo.
    const webDist = join(process.cwd(), 'apps', 'web', 'dist');
    if (req.method === 'GET' && existsSync(webDist)) {
      const rel = path === '/' ? '/index.html' : normalize(path).replace(/^([/\.])+/, '');
      const file = join(webDist, rel);
      if (file.startsWith(webDist) && existsSync(file)) {
        const ext = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
        const body = readFileSync(file);
        res.writeHead(200, { 'content-type': `${ext}; charset=utf-8`, 'content-length': body.length, 'cache-control': 'no-cache' });
        res.end(body);
        return;
      }
      // SPA fallback
      const index = join(webDist, 'index.html');
      if (existsSync(index)) {
        const body = readFileSync(index);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-cache' });
        res.end(body);
        return;
      }
    }
    json(res, 404, { error: 'not found', path });
  });
  return server;
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun || process.env.SHULKER_API_STANDALONE === '1') {
  const envPort = Number(process.env.PORT);
  const listenPort = Number.isFinite(envPort) && envPort > 0 ? envPort : 8600;
  // Bind 0.0.0.0 so cloud platforms and Docker can route traffic.
  const bindHost = process.env.BIND_HOST || '0.0.0.0';
  createScanApiServer().listen(listenPort, bindHost, () => {
    console.log(`[shulker] backend on http://${bindHost}:${listenPort}`);
    console.log(`[shulker] gemini: ${aiStatusNote().note}`);
  });
}
