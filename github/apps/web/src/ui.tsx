import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ================= Icons (inline SVG, no dependencies) ================= */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const Icons = {
  shield: () => (<svg viewBox="0 0 24 24" {...S}><path d="M12 2l8 3.5V11c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5.5L12 2z" /><path d="M9 12l2 2 4-4" /></svg>),
  dashboard: () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>),
  play: () => (<svg viewBox="0 0 24 24" {...S}><path d="M6 4.5v15l13-7.5-13-7.5z" /></svg>),
  flag: () => (<svg viewBox="0 0 24 24" {...S}><path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" /></svg>),
  grid: () => (<svg viewBox="0 0 24 24" {...S}><path d="M4 6h16M4 12h16M4 18h10" /></svg>),
  terminal: () => (<svg viewBox="0 0 24 24" {...S}><path d="M5 8l4 4-4 4" /><path d="M12 17h7" /></svg>),
  download: () => (<svg viewBox="0 0 24 24" {...S}><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 21h16" /></svg>),
  settings: () => (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.09a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h.09a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.09a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" /></svg>),
  search: () => (<svg viewBox="0 0 24 24" {...S}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>),
  copy: () => (<svg viewBox="0 0 24 24" {...S}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>),
  check: () => (<svg viewBox="0 0 24 24" {...S}><path d="M4 12.5l5 5L20 6.5" /></svg>),
  alert: () => (<svg viewBox="0 0 24 24" {...S}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v4.5" /><path d="M12 18h.01" /></svg>),
  info: () => (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M12 11.5V16" /></svg>),
  x: () => (<svg viewBox="0 0 24 24" {...S}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  lock: () => (<svg viewBox="0 0 24 24" {...S}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 118 0v4" /></svg>),
  eye: () => (<svg viewBox="0 0 24 24" {...S}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>),
  file: () => (<svg viewBox="0 0 24 24" {...S}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path d="M14 2v6h6" /></svg>),
  bolt: () => (<svg viewBox="0 0 24 24" {...S}><path d="M13 2L4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" /></svg>),
  target: () => (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>),
  clock: () => (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>),
  list: () => (<svg viewBox="0 0 24 24" {...S}><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>),
  plus: () => (<svg viewBox="0 0 24 24" {...S}><path d="M12 5v14M5 12h14" /></svg>),
  upload: () => (<svg viewBox="0 0 24 24" {...S}><path d="M12 21V9" /><path d="M7 13l5-5 5 5" /><path d="M4 3h16" /></svg>),
  trash: () => (<svg viewBox="0 0 24 24" {...S}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" /><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" /><path d="M10 11v7" /><path d="M14 11v7" /></svg>),
  'arrow-left': () => (<svg viewBox="0 0 24 24" {...S}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>),
  'arrow-right': () => (<svg viewBox="0 0 24 24" {...S}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>),
  key: () => (<svg viewBox="0 0 24 24" {...S}><rect x="5" y="13" width="14" height="8" rx="2" /><path d="M8 11V7a4 4 0 118 0v4" /></svg>),
  hash: () => (<svg viewBox="0 0 24 24" {...S}><path d="M4 9h16" /><path d="M6 12v-3" /><path d="M6 17v-3" /><path d="M10 12v-3" /><path d="M10 17v-3" /><path d="M14 12v-3" /><path d="M14 17v-3" /></svg>),
  sun: () => (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.9 4.9l1.4 1.4" /><path d="M17.7 17.7l1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M4.9 19.1l1.4-1.4" /><path d="M17.7 6.3l1.4-1.4" /></svg>),
  moon: () => (<svg viewBox="0 0 24 24" {...S}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>),
  'chevrons-left': () => (<svg viewBox="0 0 24 24" {...S}><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></svg>),
  'chevrons-right': () => (<svg viewBox="0 0 24 24" {...S}><path d="M13 17l5-5-5-5" /><path d="M6 17l5-5-5-5" /></svg>),
};

export type IconName = keyof typeof Icons;
export const Icon = ({ name }: { name: IconName }) => {
  const C = Icons[name];
  return C ? <C /> : null;
};

/* ================= Toasts ================= */

export interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  title: string;
  msg?: string;
}

interface ToastCtx {
  push: (kind: Toast['kind'], title: string, msg?: string) => void;
}

const ToastContext = createContext<ToastCtx>({ push: () => undefined });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: Toast['kind'], title: string, msg?: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>
              <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'alert' : 'info'} />
            </span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.msg && <div className="toast-msg">{t.msg}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ================= Confirm modal ================= */

export function ConfirmModal({ open, title, body, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Copy-to-clipboard helper ================= */

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }).catch(() => setCopied(false));
  }, []);
  return [copied, copy];
}

/* ================= Formatters ================= */

export function fmtDuration(ms: number): string {
  if (!ms) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function fmtTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export function severityClass(sev: string): string {
  return ['critical', 'high', 'medium', 'low', 'info'].includes(sev) ? sev : 'info';
}

export function typeLabel(t: string): string {
  const map: Record<string, string> = {
    bola: 'BOLA',
    excessive_data_exposure: 'Data Exposure',
    bfla: 'BFLA',
    weak_rate_limiting: 'Rate Limiting',
    control: 'Control',
  };
  return map[t] ?? t.replace(/_/g, ' ');
}

export function typeLabelLong(t: string): string {
  const map: Record<string, string> = {
    bola: 'Broken Object-Level Authorization',
    excessive_data_exposure: 'Excessive Data Exposure',
    bfla: 'Broken Function-Level Authorization',
    weak_rate_limiting: 'Weak Rate Limiting',
    control: 'Security Control',
  };
  return map[t] ?? typeLabel(t);
}

export function methodClass(m: string): string {
  const k = m.toLowerCase();
  return ['get', 'post', 'put', 'patch', 'delete'].includes(k) ? k : 'other';
}

export function shortDesc(f: { description: string; type: string }): string {
  const map: Record<string, string> = {
    bola: 'User accessed an object belonging to another user.',
    excessive_data_exposure: 'Response exposes fields beyond the documented contract.',
    bfla: 'Non-privileged user reached a privileged function.',
    weak_rate_limiting: 'No throttling observed under bounded test conditions.',
  };
  if (f.type in map) return map[f.type]!;
  return f.description.length > 140 ? `${f.description.slice(0, 140)}…` : f.description;
}
