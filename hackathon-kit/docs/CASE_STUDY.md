# Case Study — Anatomy of a Real API Breach

A fictional but faithful composite of real-world incidents (the pattern behind the Uber 2022 SaaS-attack chain, countless IDOR bug-bounty reports, and the OWASP API Top 10). We follow one attacker, one stolen-adjacent credential, and one API — then show exactly where Shulker's detectors intersect each step.

---

## The setup

**Northwind Rides** — a car-sharing platform. Its mobile app talks to `api.northwind.example`:

- `POST /auth/login` — issues JWTs, no rate limiting
- `GET /api/vehicles/{vehicleId}` — vehicle details, including service history
- `GET /api/invoices/{invoiceId}` — customer invoices
- `PATCH /api/users/{userId}/role` — admin panel's "promote user" action
- `GET /api/users/me` — returns the full user record

The backend **authenticates** every request (valid JWT required). It **authorizes** almost nothing.

## Step 1 — the attacker gets one legit account

The attacker signs up like anyone else and receives a normal JWT as user **Mallory**. No breach needed — free-tier registration is the entry point.

> **Shulker equivalent:** the engine authenticates two test actors (Alice = regular, admin = privileged) in `engine.ts` phase 2. Mallory *is* Alice in this story: just a valid low-privilege identity.

## Step 2 — BOLA: reading strangers' data (OWASP API1)

Mallory's app calls `GET /api/vehicles/1042` (her car). She edits the ID: `1043`. **200 OK** — someone else's car, with its service records. She does the same on `/api/invoices/8891` — a stranger's invoice, name, address. A 20-line script later, she holds every customer's billing data.

Why it works: handlers fetch by primary key with no `WHERE owner = current_user` check. Authentication passed, so the request was "valid."

> **Shulker detector — `packages/scanner-core/src/detectors/bola.ts`:**
> authenticates as Alice, discovers object IDs Alice owns (vehicles, records, invoices), then replays each request with **Bob's** token and with no token. Any 200 that returns another identity's data becomes a **confirmed HIGH finding** — with both requests, both responses, and a replayable curl. In our demo scan this pattern fires **three times** (vehicles, service records, invoices).

## Step 3 — BFLA: becoming admin (OWASP API5)

Scanning the mobile app's JS bundle, Mallory finds `PATCH /api/users/{userId}/role` — an admin-panel action. The web UI hides it from regular users, but the backend only checks *authentication*, not *role*:

```http
PATCH /api/users/6102/role   →  {"role": "admin"}
Authorization: Bearer <Mallory's normal token>
```

**200 OK.** Mallory is now an admin of Northwind Rides.

> **Shulker detector — `detectors/bfla.ts`:**
> flags endpoints whose paths/operations suggest privileged primitives (`*/role`, `/admin/*`, destructive verbs), then calls them **as the low-privilege actor**. A success response is a **confirmed CRITICAL** finding. Endpoints that correctly reject the low-privilege actor are recorded as PASS — positive controls proving the scanner isn't crying wolf. Our demo ships with this exact flaw and Shulker marks it **CRITICAL**.

## Step 4 — Excessive Data Exposure (OWASP API3)

Mallory profiles `GET /api/users/me` and notices the response is richer than the app ever displays:

```json
{ "id": 6102, "name": "Mallory", "email": "…", "passwordHash": "sha256$…", "internalFlags": ["beta"] }
```

The API returns the **entire database row** and trusts clients to ignore sensitive fields. Attackers read raw HTTP. The password hashes are now crackable offline.

> **Shulker detector — `detectors/exposure.ts`:**
> diffs each response against the contract's documented schema. Fields that are documented-never but observed-always — especially names matching the sensitive list (`passwordHash`, `ssn`, `secret`, `token`) — become **HIGH findings** with the exact field list and sample (redacted) payload. Our demo confirms one: `passwordHash` leaking on the user record.

## Step 5 — scaling up: no rate limiting (OWASP API4)

Mallory writes the whole chain into a loop. Nothing ever throttles her: not `/auth/login` (credential stuffing), not the ID iteration, nothing. The breach scales from one account to the entire customer base overnight.

> **Shulker detector — `detectors/ratelimit.ts`:**
> fires a **polite, capped burst** (default 12, max 25 requests) at auth-sensitive endpoints and checks for 429/Retry-After behavior. Absence of throttling is reported as a **MEDIUM potential** finding — honestly labeled *potential*, because a scanner can't fully prove negatives. Our demo flags `/auth/login` exactly this way.

## How the kill chain maps to Shulker

| Breach step | OWASP | Shulker detector | Demo result |
|---|---|---|---|
| Read stranger's vehicle / records / invoices | API1 BOLA | `detectors/bola.ts` cross-identity replay | 3× HIGH confirmed |
| Promote self to admin | API5 BFLA | `detectors/bfla.ts` privilege probing | CRITICAL confirmed |
| Dump password hashes | API3 Exposure | `detectors/exposure.ts` schema diff | HIGH confirmed |
| Scale without throttling | API4 Rate limit | `detectors/ratelimit.ts` bounded burst | MEDIUM potential |

**The lesson Shulker encodes:** a stolen key is rarely the root cause. The root cause is an API that *trusts the key too much* — it authenticates the caller but never authorizes the object or the action. That entire kill chain is demonstrable with one free account, and Shulker proves it end-to-end in about thirty seconds, with evidence a judge or engineer can replay themselves.
