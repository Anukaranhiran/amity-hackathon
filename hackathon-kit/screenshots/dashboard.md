# Screenshot Brief — Dashboard

**File:** `dashboard.png` · **Page:** Overview (`http://localhost:5173`, dark theme) · **Precondition:** one completed demo scan

## What must be visible

- **KPI cards with real deltas** vs the previous scan: Confirmed Findings, Critical/High count, Endpoints Tested, Tests Passed — each showing a change indicator, proving persistence across scans.
- **Scan-status ring + phase timeline** for the latest scan (all 7 phases ticked).
- **Recent findings table** — CRITICAL BFLA row on top, the three HIGH BOLA rows, HIGH exposure.
- **Severity donut** — 1 critical / 4 high / 1 potential.
- **Top vulnerability types** — BOLA, BFLA, Exposure, Rate Limiting.
- **Recent activity** strip.

## Capture instructions

1. `npm run dev` → open `http://localhost:5173` at 1920×1080, browser zoom 100%.
2. Run **Run Local Demo** once, wait for completion, then run a second scan so KPI deltas are non-zero.
3. Full-window screenshot (⌘⇧4 then space, or browser full-page capture). Dark theme for consistency.

## Why this shot matters to judges

This is the first impression: every number on screen is output from a real scan against the real ShulkerLab sandbox — no mock data. It shows persistence (deltas), correctness (severity distribution matches the known finding set), and polish in one frame.

**Caption suggestion:** *"The Shulker dashboard — every metric is real output from a live scan of the ShulkerLab sandbox."*
