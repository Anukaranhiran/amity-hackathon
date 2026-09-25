# Screenshot Brief — Sandbox Scan (Live Monitor)

**File:** `sandbox-scan.png` · **Page:** New Scan → live monitor · **Precondition:** demo scan mid-run

## What must be visible

- **Progress bar** mid-run (~60–80% is visually best).
- **Phase timeline** with completed phases ticked (Parse ✓, Authenticate ✓, Resources ✓) and the current phase highlighted (Testing).
- **Live event stream** scrolling — a mix of event types: `ENDPOINTS_DISCOVERED` (with count), `AUTH_OK`, detector test events, evidence-capture events.
- The **budget/request-count line** — the capped request counter, key to the "bounded by construction" story.
- The **cancel button** visible (safety control on screen).

## Capture instructions

1. Click **Run Local Demo** from the Dashboard.
2. On the live monitor, wait until the timeline shows 3–4 completed phases and the event stream is actively scrolling.
3. Capture. Take 2–3 candidates and pick the one with the most legible event text.
4. Optional companion: the same view right at `SCAN_DONE` when the UI auto-navigates to Findings.

## Why this shot matters to judges

This is the "it's actually running" proof: a real scan in flight against the real ShulkerLab sandbox, with every event corresponding to an actual HTTP exchange. It also visualizes the safety story — budget counter and cancel control are on the same screen as the testing.

**Caption suggestion:** *"Live scan monitor — every event is a real HTTP exchange against ShulkerLab; the request budget and cancel control are always on screen."*
