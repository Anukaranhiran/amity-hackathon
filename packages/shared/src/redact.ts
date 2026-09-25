export const REDACTED = '<REDACTED>';
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER_RE = /^(bearer|basic|token)\s+\S+$/i;
const SENSITIVE_HEADER_RE =
  /authorization|cookie|set-cookie|api[-_]?key|x-api-key|session|token|secret|password|passwd|credential/i;
const SENSITIVE_KEY_RE =
  /pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|session|credential|ssn|cvv|card[-_]?number|private[-_]?key/i;

export function maskSensitiveStrings(s: string): string {
  return s
    .replace(JWT_RE, REDACTED)
    // Embedded sensitive key/value pairs in non-JSON text: password=x,
    // "password":"x", token: abc, etc.
    .replace(
      /(["']?(?:password|passwd|secret|token|api[_-]?key|authorization|credential)["']?\s*[:=]\s*)(["']?)[^\s,;&"']+\2/gi,
      `$1$2${REDACTED}$2`,
    );
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (/authorization/i.test(k)) {
      out[k] = BEARER_RE.test(v.trim())
        ? v.trim().replace(/^(bearer|basic|token)\s+\S+$/i, (_m, p1: string) => `${p1} ${REDACTED}`)
        : REDACTED;
    } else if (SENSITIVE_HEADER_RE.test(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = maskSensitiveStrings(v);
    }
  }
  return out;
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return maskSensitiveStrings(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} characters]`;
}

export function redactBody(body: string, maxLen = 8000): string {
  if (!body) return body;
  const trimmed = body.trimStart();
  let text = body;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(body);
      text = JSON.stringify(redactValue(parsed), null, 2);
    } catch {
      // Malformed JSON: fall through to string masking below.
      text = maskSensitiveStrings(body);
    }
  } else {
    text = maskSensitiveStrings(body);
  }
  return truncate(text, maxLen);
}
