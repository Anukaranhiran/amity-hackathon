# Problem Statement

## The situation

APIs now carry the majority of the internet's sensitive traffic, and the dominant vulnerability class in the [OWASP API Security Top 10](https://owasp.org/API-Security/) is a single family: **broken authorization**.

- **API1 — BOLA (Broken Object-Level Authorization):** a valid user changes an object ID in the request and reads someone else's data. The server authenticated the caller, then never asked whether they own the object.
- **API5 — BFLA (Broken Function-Level Authorization):** an admin action (`PATCH /users/{id}/role`) is hidden in the UI but unprotected in the backend. Any user's token can call it.
- **API3 — Excessive Data Exposure:** the API returns entire database rows (including `passwordHash`) and trusts clients to ignore sensitive fields. Attackers read raw HTTP.
- **API4 — Unrestricted Resource Consumption:** no rate limiting on login or data endpoints, so a manual exploit becomes a full-scale breach overnight.

Real breaches follow exactly this pattern — the Uber 2022 SaaS-attack chain and countless IDOR bug-bounty reports among them. No malware, no crypto-breaking: **one legitimate credential, and a server that trusts it too much.**

## Why the problem persists

| Existing approach | Failure mode |
|---|---|
| Annual penetration tests | Expensive, per-API, and stale the day after the report |
| Bug bounties | Find flaws only after launch, in public, one report at a time |
| Classic DAST scanners | Fuzz parameters generically; produce noisy, non-specific findings teams can't act on |
| LLM-based "AI scanners" | Produce confident hallucinations with no reproducible proof — worse than noise, because they erode trust in real findings |

The root gap: **authorization flaws are provable facts, but nothing tests for them continuously with evidence.** If user A's token can read user B's object, that is not a guess — it is a reproducible HTTP exchange. The missing piece is the boring, careful work of managing two identities, modeling who owns what, and replaying the right requests.

## The question we set out to answer

> Can a tool prove — continuously, before every deploy, with evidence an engineer can replay themselves — that an API enforces (or fails to enforce) authorization, without hallucinating findings and without becoming an attack surface itself?

That question is what Shulker answers.
