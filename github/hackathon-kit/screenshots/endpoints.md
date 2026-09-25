# Screenshot Brief — Endpoints

**File:** `endpoints.png` · **Page:** Endpoints (Endpoint Explorer) · **Precondition:** completed demo scan

## What must be visible

- The endpoint table for the scanned target (ShulkerLab): method chips (GET/POST/PATCH), path, and per-endpoint status columns.
- **Auth / Authorization columns** — which endpoints are protected vs public.
- **Test outcome pills** — PASS (positive controls, e.g. correctly-denied BOLA probes), FAIL/finding, UNTESTED — showing the scanner records successes as well as failures.
- One row expanded to show its test records.
- Endpoint count matching the discovery phase event (ShulkerLab's full inventory).

## Capture instructions

1. After a demo scan, open **Endpoints** from the sidebar.
2. Capture the full table with one row expanded (click a BOLA-tested endpoint for the richest expansion).
3. If the Coverage page state is also wanted, capture `coverage.png` from Discovery & Intelligence → Coverage (overall ring + per-resource bars).

## Why this shot matters to judges

This answers "does it actually test everything, or cherry-pick?" in one frame: the whole discovered inventory is visible with per-endpoint outcomes, and PASS pills on correctly-protected endpoints demonstrate **positive controls** — the harness proves it works while it tests, and the scanner isn't crying wolf.

**Caption suggestion:** *"Endpoint Explorer — the full discovered inventory with per-endpoint test outcomes; PASS pills mark correctly-protected endpoints (positive controls)."*
