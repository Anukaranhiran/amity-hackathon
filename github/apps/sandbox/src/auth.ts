import { createHmac, createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { SANDBOX_JWT_SECRET } from './config.ts';

export interface TokenPayload {
  sub: number;
  email: string;
  role: string;
  name: string;
  iat: number;
  exp: number;
  jti: string;
}

const b64u = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64url');
const b64uJSON = (obj: unknown): string => b64u(JSON.stringify(obj));

function sign(data: string): string {
  return createHmac('sha256', SANDBOX_JWT_SECRET).update(data).digest('base64url');
}

export function issueToken(user: { id: number; email: string; role: string; name: string }, ttlSeconds = 7200): string {
  const header = b64uJSON({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
  };
  return `${header}.${b64uJSON(payload)}.${sign(`${header}.${b64uJSON(payload)}`)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = sign(`${h}.${p}`);
  if (s.length !== expected.length || s !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(`salt::${password}`).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

/** Extract the bearer token from a request, if present. */
export function bearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1]! : null;
}
