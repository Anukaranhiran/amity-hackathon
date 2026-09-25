import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startSandbox } from './server.ts';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let base: string;
let aliceToken = '';
let bobToken = '';

async function json(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, data };
}

before(async () => {
  const started = await startSandbox(0);
  server = started.server as unknown as Server;
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server?.close();
});

test('health and openapi are served', async () => {
  const health = await json('GET', '/health');
  assert.equal(health.status, 200);
  const spec = await json('GET', '/openapi.json');
  assert.equal(spec.status, 200);
  const specObj = spec.data as { paths: Record<string, unknown> };
  assert.ok(Object.keys(specObj.paths).length >= 12);
});

test('seeded actors can log in', async () => {
  const a = await json('POST', '/auth/login', { email: 'alice@example.com', password: 'alice-password-1' });
  assert.equal(a.status, 200);
  aliceToken = (a.data as { token: string }).token;
  const b = await json('POST', '/auth/login', { email: 'bob@example.com', password: 'bob-password-2' });
  bobToken = (b.data as { token: string }).token;
  assert.ok(aliceToken && bobToken);
});

test('V1 seeded BOLA: Alice reads Bob vehicle 202 with 200', async () => {
  const own = await json('GET', '/vehicles/101', undefined, aliceToken);
  assert.equal(own.status, 200);
  const cross = await json('GET', '/vehicles/202', undefined, aliceToken);
  assert.equal(cross.status, 200); // vulnerable: should be 403/404
  assert.equal((cross.data as { id: number }).id, 202);
});

test('V4 exposure: GET /users/{id} leaks passwordHash and internalNotes', async () => {
  const res = await json('GET', '/users/2', undefined, aliceToken);
  assert.equal(res.status, 200);
  const body = res.data as Record<string, unknown>;
  assert.ok('passwordHash' in body);
  assert.ok('internalNotes' in body);
});

test('V6 BFLA write: Alice grants herself admin via PATCH role', async () => {
  const res = await json('PATCH', '/users/1/role', { role: 'admin' }, aliceToken);
  assert.equal(res.status, 200);
  const me = await json('GET', '/users/me', undefined, aliceToken);
  assert.equal((me.data as { role: string }).role, 'admin');
  await json('PATCH', '/users/1/role', { role: 'user' }, aliceToken);
});

test('secure controls: /admin/invoices enforces admin, /vehicles scoped', async () => {
  const denied = await json('GET', '/admin/invoices', undefined, aliceToken);
  assert.equal(denied.status, 403);
  const veh = await json('GET', '/vehicles', undefined, aliceToken);
  assert.equal(veh.status, 200);
  const list = veh.data as Array<{ id: number }>;
  assert.ok(list.every((v) => v.id === 101 || v.id === 102));
});

test('register limiter returns 429 after burst', async () => {
  for (let i = 0; i < 5; i++) {
    await json('POST', '/auth/register', { email: `burst${i}@x.io`, password: 'longenough1', name: 'B' });
  }
  const res = await json('POST', '/auth/register', { email: 'burst-x@x.io', password: 'longenough1', name: 'B' });
  assert.equal(res.status, 429);
});
