# Screenshot Brief — Findings

**File:** `findings.png` · **Page:** Findings (and FindingDetail) · **Precondition:** completed demo scan

## What must be visible

**Shot A — Findings list:**
- Severity filter chips (Critical / High / Potential) with counts: 1 critical, 4 high, 1 potential.
- The **CRITICAL BFLA** finding row first: role escalation on `PATCH /users/{id}/role`.
- Three **HIGH BOLA** rows: vehicles, service records, invoices.
- One **HIGH exposure** row (`passwordHash`), one **MEDIUM potential** (login rate limiting).

**Shot B — Finding detail (the money shot):**
- **Attack Context** panel: attacker identity (Alice) vs resource owner (Bob), the swapped object ID, expected vs actual behavior.
- **Evidence block** with the redacted request/response pair — `Authorization: Bearer [REDACTED]` must be legible.
- **Remediation** section (server-side ownership predicate) and severity reasoning.
- **Copy PoC** button with the real curl command.

## Capture instructions

Run a demo scan, open Findings, capture the full list; then click the CRITICAL finding and capture the detail page (scroll so the redacted evidence block is visible). Two images: `findings.png` and `finding-detail.png`.

## Why this shot matters to judges

This proves the two headline claims at once: **no hallucinations** (expected-vs-actual with a replayable curl — the judge can verify it themselves) and **redaction works** (`[REDACTED]` visible in the evidence of a security tool's own report). If only one screenshot survives compression, this should be it.

**Caption suggestion:** *"Every finding ships reproducible proof: attacker context, expected vs actual behavior, redacted evidence, and a copy-paste PoC curl."*
