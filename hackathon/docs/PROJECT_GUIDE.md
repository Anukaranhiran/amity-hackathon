# Shulker — Project Guide

AI-assisted zero-trust API vulnerability scanner · AmiHacks Track C.

---

## 1. What it is

Shulker proves that an API enforces — or fails to enforce — authorization. It discovers endpoints from any contract source, authenticates as two identities, models resource ownership, and runs deterministic, budget-bounded tests for the OWASP API Top 10 authorization family:

| Class | OWASP | How it's tested | Demo result |
|---|---|---|---|
| BOLA — object-level authorization | API1 | Replay user A's object requests with user B's token | 3× HIGH confirmed |
| BFLA — function-level authorization | API5 | Call privileged endpoints as a low-privilege actor | 1× CRITICAL confirmed |
| Excessive Data Exposure | API3 | Diff observed response fields vs documented schema | 1× HIGH confirmed |
| Weak Rate Limiting | API4 | Polite capped burst on auth-sensitive endpoints | 1× MEDIUM potential |

**Core rule:** Gemini may hypothesize; only a reproducible HTTP exchange (request + response evidence) can create a finding. Hallucinated vulnerabilities are structurally impossible.

## 2. Quickstart

```bash
npm install
npm run dev          # ShulkerLab sandbox :8700 · scanner backend :8600 · dashboard :5173
```

1. Open `http://localhost:5173`.
2. Click **Run Local Demo** — a complete scan finishes in ~30 seconds with live SSE events.
3. Explore **Findings** → open any finding → copy the PoC curl and replay it yourself.

Other entry points:

```bash
npm run dev:api      # headless (sandbox + backend only)
npm test             # 19 unit tests
npm run test:e2e     # 60-check full pipeline
node apps/cli/src/cli.ts scan --target http://127.0.0.1:8700 \
  --openapi http://127.0.0.1:8700/openapi.json --fail-on high   # CI gate
```

## 3. Feature tour

### New Scan wizard (function-first, no artwork)
- **Scan mode:** Local Sandbox (ShulkerLab) or Real API.
- **Quick API Templates:** one click configures Gemini (`x-goog-api-key`), OpenAI, GitHub, or Stripe — target, auth scheme, and a valid OpenAPI 3.0.3 spec generated in memory. View / copy / download the generated contract; no files needed.
- **Custom contract:** OpenAPI URL, file upload (OpenAPI/Swagger JSON+YAML), Postman v2.1, HAR 1.2, or manual endpoint rows. Validate-before-scan with an endpoint discovery preview (protected vs public counts).
- **Authentication:** None, API Key (header name + value), Bearer, Basic, plus always-available custom headers. Provider console links included.
- **Safety:** scan profile (request budget, rate-limit probes, AI toggle), authorization checkbox, `[ ] Allow External Targets` with the warning banner *"Only scan APIs you own or are authorized to test."*
- **Live monitor:** progress bar, phase timeline, real-time event stream, cancel button.

### Dashboard
KPI cards with real deltas vs the previous scan (Confirmed Findings, Critical/High, Endpoints Tested, Tests Passed), scan-status ring + phase timeline, recent findings table, severity donut, top vulnerability types, recent activity.

### Discovery & Intelligence
- **API Inventory** — sources (OpenAPI/Postman/HAR/manual) and every discovered endpoint.
- **Attack Surface** — resource-grouped endpoint map overlaid with real scan results (tested / finding / untested).
- **Coverage Report** — discovered vs actually tested, overall ring + per-resource bars.
- **Resource Graph** — actor → resource → endpoint relationship graph with finding-colored nodes.
- **Activity** — audit timeline derived from scan history.

### Findings & Evidence
Every finding: severity, type, affected endpoint, expected vs actual behavior, redacted request/response evidence, impact, severity reasoning, remediation, and a copy-paste PoC curl. Evidence viewer shows both exchanges with `[REDACTED]` tokens.

### Reports
HTML (shareable/printable), Markdown (PRs/wikis), JSON (pipelines) — all redacted, generated from any completed scan.

### External Authorized Mode
Public HTTPS targets and public spec URLs behind **two gates**: the Settings toggle **and** the per-scan authorization checkbox. Verified live against Swagger Petstore with a static API key (19 endpoints discovered, credentials redacted everywhere). Budgets, timeouts, redaction, and deterministic verification are never relaxable.

### Theme
Full dark-SOC and light themes with semantic design tokens; toggle in the topbar or Settings; persisted per browser. Collapsible sidebar (280↔72px) persisted too.

## 4. Verified status

| Gate | Result |
|---|---|
| End-to-end (`scripts/e2e.mjs`) | **60/60** — live scan, authorization refuse/allow matrix (14), template generation (7), redaction assertions, reports |
| Unit tests | **19/19** — redaction, severity, spec parsing, sandbox behavior |
| Typecheck | clean across all workspaces |
| Build | `vite build` green |

## 5. Where to look in the code

| Start here | Because |
|---|---|
| `packages/scanner-core/src/engine.ts` | The 7-phase scan lifecycle |
| `packages/scanner-core/src/detectors/` | The four OWASP detectors |
| `packages/shared/src/redact.ts` | The redaction engine |
| `apps/scan-api/src/server.ts` | Routes, SSE, target validation |
| `apps/web/src/pages/NewScan.tsx` | Wizard + templates + live monitor |
| `scripts/e2e.mjs` | What "verified" means, check by check |
