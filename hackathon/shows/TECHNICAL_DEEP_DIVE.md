# Technical Deep Dive — Shulker

Companion to `docs/ARCHITECTURE.md`. This document goes one level lower: the scan lifecycle as executed code, and the four safety-critical components.

---

## 1. Architecture in one paragraph

npm-workspaces monorepo. `packages/shared` (zero deps) holds types, severity, and the redaction engine — everything imports it, so safety primitives are impossible to bypass by accident. `packages/scanner-core` is the engine: parser, HTTP client, resource model, AI bridge, four detectors, evidence store. Three apps consume it: `apps/scan-api` (zero-dep Node server: routes, SSE, sqlite, reports), `apps/web` (React 18 + Vite dashboard), `apps/cli` (CI gate). `apps/sandbox` is ShulkerLab, the deliberately vulnerable demo target. The server runs TypeScript directly via `node --experimental-strip-types` — no build step; only the web app is bundled.

```
Browser (apps/web)                Server (apps/scan-api)              Scanner (packages/scanner-core)
──────────────────                ──────────────────────              ───────────────────────────────
NewScan wizard ──POST /api/scan──▶ validateTarget() gate
  templates.ts (in-mem spec)       buildAuthHeaders()
Overview/Findings ◀──SSE──────────  ScanEngine(config, hooks) ──────▶  run(): 7 phases
  event log, timeline              sqlite ◀── redacted results         parse→auth→resources→
Reports ◀──/api/report/:id.fmt───  reports.ts (HTML/MD/JSON)           hypotheses→testing→
CLI: shulker scan ──────────────────────────────────────────────────▶  analysis→findings
```

## 2. Scan lifecycle (what `ScanEngine.run()` actually does)

Located in `packages/scanner-core/src/engine.ts` (388 lines). Phases in order, each emitting typed events through `EngineHooks.onEvent` (fanned to SSE by the server, stderr by the CLI):

1. **parse** — `parseSpecText(config.spec)` → `ApiSpecModel`. Contract failure short-circuits with `INVALID_OPENAPI`; `endpointsDiscovered` set.
2. **auth** — if `config.authHeaders` provided (API key / bearer / basic / custom), a *static-credentials actor* is used; otherwise `authenticate(spec)` exercises the API's login flow to obtain tokens for each configured actor. Emits `AUTH_OK` / fallback notes.
3. **hypotheses** — resource model built in `resources.ts` (collections, id-params, ownership mapping). If Gemini is configured, `ai.ts` returns ranked focus areas. Hypotheses are *advisory*: they reorder and enrich testing, never create findings.
4. **testing** — detectors run in sequence, all sharing one `SafeHttpClient` and the budget meter:
   - `bola.ts` — replay Alice's object requests with Bob's token and unauthenticated;
   - `bfla.ts` — call privileged-looking endpoints as the low-privilege actor (runs positive controls too);
   - `exposure.ts` — diff observed response fields vs documented schema, flag sensitive names;
   - `ratelimit.ts` — capped burst on auth-sensitive endpoints, look for 429/Retry-After.
5. **analysis** — `evidence.ts` attaches redacted request/response pairs to candidate findings; severity computed via `@shulker/shared/severity.ts`.
6. **findings** — correlation, dedup, summary roll-up (`bySeverity`, `byType`).
7. **done** — `finish()` returns `ScanResult`; server persists to sqlite and emits `SCAN_DONE`.

**Runtime guarantees:** every request increments a budget counter (`config.budget`, default 150); a 5-minute watchdog timer flips `cancelled`; `cancelledNow()` is checked between phases and inside detector loops so cancel is responsive; per-request timeouts come from `SafeHttpClient`.

## 3. Deterministic verification (the no-hallucination rule)

The rule is structural, not procedural:

- `ai.ts` output type is a *hypothesis list* — endpoint IDs, risk notes, suggested order. There is no code path from hypothesis to `Finding`.
- `Finding` construction requires a matching `TestRecord` (expected vs actual HTTP behavior). `TestRecord` creation requires a real `SafeHttpClient` exchange.
- Detectors encode OWASP definitions as test predicates: BOLA = 200 on another identity's object; BFLA = success on a privileged operation from a low-privilege actor; Exposure = sensitive field present but undocumented; RateLimit = no throttling under a bounded burst.
- Positive controls are mandatory: correctly-protected endpoints produce PASS records (visible in the UI), which both validates the harness and prevents the scanner from only ever reporting failure.
- Unprovable negatives are labeled honestly: missing rate limiting is `status: "potential"`, never "confirmed".

Consequence: an LLM outage, a bad API key, or a hallucinated hypothesis can degrade *coverage* — never *correctness*.

## 4. Redaction engine (`packages/shared/src/redact.ts`)

- **Where it runs:** at capture time inside `evidence.ts`, *before* any record reaches the sqlite store, the SSE stream, reports, or the browser. Not a display-layer filter — the stored bytes are already redacted.
- **What it catches:** JWT-shaped strings (`eyJ…`), `sk-…`-style keys, values of `Authorization` / `x-api-key` / cookie headers, and any JSON field whose name matches `sensitive.ts` (password, token, secret, ssn, api_key, …). Replaced by `[REDACTED]`.
- **Why it's in `shared`:** the CLI, server, and engine all import the same package, so there is exactly one implementation and no "forgot to redact on this path" class of bug.
- **Verification:** the e2e suite launches a demo scan with a known bearer token, then greps every artifact — scan result, evidence bodies, HTML/MD/JSON reports, and the raw SSE transcript — asserting the original value appears nowhere.

## 5. SafeHttpClient (`packages/scanner-core/src/http.ts`)

The single network chokepoint — detectors never call `fetch` themselves.

- **Scope enforcement:** loopback/private targets always allowed; public hosts require `externalTargetsAllowed` on the config. Non-HTTP(S) schemes refused outright.
- **Header hygiene:** `Host` and `Content-Length` cannot be injected through user-supplied headers (blocked explicitly) — prevents request-smuggling-style abuse of the scanner.
- **Static credentials:** `defaultHeaders` are attached to *every* request (engine, resource discovery, all detectors) — this is how API-key/bearer/basic scanning works without a login flow.
- **Bounds:** per-request timeout from config; every call increments the engine's budget counter; redirects and body sizes are constrained to keep evidence bounded.
- **Testability:** the client is injectable, which is how the 60-check e2e runs the *real* engine against a *real* HTTP server (ShulkerLab) without mocks.

---

**Quick numbers:** server routes ~898 lines · engine 388 · parser 265 · discovery 343 · web app ~2.9k TSX across 19 files · deps: `yaml` (engine), `react`/`react-dom` (web) — everything else is Node stdlib.
