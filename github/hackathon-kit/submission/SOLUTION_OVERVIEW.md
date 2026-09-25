# Solution Overview

**Shulker** is an AI-assisted, zero-trust API vulnerability scanner that proves the OWASP API Top 10 authorization family — BOLA, BFLA, Excessive Data Exposure, Weak Rate Limiting — with reproducible HTTP evidence, in about thirty seconds per scan.

## How it works, end to end

1. **Ingest any contract.** OpenAPI 3 / Swagger 2 (JSON or YAML), Postman v2.1 collections, HAR 1.2 recordings, manual endpoint rows, or one-click generated specs for the Gemini, OpenAI, GitHub, and Stripe APIs (valid OpenAPI 3.0.3 generated in memory — no files).
2. **Authenticate as two identities.** Static credentials (API key / bearer / basic / custom headers) or a login-flow actor set (regular user, second user, admin).
3. **Model ownership.** The engine builds a resource model: collections, ID parameters, and who owns what.
4. **Run bounded, deterministic detectors:**

| Detector | OWASP | Mechanics | Demo result |
|---|---|---|---|
| `bola.ts` | API1 | Replay user A's object requests with user B's token; any 200 returning another identity's data is confirmed | 3× HIGH |
| `bfla.ts` | API5 | Call privileged-looking endpoints as the low-privilege actor; success = CRITICAL, correct denial = PASS control | 1× CRITICAL |
| `exposure.ts` | API3 | Diff observed response fields against the documented schema; sensitive undocumented fields = HIGH | 1× HIGH |
| `ratelimit.ts` | API4 | Polite capped burst on auth-sensitive endpoints; no 429/Retry-After = MEDIUM potential | 1× potential |

5. **Prove every finding.** A `Finding` structurally requires a `TestRecord` (expected vs actual HTTP behavior) and a redacted `EvidenceRecord` (request/response pair). Gemini may rank what to test — it can never create a finding.
6. **Deliver everywhere.** Live SSE dashboard, redacted reports in HTML/Markdown/JSON, and a CLI (`shulker scan --fail-on high`) that fails CI when severity crosses a threshold.

## The headline guarantees

- **No hallucinations — by construction.** The LLM has no code path to `Finding`. An AI outage degrades coverage, never correctness. With no Gemini key the engine runs fully deterministic.
- **Redaction at capture time.** JWTs, API keys, auth headers, and sensitive fields become `[REDACTED]` before anything is stored, streamed, or rendered. The e2e suite greps every artifact for the original secret and asserts absence.
- **Bounded and consented.** One network chokepoint (`SafeHttpClient`) enforces scope, header hygiene, timeouts, and a request budget; a 5-minute watchdog and cancel flag stop runs cleanly; external targets require two independent consent gates.
- **One engine, three surfaces.** Dashboard, REST API, and CLI share the same `ScanEngine` — identical findings everywhere.

## What "verified" means

60/60 end-to-end checks (including a live Swagger Petstore scan and a 14-case authorization matrix), 19/19 unit tests, clean typecheck, green build — and a demo scan that reliably produces 5 confirmed + 1 potential findings in ~30 seconds, each with replayable evidence.
