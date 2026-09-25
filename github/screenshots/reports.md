# Screenshot Brief — Reports

**File:** `reports.png` · **Page:** Reports (`/api/report/:id.html|.md|.json`) · **Precondition:** completed demo scan + all three reports generated

## What must be visible

**Shot A — Reports page:**
- The completed scan selected; three format cards (HTML / Markdown / JSON) in READY state with generate/download actions.

**Shot B — Rendered HTML report (browser tab or preview):**
- Styled, shareable report header (target, date, scan profile).
- Findings table with the exact demo result set (1 CRITICAL, 4 HIGH, 1 potential).
- Evidence blocks inside the report showing `[REDACTED]` tokens.
- No credentials anywhere on the page.

## Capture instructions

1. Reports page → **Generate HTML**, **Generate Markdown**, **Generate JSON**.
2. Capture the page with all three cards showing.
3. **View** the HTML report and capture the rendered page (header + findings table + one redacted evidence block visible).
4. Optional third shot: terminal with `node apps/cli/src/cli.ts scan --target http://127.0.0.1:8700 --openapi http://127.0.0.1:8700/openapi.json --fail-on high` showing findings + non-zero exit code — *"the CI gate"* framing.

## Why this shot matters to judges

It shows findings leaving the dashboard as workflow artifacts: a human-readable report for triage, Markdown for PRs/wikis, JSON for pipelines — and the redaction guarantee holding in every format (the e2e suite greps all three for leaked secrets).

**Caption suggestion:** *"Redacted reports in HTML, Markdown, and JSON — the same findings the CLI gates CI on."*
