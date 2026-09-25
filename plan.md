# External Targets — Implementation Plan (DONE)

## Verification results
- 40/40 e2e checks (incl. 14 new external-auth matrix checks)
- tsc clean (web, scan-api, scanner-core); vite build OK
- Local demo scan unchanged: 5 confirmed + 1 potential, redaction clean
- Live: external scan refused without toggle; accepted with toggle + auth
- Live: public spec URL (Swagger Petstore) imported — 19 endpoints
- Live: real scan of Petstore over HTTPS with static api_key + custom header —
  19 endpoints discovered, 8 tested, static-credentials actor used, key redacted

## Migration notes
- `validateTarget(url)` / `validateSourceUrl(url)` take a second `allowExternal` param (default false — old behavior preserved)
- `/api/scan` body accepts `allowExternal: bool` and `auth: {mode, apiKeyName, apiKeyValue, bearerToken, basicUser, basicPass, customHeaders}`
- `/api/inventory/import-url` body accepts `allowExternal: bool`
- `GET/POST /api/settings` now include/accept `allowExternalTargets`
- `ScanConfig` gained `authHeaders?: Record<string,string>` and `externalTargetsAllowed?: bool`
- `POST /api/demo` unchanged (always local sandbox)

Design: static auth credentials are injected once at the SafeHttpClient level
(`defaultHeaders` option), so every request across engine, resource discovery
and all detectors carries the user's API key / bearer token / custom headers
without touching 15 call sites. Actor login flow still runs first; if it
succeeds (sandbox), per-actor bearer tokens are used as before. If static auth
is provided and login flow fails (typical for external APIs), the engine
falls back to a single "static" actor.

## Steps
- [x] scanner-core http.ts: `defaultHeaders` constructor option
- [x] shared types: ScanConfig.authHeaders, ActorConfig.static note
- [x] engine.ts: pass defaultHeaders; static-actor fallback in authenticate()
- [x] server.ts: validateTarget(raw, allowExternal); /api/scan accepts
      allowExternal + auth {mode,apiKeyName,apiKeyValue,bearerToken,basicUser,basicPass,customHeaders};
      import-url honors allowExternal; /api/settings exposes allowExternalTargets toggle;
      demo unchanged
- [x] web api.ts: startScan payload extended; settings type
- [x] web NewScan.tsx: mode banner (Local Sandbox / External Authorized),
      external toggle + warning banner, custom headers UI, basic auth kept
- [x] Settings.tsx: Allow External Targets toggle
- [x] tests: unit (validateTarget), e2e additions (external refuse/allow)
- [x] typecheck + build + e2e + live verification
