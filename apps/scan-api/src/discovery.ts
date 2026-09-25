/**
 * API Discovery & Intelligence — imports external API definitions into a
 * persistent inventory. Supported sources:
 *   • OpenAPI 3.x / Swagger 2.0  (URL fetch or uploaded file, JSON/YAML)
 *   • Postman Collection v2.x    (JSON)
 *   • HAR 1.2                    (recorded browser traffic)
 *   • Manual endpoint entry
 *
 * All parsing is deterministic; no network requests are made except an
 * explicit user-provided OpenAPI URL fetch (same rules as scan targets:
 * loopback/private only).
 */
import { parseSpecText, InvalidOpenApiError } from '@shulker/scanner-core';
import type { EndpointModel } from '@shulker/shared';

export interface DiscoveredEndpoint {
  method: string;
  path: string;
  baseUrl: string;
  auth: string;
  resource: string;
  parentResource: string;
  idParam: string | null;
  tags: string[];
  summary: string;
  fields: string[];
  exampleUrl: string;
  via: string;
}

export interface DiscoveryResult {
  sourceName: string;
  sourceKind: 'openapi' | 'postman' | 'har' | 'manual';
  endpoints: DiscoveredEndpoint[];
  meta: Record<string, unknown>;
  warnings: string[];
}

/* ---------------- resource inference (shared) ---------------- */

function resourceOf(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  return seg.replace(/[{}:]/g, '');
}

function parentOf(path: string): string {
  const segs = path.split('/').filter(Boolean).map((s) => s.replace(/[{}:]/g, ''));
  return segs.length >= 2 ? segs[segs.length - 2]! : '';
}

function idParamOf(path: string): string | null {
  const m = /\{([^}]+)\}|:(\w+)/.exec(path);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function exampleUrlOf(baseUrl: string, path: string): string {
  const p = path.replace(/\{([^}]+)\}/g, (_m, id: string) => `123` /* neutral example id */).replace(/:(\w+)/g, '123');
  return `${baseUrl.replace(/\/$/, '')}${p}`;
}

/* ---------------- OpenAPI ---------------- */

function fromOpenApi(doc: unknown, sourceName: string, via: string): DiscoveryResult {
  // Reuse the battle-tested scanner-core parser, then map to inventory rows.
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc);
  let model;
  try {
    model = parseSpecText(text);
  } catch (err) {
    if (err instanceof InvalidOpenApiError) {
      throw new Error(`Invalid OpenAPI: ${err.message}`);
    }
    throw err;
  }
  const servers = extractServers(text);
  const baseUrl = servers[0] ?? '';
  const endpoints: DiscoveredEndpoint[] = model.endpoints.map((e: EndpointModel) => ({
    method: e.method,
    path: e.path,
    baseUrl,
    auth: e.auth === 'bearer' ? 'JWT bearer' : e.auth === 'none' ? 'public' : 'API key / other',
    resource: e.resource ?? resourceOf(e.path),
    parentResource: parentOf(e.path),
    idParam: e.idParam ?? idParamOf(e.path),
    tags: e.tags,
    summary: e.summary || e.description.slice(0, 120),
    fields: e.responseProps,
    exampleUrl: exampleUrlOf(baseUrl, e.path),
    via,
  }));
  return {
    sourceName: model.title || sourceName,
    sourceKind: 'openapi',
    endpoints,
    meta: {
      version: model.version,
      serverUrl: baseUrl,
      servers,
      tagCount: new Set(model.endpoints.flatMap((e) => e.tags)).size,
    },
    warnings: servers.length === 0 ? ['No servers declared in the spec — set a base URL before scanning.'] : [],
  };
}

function extractServers(text: string): string[] {
  try {
    const doc = JSON.parse(text) as { servers?: Array<{ url?: string }>; host?: string; basePath?: string; schemes?: string[] };
    if (Array.isArray(doc.servers)) return doc.servers.map((s) => String(s.url ?? '')).filter(Boolean);
    if (doc.host) return [`${doc.schemes?.[0] ?? 'https'}://${doc.host}${doc.basePath ?? ''}`];
  } catch { /* yaml — try regex fallback */ }
  const m = /servers:\s*\n\s*-\s*url:\s*(\S+)/.exec(text);
  return m ? [m[1]!] : [];
}

/* ---------------- Postman Collection v2.x ---------------- */

interface PMItem {
  name?: string;
  request?: {
    method?: string;
    header?: Array<{ key?: string; value?: string }>;
    url?: string | { raw?: string; path?: Array<string | { value?: string }>; host?: string[] | string; protocol?: string };
    description?: string | { content?: string };
  };
  item?: PMItem[];
}

export function fromPostman(raw: unknown, sourceName: string): DiscoveryResult {
  const root = raw as { info?: { name?: string; _postman_id?: string }; item?: PMItem[]; variable?: Array<{ key?: string; value?: string }> };
  if (!root || typeof root !== 'object' || !Array.isArray(root.item)) {
    throw new Error('Not a Postman collection: missing "item" array. Export as Collection v2.1.');
  }
  const vars = new Map<string, string>();
  for (const v of root.variable ?? []) {
    if (v.key && v.value) vars.set(v.key, v.value);
  }
  const endpoints: DiscoveredEndpoint[] = [];
  const warnings: string[] = [];
  const walk = (items: PMItem[], tags: string[]): void => {
    for (const it of items) {
      if (Array.isArray(it.item)) {
        walk(it.item, [...tags, it.name ?? ''].filter(Boolean));
        continue;
      }
      const req = it.request;
      if (!req) continue;
      const method = String(req.method ?? 'GET').toUpperCase();
      let rawUrl = typeof req.url === 'string' ? req.url : req.url?.raw ?? '';
      // Substitute Postman variables {{var}} with stored values or a neutral placeholder.
      rawUrl = rawUrl.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars.get(key) ?? `:${key}`);
      let baseUrl = '';
      let pathPart = rawUrl;
      const urlMatch = /^https?:\/\/[^/]+(\/.*)?$/.exec(rawUrl);
      if (urlMatch) {
        const withoutScheme = rawUrl.replace(/^https?:\/\//, '');
        const slashIdx = withoutScheme.indexOf('/');
        baseUrl = slashIdx === -1 ? rawUrl : rawUrl.slice(0, rawUrl.indexOf('/', rawUrl.indexOf('//') + 2));
        pathPart = slashIdx === -1 ? '/' : rawUrl.slice(rawUrl.indexOf('/', rawUrl.indexOf('//') + 2));
      } else {
        warnings.push(`URL "${rawUrl}" has no host — stored with empty base URL.`);
      }
      const hasAuth = (req.header ?? []).some((h) => /authorization|api[-_]?key|x-api-key/i.test(h.key ?? ''));
      const path = normalizePath(pathPart);
      const desc = typeof req.description === 'string' ? req.description : req.description?.content ?? '';
      endpoints.push({
        method,
        path,
        baseUrl,
        auth: hasAuth ? 'API key / bearer (header)' : 'unknown',
        resource: resourceOf(path),
        parentResource: parentOf(path),
        idParam: idParamOf(path),
        tags: tags.slice(0, 3),
        summary: it.name ?? desc.slice(0, 120),
        fields: [],
        exampleUrl: rawUrl,
        via: 'postman',
      });
    }
  };
  walk(root.item, []);
  if (endpoints.length === 0) throw new Error('No requests found in the collection.');
  return {
    sourceName: root.info?.name ?? sourceName,
    sourceKind: 'postman',
    endpoints,
    meta: { postmanId: root.info?._postman_id ?? '', folders: countFolders(root.item ?? []) },
    warnings: [...new Set(warnings)],
  };
}

function countFolders(items: PMItem[]): number {
  let n = 0;
  for (const it of items) if (Array.isArray(it.item)) n += 1 + countFolders(it.item);
  return n;
}

function normalizePath(p: string): string {
  let path = p.split('?')[0] ?? '/';
  if (!path.startsWith('/')) path = `/${path}`;
  // Postman uses :param; normalize to {param} for consistency with OpenAPI.
  path = path.replace(/:(\w+)/g, '{$1}');
  return path || '/';
}

/* ---------------- HAR 1.2 ---------------- */

interface HarEntry {
  request?: { method?: string; url?: string; headers?: Array<{ name?: string; value?: string }> };
}

export function fromHar(raw: unknown, sourceName: string): DiscoveryResult {
  const log = (raw as { log?: { entries?: HarEntry[]; pages?: Array<{ title?: string }> } }).log;
  const entries = log?.entries ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Not a valid HAR file: no log.entries found.');
  }
  const seen = new Map<string, DiscoveredEndpoint>();
  const hostCounts = new Map<string, number>();
  for (const entry of entries) {
    const req = entry.request;
    if (!req?.url || !req.method) continue;
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      continue;
    }
    // Static assets are not API surface.
    if (/\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|map)(\?|$)/i.test(url.pathname)) continue;
    hostCounts.set(url.origin, (hostCounts.get(url.origin) ?? 0) + 1);
    const method = req.method.toUpperCase();
    // path with ids replaced by {id} template — collapse numeric/uuid segments
    const segs = url.pathname.split('/').filter(Boolean).map((seg) =>
      /^\d+$/.test(seg) ? '{id}' : /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) ? '{id}' : seg,
    );
    const path = `/${segs.join('/')}`;
    const key = `${method} ${path}`;
    const hasAuth = (req.headers ?? []).some((h) => /authorization|api[-_]?key|x-api-key|token/i.test(h.name ?? ''));
    const prev = seen.get(key);
    if (prev) {
      if (hasAuth && prev.auth === 'unknown') prev.auth = 'bearer (observed)';
      continue;
    }
    seen.set(key, {
      method,
      path,
      baseUrl: url.origin,
      auth: hasAuth ? 'bearer (observed)' : 'unknown',
      resource: resourceOf(path),
      parentResource: parentOf(path),
      idParam: idParamOf(path),
      tags: ['har'],
      summary: `Observed in HAR recording (${hostCounts.get(url.origin)} requests to ${url.origin})`,
      fields: [],
      exampleUrl: req.url,
      via: 'har',
    });
  }
  if (seen.size === 0) throw new Error('No API requests found in HAR (only static assets?).');
  const dominantHost = [...hostCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return {
    sourceName: log?.pages?.[0]?.title ?? sourceName,
    sourceKind: 'har',
    endpoints: [...seen.values()],
    meta: { requests: entries.length, hosts: [...hostCounts.keys()], dominantHost },
    warnings: [
      `HAR records what the browser did — paths containing ${'{id}'} were templated from observed values.`,
      dominantHost ? `Dominant host: ${dominantHost} — verify you are authorized to test it before scanning.` : '',
    ].filter(Boolean),
  };
}

/* ---------------- Manual entry ---------------- */

export function fromManual(entries: Array<{ method?: string; path?: string; baseUrl?: string; auth?: string; summary?: string }>, sourceName: string): DiscoveryResult {
  const endpoints: DiscoveredEndpoint[] = [];
  for (const e of entries) {
    const method = String(e.method ?? 'GET').toUpperCase();
    const path = normalizePath(e.path ?? '/');
    if (!/^[A-Z]+$/.test(method) || method.length > 10) throw new Error(`Invalid HTTP method "${method}".`);
    endpoints.push({
      method,
      path,
      baseUrl: (e.baseUrl ?? '').replace(/\/$/, ''),
      auth: e.auth ?? 'unknown',
      resource: resourceOf(path),
      parentResource: parentOf(path),
      idParam: idParamOf(path),
      tags: ['manual'],
      summary: e.summary ?? '',
      fields: [],
      exampleUrl: exampleUrlOf(e.baseUrl ?? '', path),
      via: 'manual',
    });
  }
  if (endpoints.length === 0) throw new Error('No endpoints provided.');
  return {
    sourceName,
    sourceKind: 'manual',
    endpoints,
    meta: { count: endpoints.length },
    warnings: [],
  };
}

/** Validate a fetchable OpenAPI URL with the same scope rules as scan targets. */
export function validateSourceUrl(raw: string, allowExternal = false): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'Must be an absolute http(s) URL.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'Protocol must be http or https.' };
  const host = u.hostname;
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
  const isPrivate = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
  if (!isLoopback && !isPrivate) {
    if (!allowExternal) {
      return { ok: false, reason: 'Public spec URLs require "Allow External Targets" to be enabled (authorized-testing scope).' };
    }
  }
  return { ok: true };
}

/** Format auto-detection: tries OpenAPI → Postman → HAR in order. */
export function detectAndParse(text: string, sourceName: string): DiscoveryResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON — try OpenAPI YAML via scanner-core (it uses the yaml parser).
    return fromOpenApi(text, sourceName, 'file');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj && typeof obj === 'object') {
    if (typeof obj.openapi === 'string' || typeof obj.swagger === 'string') return fromOpenApi(parsed, sourceName, 'file');
    if (obj.info && Array.isArray(obj.item)) return fromPostman(parsed, sourceName);
    if (obj.log && typeof (obj.log as Record<string, unknown>).entries !== 'undefined') return fromHar(parsed, sourceName);
  }
  throw new Error('Unrecognized format: expected OpenAPI, Postman collection v2.x, or HAR 1.2.');
}
