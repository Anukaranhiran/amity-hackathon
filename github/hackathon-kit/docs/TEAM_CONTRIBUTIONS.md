# Team Contributions — Shulker

Shulker was built end-to-end for AmiHacks Track C by a small team owning the full stack: engine, backend, sandbox, dashboard, docs, and demo.

## Ownership map

| Area | Deliverables | Owner |
|---|---|---|
| **Scanner engine** | `packages/scanner-core` — 7-phase `ScanEngine`, spec parser (OpenAPI/Swagger/Postman/HAR), resource-ownership model, four OWASP detectors, evidence pipeline | Anukaran |
| **Safety core** | `SafeHttpClient` (single network chokepoint), request budgets / watchdog / cancel, two-gate external consent | Anukaran |
| **AI integration** | `ai.ts` Gemini hypothesis bridge, deterministic-verification architecture, template-generated specs | Anukaran |
| **Backend & API** | `apps/scan-api` — zero-dependency Node server (898 lines): REST routes, SSE hub, `node:sqlite` persistence, HTML/MD/JSON reports | Anukaran |
| **ShulkerLab sandbox** | `apps/sandbox` — deliberately vulnerable demo API with BOLA/BFLA/exposure/rate-limit flaws, two-actor auth, OpenAPI contract | Anukaran |
| **Dashboard (web)** | `apps/web` — React 18 + Vite, 14 pages, live SSE scan monitor, dark/light design system, one-click API templates (488-line `templates.ts`) | Anukaran |
| **CLI** | `apps/cli` — `shulker scan --fail-on` CI quality gate | Anukaran |
| **Quality & verification** | 60-check e2e suite, 19 unit tests, typecheck/build gates, redaction assertions, demo verification script | Anukaran |
| **Documentation & demo kit** | This hackathon kit, architecture/security docs, diagrams, deck content, demo script | Anukaran |

## Working model

- **Design-first:** the "no proof, no finding" invariant and the single-egress chokepoint were decided before any detector code was written — every feature was then built inside those rails.
- **Verification-driven:** the e2e suite defines "done." Every feature landed only after its e2e checks passed, including the 14-case authorization matrix and credential-leak greps.
- **Zero-dependency discipline:** runtime deps are limited to `yaml` (engine) and `react`/`react-dom` (web); the entire backend is Node stdlib to keep the security tool auditable.

## Contact

- **Anukaran** — project lead, architecture, and implementation
