import { useCallback, useEffect, useState } from 'react';
import { api, subscribeScanEvents, type ScanEvent, type ScanResult } from '../api';
import { LATEST_SCAN_KEY, useScanCtx } from '../App';
import { Icon, fmtDateTime, fmtDuration, fmtTime, methodClass, severityClass, typeLabel, useToast, type IconName } from '../ui';

/* Real backend phase keys → display labels */
const PHASES: Array<{ key: string; label: string }> = [
  { key: 'parse', label: 'OpenAPI discovery' },
  { key: 'auth', label: 'Authentication' },
  { key: 'hypotheses', label: 'Resource discovery' },
  { key: 'testing', label: 'Authorization testing' },
  { key: 'analysis', label: 'Evidence collection' },
  { key: 'findings', label: 'Findings correlation' },
  { key: 'done', label: 'Report generation' },
];

export function Overview() {
  const { latest, loading, go, refresh } = useScanCtx();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ScanEvent[]>([]);
  const [phase, setPhase] = useState('init');
  const [prevScan, setPrevScan] = useState<ScanResult | null>(null);
  const [full, setFull] = useState<ScanResult | null>(null);

  const loadFull = useCallback((id: string) => {
    api.scan(id).then(setFull).catch(() => setFull(null));
  }, []);

  // Load full detail of latest scan + previous (for trend deltas) — real data only.
  useEffect(() => {
    if (!latest) { setFull(null); setPrevScan(null); return; }
    loadFull(latest.id);
    api.scans().then(async (all) => {
      if (all[1]) {
        const prev = await api.scan(all[1].id).catch(() => null);
        setPrevScan(prev);
      } else {
        setPrevScan(null);
      }
    }).catch(() => setPrevScan(null));
  }, [latest?.id, loadFull, latest]);

  // Attach to a running scan's SSE for the Live Scan card.
  useEffect(() => {
    const onDemo = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setLiveEvents([]);
      setPhase('init');
      const es = subscribeScanEvents(id, (ev) => {
        setLiveEvents((prev) => [...prev.slice(-60), ev]);
        setPhase(ev.phase);
        if (ev.type === 'SCAN_DONE') { refresh(); }
      }, () => undefined);
      // subscription auto-closes on stream end
      void es;
    };
    window.addEventListener('shulker:demo-started', onDemo);
    return () => window.removeEventListener('shulker:demo-started', onDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDemo = () => {
    setStarting(true);
    api.demo().then((r) => {
      localStorage.setItem(LATEST_SCAN_KEY, r.id);
      toast.push('info', 'Demo scan started', 'Running bounded security tests against ShulkerLab…');
      window.dispatchEvent(new CustomEvent('shulker:demo-started', { detail: r.id }));
      setTimeout(() => go({ name: 'scan' }), 300);
    }).catch((e: Error) => toast.push('err', 'Demo failed', e.message))
      .finally(() => setStarting(false));
  };

  if (!loading && !latest) {
    return <Landing runDemo={runDemo} starting={starting} go={go} />;
  }

  const running = latest?.status === 'running';
  const s = full?.summary ?? latest?.summary;
  const prevS = prevScan?.summary;
  const phaseIdx = PHASES.findIndex((p) => p.key === phase);
  const progress = running ? Math.max(6, ((phaseIdx + 1) / PHASES.length) * 94) : 100;

  return (
    <>
      {/* ---------- Header ---------- */}
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ fontSize: 24 }}>Security Overview</h1>
          <p className="page-sub">Continuous API security testing for authorized targets.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={runDemo} disabled={starting || running}>
            <Icon name="play" /> {starting ? 'Starting…' : 'Run Local Demo'}
          </button>
          <button className="btn btn-ghost" onClick={() => go({ name: 'scan' })}><Icon name="plus" /> New Scan</button>
        </div>
      </div>

      {loading ? (
        <div className="grid kpis">{[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 116 }} />)}</div>
      ) : (
        <>
          {/* ---------- KPI cards ---------- */}
          <div className="grid kpis">
            <KpiCard
              icon="flag" iconBg="var(--critical-bg)" iconColor="var(--critical-text)"
              label="Confirmed Findings" value={s?.confirmed ?? 0}
              delta={s && prevS ? s.confirmed - prevS.confirmed : null}
              deltaGoodWhen="negative"
              sub="vs. previous scan"
            />
            <KpiCard
              icon="alert" iconBg="var(--high-bg)" iconColor="#fb923c"
              label="Critical / High" value={(s?.bySeverity?.critical ?? 0) + (s?.bySeverity?.high ?? 0)}
              delta={s && prevS
                ? ((s.bySeverity?.critical ?? 0) + (s.bySeverity?.high ?? 0)) - ((prevS.bySeverity?.critical ?? 0) + (prevS.bySeverity?.high ?? 0))
                : null}
              deltaGoodWhen="negative"
              sub="vs. previous scan"
            />
            <KpiCard
              icon="terminal" iconBg="var(--accent-glow)" iconColor="var(--accent)"
              label="Endpoints Tested" value={`${s?.endpointsTested ?? 0}/${s?.endpointsDiscovered ?? 0}`}
              delta={s && prevS ? s.endpointsTested - prevS.endpointsTested : null}
              deltaGoodWhen="positive"
              sub="vs. previous scan"
            />
            <KpiCard
              icon="check" iconBg="var(--pass-bg)" iconColor="var(--pass-text)"
              label="Tests Passed" value={s?.testsPassed ?? 0}
              delta={s && prevS ? s.testsPassed - prevS.testsPassed : null}
              deltaGoodWhen="positive"
              sub={`${s?.testsFailed ?? 0} failed · ${fmtDuration(s?.durationMs ?? 0)}`}
            />
          </div>

          {/* ---------- Scan status + Recent findings ---------- */}
          <div className="grid2 mt">
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title"><Icon name="target" /> Scan Status</div>
                <span className={`status-pill ${running ? 'potential' : latest?.status === 'complete' ? 'pass' : 'fail'}`}>
                  {running ? 'RUNNING' : latest?.status === 'complete' ? 'COMPLETED' : 'FAILED'}
                </span>
              </div>
              <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
                <Ring pct={running ? Math.round(progress) : latest?.status === 'complete' ? 100 : 0} size={96} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kv-grid" style={{ marginBottom: 10 }}>
                    <dt>Target</dt><dd>{latest?.title ?? 'ShulkerLab'}</dd>
                    <dt>Duration</dt><dd>{fmtDuration(s?.durationMs ?? latest?.durationMs ?? 0)}</dd>
                    <dt>Started</dt><dd>{fmtDateTime(latest?.startedAt)}</dd>
                    <dt>Finished</dt><dd>{fmtDateTime(latest?.finishedAt)}</dd>
                  </div>
                  <div className="progress-track">
                    <div className={`progress-fill ${running ? '' : 'done'}`} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
              <div className="section-label" style={{ margin: '16px 0 8px' }}>Scan Phases</div>
              <div className="timeline">
                {PHASES.map((p, i) => {
                  const ev = liveEvents.find((e) => e.phase === p.key);
                  const done = running ? i < phaseIdx : latest?.status === 'complete';
                  const active = running && i === phaseIdx;
                  return (
                    <div key={p.key} className={`tl-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                      <div className="tl-dot">{done ? '✓' : active ? '●' : '○'}</div>
                      <div className="tl-label">{p.label}</div>
                      {ev && <div className="tl-meta">{fmtTime(ev.ts)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="panel-title"><Icon name="flag" /> Recent Findings</div>
                <a className="link faint" onClick={() => go({ name: 'findings' })}>View all →</a>
              </div>
              {(full?.findings ?? []).length === 0 ? (
                <div className="empty" style={{ padding: 28 }}>
                  <div className="empty-title">No Findings Yet</div>
                  <div className="empty-desc">Run a scan to generate verified security findings — every issue ships with request/response proof.</div>
                  <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={runDemo} disabled={starting}><Icon name="play" /> Run Local Demo</button></div>
                </div>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Severity</th><th>Type</th><th>Endpoint</th><th></th></tr></thead>
                  <tbody>
                    {(full?.findings ?? []).slice(0, 6).map((f) => (
                      <tr key={f.id} className="rowlink" onClick={() => go({ name: 'finding-detail', scanId: full!.id!, findingId: f.id })}>
                        <td><span className={`sev ${severityClass(f.severity)}`}>{f.severity.toUpperCase()}</span></td>
                        <td style={{ fontWeight: 650 }}>{typeLabel(f.type)}</td>
                        <td className="mono faint">{f.method} {f.endpoint}</td>
                        <td style={{ width: 24, color: 'var(--text-faint)' }}>›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ---------- Charts + activity ---------- */}
          <div className="grid3 mt">
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Findings by Severity</div></div>
              <Donut
                data={[
                  { label: 'Critical', value: s?.bySeverity?.critical ?? 0, color: '#ef4444' },
                  { label: 'High', value: s?.bySeverity?.high ?? 0, color: '#f97316' },
                  { label: 'Medium', value: s?.bySeverity?.medium ?? 0, color: '#eab308' },
                  { label: 'Low', value: s?.bySeverity?.low ?? 0, color: '#3b82f6' },
                ]}
                center={`${(s?.confirmed ?? 0) + (s?.potential ?? 0)}`}
                centerLabel="Total"
              />
            </div>

            <div className="panel">
              <div className="panel-head"><div className="panel-title">Top Vulnerability Types</div></div>
              <Bars
                data={Object.entries(s?.byType ?? {}).map(([k, v]) => ({
                  label: typeLabel(k),
                  value: v,
                  color: { bola: '#f97316', bfla: '#ef4444', excessive_data_exposure: '#eab308', weak_rate_limiting: '#3b82f6' }[k] ?? 'var(--accent)',
                }))}
              />
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">Recent Activity</div>
                <a className="link faint" onClick={() => go({ name: 'activity' })}>View all →</a>
              </div>
              <ActivityMini />
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- KPI card with trend vs previous scan ---------------- */

function KpiCard({ icon, iconBg, iconColor, label, value, delta, deltaGoodWhen, sub }: {
  icon: IconName; iconBg: string; iconColor: string; label: string;
  value: number | string; delta: number | null; deltaGoodWhen: 'positive' | 'negative'; sub: string;
}) {
  const deltaEl = delta === null ? (
    <span className="faint">—</span>
  ) : delta === 0 ? (
    <span className="trend-flat">→ 0</span>
  ) : (
    <span className={delta > 0 === (deltaGoodWhen === 'positive') ? 'trend-up' : 'trend-down'}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}
    </span>
  );
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-icon" style={{ background: iconBg, color: iconColor }}><Icon name={icon} /></div>
      </div>
      <div className="n">{value} <span className="delta">{deltaEl}</span></div>
      <div className="l">{label}</div>
      <div className="trend">{sub}</div>
    </div>
  );
}

/* ---------------- Progress ring ---------------- */

function Ring({ pct, size = 96, color = '#22c55e' }: { pct: number; size?: number; color?: string }) {
  const R = 40; const C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--bg-inset)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
          style={{ transition: 'stroke-dashoffset 0.7s var(--ease)', filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: 17 }}>
        {pct}%
      </div>
    </div>
  );
}

/* ---------------- Donut with legend ---------------- */

function Donut({ data, center, centerLabel }: { data: Array<{ label: string; value: number; color: string }>; center: string; centerLabel: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 34; const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 18, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" width="104" height="104" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--bg-inset)" strokeWidth="13" />
          {total > 0 && data.filter((d) => d.value > 0).map((d) => {
            const frac = d.value / total;
            const el = (
              <circle
                key={d.label} cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="13"
                strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-offset * C} strokeLinecap="butt"
              />
            );
            offset += frac;
            return el;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 780 }}>{center}</div>
          <div className="faint" style={{ fontSize: 9.5, letterSpacing: '0.08em' }}>{centerLabel.toUpperCase()}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((d) => (
          <div key={d.label} className="row between" style={{ fontSize: 12 }}>
            <span className="row" style={{ gap: 7 }}>
              <span className="dot-swatch" style={{ background: d.color }} /> {d.label}
            </span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Horizontal bars ---------------- */

function Bars({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <div className="empty" style={{ padding: 24 }}>No findings yet.</div>;
  return (
    <div>
      {data.map((d) => (
        <div key={d.label} className="hbar-row">
          <div className="hbar-label" style={{ width: 92 }}>{d.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <div className="hbar-n">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Recent activity mini (from real /api/activity) ---------------- */

function ActivityMini() {
  const { go } = useScanCtx();
  const [events, setEvents] = useState<Array<{ ts: string; kind: string; title: string; detail: string }> | null>(null);
  useEffect(() => {
    api.activity().then((all) => setEvents(all.slice(0, 4))).catch(() => setEvents([]));
  }, []);
  if (!events) return <div className="skeleton" style={{ height: 120 }} />;
  if (events.length === 0) return <div className="faint">No activity yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {events.map((e, i) => (
        <div key={i} className="row" style={{ gap: 10 }}>
          <span className="status-dot cyan" style={{ marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 650 }}>{e.title}</div>
            <div className="faint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.detail}</div>
          </div>
          <span className="faint mono" style={{ fontSize: 10.5 }}>{fmtTime(e.ts)}</span>
        </div>
      ))}
      <a className="link faint" onClick={() => go({ name: 'activity' })} style={{ fontSize: 11.5 }}>View all activity →</a>
    </div>
  );
}

/* ---------------- Landing (no scan data) ---------------- */

function Landing({ runDemo, starting, go }: { runDemo: () => void; starting: boolean; go: (p: never) => void }) {
  const features: Array<{ icon: IconName; title: string; body: string }> = [
    { icon: 'target', title: 'BOLA Detection', body: 'Verifies object ownership with real cross-user tests — never ID guessing.' },
    { icon: 'lock', title: 'Authorization Testing', body: 'Confirms privileged endpoints reject non-admin callers.' },
    { icon: 'file', title: 'Evidence-backed Findings', body: 'Redacted request/response proof for every finding.' },
    { icon: 'bolt', title: 'AI-assisted Analysis', body: 'Gemini hypotheses, deterministically verified before reporting.' },
  ];
  return (
    <>
      <div className="hero">
        <span className="badge">AUTHORIZED TESTING ONLY · LOCAL SANDBOX</span>
        <h2>Shulker</h2>
        <p style={{ fontWeight: 650, color: 'var(--text)', fontSize: 16, marginBottom: 6 }}>Zero-Trust API Vulnerability Scanner</p>
        <p>Discover, prove and explain API security vulnerabilities using controlled, evidence-backed testing.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={runDemo} disabled={starting}><Icon name="play" /> {starting ? 'Starting…' : 'Run Local Demo'}</button>
          <button className="btn btn-ghost" onClick={() => go({ name: 'scan' } as never)}><Icon name="plus" /> Start New Scan</button>
        </div>
      </div>
      <div className="section-label mt">Capabilities</div>
      <div className="grid kpis">
        {features.map((f) => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon"><Icon name={f.icon} /></div>
            <h4>{f.title}</h4>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
