# Shulker — Architecture

## 1. Component map

```
┌───────────────────────── Browser ─────────────────────────┐
│  apps/web (React 18 + Vite, :5173)                        │
│  App.tsx shell · 14 pages · templates.ts (in-mem specs)   │
│  api.ts: typed REST client + native EventSource (SSE)     │
└──────────────┬────────────────────────────▲───────────────┘
               │ REST + SSE                 │ JSON
┌──────────────▼────────────────────────────┴───────────────┐
│  apps/scan-api (Node 20, zero npm deps, :8600)            │
│  server.ts: routes · validateTarget() gate · SSE hub      │
│  db.ts (node:sqlite) · discovery.ts · reports.ts          │
└──────────────┬────────────────────────────▲───────────────┘
               │ ScanEngine(config, hooks)  │ ScanResult (redacted)
┌──────────────▼────────────────────────────┴───────────────┐
│  packages/scanner-core                                    │
│  engine.ts (7 phases) · parser.ts (4 formats)             │
│  resources.ts (ownership model) · ai.ts (Gemini advisory) │
│  http.ts SafeHttpClient ◀── only network egress           │
│  detectors/{bola,bfla,exposure,ratelimit}.ts              │
│  evidence.ts ──▶ redaction via @shulker/shared            │
└──────────────┬────────────────────────────────────────────┘
               │ bounded HTTP
┌──────────────▼────────────────────────────────────────────┐
│  Target API — apps/sandbox (ShulkerLab :8700) in demo,    │
│  or any authorized external HTTPS API                     │
└───────────────────────────────────────────────────────────┘

Consumers of the same engine: apps/cli (stdout + CI exit codes)
Shared everywhere: packages/shared (types, severity, redaction — zero deps)
```

## 2. Request/data flow — one scan

1. **UI → server:** `POST /api/scan` with `{ target, spec | useSandboxSpec, auth{mode,…}, budget, rateLimitProbeCount, aiEnabled, allowExternal, confirmAuthorized }` (or `POST /api/demo` for the sandbox shortcut).
2. **Gate:** `validateTarget()` allows loopback/private always; public hosts require `allowExternal` **and** `confirmAuthorized`. `buildAuthHeaders()` converts auth-mode into real headers (Host/Content-Length injection blocked).
3. **Engine spawn:** server constructs `ScanEngine(config, hooks)`; hooks push events into a per-scan in-memory buffer.
4. **SSE:** `GET /api/scan-events/:id` replays buffered events, then streams live (`text/event-stream`). The UI renders progress, phase timeline, and the event log from this single stream.
5. **Engine phases:** parse → auth (static headers or login flow) → resource model + optional Gemini hypotheses → detector testing → evidence analysis → findings correlation.
6. **Persistence:** `ScanResult` (findings, tests, evidence, endpoints, summary) written to `shulker.db` via node:sqlite — evidence already redacted at capture time.
7. **Artifacts:** dashboard reads `/api/scan/:id`; reports render via `/api/report/:id.html|.md|.json`; the CLI prints the same events to stderr and maps worst severity to its exit code.

## 3. Directory layout

```
hackathon/                        ← repo root (npm workspaces)
├── apps/
│   ├── sandbox/src/    server.ts · openapi.ts · auth.ts · db.ts · config.ts   (ShulkerLab :8700)
│   ├── scan-api/src/   server.ts (898) · db.ts (301) · discovery.ts (343) · reports.ts (227)
│   ├── web/src/        App.tsx · api.ts · ui.tsx · templates.ts (488) · styles.css
│   │                   └── pages/  Overview · NewScan (678) · Findings · FindingDetail ·
│   │                                Endpoints · Evidence · Reports · ScanList ·
│   │                                Inventory · AttackSurface · Coverage ·
│   │                                ResourceGraph · Activity · Settings
│   └── cli/src/        cli.ts (shulker scan --target --openapi --api-key --fail-on)
├── packages/
│   ├── scanner-core/src/  engine.ts (388) · parser.ts (265) · http.ts (131) ·
│   │                      resources.ts (129) · ai.ts (159) · evidence.ts (80) ·
│   │                      detectors/{bola,bfla,exposure,ratelimit}.ts
│   └── shared/src/        types.ts (225) · redact.ts · sensitive.ts · severity.ts (+ tests)
├── scripts/               dev.sh · e2e.mjs (60 checks) · verify-demo.mjs
└── hackathon/             this submission kit (shows/ docs/ diagrams/ …)
```

## 4. Design invariants (never relaxable)

1. **No proof, no finding.** `Finding` requires `TestRecord` + redacted `EvidenceRecord`; Gemini output is advisory-only.
2. **Redact before persistence.** Redaction runs in `evidence.ts` at capture time; secrets never exist in storage, reports, SSE, or the browser.
3. **One network chokepoint.** All egress flows through `SafeHttpClient`: scope validation, header hygiene, per-request timeouts, budget accounting.
4. **Two-key external gate.** Public targets require the Settings toggle AND per-scan authorization; loopback/private always allowed; non-HTTP schemes refused.
5. **Bounded by construction.** Request budget (default 150), 5-minute watchdog, cancel flag checked between phases and inside detector loops, capped rate-limit probes.
6. **Positive controls.** Correctly-protected endpoints yield PASS records — the harness proves itself while it tests.
7. **Same engine everywhere.** Dashboard, REST API, and CLI share `ScanEngine`; findings are identical across surfaces.
