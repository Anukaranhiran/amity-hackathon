import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA_DIR = process.env.SHULKER_DATA_DIR || join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.SHULKER_DB_PATH || join(DATA_DIR, 'shulker.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sandbox',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'init',
  ai_status TEXT NOT NULL DEFAULT 'disabled',
  ai_note TEXT DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER DEFAULT 0,
  spec_title TEXT DEFAULT '',
  spec_version TEXT DEFAULT '',
  error TEXT,
  config_json TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  endpoints_json TEXT NOT NULL DEFAULT '[]',
  tests_json TEXT NOT NULL DEFAULT '[]',
  findings_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  events_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id),
  format TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE TABLE IF NOT EXISTS inventory_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  endpoint_count INTEGER DEFAULT 0,
  meta_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_endpoints (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  base_url TEXT DEFAULT '',
  auth TEXT DEFAULT 'bearer',
  resource TEXT DEFAULT '',
  parent_resource TEXT DEFAULT '',
  id_param TEXT,
  tags_json TEXT DEFAULT '[]',
  summary TEXT DEFAULT '',
  fields_json TEXT DEFAULT '[]',
  example_url TEXT DEFAULT '',
  discovered_via TEXT DEFAULT '',
  last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_ep_source ON inventory_endpoints(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_key ON inventory_endpoints(method, path);
`);

export interface ScanRow {
  id: string;
  target_url: string;
  title: string;
  status: string;
  phase: string;
  ai_status: string;
  ai_note: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number;
  spec_title: string;
  spec_version: string;
  error: string | null;
  config_json: string;
  summary_json: string;
  endpoints_json: string;
  tests_json: string;
  findings_json: string;
  evidence_json: string;
  events_json: string;
}

export function saveScan(row: Omit<ScanRow, 'id'> & { id: string }): void {
  db.prepare(`
    INSERT OR REPLACE INTO scans
    (id, target_url, title, status, phase, ai_status, ai_note, started_at, finished_at, duration_ms,
     spec_title, spec_version, error, config_json, summary_json, endpoints_json, tests_json, findings_json, evidence_json, events_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.target_url, row.title, row.status, row.phase, row.ai_status, row.ai_note ?? '',
    row.started_at, row.finished_at ?? null, row.duration_ms, row.spec_title, row.spec_version,
    row.error ?? null, row.config_json, row.summary_json, row.endpoints_json, row.tests_json,
    row.findings_json, row.evidence_json, row.events_json,
  );
}

export function updateScanFields(id: string, fields: Partial<ScanRow>): void {
  const keys = Object.keys(fields).filter((k) => k !== 'id');
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (fields as Record<string, unknown>)[k]) as unknown as string[];
  db.prepare(`UPDATE scans SET ${setClause} WHERE id = ?`).run(...values, id);
}

export function getScan(id: string): ScanRow | undefined {
  return db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as ScanRow | undefined;
}

export function listScans(limit = 50): ScanRow[] {
  return db.prepare('SELECT * FROM scans ORDER BY started_at DESC LIMIT ?').all(limit) as unknown as ScanRow[];
}

export function saveFinding(scanId: string, f: { id: string; type: string; severity: string; status: string; method: string; endpoint: string; title: string; createdAt: string }): void {
  db.prepare(`
    INSERT OR REPLACE INTO findings (id, scan_id, type, severity, status, method, endpoint, title, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(f.id, scanId, f.type, f.severity, f.status, f.method, f.endpoint, f.title, f.createdAt);
}

export function listFindingsByScan(scanId: string): Array<{ id: string; type: string; severity: string; status: string; method: string; endpoint: string; title: string; created_at: string }> {
  return db.prepare('SELECT * FROM findings WHERE scan_id = ? ORDER BY created_at').all(scanId) as unknown as Array<{
    id: string; type: string; severity: string; status: string; method: string; endpoint: string; title: string; created_at: string;
  }>;
}

export function saveTarget(url: string, label: string, kind = 'sandbox'): void {
  db.prepare('INSERT OR IGNORE INTO targets (url, label, kind, created_at) VALUES (?, ?, ?, ?)')
    .run(url, label, kind, new Date().toISOString());
}

export function listTargets(): Array<{ id: number; url: string; label: string; kind: string; created_at: string }> {
  return db.prepare('SELECT * FROM targets ORDER BY created_at DESC').all() as unknown as Array<{
    id: number; url: string; label: string; kind: string; created_at: string;
  }>;
}

export function saveReport(id: string, scanId: string, format: string, path: string): void {
  db.prepare('INSERT OR REPLACE INTO reports (id, scan_id, format, path, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, scanId, format, path, new Date().toISOString());
}

export function listReports(): Array<{ id: string; scan_id: string; format: string; path: string; created_at: string }> {
  return db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as unknown as Array<{
    id: string; scan_id: string; format: string; path: string; created_at: string;
  }>;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function getSettingJson<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function clearHistory(): void {
  db.exec('DELETE FROM findings; DELETE FROM reports; DELETE FROM scans;');
}

/* ---------------- API Inventory (discovery sources & endpoints) ---------------- */

export interface InventorySourceRow {
  id: string;
  name: string;
  kind: string;
  endpoint_count: number;
  meta_json: string;
  created_at: string;
}

export function addInventorySource(s: { id: string; name: string; kind: string; endpointCount: number; meta?: Record<string, unknown> }): void {
  db.prepare('INSERT OR REPLACE INTO inventory_sources (id, name, kind, endpoint_count, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(s.id, s.name, s.kind, s.endpointCount, JSON.stringify(s.meta ?? {}), new Date().toISOString());
}

export function listInventorySources(): InventorySourceRow[] {
  return db.prepare('SELECT * FROM inventory_sources ORDER BY created_at DESC').all() as unknown as InventorySourceRow[];
}

export function getInventorySource(id: string): InventorySourceRow | undefined {
  return db.prepare('SELECT * FROM inventory_sources WHERE id = ?').get(id) as InventorySourceRow | undefined;
}

export function deleteInventorySource(id: string): void {
  db.prepare('DELETE FROM inventory_endpoints WHERE source_id = ?').run(id);
  db.prepare('DELETE FROM inventory_sources WHERE id = ?').run(id);
}

export interface InventoryEndpointInput {
  sourceId: string;
  method: string;
  path: string;
  baseUrl?: string;
  auth?: string;
  resource?: string;
  parentResource?: string;
  idParam?: string | null;
  tags?: string[];
  summary?: string;
  fields?: string[];
  exampleUrl?: string;
  via?: string;
}

export function upsertInventoryEndpoint(ep: InventoryEndpointInput): void {
  const id = `iep_${ep.method}_${ep.path}`.replace(/[^A-Za-z0-9_-]/g, '_');
  db.prepare(`
    INSERT INTO inventory_endpoints
      (id, source_id, method, path, base_url, auth, resource, parent_resource, id_param, tags_json, summary, fields_json, example_url, discovered_via, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(method, path) DO UPDATE SET
      source_id = excluded.source_id,
      base_url = CASE WHEN excluded.base_url != '' THEN excluded.base_url ELSE inventory_endpoints.base_url END,
      auth = excluded.auth,
      parent_resource = excluded.parent_resource,
      id_param = excluded.id_param,
      tags_json = excluded.tags_json,
      summary = CASE WHEN excluded.summary != '' THEN excluded.summary ELSE inventory_endpoints.summary END,
      fields_json = excluded.fields_json,
      discovered_via = excluded.discovered_via,
      last_seen = excluded.last_seen
  `).run(
    id, ep.sourceId, ep.method.toUpperCase(), ep.path, ep.baseUrl ?? '', ep.auth ?? 'bearer',
    ep.resource ?? '', ep.parentResource ?? '', ep.idParam ?? null,
    JSON.stringify(ep.tags ?? []), ep.summary ?? '', JSON.stringify(ep.fields ?? []),
    ep.exampleUrl ?? '', ep.via ?? '', new Date().toISOString(),
  );
}

export interface InventoryEndpointRow {
  id: string;
  source_id: string;
  method: string;
  path: string;
  base_url: string;
  auth: string;
  resource: string;
  parent_resource: string;
  id_param: string | null;
  tags_json: string;
  summary: string;
  fields_json: string;
  example_url: string;
  discovered_via: string;
  last_seen: string;
}

export function listInventoryEndpoints(sourceId?: string): InventoryEndpointRow[] {
  if (sourceId) {
    return db.prepare('SELECT * FROM inventory_endpoints WHERE source_id = ? ORDER BY path, method').all(sourceId) as unknown as InventoryEndpointRow[];
  }
  return db.prepare('SELECT * FROM inventory_endpoints ORDER BY path, method').all() as unknown as InventoryEndpointRow[];
}

export function countInventoryEndpoints(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM inventory_endpoints').get() as { n: number };
  return row.n;
}

export default db;
