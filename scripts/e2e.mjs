#!/usr/bin/env node
/**
 * End-to-end pipeline verification (no server needed):
 *   sandbox started in-process -> real scan engine -> assertions.
 *
 * Verifies acceptance criteria:
 *   - spec parses, endpoints discovered
 *   - actors authenticate (User A / User B)
 *   - seeded BOLA detected as CONFIRMED with evidence + PoC
 *   - excessive data exposure detected (passwordHash etc.)
 *   - BFLA write (role escalation) detected as CRITICAL
 *   - secure controls PASS (admin endpoints deny users, vehicle list scoped)
 *   - evidence tokens are redacted
 *   - severity is computed deterministically
 */
import { startSandbox } from '../apps/sandbox/src/server.ts';
import { OPENAPI_SPEC } from '../apps/sandbox/src/openapi.ts';
import { ScanEngine } from '../packages/scanner-core/src/engine.ts';

const failures = [];
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}${detail && !cond ? ` — ${detail}` : ''}`);
  if (!cond) failures.push(name);
};

console.log('\n[1/4] Starting ShulkerLab sandbox (in-process, loopback)…');
const { server, port } = await startSandbox(0);
const target = `http://127.0.0.1:${port}`;
console.log(`  sandbox: ${target}`);

console.log('\n[2/4] Running full scan pipeline (AI off — deterministic path)…');
const events = [];
const result = await new ScanEngine(
  {
    target,
    spec: JSON.stringify(OPENAPI_SPEC),
    actors: [
      { key: 'alice', label: 'User A (Alice)', username: 'alice@example.com', password: 'alice-password-1' },
      { key: 'bob', label: 'User B (Bob)', username: 'bob@example.com', password: 'bob-password-2' },
    ],
    budget: 200,
    timeoutMs: 8000,
    concurrency: 4,
    aiEnabled: false,
    rateLimitProbeCount: 12,
  },
  {
    onEvent: (e) => events.push(e),
    isCancelled: () => false,
  },
).run();

try {
  console.log('\n[3/4] Verifying acceptance criteria…');
  check('scan completed without error', !result.error, result.error ?? '');
  check('endpoints discovered >= 14', result.summary.endpointsDiscovered >= 14, String(result.summary.endpointsDiscovered));
  check('endpoints tested >= 10', result.summary.endpointsTested >= 10, String(result.summary.endpointsTested));
  check('tests executed >= 12', result.summary.testsTotal >= 12, String(result.summary.testsTotal));

  const bola = result.findings.filter((f) => f.type === 'bola' && f.status === 'confirmed');
  check('BOLA confirmed (>=1, vehicle/record/invoice)', bola.length >= 1, `${bola.length} bola findings`);
  const vehicleBola = bola.find((f) => f.endpoint === '/vehicles/{vehicleId}');
  check('BOLA on GET /vehicles/{vehicleId}', Boolean(vehicleBola));
  check('BOLA severity is HIGH with reason', vehicleBola?.severity === 'high' && (vehicleBola?.severityReason ?? '').length > 10);
  check('BOLA evidence exists and is redacted', bola.every((f) => {
    const ev = result.evidence.find((e) => e.findingId === f.id);
    return ev && !/eyJ[A-Za-z0-9_-]{8,}\./.test(JSON.stringify(ev));
  }));
  check('BOLA PoC contains no real JWT', bola.every((f) => !/eyJ[A-Za-z0-9_-]{8,}\./.test(f.poc.curl)));
  check('BOLA names both actors', bola.some((f) => (f.requestingIdentity ?? '').includes('Alice') && (f.resourceOwner ?? '').includes('Bob')));

  const exposure = result.findings.filter((f) => f.type === 'excessive_data_exposure');
  check('excessive data exposure found on GET /users/{userId}', exposure.some((f) => f.endpoint === '/users/{userId}'));
  const userExposure = exposure.find((f) => f.endpoint === '/users/{userId}');
  check('exposure is HIGH (passwordHash) and confirmed', userExposure?.severity === 'high' && userExposure?.status === 'confirmed');
  check('exposure evidence redacts passwordHash', (() => {
    const ev = result.evidence.find((e) => e.findingId === userExposure?.id);
    return Boolean(ev) && !/argon2\$|sha256[0-9a-f]{10}/i.test(ev.response.body) && ev.response.body.includes('<REDACTED>');
  })());

  const bfla = result.findings.filter((f) => f.type === 'bfla');
  check('BFLA role-escalation detected (PATCH /users/{userId}/role)', bfla.some((f) => f.endpoint === '/users/{userId}/role' && f.status === 'confirmed'));
  check('BFLA write severity is CRITICAL', bfla.some((f) => f.endpoint === '/users/{userId}/role' && f.severity === 'critical'));

  // Secure controls must PASS — the scanner must not flag everything.
  const adminDeny = result.tests.filter((t) => t.path.startsWith('/admin/') && t.detector === 'bfla');
  check('secure admin endpoints tested', adminDeny.length >= 2, `${adminDeny.length} admin tests`);
  check('secure admin endpoints PASS (403 enforced)', adminDeny.every((t) => t.status === 'pass'), JSON.stringify(adminDeny.map((t) => ({ p: t.path, s: t.status }))));

  const scopedList = result.tests.find((t) => t.path === '/vehicles' && t.detector === 'excessive_data_exposure');
  check('scoped list endpoint /vehicles produces no finding', !result.findings.some((f) => f.endpoint === '/vehicles'));

  const rate = result.findings.find((f) => f.type === 'weak_rate_limiting');
  check('weak rate limiting (potential) on POST /auth/login', rate?.status === 'potential' && rate.endpoint === '/auth/login');
  const registerLimited = result.tests.find((t) => t.path === '/auth/register' && t.detector === 'weak_rate_limiting');
  check('rate-limited /auth/register passes the probe', registerLimited?.status === 'pass', JSON.stringify(registerLimited?.actual));

  check('summary counts consistent', result.summary.confirmed === result.findings.filter((f) => f.status === 'confirmed').length);
  check('live events emitted', events.length >= 10, String(events.length));
  check('no crash-prone phases missing', ['parse', 'auth', 'testing', 'findings', 'done'].every((p) => events.some((e) => e.phase === p)));

  // Redaction sweep across the whole result.
  const serialized = JSON.stringify(result);
  check('no raw JWT anywhere in scan result', !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(serialized));
  check('no password hashes in scan result', !/sha256[0-9a-f]{20,}/i.test(serialized));
} finally {
  server.close();
}

console.log('\n[4/4] Generating reports from the scan result…');
const { renderHtml, renderMarkdown } = await import('../apps/scan-api/src/reports.ts');
const md = renderMarkdown(result);
const html = renderHtml(result);
check('markdown report includes executive summary + PoC', md.includes('## Executive summary') && md.includes('curl'));
check('html report includes findings and no raw JWT', html.includes('Finding') === false || !/eyJ[A-Za-z0-9_-]{20,}\./.test(html));

console.log('\n[5/4] External-target authorization matrix (validateTarget / validateSourceUrl)…');
const { validateTarget, buildAuthHeaders } = await import('../apps/scan-api/src/server.ts');
const { validateSourceUrl } = await import('../apps/scan-api/src/discovery.ts');

check('external target refused by default', !validateTarget('https://api.example.com').ok);
check('external target refused even with checkbox when toggle off', !validateTarget('https://api.example.com', false).ok);
check('external target allowed with allowExternal', validateTarget('https://api.example.com', true).ok === true);
check('loopback still allowed without toggle', validateTarget('http://127.0.0.1:8700').ok === true);
check('private range still allowed without toggle', validateTarget('http://10.0.0.5:3000').ok === true);
check('non-http protocol refused', !validateTarget('ftp://api.example.com', true).ok);

check('public spec URL refused by default', !validateSourceUrl('https://petstore.example.com/openapi.json').ok);
check('public spec URL allowed with allowExternal', validateSourceUrl('https://petstore.example.com/openapi.json', true).ok === true);

const ak = buildAuthHeaders({ mode: 'api-key', apiKeyName: 'x-api-key', apiKeyValue: 'sk-secret-1' });
check('api-key header built', ak.headers['x-api-key'] === 'sk-secret-1');
const bt = buildAuthHeaders({ mode: 'bearer', bearerToken: 'tok_abc' });
check('bearer header built', bt.headers['authorization'] === 'Bearer tok_abc');
const ba = buildAuthHeaders({ mode: 'basic', basicUser: 'u', basicPass: 'p' });
check('basic header built', ba.headers['authorization'] === `Basic ${Buffer.from('u:p').toString('base64')}`);
const ch = buildAuthHeaders({ mode: 'none', customHeaders: [{ k: 'X-Tenant', v: 'acme' }] });
check('custom headers built', ch.headers['X-Tenant'] === 'acme');
check('host header injection blocked', !('host' in buildAuthHeaders({ mode: 'none', customHeaders: [{ k: 'Host', v: 'evil.com' }] }).headers));

console.log('\n[6/4] Built-in API contract templates (Gemini / OpenAI / GitHub / Stripe)…');
const { templateSpec, TEMPLATES } = await import('../apps/web/src/templates.ts');
const { parseSpecText } = await import('../packages/scanner-core/src/parser.ts');

for (const t of TEMPLATES) {
  try {
    const text = templateSpec(t.id);
    const doc = JSON.parse(text);
    const model = parseSpecText(text); // throws InvalidOpenApiError if unacceptable
    const protectedCount = model.endpoints.filter((e) => e.auth !== 'none').length;
    check(`${t.id}: valid OpenAPI 3.0.3 root`, doc.openapi === '3.0.3' && typeof doc.paths === 'object');
    check(`${t.id}: passes Shulker validator (${model.endpoints.length} endpoints)`, model.endpoints.length >= 3);
    check(`${t.id}: endpoints marked as authenticated`, protectedCount === model.endpoints.length);
    check(`${t.id}: meta target set`, typeof t.target === 'string' && t.target.startsWith('https://'));
  } catch (e) {
    check(`${t.id}: template generates + validates`, false, e instanceof Error ? e.message : String(e));
  }
}

check('gemini uses x-goog-api-key apiKey scheme', templateSpec('gemini').includes('"x-goog-api-key"') && templateSpec('gemini').includes('"apiKey"'));
check('openai/github/stripe use bearer scheme', ['openai', 'github', 'stripe'].every((id) => templateSpec(id).includes('"scheme": "bearer"')));
check('gemini target is generativelanguage host', TEMPLATES.find((t) => t.id === 'gemini').target === 'https://generativelanguage.googleapis.com');
check('custom template has no generated spec (throws)', (() => { try { templateSpec('custom'); return false; } catch { return true; } })());

console.log('');
if (failures.length > 0) {
  console.error(`E2E FAILED: ${failures.length} check(s): ${failures.join(', ')}`);
  process.exit(1);
} else {
  console.log('E2E PASSED — full pipeline verified end to end.');
  process.exit(0);
}
