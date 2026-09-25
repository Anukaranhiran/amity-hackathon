import { useEffect, useState } from 'react';
import { api, type CoverageResponse } from '../api';
import { useScanCtx } from '../App';
import { Icon, methodClass } from '../ui';

export function CoveragePage() {
  const { go } = useScanCtx();
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'tested' | 'untested'>('all');

  useEffect(() => {
    api.coverage().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <>
        <Header />
        <div className="empty">
          <div className="empty-title">Coverage Unavailable</div>
          <div className="empty-desc">Could not load coverage: {error}</div>
        </div>
      </>
    );
  }
  if (!data) return <><Header /><div className="skeleton" style={{ height: 280 }} /></>;

  if (data.totals.discovered === 0) {
    return (
      <>
        <Header />
        <div className="empty">
          <div className="empty-title">No Endpoints Discovered Yet</div>
          <div className="empty-desc">Coverage is computed from discovered endpoints vs. endpoints the scanner actually tested. Import an API source first.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'inventory' })}><Icon name="bolt" /> Open API Inventory</button></div>
        </div>
      </>
    );
  }

  const rows = data.endpoints.filter((e) =>
    filter === 'all' ? true : filter === 'tested' ? e.tested : !e.tested);

  return (
    <>
      <Header />

      <div className="grid2">
        {/* Overall coverage ring */}
        <div className="panel" style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
          <CoverageRing pct={data.totals.coveragePct} />
          <div style={{ flex: 1 }}>
            <div className="kv-grid">
              <dt>Discovered</dt><dd>{data.totals.discovered} endpoints</dd>
              <dt>Tested</dt><dd>{data.totals.tested} endpoints</dd>
              <dt>Untested</dt><dd style={{ color: data.totals.untested > 0 ? 'var(--medium)' : 'var(--pass)' }}>{data.totals.untested}</dd>
              <dt>With findings</dt><dd style={{ color: data.totals.withFindings > 0 ? 'var(--critical)' : undefined }}>{data.totals.withFindings}</dd>
              <dt>Scans compared</dt><dd>{data.scansCompared}</dd>
            </div>
          </div>
        </div>

        {/* Per-resource coverage */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title"><Icon name="target" /> Coverage by resource</div>
          </div>
          <div>
            {data.byResource.map((r) => (
              <div key={r.resource} className="hbar-row">
                <div className="hbar-label" style={{ textTransform: 'capitalize' }}>{r.resource}</div>
                <div className="hbar-track">
                  <div
                    className="hbar-fill"
                    style={{
                      width: `${r.coveragePct}%`,
                      background: r.coveragePct === 100 ? 'var(--pass)' : r.coveragePct >= 50 ? 'var(--accent)' : 'var(--medium)',
                    }}
                  />
                </div>
                <div className="hbar-n" style={{ width: 60 }}>{r.tested}/{r.total}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-label">Endpoint coverage detail</div>
      <div className="filter-row mb">
        {(['all', 'tested', 'untested'] as const).map((k) => (
          <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(k)}>
            {k === 'all' ? `All (${data.endpoints.length})` : k === 'tested' ? `Tested (${data.totals.tested})` : `Untested (${data.totals.untested})`}
          </button>
        ))}
      </div>
      <div className="panel flush">
        <div className="tbl-wrap tall">
          <table className="tbl">
            <thead><tr><th>Method</th><th>Path</th><th>Resource</th><th>Auth</th><th>Source</th><th>Findings</th><th>Coverage</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={`${e.method} ${e.path}`}>
                  <td><span className={`method-chip ${methodClass(e.method)}`}>{e.method}</span></td>
                  <td className="mono" style={{ color: 'var(--text)' }}>{e.path}</td>
                  <td className="faint" style={{ textTransform: 'capitalize' }}>{e.resource || '—'}</td>
                  <td className="faint">{e.auth}</td>
                  <td><span className="type-chip">{e.source || '—'}</span></td>
                  <td>{e.findings > 0
                    ? <span className="status-pill fail">{e.findings}</span>
                    : <span className="faint">—</span>}</td>
                  <td>
                    {e.tested
                      ? <span className={`status-pill ${e.failed ? 'fail' : 'pass'}`}>{e.failed ? 'TESTED · FAIL' : 'TESTED'}</span>
                      : <span className="status-pill skipped">UNTESTED</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="faint mt">
        Coverage = endpoints with at least one executed security test ÷ endpoints discovered in the inventory.
        Scan data comes from the {data.scansCompared} most recent stored scan(s).
      </div>
    </>
  );
}

function Header() {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">API Discovery & Intelligence</div>
        <h1 className="page-title">Coverage Report</h1>
        <p className="page-sub">What was discovered, what the scanner actually tested, and where the gaps are.</p>
      </div>
    </div>
  );
}

function CoverageRing({ pct }: { pct: number }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const color = pct >= 90 ? 'var(--pass)' : pct >= 60 ? 'var(--accent)' : pct >= 30 ? 'var(--medium)' : 'var(--critical)';
  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg viewBox="0 0 140 140" width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--bg-inset)" strokeWidth="11" />
        <circle
          cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 780, letterSpacing: '-0.03em' }}>{pct}%</div>
        <div className="faint" style={{ letterSpacing: '0.08em' }}>COVERAGE</div>
      </div>
    </div>
  );
}
