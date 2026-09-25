import { useEffect, useState } from 'react';
import { api, type Settings as SettingsData } from '../api';
import { Icon, useToast, ConfirmModal } from '../ui';
import type { Theme } from '../App';

/* Settings with small accent icons and controls in logical order.
   No giant icons, no compressed controls at the bottom. */
export function SettingsPage({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const toast = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { api.settings().then(setData).catch(() => setData(null)); }, []);

  if (!data) return <div className="skeleton" style={{ height: 300 }} />;

  const update = (patch: Partial<SettingsData['defaults']>) => {
    setData({ ...data, defaults: { ...data.defaults, ...patch } });
    setSaved(false);
  };

  const save = async () => {
    try {
      await api.saveSettings(data.defaults, data.safety.externalTargetsAllowed);
      setSaved(true);
      toast.push('ok', 'Settings saved', 'Scanner defaults updated for future scans.');
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast.push('err', 'Save failed', e instanceof Error ? e.message : 'unknown error');
    }
  };

  const clearHistory = async () => {
    setConfirmClear(false);
    try {
      await api.clearHistory();
      localStorage.removeItem('shulker.latestScan');
      toast.push('ok', 'History cleared', 'All scans, findings and reports were removed.');
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      toast.push('err', 'Clear failed', e instanceof Error ? e.message : 'unknown error');
    }
  };

  return (
    <>
      <div className="row between mb" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">Configuration</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>Target safety, scanner defaults, AI provider status and appearance.</p>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-title mb"><Icon name="shield" /> Target Security</div>
          <SettingRow label="Local-only target enforcement" desc="The backend refuses non-loopback and non-private scan targets." on={data.safety.localTargetsOnly} locked />
          <SettingRow label="Authorization confirmation" desc="Every scan requires an explicit user confirmation of testing rights." on={data.safety.authorizationConfirmationRequired} locked />
          <SettingRow label="Token redaction" desc={`Mode: ${data.safety.tokenRedaction} — secrets never appear in UI, reports or logs.`} on locked />
          <label className="check setting-check">
            <input
              type="checkbox"
              checked={data.safety.externalTargetsAllowed}
              onChange={(e) => {
                setData({ ...data, safety: { ...data.safety, externalTargetsAllowed: e.target.checked, localTargetsOnly: !e.target.checked } });
                setSaved(false);
              }}
            />
            <span><b>Allow External Targets</b> — permit scanning of public HTTPS APIs and public spec URLs. Every external scan still requires the per-scan authorization confirmation.</span>
          </label>
        </div>

        <div className="panel">
          <div className="panel-title mb"><Icon name="settings" /> Scanner Defaults</div>
          <div className="grid2" style={{ gap: 10 }}>
            <label className="field" style={{ marginBottom: 8 }}>
              <span>Request budget (max requests)</span>
              <input type="number" value={data.defaults.budget} min={10} max={400} onChange={(e) => update({ budget: Number(e.target.value) })} />
            </label>
            <label className="field" style={{ marginBottom: 8 }}>
              <span>Request timeout (ms)</span>
              <input type="number" value={data.defaults.timeoutMs} min={2000} max={30000} step={500} onChange={(e) => update({ timeoutMs: Number(e.target.value) })} />
            </label>
            <label className="field" style={{ marginBottom: 8 }}>
              <span>Concurrency</span>
              <input type="number" value={data.defaults.concurrency} min={1} max={8} onChange={(e) => update({ concurrency: Number(e.target.value) })} />
            </label>
            <label className="field" style={{ marginBottom: 8 }}>
              <span>Rate-limit probe requests</span>
              <input type="number" value={data.defaults.rateLimitProbeCount} min={5} max={25} onChange={(e) => update({ rateLimitProbeCount: Number(e.target.value) })} />
            </label>
          </div>
          <button className="btn btn-primary btn-sm" onClick={save}>
            {saved ? <><Icon name="check" /> Saved</> : 'Save defaults'}
          </button>
        </div>
      </div>

      <div className="grid2 mt">
        <div className="panel">
          <div className="panel-title mb"><Icon name="bolt" /> AI Reasoning</div>
          <div className="kv-grid">
            <dt>Provider</dt><dd>Google Gemini</dd>
            <dt>Model</dt><dd className="mono">{data.ai.model}</dd>
            <dt>Status</dt>
            <dd>
              {data.ai.configured
                ? <span className="status-pill pass">CONFIGURED</span>
                : <span className="status-pill potential">NOT CONFIGURED</span>}
            </dd>
          </div>
          <div className={`notice mt ${data.ai.configured ? 'good' : 'warn'}`}>
            <Icon name="info" />
            <span>
              {data.ai.configured
                ? 'Gemini key is stored server-side only and is never sent to the browser.'
                : 'Set GEMINI_API_KEY in .env (server-side). The scanner runs fully on deterministic rules without it.'}
            </span>
          </div>
          <div className="faint mt">Fallback: {data.ai.note}</div>
        </div>

        <div className="panel">
          <div className="panel-title mb"><Icon name="eye" /> Appearance & Data</div>
          <div className="kv-grid">
            <dt>Theme</dt>
            <dd>
              <div className="row" style={{ gap: 8 }}>
                <button className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTheme('dark')}><Icon name="moon" /> Dark SOC</button>
                <button className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTheme('light')}><Icon name="sun" /> Light</button>
              </div>
            </dd>
            <dt>Motion</dt><dd>Subtle transitions</dd>
            <dt>Density</dt><dd>Comfortable</dd>
          </div>
          <div className="row mt" style={{ marginTop: 16 }}>
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmClear(true)}><Icon name="trash" /> Clear scan history…</button>
          </div>
          <div className="faint mt">Removes all stored scans, findings, evidence records and generated reports.</div>
        </div>
      </div>

      <ConfirmModal
        open={confirmClear}
        title="Clear scan history?"
        body="This permanently deletes all stored scans, findings, evidence records and generated reports. This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={clearHistory}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}

/* Simple two-column setting row with a small accent icon. */
function SettingRow({ label, desc, on, locked }: { label: string; desc: string; on: boolean; locked?: boolean }) {
  return (
    <div className="row between setting-row">
      <div style={{ maxWidth: 320 }}>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="type-chip" style={{ flexShrink: 0, padding: '3px 8px', fontSize: 10.5 }}>{on ? '✓' : '—'}</span>
          <div style={{ fontWeight: 650, fontSize: 12.5 }}>{label}</div>
        </div>
        <div className="faint" style={{ marginTop: 2 }}>{desc}</div>
      </div>
      {locked ? (
        <span className={`status-pill ${on ? 'pass' : 'fail'}`} style={{ pointerEvents: 'none' }}>{on ? 'ENFORCED' : 'OFF'}</span>
      ) : (
        <span className="type-chip">—</span>
      )}
    </div>
  );
}
