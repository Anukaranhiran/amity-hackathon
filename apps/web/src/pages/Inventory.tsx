import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type InventoryEndpointItem, type InventorySourceItem } from '../api';
import { useScanCtx } from '../App';
import { Icon, fmtDateTime, methodClass, useToast } from '../ui';

type Tab = 'sources' | 'url' | 'upload' | 'manual';

export function InventoryPage() {
  const toast = useToast();
  const { go, refresh } = useScanCtx();
  const [sources, setSources] = useState<InventorySourceItem[] | null>(null);
  const [endpoints, setEndpoints] = useState<InventoryEndpointItem[] | null>(null);
  const [tab, setTab] = useState<Tab>('sources');
  const [busy, setBusy] = useState(false);

  // url import
  const [url, setUrl] = useState('http://127.0.0.1:8700/openapi.json');
  // manual entry
  const [manualRows, setManualRows] = useState<Array<{ method: string; path: string; summary: string }>>([
    { method: 'GET', path: '/', summary: '' },
  ]);

  const load = useCallback(() => {
    api.inventory().then((inv) => {
      setSources(inv.sources);
      setEndpoints(inv.endpoints);
    }).catch((e: Error) => toast.push('err', 'Inventory unavailable', e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const importText = async (content: string, name: string) => {
    setBusy(true);
    try {
      const r = await api.inventoryImport(content, name);
      toast.push('ok', 'Imported', `${r.source} — ${r.endpoints} endpoints (${r.kind})`);
      if (r.warnings.length) toast.push('info', 'Warnings', r.warnings[0]);
      load();
      refresh();
      setTab('sources');
    } catch (e) {
      toast.push('err', 'Import failed', e instanceof Error ? e.message : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  const importUrl = async () => {
    setBusy(true);
    try {
      const r = await api.inventoryImportUrl(url);
      toast.push('ok', 'Spec fetched', `${r.source} — ${r.endpoints} endpoints`);
      if (r.warnings.length) toast.push('info', 'Warnings', r.warnings[0]);
      load();
      refresh();
      setTab('sources');
    } catch (e) {
      toast.push('err', 'Fetch failed', e instanceof Error ? e.message : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  const importManual = async () => {
    const valid = manualRows.filter((r) => r.path.trim());
    if (valid.length === 0) { toast.push('err', 'Nothing to add', 'Add at least one endpoint with a path.'); return; }
    setBusy(true);
    try {
      const r = await api.inventoryManual('Manual entries', valid);
      toast.push('ok', 'Added', `${r.endpoints} manual endpoints recorded`);
      setManualRows([{ method: 'GET', path: '/', summary: '' }]);
      load();
      refresh();
      setTab('sources');
    } catch (e) {
      toast.push('err', 'Add failed', e instanceof Error ? e.message : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  const removeSource = async (id: string, name: string) => {
    try {
      await api.inventoryDelete(id);
      toast.push('ok', 'Source removed', name);
      load();
      refresh();
    } catch (e) {
      toast.push('err', 'Remove failed', e instanceof Error ? e.message : 'unknown');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">API Discovery & Intelligence</div>
          <h1 className="page-title">API Inventory</h1>
          <p className="page-sub">
            Import OpenAPI specs, Postman collections, HAR recordings, or add endpoints manually. The inventory drives the attack surface, coverage report and resource graph.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => go({ name: 'attack-surface' })}><Icon name="target" /> Attack Surface</button>
          <button className="btn btn-ghost" onClick={() => go({ name: 'coverage' })}><Icon name="dashboard" /> Coverage</button>
        </div>
      </div>

      <div className="filter-row mb">
        {([['sources', 'Discovered sources'], ['url', 'Import from URL'], ['upload', 'Upload file'], ['manual', 'Manual entry']] as const).map(([k, label]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'sources' && (
        <>
          {          !sources ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : sources.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No API Sources Yet</div>
              <div className="empty-desc">Import an OpenAPI URL, upload a Postman/HAR/OpenAPI file, or add endpoints manually to build the inventory.</div>
              <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => setTab('url')}><Icon name="bolt" /> Import ShulkerLab spec by URL</button></div>
            </div>
          ) : (
            <>
              <div className="grid kpis compact">
                <MiniKpi n={sources.length} l="Sources" />
                <MiniKpi n={endpoints?.length ?? 0} l="Endpoints" />
                <MiniKpi n={new Set((endpoints ?? []).map((e) => e.resource)).size} l="Resources" />
                <MiniKpi n={new Set((endpoints ?? []).map((e) => e.baseUrl || 'no-host')).size} l="Hosts" />
              </div>
              <div className="grid mt" style={{ gap: 10 }}>
                {sources.map((s) => (
                  <div key={s.id} className="panel hoverable" style={{ padding: '14px 18px' }}>
                    <div className="row between">
                      <div className="row" style={{ gap: 10 }}>
                        <span className="type-chip">{s.kind.toUpperCase()}</span>
                        <strong style={{ fontSize: 13.5 }}>{s.name}</strong>
                        <span className="faint">{s.endpointCount} endpoints</span>
                        <span className="faint">· {fmtDateTime(s.createdAt)}</span>
                      </div>
                      <div className="row">
                        <button className="btn btn-ghost btn-sm" onClick={() => { const src = s; void src; go({ name: 'endpoints' }); }}>View endpoints</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeSource(s.id, s.name)}><Icon name="x" /></button>
                      </div>
                    </div>
                    {Array.isArray(s.meta.warnings) && s.meta.warnings.length > 0 && (
                      <div className="notice warn mt" style={{ padding: '8px 12px', fontSize: 12 }}>
                        <Icon name="alert" /> {String(s.meta.warnings[0])}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="section-label">All discovered endpoints ({endpoints?.length ?? 0})</div>
              <div className="panel flush">
                <div className="tbl-wrap tall">
                  <table className="tbl">
                    <thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Resource</th><th>Source</th><th>Last seen</th></tr></thead>
                    <tbody>
                      {(endpoints ?? []).map((e) => (
                        <tr key={e.id}>
                          <td><span className={`method-chip ${methodClass(e.method)}`}>{e.method}</span></td>
                          <td className="mono" style={{ color: 'var(--text)' }}>{e.path}</td>
                          <td className="faint">{e.auth}</td>
                          <td className="faint">{e.resource || '—'}</td>
                          <td><span className="type-chip">{e.via}</span></td>
                          <td className="faint">{fmtDateTime(e.lastSeen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'url' && (
        <div className="panel" style={{ maxWidth: 620 }}>
          <div className="panel-title mb"><Icon name="target" /> Fetch OpenAPI spec by URL</div>
          <label className="field">
            <span>Spec URL (loopback / private network only)</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8700/openapi.json" />
          </label>
          <div className="faint mb">
            The URL is fetched server-side with the same scope rules as scan targets — public internet hosts are refused.
            With ShulkerLab running, the default URL imports the demo spec instantly.
          </div>
          <button className="btn btn-primary" disabled={busy || !url} onClick={importUrl}>
            <Icon name="download" /> {busy ? 'Fetching…' : 'Fetch & discover'}
          </button>
        </div>
      )}

      {tab === 'upload' && (
        <div className="panel" style={{ maxWidth: 620 }}>
          <div className="panel-title mb"><Icon name="file" /> Upload API definition</div>
          <div className="row mb" style={{ gap: 8 }}>
            <span className="type-chip">OpenAPI 3.x / Swagger 2 (JSON·YAML)</span>
            <span className="type-chip">Postman v2.1</span>
            <span className="type-chip">HAR 1.2</span>
          </div>
          <div className="faint mb">Format is auto-detected. HAR paths are templated from observed traffic (numeric/UUID segments become {'{id}'}).</div>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Icon name="upload" /> Choose file…
            <input type="file" accept=".json,.yaml,.yml,.har" style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              await importText(text, file.name);
              e.target.value = '';
            }} />
          </label>
        </div>
      )}

      {tab === 'manual' && (
        <div className="panel" style={{ maxWidth: 760 }}>
          <div className="panel-title mb"><Icon name="grid" /> Manual endpoint entry</div>
          {manualRows.map((row, i) => (
            <div key={i} className="row mb" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <select value={row.method} onChange={(e) => setManualRows((rs) => rs.map((r, j) => j === i ? { ...r, method: e.target.value } : r))} style={{ width: 110, flexShrink: 0 }}>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="text" value={row.path} placeholder="/resource/{id}" onChange={(e) => setManualRows((rs) => rs.map((r, j) => j === i ? { ...r, path: e.target.value } : r))} />
              <input type="text" value={row.summary} placeholder="Description (optional)" onChange={(e) => setManualRows((rs) => rs.map((r, j) => j === i ? { ...r, summary: e.target.value } : r))} />
              {manualRows.length > 1 && <button className="icon-btn" onClick={() => setManualRows((rs) => rs.filter((_, j) => j !== i))}><Icon name="x" /></button>}
            </div>
          ))}
          <div className="row mt">
            <button className="btn btn-ghost btn-sm" onClick={() => setManualRows((rs) => [...rs, { method: 'GET', path: '', summary: '' }])}><Icon name="plus" /> Add row</button>
            <div className="spacer" />
            <button className="btn btn-primary" disabled={busy} onClick={importManual}><Icon name="check" /> Save endpoints</button>
          </div>
        </div>
      )}
    </>
  );
}

function MiniKpi({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="kpi">
      <div className="n kpi-n-sm">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}
