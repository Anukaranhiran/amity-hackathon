import { useEffect, useMemo, useState } from 'react';
import { api, type InventoryEndpointItem, type InventorySourceItem } from '../api';
import { useScanCtx } from '../App';
import { Icon, methodClass } from '../ui';

interface ScanOverlay {
  findings: Map<string, { severity: string; status: string }>;
  tested: Set<string>;
}

export function AttackSurfacePage() {
  const { go } = useScanCtx();
  const [sources, setSources] = useState<InventorySourceItem[] | null>(null);
  const [endpoints, setEndpoints] = useState<InventoryEndpointItem[] | null>(null);
  const [overlay, setOverlay] = useState<ScanOverlay>({ findings: new Map(), tested: new Set() });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.inventory().then((inv) => {
      setSources(inv.sources);
      setEndpoints(inv.endpoints);
    }).catch(() => { setSources([]); setEndpoints([]); });
    // Overlay real scan results onto the surface.
    api.scans().then(async (scans) => {
      const findings = new Map<string, { severity: string; status: string }>();
      const tested = new Set<string>();
      for (const s of scans.slice(0, 10)) {
        const full = await api.scan(s.id).catch(() => null);
        if (!full) continue;
        for (const f of full.findings) {
          if (f.status !== 'confirmed' && f.status !== 'potential') continue;
          const key = `${f.method} ${f.endpoint}`;
          const prev = findings.get(key);
          const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
          if (!prev || (rank[f.severity] ?? 0) > (rank[prev.severity] ?? 0)) findings.set(key, { severity: f.severity, status: f.status });
        }
        for (const t of full.tests) tested.add(`${t.method} ${t.path}`);
      }
      setOverlay({ findings, tested });
    }).catch(() => undefined);
  }, []);

  const groups = useMemo(() => {
    const eps = (endpoints ?? []).filter((e) =>
      `${e.method} ${e.path} ${e.resource}`.toLowerCase().includes(query.toLowerCase()));
    const map = new Map<string, InventoryEndpointItem[]>();
    for (const e of eps) {
      const res = e.resource || 'root';
      if (!map.has(res)) map.set(res, []);
      map.get(res)!.push(e);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [endpoints, query]);

  if (!endpoints) return <div className="skeleton" style={{ height: 300 }} />;

  const hostCount = new Set((endpoints ?? []).map((e) => e.baseUrl || 'no-host')).size;
  const withFindings = (endpoints ?? []).filter((e) => overlay.findings.has(`${e.method} ${e.path}`)).length;

  if (endpoints.length === 0) {
    return (
      <>
        <SurfaceHeader total={0} resources={0} hosts={0} withFindings={0} />
        <div className="empty">
          <div className="empty-title">No Attack Surface Yet</div>
          <div className="empty-desc">The surface is derived from discovered APIs — add sources in the API Inventory to populate this view.</div>
          <div className="empty-action"><BuildInventoryButtons /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <SurfaceHeader total={endpoints.length} resources={groups.length} hosts={hostCount} withFindings={withFindings} />

      <div className="row between mb">
        <div className="search-box" style={{ width: 280 }}>
          <Icon name="search" />
          <input type="text" placeholder="Filter resources & paths…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="row faint">
          <span className="status-pill pass">TESTED</span>
          <span className="status-pill fail">FINDING</span>
          <span className="status-pill skipped">UNTESTED</span>
        </div>
      </div>

      <div className="grid" style={{ gap: 12 }}>
        {groups.map(([resource, eps]) => {
          const testedCount = eps.filter((e) => overlay.tested.has(`${e.method} ${e.path}`)).length;
          const findingCount = eps.filter((e) => overlay.findings.has(`${e.method} ${e.path}`)).length;
          const open = selected === resource;
          return (
            <div key={resource} className="panel flush hoverable" style={{ cursor: 'pointer' }} onClick={() => setSelected(open ? null : resource)}>
              <div className="row between" style={{ padding: '13px 18px' }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="feature-icon" style={{ width: 30, height: 30, borderRadius: 8, marginBottom: 0 }}><Icon name="target" /></span>
                  <strong style={{ fontSize: 14, textTransform: 'capitalize' }}>{resource}</strong>
                  <span className="faint">{eps.length} endpoint{eps.length > 1 ? 's' : ''}</span>
                  {eps[0].idParam && <span className="type-chip">object-level</span>}
                  {eps.some((e) => /admin/i.test(e.path)) && <span className="type-chip" style={{ color: 'var(--critical)', borderColor: 'var(--critical-border)' }}>admin</span>}
                </div>
                <div className="row">
                  {findingCount > 0 && <span className="status-pill fail">{findingCount} finding{findingCount > 1 ? 's' : ''}</span>}
                  <span className={`status-pill ${testedCount === eps.length && eps.length > 0 ? 'pass' : testedCount > 0 ? 'potential' : 'skipped'}`}>
                    {testedCount}/{eps.length} tested
                  </span>
                  <span className="faint">{open ? '▲' : '▼'}</span>
                </div>
              </div>
              {open && (
                <table className="tbl tbl-nested">
                  <tbody>
                    {eps.map((e) => {
                      const key = `${e.method} ${e.path}`;
                      const finding = overlay.findings.get(key);
                      const tested = overlay.tested.has(key);
                      return (
                        <tr key={e.id}>
                          <td style={{ width: 76 }}><span className={`method-chip ${methodClass(e.method)}`}>{e.method}</span></td>
                          <td className="mono" style={{ color: 'var(--text)' }}>{e.path}</td>
                          <td className="faint" style={{ width: 150 }}>{e.auth}</td>
                          <td className="faint" style={{ width: 110 }}><span className="type-chip">{e.via}</span></td>
                          <td style={{ width: 150 }}>
                            {finding ? (
                              <span className={`sev ${finding.severity}`} style={{ cursor: 'pointer' }}
                                onClick={(ev) => { ev.stopPropagation(); go({ name: 'findings' }); }}>
                                {finding.severity.toUpperCase()}
                              </span>
                            ) : tested ? <span className="status-pill pass">PASS</span> : <span className="status-pill skipped">UNTESTED</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function SurfaceHeader({ total, resources, hosts, withFindings }: { total: number; resources: number; hosts: number; withFindings: number }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Attack Surface</div>
          <h1 className="page-title">Attack Surface</h1>
          <p className="page-sub">
            Every discovered resource and endpoint, mapped from API sources and overlaid with actual scan results.
          </p>
        </div>
      </div>
      <div className="grid kpis compact">
        <MiniStat n={total} l="Endpoints" accent="var(--accent)" bg="var(--accent-glow)" icon="grid" />
        <MiniStat n={resources} l="Resources" accent="var(--pass)" bg="var(--pass-bg)" icon="target" />
        <MiniStat n={hosts} l="Hosts" accent="var(--low)" bg="var(--low-bg)" icon="eye" />
        <MiniStat n={withFindings} l="With findings" accent="var(--critical)" bg="var(--critical-bg)" icon="flag" />
      </div>
    </>
  );
}

function BuildInventoryButtons() {
  const { go } = useScanCtx();
  return (
    <div className="row" style={{ justifyContent: 'center' }}>
      <button className="btn btn-primary btn-sm" onClick={() => go({ name: 'inventory' })}><Icon name="bolt" /> Open API Inventory</button>
    </div>
  );
}

function MiniStat({ n, l, accent, bg, icon }: { n: number | string; l: string; accent: string; bg: string; icon: string }) {
  return (
    <div className="kpi" style={{ ['--kpi-accent' as string]: accent, ['--kpi-bg' as string]: bg, padding: '13px 16px' }}>
      <div className="kpi-top" style={{ marginBottom: 6 }}>
        <div className="kpi-icon" style={{ width: 28, height: 28 }}>
          <Icon name={(icon as Parameters<typeof Icon>[0]['name'])} />
        </div>
      </div>
      <div className="n" style={{ fontSize: 24 }}>{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}
