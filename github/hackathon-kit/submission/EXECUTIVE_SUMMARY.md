# Executive Summary

**Shulker** — AI-assisted, zero-trust API vulnerability scanner · AmiHacks Track C · built by Anukaran.

---

## The problem

The OWASP API Top 10 is dominated by one vulnerability family: **broken authorization**. BOLA (#1) lets a valid user read strangers' data by changing an ID; BFLA (#5) lets a regular user's token reach admin functions; excessive exposure (#3) hands over password hashes; missing rate limiting (#4) lets one manual exploit scale to a full breach. Pen tests run annually; classic scanners produce noise; LLM-based "AI scanners" produce hallucinations no team can act on.

## The solution

Shulker proves authorization flaws with **reproducible HTTP evidence** — in about thirty seconds. It ingests any contract (OpenAPI 3/Swagger 2, Postman, HAR, manual, or one-click in-memory specs for Gemini/OpenAI/GitHub/Stripe), authenticates as **two identities**, builds a resource-ownership model, and runs four deterministic detector families mapped to the OWASP API Top 10. Gemini prioritizes what to test; a hard architectural rule — **no reproduced HTTP exchange, no finding** — makes AI hallucinated findings structurally impossible.

## What it demonstrably does

Against ShulkerLab, a deliberately vulnerable sandbox API, one scan confirms the complete breach chain: **1 CRITICAL** privilege escalation (BFLA), **3 HIGH** cross-user data reads (BOLA — vehicles, service records, invoices), **1 HIGH** password-hash exposure, and **1 potential** missing login rate limit — each with attacker context, expected-vs-actual behavior, redacted evidence, and a replayable PoC curl. The same engine also scanned **Swagger Petstore live** (19 endpoints, API-key auth, credentials redacted).

## Why it's trustworthy — and safe

- **Verified:** 60/60 end-to-end checks (real engine, real HTTP, zero mocks), 19/19 unit tests, clean typecheck, green build.
- **Leak-proof:** redaction runs at capture time in a shared package; the e2e suite greps every artifact — results, evidence, all three report formats, the raw SSE stream — and asserts the original secret appears nowhere.
- **Bounded & consented:** one network chokepoint enforces scope, header hygiene, timeouts, and a request budget; a watchdog and cancel stop runs cleanly; external targets require two independent consent gates. A scanner that can't be repurposed as a weapon.
- **Auditable:** the backend is zero-dependency Node stdlib (~1,700 lines); the entire repo has three runtime dependencies (`yaml`, `react`, `react-dom`).

## Delivery surfaces

One engine, three outputs: a **React dashboard** with live SSE scan monitoring and 14 pages of real-data intelligence (coverage, attack surface, resource graph), **redacted reports** in HTML/Markdown/JSON, and a **CLI gate** (`shulker scan --fail-on high`) that fails CI when severity crosses a threshold.

## The ask, and the road ahead

Immediate roadmap: recorded logins to auto-derive multi-role actors, diff-scans so CI fails only on new/regressed findings, GraphQL ingestion, and trend tracking across scans — all inside the same safety rails.

**Mission, in one line:** turn authorization testing from an annual audit into a pre-deploy command.

> *Authentication asks who you are. Shulker asks: **may you see this?***
