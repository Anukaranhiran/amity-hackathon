# Screenshot Brief — Gemini Scan (One-Click External Template)

**File:** `gemini-scan.png` · **Page:** New Scan → Real API → Quick API Templates · **Precondition:** template selected, contract modal open

## What must be visible

**Shot A — Template configured:**
- **Gemini API** template selected in Quick API Templates.
- Auto-filled fields: target `https://generativelanguage.googleapis.com`, auth mode **API Key** with header `x-goog-api-key`, external mode enabled, generated contract selected.
- The warning banner *"Only scan APIs you own or are authorized to test"* and the authorization checkbox — the two-gate consent UI.

**Shot B — View Generated Contract modal:**
- The generated OpenAPI 3.0.3 JSON (scroll so `securitySchemes` with `x-goog-api-key` is visible).
- View / copy / download actions — proving the spec is generated in memory, no files.

## Capture instructions

1. New Scan → **Real API** → Quick API Templates → **Gemini API**.
2. Capture the configured form (Shot A).
3. Click **View Generated Contract**, capture the modal (Shot B), close.
4. Optional Shot C: Settings page showing the **Allow External Targets** toggle with its warning banner.

Do **not** paste a real API key before capturing — the API-key field should show placeholder/empty state so no secret appears in the screenshot.

## Why this shot matters to judges

One frame answers "does this work on real APIs or only the demo?": Google's Gemini API configured with one click, a valid OpenAPI contract generated in memory, and the consent gates visible in the same shot — real-world reach and safety-by-design together. (The e2e suite's live Swagger Petstore scan — 19 endpoints, redacted credentials — is the recorded verification behind this flow.)

**Caption suggestion:** *"One click: Gemini API target, API-key auth, and a valid OpenAPI 3.0.3 contract generated in memory — behind two consent gates."*
