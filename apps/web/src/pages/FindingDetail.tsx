import { useEffect, useState } from 'react';
import { api, type EvidenceRecord, type Finding, type ScanResult } from '../api';
import { useScanCtx } from '../App';
import { Icon, fmtDateTime, methodClass, severityClass, typeLabelLong, useCopy } from '../ui';

export function FindingDetail({ scanId, findingId }: { scanId: string; findingId: string }) {
  const { go } = useScanCtx();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [copied, copy] = useCopy();

  useEffect(() => { api.scan(scanId).then(setScan).catch(() => setScan(null)); }, [scanId]);

  if (!scan) return <div className="skeleton" style={{ height: 320 }} />;
  const finding = scan.findings.find((f) => f.id === findingId);
  if (!finding) {
    return (
      <div className="empty">
        <div className="empty-title">Finding Not Found</div>
        <div className="empty-desc">This finding is not part of the selected scan.</div>
        <div className="empty-action"><a className="link" onClick={() => go({ name: 'findings', scanId })}>← Back to Findings</a></div>
      </div>
    );
  }
  const evidence = scan.evidence.filter((e) => e.findingId === findingId);
  const relatedTests = (scan.tests ?? []).filter((t) => finding.testIds?.includes(t.id) || t.endpointId === `${finding.method} ${finding.endpoint}`);

  return (
    <>
      <a className="link faint" onClick={() => go({ name: 'findings', scanId })}>← Back to Findings</a>

      <div className="row" style={{ margin: '12px 0 4px', gap: 12 }}>
        <span className={`sev ${severityClass(finding.severity)}`} style={{ fontSize: 11.5, padding: '5px 14px' }}>{finding.severity.toUpperCase()}</span>
        <h1 className="page-title" style={{ margin: 0 }}>{typeLabelLong(finding.type)}</h1>
        <span className={`status-pill ${finding.status}`}>{finding.status.toUpperCase()}</span>
      </div>
      <div className="row mb" style={{ gap: 10 }}>
        <span className={`method-chip ${methodClass(finding.method)}`}>{finding.method}</span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{finding.endpoint}</span>
        <span className="faint">confidence: {finding.confidence}</span>
        <span className="faint">· {fmtDateTime(finding.createdAt)}</span>
      </div>

      {/* ---- Attack context ---- */}
      <div className="section-label">Attack Context</div>
      <div className="panel">
        <div className="grid2">
          <div>
            <div className="faint" style={{ fontWeight: 750, letterSpacing: '0.08em', marginBottom: 10 }}>ATTACKER</div>
            <div className="kv-grid">
              <dt>Identity</dt><dd>{finding.requestingIdentity ?? 'unauthenticated'}</dd>
              <dt>Role</dt><dd><span className="type-chip">USER</span></dd>
            </div>
          </div>
          <div>
            <div className="faint" style={{ fontWeight: 750, letterSpacing: '0.08em', marginBottom: 10 }}>RESOURCE</div>
            <div className="kv-grid">
              <dt>Owner</dt><dd>{finding.resourceOwner ?? '—'}</dd>
              <dt>Object ID</dt><dd className="mono">{finding.objectId ?? '—'}</dd>
              <dt>Expected</dt><dd style={{ color: 'var(--pass-text)' }}>{finding.expectedBehavior}</dd>
              <dt>Actual</dt><dd style={{ color: 'var(--critical-text)' }}>{finding.actualBehavior}</dd>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Evidence ---- */}
      <div className="section-label">Evidence</div>
      <div className="row mb" style={{ marginTop: -4 }}>
        <span className="redaction-banner"><Icon name="lock" /> SENSITIVE DATA REDACTED</span>
        <button
          className={`btn btn-sm ${copied ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => copy(finding.poc.curl)}
        >
          <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy PoC'}
        </button>
      </div>
      {evidence.length === 0 && <div className="muted">No evidence records attached.</div>}
      {evidence.map((e) => <EvidencePanel key={e.id} e={e} />)}

      {/* ---- Why this is a vulnerability ---- */}
      <div className="section-label">Why This Is a Vulnerability</div>
      <div className="panel">
        <p style={{ marginTop: 0 }}>{finding.description}</p>
        <p style={{ color: 'var(--text-dim)', marginBottom: 0 }}><strong style={{ color: 'var(--text)' }}>Impact:</strong> {finding.impact}</p>
        <div className="notice mt" style={{ marginTop: 14 }}>
          <Icon name="info" />
          <span><strong>Why {finding.severity}:</strong> {finding.severityReason}</span>
        </div>
      </div>

      {/* ---- Remediation ---- */}
      <div className="section-label">Remediation</div>
      <div className="panel" style={{ borderColor: 'var(--pass-border)' }}>
        <p style={{ marginTop: 0, marginBottom: 0 }}>{finding.recommendation}</p>
      </div>

      {/* ---- Verification ---- */}
      <div className="section-label">Verification</div>
      <div className="panel">
        {relatedTests.length === 0 ? (
          <div className="muted">Fix the endpoint, then re-run the scan — this check should flip to PASS and the finding should disappear.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Test</th><th>Actor</th><th>Expected</th><th>Actual</th><th>Status</th></tr>
            </thead>
            <tbody>
              {relatedTests.map((t) => (
                <tr key={t.id}>
                  <td style={{ maxWidth: 380 }}>{t.objective}</td>
                  <td className="faint">{t.actor ?? '—'}</td>
                  <td className="faint">{t.expected ?? '—'}</td>
                  <td className="mono faint">{t.actual ?? '—'}</td>
                  <td><span className={`status-pill ${t.status}`}>{t.status.toUpperCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row mt">
          <button className="btn btn-primary" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Re-scan to verify fix</button>
        </div>
      </div>
    </>
  );
}

export function EvidencePanel({ e }: { e: EvidenceRecord }) {
  const [showBody, setShowBody] = useState(true);
  const statusGood = e.response.status >= 400;
  return (
    <div className="panel mb" style={{ marginBottom: 12 }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row">
          <span className={`method-chip ${methodClass(e.method)}`}>{e.method}</span>
          <span className="mono" style={{ fontSize: 12 }}>{e.request.url}</span>
        </div>
        <div className="row">
          <span className={`status-pill ${statusGood ? 'pass' : 'fail'}`}>HTTP {e.response.status}</span>
          <span className="faint mono">{e.durationMs}ms</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBody((v) => !v)}>{showBody ? 'Hide body' : 'Show body'}</button>
        </div>
      </div>
      <div className="code-head">
        <div className="code-head-title"><Icon name="terminal" /> Request</div>
        <span className="faint">actor: {e.actorLabel}</span>
      </div>
      <pre className="codeblock">{e.request.method} {e.request.url}
{Object.entries(e.request.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}{e.request.body ? `\n\n${e.request.body}` : ''}</pre>
      {showBody && (
        <>
          <div className="code-head" style={{ marginTop: 10 }}>
            <div className="code-head-title"><Icon name="file" /> Response</div>
            <span className="faint">HTTP {e.response.status}</span>
          </div>
          <pre className="codeblock">{e.response.body || '(empty body)'}</pre>
        </>
      )}
      <div className="row mt" style={{ gap: 18 }}>
        <span className="faint">Expected: <span style={{ color: 'var(--pass-text)' }}>{e.expected}</span></span>
        <span className="faint">Actual: <span style={{ color: 'var(--critical-text)' }}>{e.actual}</span></span>
      </div>
    </div>
  );
}
