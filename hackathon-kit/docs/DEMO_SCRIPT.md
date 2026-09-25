# Demo Script — 5 Minutes (Judging Flow)

> Verified state: 60/60 e2e · 19/19 unit · tsc clean · vite build green.
> Demo scan reliably produces **5 confirmed (1 CRITICAL BFLA, 3 HIGH BOLA, 1 HIGH data exposure) + 1 potential (rate limiting)** in ~30 seconds.

## Pre-flight (before the judge walks in — do NOT demo this)

```bash
npm run dev          # sandbox :8700 + backend :8600 + dashboard :5173
```

- Browser tab open at `http://localhost:5173` (dark theme), Dashboard page.
- One earlier demo scan already completed (so history/KPIs are populated).
- Terminal tab ready with the e2e command as backup: `node scripts/e2e.mjs`.

---

## 0:00–0:30 — Hook (Dashboard)

**Click:** nothing yet. Let them read the dashboard.

**Say:**
> "This is Shulker — a zero-trust API vulnerability scanner. Everything on this dashboard is real output from a real scan: confirmed findings with HTTP proof, severity distribution, endpoint coverage. Watch — I'll go from zero to a full findings report in under a minute."

**Click:** **Run Local Demo**.

---

## 0:30–1:15 — Live scan (New Scan → live monitor)

**What happens:** auto-navigates to New Scan; progress bar fills; timeline steps tick; event stream scrolls.

**Say:**
> "The engine parses the API contract, authenticates as two separate user identities, builds a resource-ownership model, then runs bounded authorization tests. Every event you see is a real HTTP exchange against the target. It's an AI-assisted scan — Gemini ranks what to test — but a finding only exists if the scanner reproduces it with raw requests. Zero LLM guesses."

**Point out:** the budget line — *"capped request count, so it can never hammer a target."*

---

## 1:15–2:15 — Findings walkthrough (the money shot)

**Click:** **Findings** when the scan completes.

**Say, per finding (top to bottom):**
> "CRITICAL: Broken Function-Level Authorization — a regular user escalated their own role to admin. Three HIGH BOLA findings — user Alice read Bob's vehicle, service records and invoices just by changing object IDs. One HIGH data exposure — the API returns password hashes it never should. And one potential: no rate limiting on the login endpoint."

**Click:** the CRITICAL BFLA finding → detail page.

**Say:**
> "Every finding ships the full evidence: attacker identity, expected vs actual behavior, the raw redacted request/response, and a copy-paste curl PoC. This isn't a hallucination — the judge can replay it themselves."

**Click:** **Copy PoC** — show it's a real curl command.

---

## 2:15–3:00 — Evidence + redaction

**Click:** **Evidence** tab.

**Say:**
> "All evidence is captured with secrets redacted at capture time — the bearer token the scanner used never appears in the UI, reports, or logs. That's a hard rule enforced in one chokepoint, not a convention."

**Point out:** the `[REDACTED]` markers in the request headers.

---

## 3:00–3:45 — One-click API templates (the wow moment)

**Click:** **New Scan** → "Real API" mode → **Quick API Templates** → **Gemini API**.

**Say:**
> "Real-world demo. One click — target, auth scheme, and a valid OpenAPI 3.0.3 contract generated in memory. No files. I can scan Google's Gemini API the moment I paste my key."

**Click:** **View Generated Contract** → show JSON → close.
**Mention:** "Same one-click flow for OpenAI, GitHub, and Stripe. Custom APIs still support OpenAPI URL, file upload, Postman, and HAR."

---

## 3:45–4:30 — Safety story (external mode)

**Click:** New Scan → Real API → toggle **Allow External Targets**.

**Say:**
> "External scanning is behind two independent gates: a settings toggle AND a per-scan authorization confirmation. Non-local targets are refused at the backend otherwise. Budgets, timeouts, cancel, and redaction are non-removable — this is a scanner that can't be abused as a weapon."

---

## 4:30–5:00 — Reports + close

**Click:** **Reports** → **Generate HTML** → **View**.

**Say:**
> "Shareable, redacted report in HTML, Markdown, or JSON — same findings the CLI emits, so it drops straight into CI as a quality gate. Shulker: authentication asks who you are — Shulker asks *may you see this*. Thanks — questions?"

---

## Failure recovery

| Problem | Recovery |
|---|---|
| Demo scan stalls | `node scripts/verify-demo.mjs` in the terminal tab — re-runs headlessly in ~20s |
| Backend offline banner | `npm run dev:api`, wait for the "online" dot (auto-reconnects) |
| Judge asks to scan a real external API | Decline politely on-stage (needs an owned key); show the recorded Petstore verification in `scripts/e2e.mjs` output instead |
