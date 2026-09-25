import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactHeaders, redactBody, maskSensitiveStrings, REDACTED } from './redact.ts';

const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';

test('redactHeaders masks bearer tokens but keeps scheme', () => {
  const out = redactHeaders({ Authorization: `Bearer ${JWT}`, 'X-Api-Key': 'abc', Accept: 'application/json' });
  assert.equal(out['Authorization'], `Bearer ${REDACTED}`);
  assert.equal(out['X-Api-Key'], REDACTED);
  assert.equal(out['Accept'], 'application/json');
});

test('redactBody masks sensitive keys and raw JWTs, keeps normal fields', () => {
  const body = JSON.stringify({
    id: 1,
    email: 'a@b.c',
    passwordHash: 'argon2$xyz',
    session: 'abc123',
    token: JWT,
  });
  const out = redactBody(body);
  assert.ok(out.includes('"id": 1'));
  assert.ok(out.includes('"email": "a@b.c"'));
  assert.ok(!out.includes('argon2$xyz'));
  assert.ok(!out.includes('abc123'));
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(out.includes(REDACTED));
});

test('maskSensitiveStrings replaces JWT-like strings in free text', () => {
  assert.equal(maskSensitiveStrings(`token=${JWT};`), `token=${REDACTED};`);
});

test('redactBody survives malformed JSON', () => {
  const out = redactBody('not json {"password":"x"}');
  assert.ok(!out.includes('"x"'));
});
