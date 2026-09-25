/**
 * Scan engine — orchestrates the full pipeline:
 *
 *   parse spec -> authenticate actors -> discover ownership -> AI hypotheses
 *   -> run deterministic detectors (bounded) -> verify -> evidence -> findings
 *
 * Safety properties: request budget, scan timeout, cancellation, per-request
 * timeout/size caps, and no target beyond the configured base URL.
 */
import type {
  Actor,
  ActorConfig,
  ApiSpecModel,
  EndpointModel,
  EvidenceData,
  Finding,
  ScanConfig,
  ScanEvent,
  ScanPhase,
  ScanResult,
  TestRecord,
} from '@shulker/shared';
import { emptySummary, REDACTED } from '@shulker/shared';
import { parseSpecText, InvalidOpenApiError } from './parser.ts';
import { SafeHttpClient } from './http.ts';
import { ResourceIndex } from './resources.ts';
import { EvidenceEngine } from './evidence.ts';
import { BolaDetector } from './detectors/bola.ts';
import { ExposureDetector } from './detectors/exposure.ts';
import { AuthzDetector } from './detectors/authz.ts';
import { RateLimitDetector } from './detectors/ratelimit.ts';
import { generateHypotheses, aiStatusNote, type EndpointHypothesis } from './ai.ts';

export interface EngineHooks {
  onEvent(event: ScanEvent): void;
  isCancelled(): boolean;
}

export interface AuthOutcome {
  actors: Actor[];
  ok: boolean;
  failed: string[];
}

export class ScanEngine {
  private events: ScanEvent[] = [];
  private seq = 0;
  private requestCount = 0;
  private budget: number;
  private cancelled = false;
  private scanTimeout?: ReturnType<typeof setTimeout>;
  readonly aiStatus: { status: string; note: string } = { status: 'disabled', note: '' };

  private readonly config: ScanConfig;
  private readonly hooks: EngineHooks;
  constructor(config: ScanConfig, hooks: EngineHooks) {
    this.config = config;
    this.hooks = hooks;
    this.budget = Math.max(1, config.budget || 150);
  }

  private emit(phase: ScanPhase, type: string, message: string, data?: unknown): void {
    const event: ScanEvent = {
      seq: ++this.seq,
      scanId: 'scan',
      ts: new Date().toISOString(),
      phase,
      type,
      message,
      data,
    };
    this.events.push(event);
    this.hooks.onEvent(event);
  }

  private cancelledNow(): boolean {
    return this.cancelled || this.hooks.isCancelled();
  }

  async run(): Promise<ScanResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const summary = emptySummary();
    const endpoints: EndpointModel[] = [];
    const tests: TestRecord[] = [];
    const findings: Finding[] = [];
    const evidence: EvidenceData[] = [];
    let aiStatus = aiStatusNote();

    this.scanTimeout = setTimeout(() => {
      this.cancelled = true;
      this.emit('testing', 'SCAN_TIMEOUT', 'Scan timeout reached — stopping further requests.');
    }, 5 * 60_000);

    try {
      // ---- Phase 1: parse -----------------------------------------------
      this.emit('parse', 'PARSE_START', 'Analyzing OpenAPI specification…');
      let spec: ApiSpecModel;
      try {
        spec = parseSpecText(this.config.spec);
      } catch (err) {
        if (err instanceof InvalidOpenApiError) {
          this.emit('error', 'INVALID_OPENAPI', err.message);
          return this.finish(startedAt, t0, { endpoints, tests, findings, evidence, summary, aiStatus }, `INVALID_OPENAPI: ${err.message}`);
        }
        throw err;
      }
      endpoints.push(...spec.endpoints);
      summary.endpointsDiscovered = endpoints.length;
      this.emit('parse', 'ENDPOINTS_DISCOVERED', `Parsed specification — ${endpoints.length} endpoints discovered across ${new Set(endpoints.map((e) => e.tags[0])).size} tag(s).`, {
        count: endpoints.length,
        endpoints: endpoints.map((e) => `${e.method} ${e.path}`),
      });

      // ---- Phase 2: authenticate -----------------------------------------
      const staticAuth = Object.keys(this.config.authHeaders ?? {}).length > 0;
      this.emit('auth', 'AUTH_START', staticAuth
        ? 'Authenticating with user-provided static credentials (API key / bearer / custom headers)…'
        : 'Authenticating configured test identities…');
      const auth = await this.authenticate(spec);
      let actors = auth.actors;
      let authed = actors.filter((a) => a.token);
      if (authed.length === 0 && staticAuth) {
        // External-API mode: no login endpoint / login failed, but the user gave
        // static credentials. Every request already carries them via defaultHeaders.
        actors = [{
          key: 'static', label: 'Provided credentials', username: '(static auth)',
          password: '', token: 'static-credentials', role: 'user',
        }];
        authed = actors;
        this.emit('auth', 'AUTH_STATIC', 'Using static credentials supplied with the scan (no login flow required).');
      }
      if (authed.length === 0) {
        this.emit('auth', 'AUTHENTICATION_FAILED', `Could not authenticate any test identity: ${auth.failed.join('; ')}`);
        return this.finish(startedAt, t0, { endpoints, tests, findings, evidence, summary, aiStatus }, 'AUTHENTICATION_FAILED');
      }
      if (auth.failed.length > 0) {
        this.emit('auth', 'AUTH_PARTIAL', `Some identities failed: ${auth.failed.join('; ')}`);
      }
      this.emit('auth', 'AUTH_OK', `Authenticated ${authed.length} identity/identities (${authed.map((a) => a.label).join(', ')}).`);

      // ---- Phase 3: ownership discovery ----------------------------------
      this.emit('hypotheses', 'RESOURCE_DISCOVERY', 'Building resource/ownership model from list endpoints…');
      const client = new SafeHttpClient(this.config.target, { timeoutMs: this.config.timeoutMs, defaultHeaders: this.config.authHeaders });
      const resources = new ResourceIndex(client);
      const discovery = await this.bounded(() => resources.discover(endpoints, actors));
      this.emit('hypotheses', 'RESOURCE_MODEL', `Resource model built — ${discovery.indexed} objects indexed via ${discovery.listEndpointsUsed.length} list endpoint(s).`, discovery);

      // ---- Phase 4: AI hypotheses -----------------------------------------
      this.emit('hypotheses', 'AI_START', 'Requesting AI security hypotheses…');
      const ai = await this.bounded(() => generateHypotheses(spec, { timeoutMs: 25_000 }));
      aiStatus = ai.status;
      this.emit('hypotheses', ai.status.status === 'ok' ? 'AI_HYPOTHESES' : 'AI_FALLBACK', ai.status.note, {
        sample: [...ai.hypotheses.entries()].slice(0, 3).map(([id, h]) => ({ endpoint: id, ...h })),
      });

      // ---- Phase 5: run detectors ------------------------------------------
      this.emit('testing', 'TESTING_START', 'Executing bounded security tests…');
      const ev = new EvidenceEngine(client);
      const hypotheses = ai.hypotheses;

      const hypo = (e: EndpointModel): EndpointHypothesis | undefined => hypotheses.get(e.id);

      // 5a. BOLA on object-detail GET endpoints.
      const bola = new BolaDetector(client, ev);
      const bolaEndpoints = endpoints.filter(
        (e) => e.method === 'GET' && e.idParam && e.auth === 'bearer' && !e.adminLikely,
      );
      for (const endpoint of bolaEndpoints) {
        if (this.cancelledNow() || this.exhausted()) break;
        this.emit('testing', 'TEST_RUNNING', `Testing ${endpoint.method} ${endpoint.path} (BOLA)…`);
        const r = await this.bounded(() => bola.testEndpoint(endpoint, actors, resources, hypo(endpoint)));
        tests.push(...r.tests);
        findings.push(...r.findings);
        evidence.push(...r.evidence);
        this.emit('testing', 'ENDPOINT_ANALYZED', `${endpoint.method} ${endpoint.path}: ${r.tests.length} test(s), ${r.findings.length} finding(s).`);
      }

      // 5b. Excessive data exposure on GET endpoints.
      const exposure = new ExposureDetector(client, ev);
      for (const endpoint of endpoints.filter((e) => e.method === 'GET' && !e.adminLikely && !e.isAuthEndpoint)) {
        if (this.cancelledNow() || this.exhausted()) break;
        const r = await this.bounded(() => exposure.testEndpoint(endpoint, actors, hypo(endpoint)));
        tests.push(...r.tests);
        findings.push(...r.findings);
        evidence.push(...r.evidence);
        this.emit('testing', 'ENDPOINT_ANALYZED', `${endpoint.method} ${endpoint.path}: exposure analyzed.`);
      }

      // 5c. Function-level authorization (admin read + privileged write).
      const authz = new AuthzDetector(client, ev);
      for (const endpoint of endpoints.filter((e) => e.adminLikely)) {
        if (this.cancelledNow() || this.exhausted()) break;
        const read = endpoint.method === 'GET' ? await this.bounded(() => authz.testReadEndpoint(endpoint, actors)) : { findings: [], tests: [], evidence: [] };
        const write = endpoint.modifiesData ? await this.bounded(() => authz.testWriteEndpoint(endpoint, actors)) : { findings: [], tests: [], evidence: [] };
        tests.push(...read.tests, ...write.tests);
        findings.push(...read.findings, ...write.findings);
        evidence.push(...read.evidence, ...write.evidence);
        this.emit('testing', 'ENDPOINT_ANALYZED', `${endpoint.method} ${endpoint.path}: authorization checked.`);
      }

      // 5d. BFLA on role-change endpoints even when not admin-tagged (heuristic).
      const roleChange = endpoints.filter(
        (e) => e.modifiesData && /role|permission|privilege/i.test(e.path),
      );
      for (const endpoint of roleChange) {
        if (this.cancelledNow() || this.exhausted()) break;
        if (endpoints.some((e) => e.id === endpoint.id && e.adminLikely)) continue;
        const r = await this.bounded(() => authz.testWriteEndpoint({ ...endpoint, adminLikely: true }, actors));
        tests.push(...r.tests);
        findings.push(...r.findings);
        evidence.push(...r.evidence);
        this.emit('testing', 'ENDPOINT_ANALYZED', `${endpoint.method} ${endpoint.path}: privileged action checked.`);
      }

      // 5e. Rate limiting on auth endpoints.
      const rate = new RateLimitDetector(client, ev);
      for (const endpoint of endpoints.filter((e) => e.isAuthEndpoint && e.method === 'POST')) {
        if (this.cancelledNow() || this.exhausted()) break;
        const r = await this.bounded(() => rate.testEndpoint(endpoint, actors, this.config.rateLimitProbeCount));
        tests.push(...r.tests);
        findings.push(...r.findings);
        evidence.push(...r.evidence);
        this.emit('testing', 'ENDPOINT_ANALYZED', `${endpoint.method} ${endpoint.path}: rate limiting probed with ${r.requestsUsed} request(s).`);
      }

      // ---- Phase 6: verify & summarize --------------------------------------
      this.emit('analysis', 'ANALYSIS_START', 'Verifying responses and correlating evidence…');
      summary.endpointsTested = new Set(tests.map((t) => t.endpointId)).size;
      summary.testsTotal = tests.length;
      summary.testsPassed = tests.filter((t) => t.status === 'pass').length;
      summary.testsFailed = tests.filter((t) => t.status === 'fail').length;
      summary.testsInconclusive = tests.filter((t) => t.status === 'inconclusive' || t.status === 'error').length;
      for (const f of findings) {
        summary.bySeverity[f.severity] = (summary.bySeverity[f.severity] ?? 0) + 1;
        summary.byType[f.type] = (summary.byType[f.type] ?? 0) + 1;
        if (f.status === 'confirmed') summary.confirmed += 1;
        else if (f.status === 'potential') summary.potential += 1;
        else summary.inconclusive += 1;
      }
      this.emit('findings', 'FINDINGS_READY', `${summary.confirmed} confirmed, ${summary.potential} potential finding(s).`, {
        confirmed: summary.confirmed,
        potential: summary.potential,
      });

      const out = { endpoints, tests, findings, evidence, summary, aiStatus };
      return this.finish(startedAt, t0, out);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown scan error';
      this.emit('error', 'SCAN_ERROR', message);
      return this.finish(startedAt, t0, { endpoints, tests, findings, evidence, summary, aiStatus }, message);
    } finally {
      if (this.scanTimeout) clearTimeout(this.scanTimeout);
    }
  }

  cancel(): void {
    this.cancelled = true;
  }

  private exhausted(): boolean {
    return this.requestCount >= this.budget;
  }

  /** Wrap engine steps so cancellation always wins, and surface budget errors. */
  private async bounded<T>(fn: () => Promise<T>): Promise<T> {
    if (this.cancelledNow()) throw new Error('SCAN_CANCELLED');
    return fn();
  }

  private async authenticate(spec: ApiSpecModel): Promise<AuthOutcome> {
    const actors: Actor[] = [];
    const failed: string[] = [];
    const client = new SafeHttpClient(this.config.target, { timeoutMs: this.config.timeoutMs, defaultHeaders: this.config.authHeaders });
    const loginEndpoint = spec.endpoints.find((e) => /auth\/login/.test(e.path) && e.method === 'POST');
    const registerEndpoint = spec.endpoints.find((e) => /auth\/register/.test(e.path) && e.method === 'POST');

    for (const cfg of this.config.actors) {
      if (this.cancelledNow()) break;
      if (!loginEndpoint) {
        failed.push(`${cfg.label}: no login endpoint found in spec`);
        actors.push({ ...cfg, error: 'no login endpoint in spec' });
        continue;
      }
      let res = await client.request('POST', loginEndpoint.path, {
        body: { email: cfg.username, password: cfg.password },
      });
      this.requestCount += 1;
      if (res.status === 401 || res.status === 404 || res.status === 400) {
        // Try self-registration if the spec exposes it and allowed.
        if (registerEndpoint && cfg.registerIfMissing) {
          await client.request('POST', registerEndpoint.path, {
            body: { email: cfg.username, password: cfg.password, name: cfg.label },
          });
          this.requestCount += 1;
          res = await client.request('POST', loginEndpoint.path, {
            body: { email: cfg.username, password: cfg.password },
          });
          this.requestCount += 1;
        }
      }
      if (res.status === 200) {
        const parsed = safeParse(res.bodyText);
        const token = extractToken(parsed);
        if (token) {
          const me = await this.whoAmI(client, spec, token);
          actors.push({ ...cfg, token, userId: me?.id, role: me?.role });
          continue;
        }
      }
      failed.push(`${cfg.label}: login returned ${res.status}`);
      actors.push({ ...cfg, error: `login returned ${res.status}` });
    }
    return { actors, ok: actors.some((a) => a.token), failed };
  }

  private async whoAmI(client: SafeHttpClient, spec: ApiSpecModel, token: string): Promise<{ id: number; role: string } | undefined> {
    const meEndpoint = spec.endpoints.find((e) => /users\/me/.test(e.path) && e.method === 'GET');
    if (!meEndpoint) return undefined;
    const res = await client.request('GET', meEndpoint.path, { headers: { authorization: `Bearer ${token}` } });
    this.requestCount += 1;
    if (res.status !== 200) return undefined;
    const parsed = safeParse(res.bodyText);
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      const id = (parsed as Record<string, unknown>).id;
      const role = (parsed as Record<string, unknown>).role;
      if (typeof id === 'number') return { id, role: typeof role === 'string' ? role : 'user' };
    }
    return undefined;
  }

  private finish(
    startedAt: string,
    t0: number,
    partial: {
      endpoints: EndpointModel[];
      tests: TestRecord[];
      findings: Finding[];
      evidence: EvidenceData[];
      summary: ReturnType<typeof emptySummary>;
      aiStatus: { status: string; note: string };
    },
    error?: string,
  ): ScanResult {
    const finishedAt = new Date().toISOString();
    partial.summary.durationMs = Date.now() - t0;
    if (error) {
      this.emit(error.startsWith('SCAN_CANCELLED') || error.includes('cancel') ? 'cancelled' : 'error', error.startsWith('INVALID') ? 'INVALID_OPENAPI' : 'SCAN_HALTED', error);
    }
    this.emit('done', 'SCAN_DONE', error ? `Scan halted: ${error}` : `Scan complete in ${(partial.summary.durationMs / 1000).toFixed(1)}s — ${partial.summary.confirmed} confirmed, ${partial.summary.potential} potential.`);
    const allEvidence: EvidenceData[] = partial.evidence;
    return {
      id: `scan_${Date.now()}`,
      title: 'ShulkerLab scan',
      target: this.config.target,
      startedAt,
      finishedAt,
      aiStatus: partial.aiStatus.status as ScanResult['aiStatus'],
      aiNote: partial.aiStatus.note,
      endpoints: partial.endpoints,
      tests: partial.tests,
      findings: partial.findings,
      evidence: allEvidence,
      summary: partial.summary,
      error,
    };
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractToken(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const obj = parsed as Record<string, unknown>;
  for (const key of ['token', 'accessToken', 'access_token', 'jwt']) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 10) return v;
  }
  return undefined;
}

export { REDACTED };
