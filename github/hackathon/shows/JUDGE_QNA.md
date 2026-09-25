# Judge Q&A — prepared answers

Format: **Q** → short answer (say this first), then technical depth (use only if pressed).

---

### Q: "How is this different from just asking ChatGPT to find vulnerabilities?"

**Short:** AI never decides. It hypothesizes; only a reproducible HTTP exchange promotes a finding.

**Technical:** Gemini receives the endpoint inventory and response samples and returns ranked hypotheses (which endpoints look juicy, which fields look sensitive). The engine converts hypotheses into concrete test actions executed by detectors. A `Finding` object cannot be constructed without a `TestRecord` containing the actual request/response pair. If the LLM is wrong, the test simply passes and nothing is reported. False-positive rate from LLM hallucination is structurally zero.

---

### Q: "What actually is BOLA and why does it matter?"

**Short:** The #1 API vulnerability (OWASP API1): the server authenticates you but never checks you own the object you're asking for.

**Technical:** `GET /api/vehicles/101` returns your car; `GET /api/vehicles/102` returns your neighbor's — because the handler fetches by ID with no ownership predicate. Attackers iterate IDs and scrape an entire user base with one valid account. Shulker detects it by authenticating two identities (Alice, Bob), building an ownership map from Alice's sessions, then replaying Alice's requests against Bob's object IDs. Any 200 with the wrong identity's token is a confirmed finding with the full exchange attached.

---

### Q: "How do you scan without breaking the target?"

**Short:** Hard request budget, bounded probes, timeouts, cancel — all enforced in one HTTP chokepoint.

**Technical:** `SafeHttpClient` (packages/scanner-core/src/http.ts) is the only code that touches the network. The engine counts every request against `config.budget` (default 150, max 400); a 5-minute watchdog cancels mid-phase; rate-limit probes are capped at 25 polite bursts; the UI exposes a cancel button that flips a flag checked between phases and inside detector loops. The scanner physically cannot exceed the budget the operator set.

---

### Q: "Can it scan a real external API?"

**Short:** Yes — verified live against Swagger Petstore with an API key, but external mode needs two explicit consent gates.

**Technical:** `validateTarget(url, allowExternal)` always permits loopback/private ranges; public HTTPS hosts require `allowExternal: true` (Settings toggle, persisted in DB) **and** `confirmAuthorized: true` (per-scan checkbox). Spec URL imports for public hosts go through the same gate in `validateSourceUrl`. In e2e we scanned Petstore with a static `api_key` header plus a custom header: 19 endpoints discovered, credentials redacted everywhere. Host/Content-Length header injection is blocked in the client.

---

### Q: "What if the API has no OpenAPI spec?"

**Short:** Four more ingestion paths: Postman collections, HAR recordings, manual entry, or one-click generated specs for known providers.

**Technical:** parser.ts auto-detects OpenAPI 3.x, Swagger 2 (JSON or YAML), Postman v2.1, and HAR 1.2 (templating numeric/UUID path segments into `{id}` params). The inventory also accepts manual rows. For Gemini/OpenAI/GitHub/Stripe, templates.ts generates a valid OpenAPI 3.0.3 spec in memory with correct `securitySchemes` — no file ever touches disk.

---

### Q: "Why no false positives — prove it."

**Short:** Every finding embeds its own proof; the e2e suite asserts the exact finding set.

**Technical:** A finding requires: matching `TestRecord` (expected vs actual), an `EvidenceRecord` with the redacted HTTP exchange, and severity reasoning. The 60-check e2e asserts the demo scan yields exactly 5 confirmed + 1 potential with the expected types — BOLA probes that correctly 403 are recorded as PASS (positive controls), never as findings.

---

### Q: "Why did you build the backend with zero npm dependencies?"

**Short:** Auditability and supply-chain safety — the scanner itself shouldn't be an attack surface.

**Technical:** `node:http` router, `node:sqlite` persistence, native `EventSource` on the client, hand-rolled SSE. The entire server is ~1,700 lines of readable TypeScript. The only runtime deps in the repo are `yaml` (spec parsing) and `react`/`react-dom` (UI).

---

### Q: "How does redaction work? Where do tokens go?"

**Short:** Redaction runs at capture time in a shared package — secrets never reach storage, reports, or the browser.

**Technical:** `@shulker/shared/redact.ts` patterns: JWTs (`eyJ…`), `sk-…` keys, `Authorization`/`x-api-key` header values, and any field whose name matches the sensitive list (password, token, secret, ssn…). Values become `[REDACTED]` before `evidence.ts` stores the record. The e2e suite greps every artifact — findings, evidence, reports, SSE stream — for the original credential and asserts absence.

---

### Q: "What's the AI actually doing, concretely?"

**Short:** Prioritization and hypothesis ranking — the 'where to look', never the 'whether it's broken'.

**Technical:** ai.ts sends sanitized endpoint metadata to Gemini, receives ranked focus areas (e.g. "PATCH /users/{id}/role looks like a privilege primitive — test it first"). The engine then runs deterministic BFLA logic on it. With no `GEMINI_API_KEY`, the engine runs fully on deterministic rules — the UI shows "Deterministic Verification" mode in the sidebar footer.

---

### Q: "Is this just for the demo API?"

**Short:** No — the demo API is a target like any other. Same engine runs against any HTTP API with a contract.

**Technical:** ShulkerLab (apps/sandbox) is just a vulnerable OpenAPI-documented service on loopback. The engine consumed the spec, two identities, and the resource model — nothing demo-specific. CLI (`shulker scan --target … --openapi … --fail-on high`) and the REST API accept arbitrary targets.

---

### Q: "What would you build next?"

**Short:** Authenticated multi-role scanning from a captured login flow, plus continuous re-scans triggered from CI on every deploy.

**Technical:** Roadmap: (1) record-a-login flow to derive actors automatically, (2) diff-scans against the previous result so CI fails only on new/regressed findings, (3) GraphQL schema ingestion, (4) a findings-dedup layer across scans for trend tracking over time.
