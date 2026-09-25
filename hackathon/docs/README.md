# hackathon/docs — Shulker Documentation

Judge-facing documentation set. For live-demo materials see `../shows/`; for the PDF guides see the repo-root `docs/` folder.

## Files

| File | Contents |
|---|---|
| `PROJECT_GUIDE.md` | What Shulker is, quickstart, feature tour, verification status |
| `ARCHITECTURE.md` | Component map, request/data flow, directory layout, design invariants |

## The 30-second orientation

**Shulker** is an AI-assisted zero-trust API vulnerability scanner (AmiHacks Track C). It discovers API endpoints from any contract source — OpenAPI 3/Swagger 2, Postman collections, HAR recordings, manual entry, or one-click in-memory specs for Gemini/OpenAI/GitHub/Stripe — then runs bounded, authorized security tests that prove the OWASP API Top 10 authorization family: BOLA, BFLA, Excessive Data Exposure, Weak Rate Limiting. Gemini hypothesizes; deterministic detectors verify; every finding ships redacted HTTP evidence and a replayable PoC.

## Quickstart

```bash
npm install
npm run dev        # ShulkerLab :8700 + backend :8600 + dashboard :5173
```

Open `http://localhost:5173` → **Run Local Demo** → findings in ~30 seconds.

## Verified status (demo day baseline)

- 60/60 end-to-end checks (`node scripts/e2e.mjs`)
- 19/19 unit tests (`npm test`)
- `tsc --noEmit` clean across all workspaces · `vite build` green
- Demo scan: 5 confirmed (1 CRITICAL BFLA, 3 HIGH BOLA, 1 HIGH exposure) + 1 potential (rate limiting), tokens redacted in every artifact
