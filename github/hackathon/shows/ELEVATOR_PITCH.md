# Elevator Pitch — Shulker

## 30 seconds

> Most API breaches aren't crypto failures — a valid user changes an ID and reads someone else's data, or calls an admin endpoint the server forgot to protect. **Shulker** is an AI-assisted, zero-trust API scanner that proves these flaws in under 30 seconds: it discovers your endpoints from any contract — OpenAPI, Postman, HAR, even generated in memory — authenticates as two identities, and tests whether ownership and privilege are actually enforced. AI hypothesizes, code proves. Every finding ships redacted HTTP evidence and a copy-paste PoC. No hallucinations — if the scanner can't reproduce it, it doesn't report it.

## 1 minute

> When APIs get breached, it's rarely exotic cryptography. An attacker signs up, gets a perfectly valid API key, changes `/orders/101` to `/orders/102`, and reads a stranger's data — because the server authenticated the caller but never checked object ownership. That's BOLA, OWASP's #1 API risk. Or they find an admin endpoint the UI hides but the backend doesn't — BFLA.
>
> **Shulker finds these automatically, with proof.** Give it a contract — OpenAPI, Postman, HAR, or a one-click template for Gemini/OpenAI/GitHub/Stripe — and it authenticates as two separate users, builds a resource-ownership model, and runs bounded authorization tests against every endpoint. Gemini ranks what to test first, but every finding must be reproduced with raw HTTP: expected behavior, actual behavior, redacted request/response, copy-paste curl. Zero false positives from AI guessing.
>
> It's bounded and ethical by construction — request budgets, a five-minute watchdog, cancel, two consent gates before any external target, and secrets redacted at capture time. Output lands in the dashboard, in HTML/Markdown/JSON reports, and in a CLI that fails your CI pipeline when severity crosses a threshold. In our demo it proves a critical privilege-escalation flaw, three cross-user data reads, and a password-hash leak in about thirty seconds.

## 3 minutes

> **The problem.** APIs now carry most of the internet's sensitive traffic, and the OWASP API Top 10 is dominated by one family: broken authorization. Penetration tests catch it only once a year, per API, at high cost. Bug bounties find it only after launch. Existing scanners mostly fuzz parameters and produce noise, while LLM-based tools produce confident hallucinations no security team can act on.
>
> **The insight.** Authorization flaws are *provable*. If user A's token can read user B's object, that's not a guess — it's a reproducible fact. The missing piece is doing the boring, careful work: managing two identities, modeling who owns what, and replaying the right requests.
>
> **What Shulker does.** It ingests your API's contract — OpenAPI, Swagger, Postman, HAR traffic, manual entries, or one-click generated specs for the Gemini, OpenAI, GitHub, and Stripe APIs. It authenticates as two users, builds an ownership graph of resources, and runs four deterministic detector families mapped to the OWASP API Top 10: BOLA (cross-identity object replay), BFLA (privileged function probing as a low-privilege user), Excessive Data Exposure (response-vs-contract schema diff), and Weak Rate Limiting (polite bounded bursts). Gemini assists by ranking which endpoints deserve attention first — but the engine's rule is absolute: *no HTTP proof, no finding.*
>
> **The proof it works.** Against our deliberately vulnerable demo API, Shulker confirms a critical role-escalation (BFLA), three high-severity cross-user reads (BOLA), a password-hash exposure, and a missing login rate limit — each with redacted evidence and a replayable PoC, in under a minute, inside a request budget the operator controls. The full pipeline is verified by a 60-check end-to-end suite plus 19 unit tests, and the same engine powers the dashboard, the REST API, and a CLI built to fail CI when severity crosses a threshold.
>
> **Why it matters.** Every check is bounded, consented, and redacted — local targets always allowed, external targets behind two explicit gates. Shulker turns authorization testing from an annual audit into a command you run before every deploy. Authentication asks who you are. Shulker asks: *may you see this?*
