# Deployment Guide — Shulker

Three ways to run Shulker: locally, on Railway (full stack), or on Vercel (dashboard only).

## Ports & services

| Service | Path | Default port |
|---|---|---|
| ShulkerLab sandbox (vulnerable demo target) | `apps/sandbox` | 8700 |
| Scanner backend (REST + SSE + sqlite) | `apps/scan-api` | 8600 |
| React dashboard | `apps/web` | 5173 |

## Local

```bash
npm install
npm run dev          # all three services
```

Requires Node 20 (see `.nvmrc`).

## Railway (full stack)

1. Push this repo to GitHub, then create a new Railway project from the repo.
2. Railway auto-detects `railway.json` + `Procfile`:
   - Build: `npm install && npm run build --workspace apps/web`
   - Start: `npm run dev`
3. Set environment variables (from `.env.example`):
   - `GEMINI_API_KEY` (optional — without it the scanner runs in deterministic mode)
   - `PORT` (backend), `SANDBOX_PORT`
   - `SANDBOX_JWT_SECRET` — set a strong random value in production
4. Expose the dashboard port; the backend and sandbox run as internal processes.

## Vercel (dashboard only)

`vercel.json` is preconfigured:

- Root directory: `apps/web`
- Build: `npm run build --workspace apps/web`
- SPA rewrites enabled

**Note:** the Vercel deployment serves the dashboard only. The scanner backend and sandbox must run elsewhere (Railway, Fly.io, a VPS, or localhost) — point the dashboard's API base URL at the backend instance.

## CI gate

```bash
npm run typecheck && npm test && npm run test:e2e
```

The 60-check e2e suite runs the real engine against the real sandbox — the definitive verification that a deployment works.

## Security notes for production

- Never commit a real `.env`; only `.env.example` is in the repo.
- Change `SANDBOX_JWT_SECRET` from the demo default.
- The backend's two-gate external-target consent stays enabled regardless of environment — local/loopback targets always work; public hosts require both the settings toggle and the per-scan authorization flag.
