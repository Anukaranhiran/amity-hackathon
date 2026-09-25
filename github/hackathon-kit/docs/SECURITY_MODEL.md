# Shulker — Security Model

Shulker is itself a security tool, so its own safety properties are first-class design decisions, not afterthoughts. This document describes every safeguard, where it lives in the code, and how it is verified.

---

## 1. Threat model: can the scanner be abused as a weapon?

A scanner that probes APIs could be repurposed to attack systems. Shulker is designed so that abuse requires breaking the code itself:

| Abuse scenario | Countermeasure | Code location |
|---|---|---|
| Scan a third-party API without consent | Two-key external gate (below) | `validateTarget()` in `apps/scan-api/src/server.ts` |
| Flood a target with requests | Request budget (default 150, max 400) + 5-min watchdog + cancel | `packages/scanner-core/src/engine.ts` |
| Hammer auth endpoints with bursts | Rate-limit probes capped at 25 polite bursts | `detectors/ratelimit.ts` |
| Smuggle hostile headers via user-supplied auth | `Host` / `Content-Length` injection blocked | `packages/scanner-core/src/http.ts` |
| Leak the operator's credentials into artifacts | Redaction at capture time | `packages/shared/src/redact.ts` + `evidence.ts` |
| Path/SSE scheme abuse (`file:`, non-HTTP) | Scheme whitelist — HTTP(S) only | `SafeHttpClient` |

## 2. The two-gate external consent system

Local (loopback/private-range) targets are always allowed — this is the core use case. Public HTTPS hosts require **two independent consents**:

1. **Settings toggle** — `allowExternalTargets`, persisted in `shulker.db` via `POST /api/settings`, with the warning banner *"Only scan APIs you own or are authorized to test."*
2. **Per-scan confirmation** — `confirmAuthorized: true` on each `POST /api/scan` request.

Both are checked server-side in `validateTarget(url, allowExternal)` — the client cannot bypass them. Public **spec URLs** pass through the same gate via `validateSourceUrl` in `discovery.ts`, so an attacker can't smuggle an external target in through the contract.

**Live verification:** the 60-check e2e includes a 14-case authorization matrix (refuse/allow across loopback, private, and public hosts, with each gate toggled independently) and a real scan of Swagger Petstore (19 endpoints discovered, static `api_key` auth, credentials redacted everywhere).

## 3. Redaction: secrets never leave the chokepoint

**Where:** at capture time, inside `evidence.ts`, *before* any record reaches sqlite, the SSE stream, reports, or the browser. This is not a display filter — the stored bytes are already redacted.

**What is caught** (`@shulker/shared/redact.ts` + `sensitive.ts`):

- JWT-shaped strings (`eyJ…`)
- `sk-…`-style API keys
- Values of `Authorization`, `x-api-key`, and cookie headers
- Any JSON field whose name matches the sensitive list (`password`, `token`, `secret`, `ssn`, `api_key`, …)

All become `[REDACTED]`.

**Why it's in `shared`:** the engine, server, and CLI all import the same package — one implementation, no "forgot to redact on this path" bug class.

**Verification:** the e2e suite runs a demo scan with a known bearer token, then greps every artifact — scan result, evidence bodies, all three report formats, and the raw SSE transcript — asserting the original value appears nowhere.

## 4. SafeHttpClient: the single network chokepoint

`packages/scanner-core/src/http.ts` is the only code in the engine that touches the network. Detectors never call `fetch`.

- **Scope enforcement** — loopback/private always allowed; public hosts require `externalTargetsAllowed`; non-HTTP(S) schemes refused.
- **Header hygiene** — `Host` and `Content-Length` cannot be set through user-supplied headers (explicitly blocked), preventing request-smuggling-style abuse of the scanner.
- **Bounds** — per-request timeout, budget accounting on every call, constrained redirects and body sizes so evidence stays bounded.
- **Static credentials** — `defaultHeaders` attach to every request; this is how API-key/bearer/basic scanning works without a login flow.
- **Injectability** — the client is injectable, which is how the e2e runs the real engine against a real HTTP server with zero mocks.

## 5. Bounded execution

| Control | Value | Behavior |
|---|---|---|
| Request budget | default 150, max 400 | Every request increments the meter; exceeded → engine stops |
| Watchdog | 5 minutes | Cancels a hung scan mid-phase |
| Cancel | UI button + CLI | Flag checked between phases and inside detector loops — responsive, not just between phases |
| Rate-limit probes | default 12, max 25 | Polite bounded bursts, never sustained load |
| Per-request timeout | from config | No request can hang the scan |

## 6. AI safety: the LLM never decides

Gemini (`ai.ts`) receives sanitized endpoint metadata and returns ranked hypotheses — endpoint IDs, risk notes, suggested order. There is **no code path from hypothesis to `Finding`**: a finding requires a `TestRecord` (expected vs actual HTTP behavior), which requires a real exchange through `SafeHttpClient`. An LLM outage, a bad key, or a hallucinated hypothesis can degrade *coverage* — never *correctness*. With no `GEMINI_API_KEY`, the engine runs fully deterministic (shown as "Deterministic Verification" mode in the dashboard).

## 7. Honest reporting

- **Positive controls:** endpoints that correctly deny low-privilege actors are recorded as PASS — visible in the UI, proving the harness works and preventing all-failure output.
- **`potential` status:** unprovable negatives (missing rate limiting) are labeled `potential`, never `confirmed`.

## 8. Data residency

All persistence is local: `shulker.db` (node:sqlite) in the repo's data directory. Nothing is sent to any cloud service except the optional, explicit Gemini API call, which receives sanitized endpoint metadata only — never evidence, never credentials.
