# Impact

## Who this helps, and how

### Engineers shipping APIs
Today, authorization regressions reach production because testing them is manual and annual. Shulker makes them a **pre-deploy command**:

```bash
node apps/cli/src/cli.ts scan --target … --openapi … --fail-on high
```

Non-zero exit on severity ≥ high blocks the regression in CI — the same finding set the dashboard shows, delivered where engineers already work.

### Security teams
Every finding ships attacker context, expected-vs-actual behavior, redacted evidence, and a replayable PoC. Triage becomes **minutes, not days**: no deduplicating scanner noise, no chasing LLM hallucinations. Positive-control PASS records tell analysts the harness itself is healthy. HTML/Markdown/JSON reports drop into tickets, PRs, and pipelines.

### The ecosystem
Shulker demonstrates what AI-era security tooling should be held to: **proof over prediction**. As AI writes more API code faster, the authorization-testing gap widens; a scanner whose findings are reproducible HTTP exchanges — and whose honesty labels (`potential` vs `confirmed`) are explicit — is the only kind of output a team can safely automate on.

## Measurable outcomes (from the verified build)

| Metric | Result |
|---|---|
| Demo breach chain proven | 5 confirmed findings (1 CRITICAL BFLA role escalation, 3 HIGH BOLA, 1 HIGH passwordHash exposure) + 1 potential, in ~30s |
| End-to-end verification | 60/60 checks — real engine, real HTTP server, zero mocks |
| Unit tests | 19/19 (redaction, severity, parsing, sandbox) |
| Credential leakage | 0 — e2e greps every artifact (results, evidence, 3 report formats, SSE stream) for the original secret |
| External-mode safety | 14/14 authorization-matrix cases; live Swagger Petstore scan (19 endpoints) |
| Supply-chain surface | 2 runtime deps total (`yaml`, `react`/`react-dom`); backend zero-dep |

## From demo to real-world path

The demo target (ShulkerLab) is deliberately vulnerable by design, but the engine is target-agnostic: it consumed only the spec, credentials, and a resource model. The same flow already ran **live** against Swagger Petstore with API-key auth. The roadmap (record-a-login actors, diff-scans for CI, GraphQL ingestion) closes the remaining distance to everyday use on private APIs — turning "the breach that makes headlines" into "the CI failure that prevented it."

## The one-sentence mission

> **Authentication asks who you are. Shulker asks: *may you see this?* — and answers with proof, before deploy, every time.**
