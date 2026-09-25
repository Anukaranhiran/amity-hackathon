# Tech Stack

Deliberately minimal: a security tool should be auditable, so every dependency is a decision with a reason.

## Languages & runtime

| Layer | Choice | Why |
|---|---|---|
| Everything | **TypeScript** (~8.7k lines) | One language across engine, backend, UI, CLI — types carry the safety invariants (`Finding` ↔ `TestRecord` coupling) |
| Runtime | **Node.js 20** | Stdlib covers everything the backend needs; runs TS directly via `--experimental-strip-types` — no server build step |

## Monorepo layout (npm workspaces)

```
packages/scanner-core   the engine — no server, no DOM
packages/shared         types, severity, redaction — zero deps, imported by everything
apps/scan-api           Node backend (:8600)
apps/web                React dashboard (:5173)
apps/cli                CI gate
apps/sandbox            ShulkerLab demo target (:8700)
scripts/                dev.sh · e2e.mjs · verify-demo.mjs
```

## Total runtime dependencies: **3**

| Dependency | Package | Why it's justified |
|---|---|---|
| `yaml` | scanner-core | Parse OpenAPI/Swagger YAML contracts |
| `react` | web | Dashboard UI |
| `react-dom` | web | Dashboard rendering |

**The backend is zero-dependency:** `node:http` (router, SSE), `node:sqlite` (`shulker.db` persistence). Rationale: a security tool shouldn't be its own supply-chain attack surface — the entire server is ~1,700 auditable lines of stdlib-only TypeScript. Even the SSE client on the web side is the browser-native `EventSource`.

## Key components & libraries-in-role

| Concern | Implementation | Where |
|---|---|---|
| Scan lifecycle | `ScanEngine` — 7 phases, budget meter, watchdog, cancel | `packages/scanner-core/src/engine.ts` |
| Contract parsing | OpenAPI 3 / Swagger 2 / Postman v2.1 / HAR 1.2 → `ApiSpecModel` | `parser.ts` |
| Network egress | `SafeHttpClient` — scope gate, header hygiene, timeouts, budget | `http.ts` |
| AI hypotheses | Gemini via REST, advisory-only | `ai.ts` |
| OWASP detectors | `bola` · `bfla` · `exposure` · `ratelimit` | `detectors/` |
| Redaction | JWT / key / auth-header / sensitive-field patterns → `[REDACTED]` | `@shulker/shared/redact.ts` |
| Real-time updates | Hand-rolled SSE hub + native `EventSource` | `server.ts` / `api.ts` |
| Persistence | `node:sqlite` — scans, findings, evidence, inventory, settings | `apps/scan-api/src/db.ts` |
| Templates | In-memory OpenAPI 3.0.3 generators for Gemini/OpenAI/GitHub/Stripe | `apps/web/src/templates.ts` |
| Dashboard | React 18 + Vite, 14 pages, dark/light design system | `apps/web/` |
| Reports | HTML / Markdown / JSON renderers (input pre-redacted) | `reports.ts` |

## Verification tooling

| Tool | Role |
|---|---|
| `scripts/e2e.mjs` | 60-check end-to-end suite: real engine vs real HTTP, authorization matrix, redaction greps, report assertions |
| `scripts/verify-demo.mjs` | Headless demo re-verification in ~20s (demo-day fallback) |
| `tsc --noEmit` | Typecheck across all workspaces |
| `vite build` | Web production build |
| `apps/web/scripts/check-css-usage.mjs` | CSS-class/TSX usage guard |

## Build & run

```bash
npm install
npm run dev            # all services: sandbox :8700 · backend :8600 · dashboard :5173
npm run dev:api        # headless
npm run typecheck && npm test && npm run test:e2e   # all three gates
```
