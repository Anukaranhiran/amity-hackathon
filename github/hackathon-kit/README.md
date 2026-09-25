# Shulker — Hackathon Kit

AI-assisted, zero-trust API vulnerability scanner · AmiHacks Track C.
**"Authentication asks who you are. Shulker asks: *may you see this?*"**

This folder is the complete judge-facing package for the Shulker project: documentation, diagrams, presentation material, screenshot guidance, and the submission narrative. Everything here is derived from the actual, verified codebase in this repository.

## Folder map

| Folder | Contents |
|---|---|
| `docs/` | Project guide, architecture, security model, case study, judge Q&A, demo script, roadmap, team contributions |
| `diagrams/` | Mermaid-in-markdown diagrams: high/low-level architecture, scan pipeline, data flow, attack flow |
| `presentation/` | 10-slide deck content, speaker notes, elevator pitches, demo walkthroughs |
| `screenshots/` | Capture briefs for the six judge-critical screenshots |
| `submission/` | Problem statement, solution overview, innovation, impact, tech stack, features, checklist, executive summary |
| `LICENSE` | MIT — see also [LICENSE](LICENSE) |
| `CONTRIBUTING.md` | How to set up, build, test, and contribute |
| `CODE_OF_CONDUCT.md` | Community standards |

## The 60-second pitch

API breaches are rarely crypto failures. An attacker signs up, receives a perfectly valid credential, changes `/orders/101` to `/orders/102`, and reads a stranger's data — because the server authenticated the caller but never checked object ownership. That is BOLA, the #1 OWASP API risk.

**Shulker proves these flaws automatically, with evidence.** Give it a contract — OpenAPI 3/Swagger 2, Postman, HAR, manual rows, or a one-click in-memory spec for Gemini/OpenAI/GitHub/Stripe — and it authenticates as two identities, builds a resource-ownership model, and runs four deterministic detector families mapped to the OWASP API Top 10. Gemini ranks what to test first, but the engine's rule is absolute: **no reproduced HTTP exchange, no finding.** Every confirmed issue ships expected-vs-actual behavior, redacted request/response evidence, and a copy-paste PoC curl.

## Quickstart

```bash
npm install
npm run dev          # ShulkerLab sandbox :8700 · scanner backend :8600 · dashboard :5173
```

Open `http://localhost:5173` → **Run Local Demo** → 5 confirmed + 1 potential findings in ~30 seconds, each with replayable evidence.

## Verified status

| Gate | Result |
|---|---|
| End-to-end (`node scripts/e2e.mjs`) | **60/60** checks |
| Unit tests (`npm test`) | **19/19** |
| Typecheck | clean across all workspaces |
| Build | `vite build` green |

## License

MIT — see [LICENSE](LICENSE).
