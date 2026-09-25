# Talking Points — Shulker

Quick-reference framing for interviews, judging rounds, and stage Q&A. Speak the bolded line first; the bullets are depth on demand.

---

## Problem

**"APIs are the front door to modern data — and their #1 vulnerability class is broken authorization, which almost nothing tests automatically."**

- The OWASP API Top 10 is dominated by one family: BOLA (#1), excessive exposure (#3), missing rate limiting (#4), BFLA (#5). All are *authorization* flaws, not crypto flaws.
- Real breaches follow one pattern: a valid, low-privilege credential + a server that never checks object ownership or role.
- Pen tests happen annually, per API, at high cost. LLM-based "AI scanners" produce confident hallucinations no team can act on. Classic DAST fuzzes parameters and drowns teams in noise.

## Solution

**"Shulker proves authorization flaws with reproducible HTTP evidence — in seconds, not months."**

- Ingests any contract: OpenAPI 3/Swagger 2, Postman, HAR traffic, manual entry, or one-click generated specs for Gemini/OpenAI/GitHub/Stripe.
- Authenticates as two identities, builds a resource-ownership model, then runs four deterministic detector families mapped to the OWASP API Top 10.
- Every finding ships: attacker identity, expected vs actual behavior, redacted request/response evidence, and a copy-paste curl PoC.
- Output everywhere you work: live dashboard (SSE), HTML/Markdown/JSON reports, and a CLI that fails CI on threshold.

## Innovation

**"AI hypothesizes; deterministic code verifies. The LLM never gets the last word."**

- Gemini ranks which endpoints deserve attention; a `Finding` structurally cannot exist without a `TestRecord` + `EvidenceRecord` proving it. LLM false positives are impossible *by construction*, not by prompting.
- Cross-identity replay engine: two real authenticated sessions, an ownership graph, and object-swapping probes — the actual mechanics of how humans find BOLA, automated.
- Zero-dependency backend on Node stdlib (node:http, node:sqlite, SSE): the security tool itself is ~1,700 auditable lines with near-zero supply-chain risk.
- Safety as architecture: request budgets, 5-minute watchdog, cancel, token redaction at capture time, and a two-gate consent system for external targets — a scanner that can't be repurposed as a weapon.

## Impact

**"This turns authorization testing from an annual audit into a pre-deploy command."**

- For engineers: a CI gate (`shulker scan --fail-on high`) that blocks regressions before production.
- For security teams: findings with proof, so triage is minutes — every report item is replayable, no deduping hallucinations.
- For the ecosystem: honest reporting — positive controls (correctly-protected endpoints PASS) and "potential" labels where negatives can't be fully proven.
- Verified rigor: 60-check e2e suite, 19 unit tests, typecheck and build gates; demo reliably reproduces 5 confirmed + 1 potential findings in ~30 seconds.

## Why it matters

**"Authentication asks who you are. Authorization decides what you may see. Only one of them is tested today."**

- Every modern breach headline reduces to the same sentence: the server knew who the caller was and let them see it anyway.
- The fix is tractable: these flaws are provable with two accounts and the right requests — exactly what Shulker automates.
- As AI writes more API code faster, the testing gap widens; proof-based scanning is the only output a security team can act on.
- Shulker demonstrates the full loop — discover, authenticate, model, test, prove, report, gate — on a stack simple enough to fully audit. That's the standard AI-era security tooling should be held to.
