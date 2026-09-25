# Innovation

Four ideas distinguish Shulker from both classic DAST scanners and the new wave of LLM security tools. None of them is a prompt trick — each is an architectural decision.

## 1. Deterministic verification: the LLM never gets the last word

AI security tools today generate plausible findings that no team can act on. Shulker inverts the pattern: Gemini receives sanitized endpoint metadata and returns **ranked hypotheses** — where to look, what to prioritize. There is **no code path from hypothesis to `Finding`**: a finding requires a `TestRecord` (expected vs actual HTTP behavior), which requires a real exchange through the engine's HTTP client. Consequence: an LLM hallucination, outage, or missing API key can degrade *coverage* — never *correctness*. False positives from AI are structurally impossible, not merely discouraged.

## 2. Cross-identity replay: the mechanics of human bug-hunting, automated

BOLA — the #1 API risk — is found by humans with a simple craft: log in as two users, map who owns what, replay A's requests against B's objects. Shulker encodes exactly this: two authenticated actors, a resource-ownership graph built from the contract and observed data, then object-swapping probes across every owned resource. It's not fuzzy signature matching; it's the actual proof procedure, executed deterministically — and it fires three times in the demo with full evidence.

## 3. Safety as architecture, not policy

A scanner is a potential weapon, so Shulker makes abuse require breaking the code:

- **Single network chokepoint** (`SafeHttpClient`) — detectors physically cannot bypass scope checks, header hygiene (Host/Content-Length injection blocked), timeouts, or the request budget.
- **Two-key external consent** — public targets need a Settings toggle *and* a per-scan authorization confirmation, both validated server-side; verified by a 14-case refuse/allow matrix in the e2e suite.
- **Redaction at capture time** — secrets become `[REDACTED]` inside the engine, before sqlite, SSE, reports, or the browser ever see them; the e2e greps every artifact for the original credential.
- **Bounded execution** — request budget (default 150), 5-minute watchdog, responsive cancel, capped rate-limit bursts.

## 4. Honest reporting: positive controls and `potential` labels

Correctly-protected endpoints are recorded as **PASS records**, visible in the UI — the harness proves it works while it tests, and the scanner can't be all-failure noise. Unprovable negatives (like missing rate limiting) are labeled **`potential`**, never dressed up as `confirmed`. This epistemic honesty is rare in scanning tools and is the difference between findings a team trusts and findings they mute.

---

## Why the combination matters

Each idea is useful alone; together they produce a tool whose output a security team can act on *immediately* — every finding is reproducible, redacted, bounded, and consented. The same engine then powers a live dashboard, a REST API, and a CI gate (`shulker scan --fail-on high`), turning authorization testing from an annual audit into a pre-deploy command.

And the whole thing is auditable: the backend is **zero-dependency Node stdlib** (~1,700 readable lines), the repo's only runtime deps are `yaml` and `react`/`react-dom`, and the 60-check e2e suite runs the real engine against a real HTTP server with zero mocks.
