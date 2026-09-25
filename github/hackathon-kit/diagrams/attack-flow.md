# Attack Flow

The Northwind Rides breach chain (see `docs/CASE_STUDY.md`) as a diagram: how an attacker with one free account goes from signup to full customer-data compromise — and where each Shulker detector intercepts the chain.

```mermaid
flowchart TD
    ATTACKER(["Attacker — Mallory"]) --> SIGNUP["Step 1 · Free signup<br/>receives a perfectly valid low-privilege JWT<br/>(no breach required — registration IS the entry point)"]

    SIGNUP --> BOLA["Step 2 · BOLA (OWASP API1)<br/>GET /api/vehicles/1042 → 200 OK<br/>change ID to 1043 → 200 OK — stranger's car + service records<br/>same on /api/invoices/8891 — stranger's invoice, name, address"]
    BOLA --> LOOP["20-line iteration script<br/>→ every customer's billing data"]

    SIGNUP --> BFLA["Step 3 · BFLA (OWASP API5)<br/>finds PATCH /api/users/{id}/role in the app's JS bundle<br/>(hidden in the UI, unprotected in the backend)"]
    BFLA --> ADMIN["PATCH own role → {\"role\": \"admin\"} → 200 OK<br/>Mallory is now an admin"]

    SIGNUP --> EXPO["Step 4 · Excessive Data Exposure (OWASP API3)<br/>GET /api/users/me returns the full DB row<br/>including passwordHash — crackable offline"]

    ADMIN & LOOP & EXPO --> SCALE["Step 5 · No rate limiting (OWASP API4)<br/>nothing throttles /auth/login (credential stuffing),<br/>ID iteration, or any of it<br/>→ breach scales to the entire customer base overnight"]

    subgraph Detection["🛡️ Where Shulker intercepts (one ~30-second scan)"]
        D1["bola.ts — cross-identity replay:<br/>Alice's requests replayed with Bob's token → 3× HIGH confirmed"]
        D2["bfla.ts — privileged primitives called as low-priv actor → CRITICAL confirmed"]
        D3["exposure.ts — response vs documented schema diff → HIGH confirmed"]
        D4["ratelimit.ts — polite capped burst, no 429 → MEDIUM potential"]
    end

    BOLA -.->|"detector"| D1
    BFLA -.->|"detector"| D2
    EXPO -.->|"detector"| D3
    SCALE -.->|"detector"| D4

    D1 & D2 & D3 & D4 --> OUT["Every detection ships redacted evidence<br/>+ expected-vs-actual + replayable curl PoC<br/>→ fix before deploy, not after the headline"]

    style SIGNUP fill:#f0f7fd,stroke:#0284c7
    style BOLA fill:#fef2f2,stroke:#dc2626
    style BFLA fill:#fef2f2,stroke:#dc2626
    style EXPO fill:#fef2f2,stroke:#dc2626
    style SCALE fill:#fef2f2,stroke:#dc2626
    style ADMIN fill:#fffbeb,stroke:#d97706
    style OUT fill:#f0fdf4,stroke:#16a34a
```

## The pattern in one sentence

> A stolen key is rarely the root cause — the root cause is an API that *trusts the key too much*: it authenticates the caller but never authorizes the object or the action.

All four vulnerability classes in this chain belong to one family (the OWASP API Top 10 authorization group), all are reachable with **zero malware and zero exploit primitives** — just a valid account — and all four are provable with two identities and the right replayed requests, which is exactly what Shulker automates.
