import { useEffect, useState } from 'react';
import { api, type ScanListItem } from '../api';
import { useScanCtx } from '../App';
import { Icon, fmtDateTime, useCopy, useToast, type IconName } from '../ui';

type Format = 'json' | 'md' | 'html';

const CARDS: Array<{ format: Format; icon: IconName; title: string; body: string }> = [
  { format: 'html', icon: 'eye', title: 'HTML Report', body: 'Shareable, styled security report — print-ready for PDF export.' },
  { format: 'md', icon: 'file', title: 'Markdown Report', body: 'Developer-friendly report for PRs, wikis and CI artifacts.' },
  { format: 'json', icon: 'terminal', title: 'JSON Report', body: 'Full machine-readable scan result for pipelines and tooling.' },
];

interface GeneratedReport {
  format: Format;
  content: string;
  findings: number;
  potential: number;
  createdAt: string;
  path: string;
}

export function ReportsPage() {
  const { latest, go } = useScanCtx();
  const toast = useToast();
  const [scanId, setScanId] = useState('');
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [busy, setBusy] = useState<Format | null>(null);
  const [generated, setGenerated] = useState<Partial<Record<Format, GeneratedReport>>>({});

  useEffect(() => {
    api.scans().then((all) => {
      const done = all.filter((s) => s.status === 'complete');
      setScans(done);
      const latestDone = done[0]?.id;
      const stored = localStorage.getItem('shulker.latestScan');
      setScanId(done.some((s) => s.id === stored) ? stored! : latestDone ?? '');
    }).catch(() => setScans([]));
  }, []);

  const generate = async (format: Format) => {
    if (!scanId) return;
    setBusy(format);
    try {
      const r = await api.report(scanId, format);
      setGenerated((g) => ({
        ...g,
        [format]: {
          format,
          content: r.content ?? '',
          findings: r.findings ?? 0,
          potential: r.potential ?? 0,
          createdAt: r.createdAt ?? new Date().toISOString(),
          path: r.path,
        },
      }));
      toast.push('ok', `${format.toUpperCase()} report generated`, 'Evidence redacted · ready to view or download');
    } catch (e) {
      toast.push('err', 'Report failed', e instanceof Error ? e.message : 'unknown error');
    } finally {
      setBusy(null);
    }
  };

  const download = (format: Format) => {
    const g = generated[format];
    if (!g) return;
    const ext = format === 'md' ? 'md' : format;
    const mime = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/markdown';
    const blob = new Blob([g.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shulker-report-${scanId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push('ok', 'Report downloaded', `shulker-report.${ext}`);
  };

  const openView = (format: Format) => {
    const g = generated[format];
    if (!g) return;
    const blob = new Blob([g.content], { type: format === 'html' ? 'text/html' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Export & Share</div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">
            Generate shareable, evidence-backed reports from a completed scan. Secrets are redacted in every format.
          </p>
        </div>
        <div style={{ minWidth: 280 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Scan</span>
            <select value={scanId} onChange={(e) => { setScanId(e.target.value); setGenerated({}); }}>
              {scans.length === 0 && <option value="">No completed scans yet</option>}
              {scans.map((s) => <option key={s.id} value={s.id}>{s.title} — {fmtDateTime(s.startedAt)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {scans.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No Reports Yet</div>
          <div className="empty-desc">Reports are generated from completed scans — run the local demo first, then export HTML, Markdown or JSON.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Start Scan</button></div>
        </div>
      ) : (
        <div className="grid3">
          {CARDS.map(({ format, icon, title, body }) => {
            const g = generated[format];
            return (
              <div key={format} className="feature-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="feature-icon"><Icon name={icon} /></div>
                <h4>{title}</h4>
                <p style={{ flex: 1 }}>{body}</p>
                {g ? (
                  <div className="kv-grid" style={{ fontSize: 11.5 }}>
                    <dt>Generated</dt><dd>{fmtDateTime(g.createdAt)}</dd>
                    <dt>Findings</dt><dd>{g.findings} confirmed · {g.potential} potential</dd>
                    <dt>Status</dt><dd><span className="status-pill pass">READY</span></dd>
                  </div>
                ) : (
                  <div className="faint">Not generated yet — click Generate.</div>
                )}
                <div className="row" style={{ gap: 7 }}>
                  {g ? (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => openView(format)}><Icon name="eye" /> View</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => download(format)}><Icon name="download" /> Download</button>
                      <CopyBtn format={format} />
                    </>
                  ) : (
                    <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => generate(format)}>
                      {busy === format ? 'Generating…' : <><Icon name="bolt" /> Generate {format.toUpperCase()}</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  function CopyBtn({ format }: { format: Format }) {
    const [copied, copy] = useCopy();
    const g = generated[format];
    if (!g) return null;
    return (
      <button className={`btn btn-sm ${copied ? 'btn-primary' : 'btn-ghost'}`} onClick={() => copy(g.content)}>
        <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy'}
      </button>
    );
  }
}
