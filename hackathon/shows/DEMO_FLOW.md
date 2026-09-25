# Demo Flow — all walkthrough variants

Pick the flow that fits the judging slot. Flows A and C are the core; B and D are extenders. All assume `npm run dev` is running (sandbox :8700, backend :8600, web :5173).

---

## A. Local sandbox demo (ShulkerLab) — 60 seconds

**Goal:** full kill-chain proof with zero setup.

1. Dashboard → click **Run Local Demo**.
2. Live monitor: progress bar, phase timeline, event stream — *say: "every line is a real HTTP exchange; request count is budget-capped."*
3. Scan completes (~30s) → click **Findings**.
4. Result set: **1 CRITICAL BFLA** (role escalation) · **3 HIGH BOLA** (vehicles, service records, invoices) · **1 HIGH exposure** (`passwordHash`) · **1 MEDIUM potential** (login rate limit).
5. Click the CRITICAL finding → **Copy PoC** — a real, replayable curl.
6. Click **Evidence** → show `[REDACTED]` in the Authorization header.

**One-liner close:** *"One free account, thirty seconds, full breach chain — with proof."*

## B. Gemini demo (one-click external template) — 45 seconds

**Goal:** show real-world readiness: no files, no setup, scan a real API.

1. **New Scan** → select **Real API**.
2. **Quick API Templates** → click **Gemini API**.
3. Watch auto-fill: target `https://generativelanguage.googleapis.com`, auth **API Key** with header `x-goog-api-key`, external mode enabled, contract selected.
4. Click **View Generated Contract** — valid OpenAPI 3.0.3 JSON generated in memory (view / copy / download). Close.
5. *Say: "Paste a Gemini key, check the authorization box, and this scans the real API — bounded and redacted. Same one-click flow for OpenAI, GitHub, and Stripe."*
6. Optionally open Settings → show **Allow External Targets** toggle + warning banner ("Only scan APIs you own or are authorized to test").

**If the judge asks to see it hit the real API:** explain the recorded verification — e2e scanned Swagger Petstore live with a static `api_key` header: 19 endpoints discovered, credentials redacted (see `node scripts/e2e.mjs`).

## C. Findings walkthrough — 2 minutes

**Goal:** prove finding quality: evidence, expected-vs-actual, remediation.

1. Open a **BOLA** finding from the latest scan.
2. **Attack Context** panel: attacker identity (Alice) vs resource owner (Bob), object ID, expected vs actual behavior.
3. **Evidence**: redacted request/response pair — Bob's data returned under Alice's token.
4. **Why This Is a Vulnerability**: impact narrative + severity reasoning.
5. **Remediation**: concrete fix (server-side ownership predicate).
6. **Verification** table: the exact test record, then the re-scan button — *"fix it, re-run, and this flips to PASS."*
7. Back on Findings: use the severity filter chips (Critical/High/Potential) + search to show triage UX.

## D. Reports walkthrough — 1 minute

**Goal:** show the artifacts leave the dashboard.

1. **Reports** page → select the completed scan.
2. **Generate HTML** → **View** — styled, shareable, redacted.
3. **Download Markdown** — "drops into PRs and wikis."
4. **Generate JSON** — "machine-readable for pipelines."
5. Terminal: `node apps/cli/src/cli.ts scan --target http://127.0.0.1:8700 --openapi http://127.0.0.1:8700/openapi.json --fail-on high`
   — same findings in the terminal; exit code non-zero because severity ≥ high. *"That's your CI gate."*

---

## Timing matrix

| Slot | Use |
|---|---|
| 3 min | A + C (skip step 7) |
| 5 min | A + B + C + D (the full DEMO_SCRIPT.md) |
| Live Q&A depth | C step 2–6 (evidence detail) or B step 6 (safety gates) |

**Universal fallback:** if anything web-side fails, run `node scripts/verify-demo.mjs` — headless scan proves the engine live in ~20s while you narrate over the terminal output.
