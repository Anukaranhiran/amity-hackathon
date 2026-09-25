# Low-Level Architecture

Module-level view of the codebase: what each file does, what it may depend on, and the boundaries that make the safety guarantees enforceable.

```mermaid
flowchart LR
    subgraph Web["apps/web (React 18 + Vite :5173)"]
        APP["App.tsx — shell, routing, theme, sidebar state"]
        PAGES["pages/ ×14 — Overview · NewScan (678 ln) · Findings · FindingDetail · Endpoints · Evidence · Reports · ScanList · Inventory · AttackSurface · Coverage · ResourceGraph · Activity · Settings"]
        API["api.ts — typed REST client + EventSource(SSE)"]
        TPL["templates.ts (488 ln) — in-memory OpenAPI 3.0.3 generators"]
        CSS["styles.css — 19-section design system + check-css-usage.mjs guard"]
    end

    subgraph Server["apps/scan-api (node --experimental-strip-types, zero deps :8600)"]
        SRV["server.ts (898 ln) — routing · validateTarget() · buildAuthHeaders() · SSE hub · /api/report/:id.html|.md|.json · /api/settings"]
        DB2["db.ts (301 ln) — node:sqlite shulker.db"]
        DISC["discovery.ts (343 ln) — spec import + validateSourceUrl()"]
        REP2["reports.ts (227 ln) — HTML/MD/JSON renderers (input already redacted)"]
    end

    subgraph Core["packages/scanner-core"]
        ENGINE["engine.ts (388 ln) — 7 phases, budget meter, watchdog, cancel flag"]
        PAR["parser.ts (265 ln) — OpenAPI 3 / Swagger 2 / Postman v2.1 / HAR 1.2 → ApiSpecModel"]
        RES["resources.ts (129 ln) — collections, id-params, ownership map, actors"]
        AIB["ai.ts (159 ln) — Gemini ranked hypotheses (advisory; no path to Finding)"]
        DETS["detectors/ — bola.ts · bfla.ts · exposure.ts · ratelimit.ts"]
        HTTPC["http.ts (131 ln) — SafeHttpClient: scope gate · header hygiene · timeouts · budget"]
        EV["evidence.ts (80 ln) — capture → REDACT → attach"]
    end

    subgraph SharedPkg["packages/shared (zero deps)"]
        TYP["types.ts (225 ln) — ScanConfig · ScanResult · Finding · TestRecord · EvidenceRecord"]
        RD["redact.ts + sensitive.ts — JWT/sk-key/auth-header/sensitive-field → [REDACTED]"]
        SEV["severity.ts — ordering, roll-up, worst-severity"]
    end

    subgraph Apps2["apps/sandbox (ShulkerLab :8700) · apps/cli"]
        SBX["sandbox: vulnerable API — auth.ts two-actor JWT · db.ts · openapi.ts"]
        CLIC["cli.ts — scan · --target · --openapi · --api-key · --fail-on → exit code"]
    end

    APP --> PAGES --> API
    TPL --> PAGES
    CSS --> APP
    API -->|"REST + SSE"| SRV
    SRV --> DB2
    SRV --> DISC --> PAR
    SRV -->|"ScanEngine(config, hooks)"| ENGINE
    ENGINE --> PAR
    ENGINE --> RES
    ENGINE --> AIB
    ENGINE --> DETS
    DETS --> HTTPC
    DETS --> EV
    EV --> RD
    ENGINE --> SEV
    TYP -.->|"imported everywhere"| ENGINE
    TYP -.-> SRV
    TYP -.-> PAGES
    ENGINE -->|"ScanResult (redacted)"| DB2
    DB2 --> REP2
    CLIC --> ENGINE
    HTTPC -->|"bounded HTTP"| SBX
```

## Dependency rules (enforced by convention + imports)

1. **`packages/shared` depends on nothing** and is imported by everything — safety primitives (types, severity, redaction) cannot be bypassed by a module "forgetting" to import them, and there is exactly one implementation.
2. **`packages/scanner-core` depends only on `shared`** (+ `yaml` for parsing). No server, no DOM, no Node-specific assumptions where avoidable — the same engine runs in the CLI and the server.
3. **Detectors never touch the network directly.** They receive the shared `SafeHttpClient`; the chokepoint is structural, not stylistic.
4. **The server never sees unredacted evidence.** `evidence.ts` redacts before records leave the engine; `db.ts` and `reports.ts` handle already-redacted data.
5. **Server runs TypeScript directly** via `node --experimental-strip-types` — no build step; only `apps/web` is bundled (Vite).

## Key interfaces

| Interface | Shape | Why it matters |
|---|---|---|
| `ScanConfig` | target, spec, auth mode/credentials, budget, probe counts, aiEnabled, allowExternal, confirmAuthorized | The single configuration surface; consent flags travel with the config |
| `EngineHooks.onEvent` | typed scan events | Fanned to SSE by the server, stderr by the CLI — one event source, many consumers |
| `TestRecord` | expected vs actual HTTP behavior | Required to construct a `Finding` — the no-hallucination guarantee |
| `EvidenceRecord` | redacted request/response pair | Attached to findings; what makes every report item replayable |
| `SafeHttpClient.request()` | single egress call | Increments budget, enforces scope, blocks Host/Content-Length injection, applies timeout |
