# Shulker — Future Roadmap

Where the project goes after the hackathon, in four horizons. Each item names the engine concept it extends and why it matters.

---

## Horizon 1 — Developer-workflow integration (next 1–2 months)

### Record-a-login: auto-derived actors
**Today:** the operator supplies credentials or static headers for each identity.
**Next:** a browser extension / proxy recorder captures a real login flow once, and the engine derives actors (Alice, Bob, admin) automatically — including token-refresh and multi-step logins. This removes the last manual step of scanning an arbitrary API and unlocks multi-role BFLA testing on any authenticated app.

### Diff-scans for CI
**Today:** `shulker scan --fail-on high` fails CI on any finding at or above the threshold.
**Next:** the engine compares each scan against the previous persisted scan and emits a delta (new / regressed / fixed). CI fails **only on new or regressed findings**, so a known-accepted finding doesn't block every deploy forever. Fixes become visible: "this PR closed 2 BOLA findings" appears in the report.

### Trend tracking & dedup
A findings-dedup layer across scans (fingerprint on type + endpoint + identity pair) gives each issue a stable identity and a first-seen/last-seen timeline — the basis for MTTR metrics and severity trends on the dashboard.

## Horizon 2 — Broader coverage (2–4 months)

### GraphQL ingestion
GraphQL introspection maps naturally onto the resource model: every field resolver is an authorization boundary. BOLA translates to "object A's field readable via object B's query"; the ownership model already supports it.

### More detectors, same framework
The detector interface (bounded probes → TestRecord → evidence) admits new families without architectural change:
- **Mass assignment** — send documented + undocumented writable fields on PATCH/PUT as a low-privilege actor.
- **Broken object-level property authorization** — subset exposure checks per-property rather than per-object.
- **Unrestricted business flows** — bounded sequence tests (order → cancel → refund) modeled as state machines.

### Auth-flow intelligence
Beyond static headers: detect OAuth2 flows from the contract, handle token expiry/retry, and test token-scope enforcement (an access token for scope `read` calling a `write` endpoint).

## Horizon 3 — Scale and teams (4–8 months)

### Multi-tenant reporting & workspaces
Team workspaces with per-project scan histories, evidence retention policies, and role-based access — moving Shulker from a tool into a lightweight API-security posture product.

### Scheduled scans & alerting
Cron-style scan schedules per target with webhook/Slack/email alerts on new findings; the existing SSE infrastructure extends naturally to server-to-server notifications.

### Scanner SDK / plugin API
Formalize the detector interface as a public plugin contract so the community can add detectors against the same safety primitives (budget, chokepoint, redaction) without touching core code.

## Horizon 4 — Intelligence (6–12 months)

### Smarter hypothesis engine
Feed Gemini richer context: per-endpoint positive-control history, field-level schema diffs, and cross-scan trends. The advisory layer improves; the verification layer stays untouched — the "no proof, no finding" invariant is permanent.

### Learned ownership models
Infer resource-ownership graphs automatically from observed data correlations (IDs appearing in responses across endpoints) instead of requiring an explicit model, improving BOLA coverage on APIs with opaque ID schemes (UUIDs, encoded IDs).

---

## What will *not* change

The design invariants are permanent, by intent:

1. No HTTP proof → no finding. AI stays advisory forever.
2. Redact before persistence.
3. All egress through `SafeHttpClient`.
4. Two-key consent for external targets.
5. Bounded execution — budgets, watchdog, cancel.
6. Honest labels — `potential` never dressed up as `confirmed`.

Every roadmap item above ships inside those rails.
