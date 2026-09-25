# screenshots/ — capture inventory

Capture these from the running app (`npm run dev` → `http://localhost:5173`, dark theme, 1920×1080, browser zoom 100%). Save PNGs in this folder with the exact names below so `PPT_CONTENT.md` and the deck can reference them directly.

| # | File name | What to capture | Where in the app |
|---|---|---|---|
| 1 | `01-dashboard.png` | Dashboard with a completed scan: KPI cards, scan-status ring + phase timeline, recent findings table, severity donut | Dashboard (landing page after a demo scan) |
| 2 | `02-findings.png` | Full findings list: severity filter chips (5 confirmed + 1 potential), CRITICAL BFLA row visible | Findings |
| 3 | `03-finding-detail.png` | BOLA finding detail: Attack Context (Alice vs Bob), expected vs actual, redacted evidence, remediation | Click any BOLA finding |
| 4 | `04-endpoints.png` | Endpoint Explorer table: method chips, auth/authz columns, PASS/FAIL pills, one row expanded | Endpoints |
| 5 | `05-reports.png` | Reports page with all three generated cards showing READY status | Reports → Generate HTML/MD/JSON |
| 6 | `06-gemini-scan.png` | New Scan → Real API → Gemini template selected: auto-filled target, `x-goog-api-key`, contract notice + View Generated Contract modal open | New Scan → Quick API Templates |
| 7 | `07-shulkerlab-scan.png` | Live scan monitor: progress bar mid-run, phase timeline, scrolling event stream | Run Local Demo → New Scan monitor |
| 8 | `08-attack-surface.png` | Attack Surface: resource groups with tested/finding pills | Discovery & Intelligence → Attack Surface |
| 9 | `09-coverage.png` | Coverage Report: overall ring, per-resource bars, endpoint detail table | Discovery & Intelligence → Coverage |
| 10 | `10-resource-graph.png` | Resource relationship graph with finding-colored nodes | Discovery & Intelligence → Resource Graph |
| 11 | `11-external-mode.png` | External Authorized Mode: warning banner + Allow External Targets checked | New Scan → Real API |
| 12 | `12-cli.png` | Terminal running `shulker scan … --fail-on high` with findings output + non-zero exit | Terminal |

## Capture tips

- Run a demo scan first so all pages have real data.
- Use the browser's full-page screenshot (or ⌘⇧4 then window) — avoid cropped fragments.
- Keep the dark theme for consistency; add `*-light.png` variants only if time permits.
- `03-finding-detail.png` should visibly show `[REDACTED]` in the evidence block — it's the redaction proof shot.

**Status:** placeholders only — PNGs pending final capture pass before submission.
