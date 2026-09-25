# Shulker

**Find the API vulnerability before the breach headline does.**

**Repository:** https://github.com/Anukaranhiran/amity-hackathon · **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)

Shulker is an AI-assisted, zero-trust API vulnerability scanner built for the
AmiHacks Track C challenge. It ingests an OpenAPI specification, reasons about
authorization boundaries, executes **bounded, deterministic security tests** against an
explicitly authorized target, and produces severity-ranked, evidence-backed findings with
reproducible proof-of-concept requests.

> Instead of blindly fuzzing an API, Shulker reasons about *who should be allowed to
> access what*, then verifies those assumptions with controlled tests.
> **AI proposes. The scanner verifies.** An LLM's claim is never treated as proof.

---

## Why

Modern APIs rarely fail because HTTP is broken — they fail because the application
doesn't correctly enforce *who can access what*. Broken object-level authorization
(BOLA/IDOR), excessive data exposure, broken function-level authorization (BFLA) and
missing rate limiting are among the most common real-world breach vectors, and existing
tools either fuzz blindly, cost enterprise money, or lack reproducible evidence.

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full diagram set (high-level layout, 7-phase pipeline, data flow, security invariants) and Mermaid sources in `hackathon/diagrams/`.

```
apps/
  web/         React + Vite + TypeScript dashboard (dark, SSE live scan progress)
  scan-api/    Scanner backend: scan manager, SQLite persistence, reports, demo mode
  sandbox/     SentinelLab — deliberately vulnerable vehicle-service API (loopback only)
  cli/         `sentinel` CLI with CI/CD exit codes
packages/
  scanner-core/  OpenAPI parser, execution engine, detectors, evidence engine, AI layer
  shared/        Types, redaction, severity engine, sensitive-field heuristics
scripts/       dev.sh launcher + e2e verification
data/          SQLite DB + generated reports (gitignored)
```

**AI is a hypothesis engine, never a source of truth.** Gemini receives endpoint
semantics and returns schema-validated hypotheses (ownership boundaries, risk types,
priorities). Every hypothesis is then *verified* by deterministic tests against real
responses. If Gemini is unavailable, misconfigured, or returns malformed JSON, the scan
continues with deterministic rules and says so in the UI and reports.

## Vulnerability classes (real, verified checks)

| Class | How it works | False-positive control |
| --- | --- | --- |
| **BOLA / IDOR** | Authenticates two actors, discovers what each *actually owns* via the target's own list endpoints, then tests whether actor A can read actor B's objects. Never guesses sequential IDs. | Control test (owner access must succeed) + ownership ground truth; otherwise `INCONCLUSIVE`, not a finding. |
| **Excessive data exposure** | Compares response fields against the OpenAPI-documented schema + sensitive-field heuristics (passwordHash, secrets, internal metadata…). | HIGH confidence only for credential material (confirmed); internal metadata is `potential`; generic extras are low/informational. |
| **BFLA (privileged access)** | Non-admin actor reads admin-only resources and attempts privileged mutations (e.g. role change) on their own account. | Documented admin semantics required; expected 403 enforced by control. |
| **Weak rate limiting** | Bounded probe (configurable, default 12 requests) at auth endpoints; analyzes 429/`Retry-After`/rate-limit headers. | Always reported as *potential* with the wording "not observed under the configured test conditions". |

## Safety model

- **Local/private targets only** — the backend refuses non-loopback, non-private targets.
- **Explicit authorization confirmation** required for every scan (`confirmAuthorized`).
- **Request budget** (hard cap), per-request timeout, response-size cap, scan timeout, cancellation.
- **Secret redaction everywhere** — tokens/passwords are redacted in evidence, PoCs,
  reports, test records and logs. The dashboard never displays a real credential.
- The sandbox binds to `127.0.0.1` only and is deliberately vulnerable — never expose it.

## Quick start

Requires **Node.js ≥ 20.10** (uses the built-in `node:sqlite` and native TS type-stripping — no build step, no DB install).

```bash
npm install
npm run dev
# → Dashboard http://localhost:5173
# → Backend   http://localhost:8600/health
# → Sandbox   http://localhost:8700/health
```

Then click **⚡ Run Local Demo** (or on first launch, the hero button) — it starts a
sandbox, configures the target, runs a real scan, and lands you on live findings.

### One-command demo (headless)

```bash
npm run dev:api                      # sandbox + backend
curl -s -X POST localhost:8600/api/demo
```

### CLI / CI mode

```bash
node apps/cli/src/cli.ts demo                    # scan the built-in sandbox
node apps/cli/src/cli.ts scan --target http://127.0.0.1:8700 --spec spec.json --fail-on high
```

Exit codes: `0` no blocking findings · `1` confirmed findings at/above `--fail-on` · `2` scan error.

## Configuring Gemini (optional)

```bash
cp .env.example .env
# then set:
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.0-flash
```

The key is read **server-side only** and is never sent to the browser. With no key,
Shulker runs fully on deterministic rules (the UI shows
“AI reasoning unavailable — using deterministic security rules”).

## The scan pipeline

```
Upload OpenAPI → parse & validate → authenticate test identities (User A/B)
→ build ownership/resource model from the target's own list endpoints
→ AI hypotheses (or deterministic rules) → bounded detector execution
→ verify responses → evidence (redacted) → severity engine → findings + PoCs
→ dashboard (live SSE) → exportable reports (JSON / Markdown / print-ready HTML)
```

Every finding answers: **WHAT? WHERE? WHO? EXPECTED? ACTUAL? WHY? PROOF? FIX?**

## Seeded vulnerabilities in SentinelLab

| ID | Class | Endpoint | Behavior |
| --- | --- | --- | --- |
| V1 | BOLA | `GET /vehicles/{vehicleId}` | Any user reads any vehicle (200 instead of 403/404) |
| V2 | BOLA | `GET /service-records/{recordId}` | Ownership never checked |
| V3 | BOLA | `GET /invoices/{invoiceId}` | Ownership never checked |
| V4 | Exposure | `GET /users/{userId}` | Returns `passwordHash`, `internalNotes`, `lastLoginIp`… |
| V5 | Rate limit | `POST /auth/login` | No limiter (register *is* limited — a control) |
| V6 | BFLA | `PATCH /users/{userId}/role` | Any user can grant themselves admin |

Secure controls (must **PASS** and produce no findings): scoped `GET /vehicles`,
`GET /service-records`, `GET /invoices`, session-bound `GET /users/me`, admin-gated
`GET /admin/users`, `/admin/invoices`, `/admin/metrics`, ownership-checked
`POST /service-records`, and rate-limited `POST /auth/register`.

## Detect → prove → fix → verify

1. Run the demo scan → 5 confirmed findings (3×BOLA, exposure, critical BFLA) + 1 potential.
2. Open a finding → expected vs actual, redacted evidence, copyable PoC, remediation.
3. Fix the sandbox (e.g. add an ownership check in `apps/sandbox/src/server.ts`).
4. Re-scan → the finding disappears and the corresponding test flips to **PASS**.

## Tests & verification

```bash
npm test            # unit tests (parser, redaction, severity) + sandbox smoke tests
node scripts/e2e.mjs  # 27-check end-to-end pipeline verification
```

The e2e script boots the sandbox in-process, runs the real scan engine, and asserts:
endpoints discovered, actors authenticated, every seeded vulnerability confirmed with
redacted evidence + JWT-free PoCs, all secure controls passing, deterministic severity
reasons, no raw tokens/hashes anywhere in the result, and valid report generation.

## Limitations & future work

- Current classes: BOLA, exposure, BFLA, weak rate limiting (depth over breadth).
- Ownership discovery relies on enumerable list endpoints; non-enumerable resources
  become `INCONCLUSIVE` rather than false positives.
- Agentic multi-step chains, API graph visualization, and OpenAPI diffing are natural
  next steps; the detector interface is designed to be extended.

## Ethics

Shulker is an **authorized-testing** tool. It refuses non-local targets, requires
explicit confirmation, bounds every request, and never stores secrets in the clear. Do
not attempt to scan systems you do not own or lack written permission to test.
