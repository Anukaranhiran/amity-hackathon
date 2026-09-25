import { useEffect, useMemo, useState } from 'react';
import { api, type Finding, type ScanResult } from '../api';
import { useScanCtx } from '../App';
import { Icon, fmtTime, methodClass, severityClass, shortDesc, typeLabel, useToast } from '../ui';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'potential', label: 'Potential' },
] as const;

export function FindingsPage({ scanId }: { scanId?: string }) {
  const { go } = useScanCtx();
  const toast = useToast();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const id = scanId ?? localStorage.getItem('shulker.latestScan') ?? undefined;

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    api.scan(id).then(setScan).catch((e: Error) => {
      toast.push('err', 'Could not load scan', e.message);
      setScan(null);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const findings = scan?.findings ?? [];
  const filtered = useMemo(() => findings.filter((f) => {
    const sevOk =
      filter === 'all' ? true :
      filter === 'potential' ? f.status === 'potential' :
      f.severity === filter;
    const q = query.trim().toLowerCase();
    const qOk = !q || `${f.method} ${f.endpoint} ${f.title} ${f.type}`.toLowerCase().includes(q);
    return sevOk && qOk;
  }), [findings, filter, query]);

  const countBy = (key: string): number => findings.filter((f) =>
    key === 'all' ? true :
    key === 'potential' ? f.status === 'potential' :
    f.severity === key,
  ).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Security Findings</div>
          <h1 className="page-title">Findings</h1>
          <p className="page-sub">
            {scan ? `${scan.title} · ${scan.target}` : 'Evidence-backed issues from the latest scan'}
            {scan && <> · <a className="link" onClick={() => go({ name: 'evidence', scanId: scan.id })}>evidence</a> · <a className="link" onClick={() => go({ name: 'endpoints', scanId: scan.id })}>endpoints</a></>}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid" style={{ gap: 10 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
        </div>
      ) : findings.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No Findings Yet</div>
          <div className="empty-desc">Run a scan to generate verified security findings — either every control passed, or no scan has run yet.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Start Scan</button></div>
        </div>
      ) : (
        <>
          <div className="row between mb">
            <div className="filter-row">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label} <span className="filter-count">{countBy(f.key)}</span>
                </button>
              ))}
            </div>
            <div className="search-box" style={{ width: 260 }}>
              <Icon name="search" />
              <input type="text" placeholder="Search endpoint, type…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <div className="grid" style={{ gap: 10 }}>
            {filtered.map((f) => (
              <FindingRow key={f.id} f={f} scanId={scan!.id!} />
            ))}
            {filtered.length === 0 && (
              <div className="empty" style={{ padding: 30 }}>No findings match this filter.</div>
            )}
          </div>
        </>
      )}
    </>
  );

  function FindingRow({ f, scanId }: { f: Finding; scanId: string }) {
    const { go } = useScanCtx();
    return (
      <div className={`finding-row ${severityClass(f.severity)}`} onClick={() => go({ name: 'finding-detail', scanId, findingId: f.id })}>
        <div className="finding-top">
          <span className={`sev ${severityClass(f.severity)}`}>{f.severity.toUpperCase()}</span>
          <span className="type-chip">{typeLabel(f.type)}</span>
          <span className={`method-chip ${methodClass(f.method)}`}>{f.method}</span>
          <span className="mono" style={{ color: 'var(--text)' }}>{f.endpoint}</span>
          <div className="spacer" />
          <span className={`status-pill ${f.status}`}>{f.status.toUpperCase()}</span>
          <span className="faint">{fmtTime(f.createdAt)}</span>
          <span style={{ color: 'var(--text-faint)' }}>→</span>
        </div>
        <div className="finding-desc">“{shortDesc(f)}”</div>
      </div>
    );
  }
}
