# Shulker — Architecture

**AI-assisted, zero-trust API vulnerability scanner** — monorepo layout, scan pipeline, and request flow.

- **GitHub Repository:** https://github.com/Anukaranhiran/amity-hackathon
- **Stack:** TypeScript monorepo (npm workspaces) · Node ≥ 20.10 · React 18 + Vite · SQLite (`node:sqlite`) · zero-dependency backend

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  🖥️  Dashboard — apps/web (React 18 + Vite, :5173)                  │
│  Overview · NewScan wizard · Findings · Evidence · Reports          │
│  Inventory · Attack Surface · Coverage · Resource Graph · Settings  │
│  api.ts (typed REST + SSE EventSource) · templates.ts (1-click specs)│
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST + SSE
┌──────────────────────────────▼──────────────────────────────────────┐
│  ⚙️  Scanner Backend — apps/scan-api (Node 20, ZERO npm deps, :8600)│
│  server.ts (routes · consent gate) · SSE hub · reports.ts           │
│  discovery.ts (OpenAPI/Postman/HAR import) · db.ts (node:sqlite)    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ in-process
┌──────────────────────────────▼──────────────────────────────────────┐
│  🔎 Scan Engine — packages/scanner-core                             │
│  engine.ts (7-phase lifecycle · budget · watchdog · cancel)         │
│  parser.ts (OpenAPI 3/Swagger 2/Postman/HAR → ApiSpecModel)         │
│  resources.ts (actor + ownership model) · ai.ts (Gemini hypotheses) │
│  detectors/ (bola · bfla · exposure · ratelimit)                    │
│  SafeHttpClient (single egress: scope gate · timeouts · budgets)    │
│  evidence.ts (expected vs actual + redacted PoC)                    │
└───────┬──────────────────────────────────────────────┬──────────────┘
        │                                               │
┌───────▼──────────────┐                 ┌──────────────▼──────────────┐
│ 🎯 Target API        │                 │ 🧪 ShulkerLab sandbox        │
│ authorized external  │                 │ apps/sandbox — deliberately │
│ or loopback          │                 │ vulnerable demo target      │
└──────────────────────┘                 └─────────────────────────────┘
```

## 2. Scan Pipeline (7 phases)

```
Parse → Authenticate → Model + AI hypotheses → Test → Analyze → Findings → Report
         (2 identities)  (ownership map)       (bounded) (verify)  (evidence) (HTML/MD/JSON)
```

- **Detectors:** BOLA (cross-identity replay) · BFLA (privilege probing) · Exposure (schema diff) · Rate limit (bounded burst)
- **Safety:** all traffic through `SafeHttpClient` — scope checks, header hygiene, timeouts, request budget, 5-min watchdog, cancel
- **Golden rule:** no reproduced HTTP proof → no finding. AI proposes; the scanner verifies.

## 3. Repository Layout

```
├── apps/
│   ├── web/          React 18 + Vite dashboard (dark, SSE live progress)
│   ├── scan-api/     Scanner backend: REST + SSE + SQLite + reports + demo mode
│   ├── sandbox/      ShulkerLab — deliberately vulnerable demo API (loopback default)
│   └── cli/          `sentinel` CLI with CI/CD exit codes
├── packages/
│   ├── scanner-core/ Engine, parser, detectors, evidence, AI layer
│   └── shared/       Types, severity engine, redaction, sensitive-field heuristics
├── scripts/          dev.sh launcher · e2e.mjs (60-check suite) · make_deck.py
├── docs/             Technical guides
├── render.yaml → REMOVED (deployment-agnostic; any Node host works)
└── ARCHITECTURE.md   This document
```

## 4. Data Flow (finding lifecycle)

```
OpenAPI spec ─▶ parser ─▶ ApiSpecModel ─▶ resources.ts ownership map
                                              │
                        Gemini (optional) ────┤  hypotheses: "endpoint X may leak Y"
                                              ▼
                        detectors replay bounded requests via SafeHttpClient
                                              │
                              reproduced? ────┼── no  → PASS (positive control)
                                              └── yes → Finding {severity, evidence,
                                                        redacted req/resp, PoC curl}
                                                        ▼
                                        SQLite ─▶ SSE ─▶ Dashboard ─▶ Report
```

## 5. Security Invariants

1. **Redaction at capture** — tokens never reach storage, reports, SSE, or browser (e2e-grepped).
2. **Single egress chokepoint** — every scan request passes scope-gate + budget checks in `SafeHttpClient`.
3. **Two-key external gate** — settings toggle AND per-scan authorization for non-loopback targets; loopback always allowed.
4. **Deterministic verification** — a `Finding` cannot be constructed without a matching test record; hallucinations are structurally impossible.
5. **Bounded by design** — request budget, time watchdog, and user-cancel enforced in the engine lifecycle.

## 6. Verification

```bash
npm run typecheck   # all workspaces clean
npm test            # 19/19 unit tests
npm run test:e2e    # 60/60 checks — real engine vs real sandbox
```
