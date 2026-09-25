import { useEffect, useState } from 'react';
import { api, type ScanResult } from '../api';
import { useScanCtx } from '../App';
import { Icon } from '../ui';
import { EvidencePanel } from './FindingDetail';

export function EvidencePage({ scanId }: { scanId?: string }) {
  const { go } = useScanCtx();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [findingFilter, setFindingFilter] = useState('all');

  const id = scanId ?? localStorage.getItem('shulker.latestScan') ?? undefined;

  useEffect(() => {
    if (!id) return;
    api.scan(id).then(setScan).catch(() => setScan(null));
  }, [id]);

  const evidence = scan?.evidence ?? [];
  const findings = scan?.findings ?? [];
  const filtered = findingFilter === 'all' ? evidence : evidence.filter((e) => e.findingId === findingFilter);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Proof & Reproducibility</div>
          <h1 className="page-title">Evidence</h1>
          <p className="page-sub">
            Raw request/response pairs captured during the scan. Tokens are redacted at capture time —
            raw secrets never reach the browser, reports or logs.
          </p>
        </div>
        <span className="redaction-banner"><Icon name="lock" /> SENSITIVE DATA REDACTED</span>
      </div>

      {!scan ? (
        <div className="empty">
          <div className="empty-title">No Scan Selected</div>
          <div className="empty-desc">Evidence is captured during scans — run the local demo to collect redacted request/response proof.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Start Scan</button></div>
        </div>
      ) : evidence.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No Evidence Records Yet</div>
          <div className="empty-desc">Evidence is captured automatically when findings are confirmed.</div>
        </div>
      ) : (
        <>
          <div className="row mb">
            <select value={findingFilter} onChange={(e) => setFindingFilter(e.target.value)} style={{ maxWidth: 460 }}>
              <option value="all">All findings ({evidence.length} records)</option>
              {findings.map((f) => (
                <option key={f.id} value={f.id}>{f.severity.toUpperCase()} · {f.method} {f.endpoint}</option>
              ))}
            </select>
            <div className="spacer" />
            <a className="link" onClick={() => go({ name: 'findings', scanId: scan.id! })}>← findings</a>
          </div>
          {filtered.map((e) => <EvidencePanel key={e.id} e={e} />)}
        </>
      )}
    </>
  );
}
