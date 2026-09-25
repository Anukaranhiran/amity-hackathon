# Submission Checklist — Shulker (AmiHacks Track C)

Tick every box before the deadline. Verification command in parentheses.

## Build & correctness
- [ ] GitHub pushed (final commit + `git push`; verify on a fresh clone / incognito window)
- [ ] README complete (repo root `README.md`: what/why, quickstart, screenshots, API, verification status)
- [ ] PPT ready (`hackathon-kit/presentation/PPT_CONTENT.md` → deck exported, speaker notes rehearsed)
- [ ] Demo verified — full run within the last hour (`node scripts/e2e.mjs` → 60/60; `node scripts/verify-demo.mjs` → live scan OK)
- [ ] Architecture diagrams render (`hackathon-kit/diagrams/*.md` — check on mermaid.live)
- [ ] Screenshots captured per `hackathon-kit/screenshots/*.md` briefs
- [ ] Build passing (`npm run build` → vite build green)
- [ ] Typecheck passing (`npm run typecheck` → clean across all workspaces)

## Demo-day kit
- [ ] `npm run dev` starts clean from a cold terminal (sandbox :8700 · backend :8600 · web :5173)
- [ ] Demo scan completes: 5 confirmed (1 CRITICAL BFLA, 3 HIGH BOLA, 1 HIGH exposure) + 1 potential
- [ ] Evidence shows `[REDACTED]` tokens (redaction proof shot captured)
- [ ] Gemini template one-click flow rehearsed (View Generated Contract modal)
- [ ] CLI gate rehearsed: `node apps/cli/src/cli.ts scan --target http://127.0.0.1:8700 --openapi http://127.0.0.1:8700/openapi.json --fail-on high`
- [ ] Backup plans: `node scripts/verify-demo.mjs` (headless proof) + offline screenshots folder

## Docs & submission folder
- [ ] `hackathon-kit/docs/` — all 8 documents reviewed once (PROJECT_GUIDE · ARCHITECTURE · SECURITY_MODEL · CASE_STUDY · JUDGE_QNA · DEMO_SCRIPT · FUTURE_ROADMAP · TEAM_CONTRIBUTIONS)
- [ ] `hackathon-kit/submission/` — all 8 docs consistent with the final build
- [ ] PDFs current (repo-root `docs/Shulker-*.pdf` regenerated if the UI changed since last export)
- [ ] No secrets committed: `.env` gitignored, no API keys in repo or screenshots (grep for `sk-`, `eyJ`, known keys)

## Final hygiene
- [ ] `git status` clean — everything committed except intentional local files (`.env`, `data/`, `dist/`)
- [ ] Tags/links in submission form: repo URL · live-demo plan · team contacts
- [ ] Rehearsal done end-to-end with a 5-minute timer (see `docs/DEMO_SCRIPT.md`)
