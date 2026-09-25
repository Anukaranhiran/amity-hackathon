export interface FieldHit {
  key: string;
  level: 'high' | 'medium' | 'low';
  label: string;
}

interface Rule {
  re: RegExp;
  level: 'high' | 'medium' | 'low';
  label: string;
}

const RULES: Rule[] = [
  { re: /^password(_?hash)?$|^passwd$|^pwd(_?hash)?$/i, level: 'high', label: 'password credential' },
  { re: /password[_-]?hash|passwordhash/i, level: 'high', label: 'password hash' },
  { re: /secret|private[_-]?key/i, level: 'high', label: 'secret material' },
  { re: /^(access|refresh|auth|bearer|jwt)?_?token$/i, level: 'high', label: 'authentication token' },
  { re: /api[-_]?key/i, level: 'high', label: 'API key' },
  { re: /^ssn$|social[_-]?security/i, level: 'high', label: 'government identifier' },
  { re: /credit[_-]?card|^cvv$|^cvc$|^pan$/i, level: 'high', label: 'payment credential' },
  { re: /^internal[_-]?(user[_-]?)?id$|database[_-]?id$/i, level: 'medium', label: 'internal database identifier' },
  { re: /internal[_-]?notes?|admin[_-]?notes?|private[_-]?notes?/i, level: 'medium', label: 'internal notes' },
  { re: /last[_-]?login[_-]?ip|ip[_-]?address$/i, level: 'medium', label: 'network metadata' },
  { re: /^credit[_-]?limit$|salary|internal[_-]?balance/i, level: 'medium', label: 'confidential financial detail' },
  { re: /^deleted|^is[_-]?internal|^row[_-]?version|^_?(meta|internal)|^db_/i, level: 'low', label: 'database metadata' },
];

// Fields that are expected in authentication responses (e.g. POST /auth/login
// must return a token) and therefore do not constitute excessive exposure.
export const AUTH_RESPONSE_FIELDS = new Set([
  'token',
  'accessToken',
  'refreshToken',
  'expiresIn',
  'tokenType',
]);

export function classifyField(key: string): FieldHit | null {
  for (const r of RULES) {
    if (r.re.test(key)) return { key, level: r.level, label: r.label };
  }
  return null;
}

export interface FlatField {
  key: string;
  value: unknown;
  depth: number;
}

export function flattenFields(
  value: unknown,
  prefix = '',
  depth = 0,
  maxDepth = 2,
  out: FlatField[] = [],
): FlatField[] {
  if (depth > maxDepth) return out;
  if (Array.isArray(value)) {
    // Sample the first element only — keeps evidence bounded.
    if (value.length > 0) flattenFields(value[0], `${prefix}[0]`, depth + 1, maxDepth, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const full = prefix ? `${prefix}.${k}` : k;
      out.push({ key: full, value: v, depth });
      if (v && typeof v === 'object') flattenFields(v, full, depth + 1, maxDepth, out);
    }
  }
  return out;
}
