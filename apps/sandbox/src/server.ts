/**
 * ShulkerLab API — deliberately vulnerable vehicle service sandbox.
 *
 * SECURITY NOTE: This server intentionally contains vulnerabilities so that
 * Shulker can detect them. NEVER run it on a public interface, and never
 * point it at real user data. It binds to loopback only.
 *
 * Seeded vulnerabilities:
 *  V1  BOLA  GET /vehicles/{vehicleId}      — no ownership check (VULN)
 *  V2  BOLA  GET /service-records/{id}      — no ownership check (VULN)
 *  V3  BOLA  GET /invoices/{invoiceId}      — no ownership check (VULN)
 *  V4  EXPOSURE  GET /users/{userId}         — returns full user record (VULN)
 *  V5  Rate limiting: login has none (VULN) / register does (control)
 *  V6  BFLA  PATCH /users/{userId}/role     — any user can escalate (VULN)
 * Secure controls (must PASS):
 *  S1  GET /vehicles            — scoped to owner
 *  S2  GET /users/me            — session-bound, safe fields
 *  S3  GET /admin/users         — admin-only (403 for users)
 *  S4  GET /admin/invoices      — admin-only (403 for users)
 *  S5  GET /admin/metrics       — admin-only (403 for users)
 *  S6  POST /service-records    — rejects vehicleId not owned by caller (403)
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { db } from './db.ts';
import { bearerToken, issueToken, verifyPassword, verifyToken, type TokenPayload } from './auth.ts';
import { OPENAPI_SPEC } from './openapi.ts';
import { SANDBOX_PORT } from './config.ts';
export { SANDBOX_PORT };

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function send(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, ...extraHeaders, 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const text = await readBody(req);
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function auth(req: IncomingMessage): TokenPayload | null {
  const token = bearerToken(req);
  if (!token) return null;
  return verifyToken(token);
}

// --- Fixed-window limiter -------------------------------------------------
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetIn: b.resetAt - now };
}

// --- Route handlers -------------------------------------------------------

function publicUser(u: { id: number; email: string; name: string; role: string }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = (req.method ?? 'GET').toUpperCase();

  if (path === '/health') {
    send(res, 200, { status: 'ok', service: 'shulkerlab', time: new Date().toISOString() });
    return;
  }
  if (path === '/openapi.json') {
    send(res, 200, OPENAPI_SPEC);
    return;
  }

  // ---- Auth ----
  if (path === '/auth/register' && method === 'POST') {
    const rl = rateLimit('register', 3, 60_000);
    if (!rl.allowed) {
      send(res, 429, { error: 'Too many registrations. Try again later.' }, {
        'x-ratelimit-limit': '3',
        'x-ratelimit-remaining': '0',
        'retry-after': String(Math.ceil(rl.resetIn / 1000)),
      });
      return;
    }
    const body = await readJson(req);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!email || !email.includes('@') || password.length < 8 || !name) {
      send(res, 400, { error: 'email, name and a password of at least 8 characters are required' });
      return;
    }
    if (db.getUserByEmail(email)) {
      send(res, 409, { error: 'Email already registered' });
      return;
    }
    const user = db.createUser(email, name, password);
    send(res, 201, publicUser(user), {
      'x-ratelimit-limit': '3',
      'x-ratelimit-remaining': String(rl.remaining),
    });
    return;
  }

  if (path === '/auth/login' && method === 'POST') {
    // V5: NO rate limiting on login (the register limiter above is the control).
    const body = await readJson(req);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const user = email ? db.getUserByEmail(email) : undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      if (user) db.recordLoginFailure(email);
      send(res, 401, { error: 'Invalid credentials' });
      return;
    }
    send(res, 200, { token: issueToken(user), tokenType: 'Bearer' });
    return;
  }

  // ---- Everything below requires authentication ----
  const principal = auth(req);
  if (!principal) {
    send(res, 401, { error: 'Authentication required' });
    return;
  }

  if (path === '/users/me' && method === 'GET') {
    const u = db.getUserById(principal.sub);
    if (!u) { send(res, 404, { error: 'Not found' }); return; }
    send(res, 200, publicUser(u)); // S2: safe fields only
    return;
  }

  if (path === '/users' && method === 'GET') {
    const u = db.getUserById(principal.sub);
    if (!u) { send(res, 404, { error: 'Not found' }); return; }
    send(res, 200, publicUser(u));
    return;
  }

  {
    const m = /^\/users\/(\d+)$/.exec(path);
    if (m && method === 'GET') {
      const target = db.getUserById(Number(m[1]));
      if (!target) { send(res, 404, { error: 'User not found' }); return; }
      // V4: intentionally returns the FULL record (excessive data exposure).
      send(res, 200, {
        id: target.id,
        email: target.email,
        name: target.name,
        role: target.role,
        passwordHash: target.password_hash,
        internalNotes: target.internal_notes,
        lastLoginIp: target.last_login_ip,
        failedLogins: target.failed_logins,
        createdAt: '2025-01-15T09:00:00.000Z',
        accountTier: 'standard',
      });
      return;
    }
  }

  {
    const m = /^\/users\/(\d+)\/role$/.exec(path);
    if (m && method === 'PATCH') {
      // V6: any authenticated user may change any role (should be admin-only).
      const body = await readJson(req);
      const role = body?.role;
      if (role !== 'user' && role !== 'admin') {
        send(res, 400, { error: "role must be 'user' or 'admin'" });
        return;
      }
      const target = db.getUserById(Number(m[1]));
      if (!target) { send(res, 404, { error: 'User not found' }); return; }
      db.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
      const fresh = db.getUserById(target.id)!;
      send(res, 200, publicUser(fresh));
      return;
    }
  }

  if (path === '/vehicles' && method === 'GET') {
    // S1: correctly scoped to the owner.
    send(res, 200, db.listVehicles(principal.sub));
    return;
  }

  if (path === '/vehicles' && method === 'POST') {
    const body = await readJson(req);
    const make = typeof body?.make === 'string' ? body.make.trim() : '';
    const model = typeof body?.model === 'string' ? body.model.trim() : '';
    const year = Number(body?.year);
    if (!make || !model || !Number.isInteger(year) || year < 1950 || year > 2100) {
      send(res, 400, { error: 'make, model and a valid year are required' });
      return;
    }
    const color = typeof body?.color === 'string' ? body.color : '';
    const vehicle = db.insertVehicle(principal.sub, make, model, year, color);
    send(res, 201, vehicle);
    return;
  }

  {
    const m = /^\/vehicles\/(\d+)$/.exec(path);
    if (m && method === 'GET') {
      const vehicle = db.getVehicle(Number(m[1]));
      if (!vehicle) { send(res, 404, { error: 'Vehicle not found' }); return; }
      // V1: BOLA — authentication is verified, ownership is NOT.
      send(res, 200, vehicle);
      return;
    }
  }

  if (path === '/service-records' && method === 'POST') {
    const body = await readJson(req);
    const vehicleId = Number(body?.vehicleId);
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const scheduledFor = typeof body?.scheduledFor === 'string' ? body.scheduledFor : '2026-10-01';
    if (!Number.isInteger(vehicleId) || !description) {
      send(res, 400, { error: 'vehicleId and description are required' });
      return;
    }
    const vehicle = db.getVehicle(vehicleId);
    if (!vehicle) { send(res, 404, { error: 'Vehicle not found' }); return; }
    if (vehicle.owner_id !== principal.sub) {
      // S6: secure control — creating a record for someone else's vehicle is denied.
      send(res, 403, { error: 'Vehicle does not belong to the authenticated user' });
      return;
    }
    const record = db.insertServiceRecord(vehicleId, description, scheduledFor);
    send(res, 201, record);
    return;
  }

  if (path === '/service-records' && method === 'GET') {
    // S7: correctly scoped — only records on vehicles the caller owns.
    const owned = db.listVehicles(principal.sub).map((v) => v.id);
    send(res, 200, db.listServiceRecords(owned));
    return;
  }

  if (path === '/invoices' && method === 'GET') {
    // S8: correctly scoped — invoices of records on the caller's vehicles.
    const owned = db.listVehicles(principal.sub).map((v) => v.id);
    const records = db.listServiceRecords(owned);
    const mine = records
      .map((r) => db.invoiceForRecord(r.id))
      .filter((i): i is NonNullable<typeof i> => Boolean(i));
    send(res, 200, mine);
    return;
  }

  {
    const m = /^\/service-records\/(\d+)$/.exec(path);
    if (m && method === 'GET') {
      const record = db.getServiceRecord(Number(m[1]));
      if (!record) { send(res, 404, { error: 'Service record not found' }); return; }
      // V2: BOLA — record ownership is never checked.
      send(res, 200, record);
      return;
    }
  }

  {
    const m = /^\/invoices\/(\d+)$/.exec(path);
    if (m && method === 'GET') {
      const invoice = db.getInvoice(Number(m[1]));
      if (!invoice) { send(res, 404, { error: 'Invoice not found' }); return; }
      // V3: BOLA — invoice ownership is never checked.
      send(res, 200, invoice);
      return;
    }
  }

  // ---- Admin endpoints ----
  if (path === '/admin/users' && method === 'GET') {
    if (principal.role !== 'admin') {
      // S3: secure control.
      send(res, 403, { error: 'Admin role required' });
      return;
    }
    const rows = db.db.prepare('SELECT id, email, name, role, failed_logins FROM users ORDER BY id').all() as Array<{
      id: number; email: string; name: string; role: string; failed_logins: number;
    }>;
    send(res, 200, rows.map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, failedLogins: r.failed_logins })));
    return;
  }

  if (path === '/admin/invoices' && method === 'GET') {
    if (principal.role !== 'admin') {
      // S4: secure control.
      send(res, 403, { error: 'Admin role required' });
      return;
    }
    send(res, 200, db.allInvoices());
    return;
  }

  if (path === '/admin/metrics' && method === 'GET') {
    if (principal.role !== 'admin') {
      // S5: secure control.
      send(res, 403, { error: 'Admin role required' });
      return;
    }
    const vehicles = db.db.prepare('SELECT COUNT(*) AS n FROM vehicles').get() as { n: number };
    const users = db.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    send(res, 200, { users: users.n, vehicles: vehicles.n, uptimeSeconds: Math.round(process.uptime()) });
    return;
  }

  send(res, 404, { error: 'Not found' });
}

export function startSandbox(port = SANDBOX_PORT): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      handle(req, res).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'unknown';
        const status = message === 'payload_too_large' ? 413 : 500;
        try { send(res, status, { error: 'Internal error', detail: message }); } catch { /* socket gone */ }
      });
    });
    // Bind loopback only — this is a deliberately vulnerable target.
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as { port: number }).port });
    });
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun || process.env.SHULKERLAB_STANDALONE === '1') {
  startSandbox().then(({ port }) => {
    console.log(`[shulkerlab] deliberately vulnerable sandbox on http://127.0.0.1:${port}`);
    console.log('[shulkerlab] openapi: http://127.0.0.1:' + port + '/openapi.json');
  });
}
