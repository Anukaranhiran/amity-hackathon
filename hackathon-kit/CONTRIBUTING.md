# Contributing to Shulker

Thanks for your interest in improving Shulker! This guide covers everything you need to go from clone to first pull request.

## Project overview

Shulker is an AI-assisted, zero-trust API vulnerability scanner. It discovers API endpoints from any contract source (OpenAPI 3 / Swagger 2 / Postman / HAR / manual / one-click generated specs), authenticates as two identities, models resource ownership, and runs deterministic, budget-bounded detectors for the OWASP API Top 10 authorization family. AI hypothesizes; only reproduced HTTP evidence creates a finding.

## Getting started

```bash
git clone <your-fork-url> && cd shulker
npm install          # npm workspaces — installs everything
npm run dev          # ShulkerLab sandbox :8700 · backend :8600 · dashboard :5173
```

Open `http://localhost:5173` and click **Run Local Demo** to see a full scan in ~30 seconds.

## Verify before you push

All three gates must pass. CI-style checks, run locally:

```bash
npm run typecheck    # tsc --noEmit across all workspaces
npm test             # 19 unit tests (redaction, severity, parser, sandbox)
npm run test:e2e     # 60-check end-to-end suite (real engine, real HTTP, no mocks)
```

The e2e suite is the ground truth: it asserts the exact demo finding set (1 CRITICAL BFLA, 3 HIGH BOLA, 1 HIGH exposure, 1 MEDIUM potential rate-limit) and greps every artifact for leaked credentials. If you touch the engine, detectors, redaction, or reports, this suite is your regression net.

## Repository layout

```
apps/
  sandbox/     ShulkerLab — deliberately vulnerable demo API (:8700)
  scan-api/    Zero-dependency Node backend: routes, SSE, sqlite, reports (:8600)
  web/         React 18 + Vite dashboard (14 pages) (:5173)
  cli/         `shulker scan --fail-on <sev>` CI gate
packages/
  scanner-core/  ScanEngine (7 phases), parser, SafeHttpClient, detectors, evidence
  shared/        Types, severity, redaction — zero deps, imported by everything
scripts/         dev.sh · e2e.mjs · verify-demo.mjs
```

## Ground rules

1. **No proof, no finding.** A `Finding` requires a `TestRecord` and a redacted `EvidenceRecord`. Never create findings from AI output or heuristics alone.
2. **Redact before persistence.** All captured evidence flows through `@shulker/shared/redact.ts`. Never write raw credentials to storage, reports, SSE, or logs. New sensitive-field names go in `sensitive.ts`.
3. **All network egress through `SafeHttpClient`.** Detectors must never call `fetch` directly — the chokepoint enforces scope, header hygiene, timeouts, and the budget.
4. **Keep the backend zero-dependency.** `apps/scan-api` uses only Node stdlib (`node:http`, `node:sqlite`). New runtime deps require a strong justification.
5. **Bounded by construction.** Any new probe must respect the budget meter, watchdog, and cancel flag. Cap burst-style tests explicitly.
6. **Positive controls.** New detectors should record PASS records for correctly-protected endpoints, not only failures.
7. **Honest labeling.** Unprovable negatives (e.g. missing rate limiting) are `potential`, never `confirmed`.

## Style

- TypeScript everywhere; 2-space indent in TS, 4-space in `apps/web/src/styles.css` (enforced by convention and the CSS usage guard at `apps/web/scripts/check-css-usage.mjs`).
- No build step for server code — it runs via `node --experimental-strip-types`. Keep server TS compatible with type-stripping.
- UI copy is function-first: no marketing fluff in the product, no lorem ipsum anywhere.

## Submitting

1. Branch from `main`: `git checkout -b feat/my-change`.
2. Make the change; add/adjust tests when behavior changes.
3. Run all three verification gates.
4. Open a PR describing *what* changed, *why*, and the verification output (paste the e2e tail).

## Reporting security issues in Shulker itself

Found a way to make the scanner exceed its budget, leak credentials, or reach unconsented targets? That's exactly the class of bug we care most about. Please open a private security advisory rather than a public issue.
