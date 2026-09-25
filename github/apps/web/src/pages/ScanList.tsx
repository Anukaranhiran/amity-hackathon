import { useScanCtx } from '../App';
import { Icon, fmtDateTime, fmtDuration } from '../ui';

export function ScanList() {
  const { latest, loading, go } = useScanCtx();
  const scans = latest ? [latest] : [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Audit Trail</div>
          <h1 className="page-title">Scan History</h1>
          <p className="page-sub">Stored scan results with real coverage and finding counts.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => go({ name: 'scan' })}><Icon name="play" /> New Scan</button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 180 }} />
      ) : scans.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No Scans Recorded Yet</div>
          <div className="empty-desc">Run the local demo to produce your first scan — results appear here with findings and duration.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Start Scan</button></div>
        </div>
      ) : (
        <div className="panel flush">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Scan</th><th>Target</th><th>Status</th><th>Confirmed</th><th>Potential</th><th>Tests</th><th>Duration</th><th>Started</th><th></th></tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id} className="rowlink" onClick={() => go({ name: 'findings', scanId: s.id })}>
                    <td>
                      <div className="cell-stack">
                        <span className="primary">{s.title}</span>
                        <span className="secondary">{s.id}</span>
                      </div>
                    </td>
                    <td className="mono">{s.target}</td>
                    <td>
                      <span className={`status-pill ${s.status === 'complete' ? 'pass' : s.status === 'running' ? 'potential' : 'fail'}`}>
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="num sev-high">{s.summary?.confirmed ?? 0}</td>
                    <td className="num sev-medium">{s.summary?.potential ?? 0}</td>
                    <td>{s.summary?.testsTotal ?? 0}</td>
                    <td>{fmtDuration(s.summary?.durationMs ?? s.durationMs)}</td>
                    <td className="faint">{fmtDateTime(s.startedAt)}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); go({ name: 'reports' }); }}>Report</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
