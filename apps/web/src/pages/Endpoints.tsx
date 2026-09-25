import { useEffect, useMemo, useState } from 'react';
import { api, type ScanResult, type TestRecord } from '../api';
import { useScanCtx } from '../App';
import { Icon, methodClass, typeLabel } from '../ui';

/** Infer the authorization model + risk class shown per endpoint row. */
function endpointAuth(e: ScanResult['endpoints'][number]): string {
  if (e.isAuthEndpoint) return 'Public';
  if (e.auth === 'bearer') return 'JWT';
  if (e.auth === 'none') return 'None';
  return e.auth;
}

function endpointAuthz(e: ScanResult['endpoints'][number]): string {
  if (e.adminLikely) return 'Admin required';
  if (e.idParam) return 'User ownership';
  if (e.isAuthEndpoint) return 'Rate limited';
  return 'Scoped';
}

function endpointTest(e: ScanResult['endpoints'][number]): string {
  if (e.isAuthEndpoint) return 'Rate limit';
  if (e.adminLikely) return 'BFLA';
  if (e.idParam) return 'BOLA';
  return 'Exposure';
}

export function EndpointsPage({ scanId }: { scanId?: string }) {
  const { go } = useScanCtx();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'fail' | 'pass'>('all');

  const id = scanId ?? localStorage.getItem('shulker.latestScan') ?? undefined;

  useEffect(() => {
    if (!id) return;
    api.scan(id).then(setScan).catch(() => setScan(null));
  }, [id]);

  const endpoints = scan?.endpoints ?? [];
  const tests = scan?.tests ?? [];
  const findings = scan?.findings ?? [];

  const rows = useMemo(() => endpoints
    .filter((e) => `${e.method} ${e.path}`.toLowerCase().includes(query.toLowerCase()))
    .map((e) => {
      const endpointTests = tests.filter((t) => t.endpointId === e.id);
      const endpointFindings = findings.filter((f) => `${f.method} ${f.endpoint}` === e.id);
      const passed = endpointTests.filter((t) => t.status === 'pass').length;
      const failed = endpointTests.filter((t) => t.status === 'fail').length;
      const hasFinding = endpointFindings.length > 0;
      return { e, endpointTests, endpointFindings, passed, failed, hasFinding };
    })
    .filter((r) => filter === 'all' || (filter === 'fail' ? r.hasFinding : !r.hasFinding && r.passed > 0)),
    [endpoints, tests, findings, query, filter]);

  const coverage = endpoints.length > 0
    ? Math.round((new Set(tests.map((t) => t.endpointId)).size / endpoints.length) * 100)
    : 0;

  if (!scan) {
    return (
      <>
        <Header coverage={0} total={0} tested={0} />
        <div className="empty">
          <div className="empty-title">No Scan Selected</div>
          <div className="empty-desc">Endpoint exploration needs a completed scan — run the local demo to see per-endpoint test results.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Start Scan</button></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header coverage={coverage} total={endpoints.length} tested={new Set(tests.map((t) => t.endpointId)).size} />

      <div className="row between mb">
        <div className="filter-row">
          {(['all', 'fail', 'pass'] as const).map((k) => (
            <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(k)}>
              {k === 'all' ? 'All' : k === 'fail' ? 'Findings' : 'Passed'}
            </button>
          ))}
        </div>
        <div className="search-box" style={{ width: 260 }}>
          <Icon name="search" />
          <input type="text" placeholder="Filter endpoints…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="panel flush">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Method</th>
                <th>Endpoint</th>
                <th style={{ width: 110 }}>Authentication</th>
                <th style={{ width: 150 }}>Authorization</th>
                <th style={{ width: 100 }}>Test</th>
                <th style={{ width: 140 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, endpointTests, endpointFindings, passed, failed, hasFinding }) => {
                const open = expanded === e.id;
                return (
                  <>
                    <tr key={e.id} className="rowlink" onClick={() => setExpanded(open ? null : e.id)}>
                      <td><span className={`method-chip ${methodClass(e.method)}`}>{e.method}</span></td>
                      <td className="mono" style={{ color: 'var(--text)' }}>{e.path}</td>
                      <td className="faint">{endpointAuth(e)}</td>
                      <td className="faint">{endpointAuthz(e)}</td>
                      <td><span className="type-chip">{endpointTest(e)}</span></td>
                      <td>
                        {hasFinding
                          ? <span className="status-pill fail">FAIL</span>
                          : passed > 0
                            ? <span className="status-pill pass">PASS</span>
                            : <span className="status-pill skipped">UNTESTED</span>}
                        {failed > 0 && <span className="faint" style={{ marginLeft: 6 }}>{failed} test{failed > 1 ? 's' : ''}</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${e.id}-detail`}>
                        <td colSpan={6} style={{ background: 'var(--bg-inset)' }}>
                          <div style={{ padding: '4px 6px 8px' }}>
                            {e.summary && <div className="muted" style={{ marginBottom: 8 }}>{e.summary}</div>}
                            <div className="muted" style={{ marginBottom: 8 }}>
                              <strong style={{ color: 'var(--text)' }}>Parameters:</strong>{' '}
                              {e.params.length === 0 ? 'none' : e.params.map((p) => <code className="inline" key={p.name} style={{ marginRight: 6 }}>{p.in}:{p.name}{p.required ? '*' : ''}</code>)}
                            </div>
                            {e.responseProps.length > 0 && (
                              <div className="muted" style={{ marginBottom: 10 }}>
                                <strong style={{ color: 'var(--text)' }}>Documented response fields:</strong>{' '}
                                {e.responseProps.map((p) => <code className="inline" key={p} style={{ marginRight: 6 }}>{p}</code>)}
                              </div>
                            )}
                            {endpointTests.length > 0 && (
                              <table className="tbl" style={{ margin: '4px 0 10px' }}>
                                <tbody>
                                  {endpointTests.map((t) => <TestRow key={t.id} t={t} />)}
                                </tbody>
                              </table>
                            )}
                            {endpointFindings.length > 0 && (
                              <div className="notice bad">
                                <Icon name="alert" />
                                <span>
                                  <strong>{endpointFindings.length} finding(s)</strong> on this endpoint —{' '}
                                  <a className="link" onClick={(ev) => { ev.stopPropagation(); go({ name: 'finding-detail', scanId: scan!.id!, findingId: endpointFindings[0].id }); }}>
                                    open {typeLabel(endpointFindings[0].type)} detail →
                                  </a>
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TestRow({ t }: { t: TestRecord }) {
  return (
    <tr>
      <td style={{ width: 80 }}><span className={`status-pill ${t.status}`}>{t.status.toUpperCase()}</span></td>
      <td>{t.objective}</td>
      <td className="faint" style={{ width: 130 }}>{t.actor ?? '—'}</td>
      <td className="mono faint" style={{ width: 150 }}>{t.actual ?? '—'}</td>
      <td className="faint" style={{ width: 70 }}>{t.durationMs ?? '—'}ms</td>
    </tr>
  );
}

function Header({ coverage, total, tested }: { coverage: number; total: number; tested: number }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">Attack Surface</div>
        <h1 className="page-title">Endpoint Explorer</h1>
        <p className="page-sub">Discovered from the API specification, with per-endpoint test results.</p>
      </div>
      <div className="panel coverage-stat">
        <div className="coverage-stat-n">{coverage}%</div>
        <div className="faint" style={{ letterSpacing: '0.07em' }}>COVERAGE · {tested}/{total}</div>
      </div>
    </div>
  );
}
