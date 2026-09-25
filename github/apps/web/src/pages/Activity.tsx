import { useEffect, useState } from 'react';
import { api, type ActivityEvent } from '../api';
import { useScanCtx } from '../App';
import { Icon, fmtDateTime, type IconName } from '../ui';

const KIND_ICON: Record<string, IconName> = {
  scan: 'shield', finding: 'flag', report: 'file', error: 'alert',
};
const KIND_COLOR: Record<string, string> = {
  scan: 'var(--accent)', finding: 'var(--high)', report: 'var(--pass)', error: 'var(--critical)',
};

export function ActivityPage() {
  const { go } = useScanCtx();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  useEffect(() => {
    api.activity().then(setEvents).catch(() => setEvents([]));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Audit Trail</div>
          <h1 className="page-title">Recent Activity</h1>
          <p className="page-sub">Scan completions, findings and generated reports — derived from stored scan history.</p>
        </div>
      </div>

      {!events ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : events.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No Activity Yet</div>
          <div className="empty-desc">Scan completions, findings and reports appear here as an audit timeline — run a scan to populate it.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="play" /> Start Scan</button></div>
        </div>
      ) : (
        <div className="panel" style={{ padding: '8px 20px' }}>
          {events.map((e, i) => (
            <div key={i} className="list-row">
              <div className="list-row-icon" style={{ color: KIND_COLOR[e.kind] ?? 'var(--accent)' }}>
                <Icon name={KIND_ICON[e.kind] ?? 'info'} />
              </div>
              <div className="list-row-body">
                <div className="list-row-title">{e.title}</div>
                <div className="faint list-row-meta">{e.detail}</div>
              </div>
              <span className="faint mono" style={{ fontSize: 11 }}>{fmtDateTime(e.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
