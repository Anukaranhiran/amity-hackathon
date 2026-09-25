# Features

## Scanner engine

- **7-phase scan lifecycle** — parse → authenticate → resources + AI hypotheses → testing → analysis → findings → done, with live typed events at every step.
- **BOLA detection (OWASP API1)** — authenticates two identities, builds a resource-ownership model, replays user A's object requests with user B's token (and unauthenticated); any cross-identity 200 becomes a confirmed finding with both exchanges.
- **BFLA detection (OWASP API5)** — probes privileged-looking endpoints (`*/role`, `/admin/*`, destructive verbs) as the low-privilege actor; success = CRITICAL, correct denial = PASS positive control.
- **Excessive Data Exposure detection (OWASP API3)** — diffs observed response fields against the documented schema; sensitive undocumented fields (`passwordHash`, `ssn`, `token`, …) = HIGH.
- **Rate-limiting detection (OWASP API4)** — polite capped bursts (default 12, max 25) on auth-sensitive endpoints; no 429/Retry-After = honestly-labeled `potential`.
- **AI-assisted prioritization** — Gemini ranks which endpoints to test first; purely advisory. Without a key, the engine runs fully deterministic ("Deterministic Verification" mode).

## Contract ingestion

- **OpenAPI 3.x / Swagger 2** — JSON or YAML, URL or file upload.
- **Postman v2.1 collections** and **HAR 1.2 recordings** — with numeric/UUID path templating into `{id}` parameters.
- **Manual endpoint rows** for undocumented APIs.
- **One-click API templates** — Gemini (`x-goog-api-key`), OpenAI, GitHub, Stripe: target, auth scheme, and a valid OpenAPI 3.0.3 contract generated **in memory**; view / copy / download, no files.
- **Validate-before-scan** with endpoint discovery preview (protected vs public counts).

## Authentication support

- API Key (configurable header), Bearer, Basic, and custom headers — attached at the single egress chokepoint on every request.
- Login-flow actors (Alice / Bob / admin) for sandbox-style targets.

## Evidence & findings

- **Every finding ships proof:** attacker identity, expected vs actual behavior, redacted request/response pair, impact narrative, severity reasoning, remediation, and a copy-paste PoC curl.
- **Redaction at capture time** — JWTs, `sk-`-style keys, auth headers, sensitive fields → `[REDACTED]` before storage, streaming, or rendering.
- **Positive controls** — correctly-protected endpoints recorded as PASS, visible in the UI.
- **Honest labels** — unprovable negatives are `potential`, never `confirmed`.

## Dashboard (React, 14 pages)

- **Overview** — KPI cards with deltas vs previous scan, scan-status ring, phase timeline, severity donut, recent findings, activity.
- **New Scan wizard** — sandbox/real-API modes, templates, auth config, safety profile, live SSE monitor with progress, timeline, event stream, and cancel.
- **Findings / Finding Detail / Evidence** — triage filters, full proof chain, `[REDACTED]` evidence viewer.
- **Endpoints** — full inventory with per-endpoint auth/authz status and test outcome pills.
- **Discovery & Intelligence** — API Inventory, Attack Surface map, Coverage Report (ring + per-resource bars), Resource Graph (actor → resource → endpoint), Activity audit timeline.
- **Reports / ScanList / Settings** — report generation, scan history, theme + external-target toggle.
- **Dark/light themes** and a collapsible sidebar, both persisted.

## Reports & CI

- **HTML / Markdown / JSON reports** — all redacted, generated from any completed scan.
- **CLI quality gate** — `shulker scan --target … --openapi … --fail-on high`: same engine, exit code reflects worst severity; drops straight into CI.

## Safety (non-removable)

- **Two-gate external mode** — Settings toggle AND per-scan authorization checkbox, enforced server-side; loopback/private always allowed.
- **Bounded execution** — request budget (default 150, max 400), 5-minute watchdog, responsive cancel, capped bursts.
- **Single network chokepoint** — `SafeHttpClient` blocks `Host`/`Content-Length` injection, enforces scope and timeouts.

## Verified quality

- **60/60 e2e checks** (live scan, 14-case authorization matrix, 7 template checks, redaction greps, reports) · **19/19 unit tests** · clean typecheck · green build.
