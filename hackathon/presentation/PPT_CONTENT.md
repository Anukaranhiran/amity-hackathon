# PPT_CONTENT.md — Shulker Hackathon Deck (10 slides)

Ready-to-paste slide content. **On-slide** = what the audience reads. **Speaker notes** = what you say. Screenshot references map to `../screenshots/`.

---

## Slide 1 — Title

**On-slide:**
- **Shulker** — Zero-Trust API Vulnerability Scanner
- "Authentication asks who you are. Shulker asks: *may you see this?*"
- AI-assisted · Evidence-backed · Bounded by design
- AmiHacks · Track C · [team names]

**Speaker notes:**
> "Thirty-second promise: by the end of this deck you'll watch a scanner prove a critical privilege-escalation flaw and three cross-user data leaks — with replayable proof — in under a minute."

---

## Slide 2 — Problem

**On-slide:**
- API breaches aren't crypto failures — they're **authorization failures**
  - BOLA (#1 OWASP API): change an ID, read a stranger's data
  - BFLA (#5): user-only token reaches admin functions
- Pen tests: annual, expensive, per-API · LLM scanners: confident hallucinations · classic DAST: noise
- **The gap: nothing proves authorization continuously**

**Speaker notes:**
> "Attackers don't break the lock — they sign up, get a perfectly valid key, and the server never asks whether they may see that object. Every major API breach in recent memory reduces to this one sentence: the server knew who the caller was, and let them see it anyway."

---

## Slide 3 — Solution

**On-slide:**
- **Shulker proves authorization flaws — with HTTP evidence, not guesses**
- Ingest any contract: OpenAPI 3/Swagger 2 · Postman · HAR · manual · one-click specs (Gemini/OpenAI/GitHub/Stripe)
- Two authenticated identities → resource-ownership model → bounded tests
- Every finding: expected vs actual + redacted request/response + copy-paste PoC
- **Rule: no HTTP proof → no finding**

**Speaker notes:**
> "The insight is that authorization flaws are provable facts. If Alice's token returns Bob's invoice, that's not a hypothesis — it's a reproducible exchange. Shulker automates the boring, careful work humans do in bug bounties: two accounts, an ownership map, and the right replayed requests."

---

## Slide 4 — Architecture

**On-slide:**
- Monorepo (npm workspaces, ~8.7k lines TS):
  - `packages/scanner-core` — engine, parser, detectors, SafeHttpClient
  - `packages/shared` — types, severity, **redaction** (zero deps)
  - `apps/scan-api` — Node backend, SSE, sqlite (**zero npm deps**)
  - `apps/web` — React 18 + Vite dashboard · `apps/cli` — CI gate · `apps/sandbox` — demo target
- One engine → dashboard, REST, CLI
- Diagram: `../diagrams/architecture.mmd`

**Speaker notes:**
> "Security tooling should be auditable, so the backend is zero-dependency Node stdlib — the whole server is ~1,700 readable lines. The same ScanEngine powers the dashboard, the REST API, and the CLI, so findings are identical everywhere."

---

## Slide 5 — Pipeline

**On-slide:**
- 7 phases: Parse → Authenticate → Model + AI hypotheses → Test → Analyze → Findings → Report
- Detectors: BOLA (cross-identity replay) · BFLA (privilege probing) · Exposure (schema diff) · Rate limit (bounded burst)
- Budget meter · 5-min watchdog · cancel — enforced in one HTTP chokepoint
- Diagram: `../diagrams/scan-pipeline.mmd`

**Speaker notes:**
> "Walk the phases left to right. Emphasize the chokepoint: every request flows through SafeHttpClient — scope checks, header hygiene, timeouts, budget. The scanner physically cannot exceed the limits the operator set."

---

## Slide 6 — Features

**On-slide:**
- One-click API templates: Gemini · OpenAI · GitHub · Stripe — valid OpenAPI generated **in memory**, no files
- Contract sources: OpenAPI URL/file · Postman · HAR · manual
- Auth: API key · Bearer · Basic · custom headers — redacted everywhere
- Live SSE scan monitor · severity donut · coverage ring · attack-surface map · resource graph
- Reports: HTML / Markdown / JSON · CLI CI gate (`--fail-on high`)
- Dark/light professional UI, collapsible nav

**Speaker notes:**
> "Feature-dense but function-first — every widget is real data, no placeholder art. The template demo gets the biggest reaction: click Gemini, and target, auth scheme, and a valid contract appear instantly. Paste a key and you're scanning Google's API."

---

## Slide 7 — Case Study

**On-slide:**
- One free account, one API, four findings — the real breach chain:
  1. Read strangers' vehicles/invoices by changing IDs → **BOLA ×3 HIGH**
  2. `PATCH /users/{id}/role` as normal user → **BFLA CRITICAL**
  3. `passwordHash` in response, undocumented → **Exposure HIGH**
  4. Nothing throttles the loop → **Rate limit MEDIUM (potential)**
- Each reproduced with redacted evidence + replayable curl
- Screenshot: `03-finding-detail.png`

**Speaker notes:**
> "This is the Uber-style pattern: no malware, no crypto-breaking — one legitimate account and a server that authenticates but never authorizes. Shulker proves the whole chain in about thirty seconds. Note the honest labeling: missing rate limiting is 'potential', because a scanner can't fully prove a negative."

---

## Slide 8 — Demo

**On-slide:**
- Live: Run Local Demo → 5 confirmed + 1 potential in ~30s
- Watch: SSE event stream → findings → evidence with `[REDACTED]`
- Then: one-click Gemini template → external authorized mode
- Backup: 60-check e2e (`node scripts/e2e.mjs`)
- Screenshots: `07-shulkerlab-scan.png` · `06-gemini-scan.png`

**Speaker notes:**
> "(See shows/DEMO_SCRIPT.md for the full click-and-say script.) If anything web-side fails on stage, the headless verify script re-proves the engine live in 20 seconds — the demo has a fallback at every layer."

---

## Slide 9 — Technical Highlights

**On-slide:**
- **Deterministic verification:** AI hypothesizes; only reproduced HTTP creates a finding — hallucinations structurally impossible
- **Redaction at capture:** tokens never reach storage, reports, SSE, or the browser (e2e-grepped)
- **SafeHttpClient:** single egress — scope gate, Host/Content-Length injection blocked, budgets
- **Two-key external gate:** settings toggle AND per-scan authorization (verified live on Swagger Petstore)
- **Quality:** 60/60 e2e · 19/19 unit · tsc clean · zero-dep backend

**Speaker notes:**
> "If judges remember one thing: the LLM never gets the last word. Gemini ranks what to test; a Finding object literally cannot be constructed without a matching test record and evidence. Positive controls — endpoints that correctly deny — are recorded as PASS, proving the harness works."

---

## Slide 10 — Future Scope

**On-slide:**
- Record-a-login → auto-derive multi-role actors
- Diff-scans: CI fails only on **new/regressed** findings
- GraphQL schema ingestion · continuous trend tracking across scans
- Team contributions: [name → area] · Repo: [link]
- *"Authentication asks who you are. Shulker asks: may you see this?"*

**Speaker notes:**
> "Close on the mission: turn authorization testing from an annual audit into a pre-deploy command. Then stop talking and take questions — JUDGE_QNA.md has you covered."
