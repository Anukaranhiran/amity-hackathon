import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, type ScanListItem } from './api';
import { Icon, ToastProvider, fmtTime, useToast, type IconName } from './ui';
import { Overview } from './pages/Overview';
import { NewScan } from './pages/NewScan';
import { ScanList } from './pages/ScanList';
import { FindingsPage } from './pages/Findings';
import { FindingDetail } from './pages/FindingDetail';
import { EndpointsPage } from './pages/Endpoints';
import { EvidencePage } from './pages/Evidence';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { InventoryPage } from './pages/Inventory';
import { AttackSurfacePage } from './pages/AttackSurface';
import { CoveragePage } from './pages/Coverage';
import { ResourceGraphPage } from './pages/ResourceGraph';
import { ActivityPage } from './pages/Activity';

export type Page =
  | { name: 'overview' }
  | { name: 'scan' }
  | { name: 'scans' }
  | { name: 'inventory' }
  | { name: 'attack-surface' }
  | { name: 'coverage' }
  | { name: 'graph' }
  | { name: 'activity' }
  | { name: 'findings'; scanId?: string }
  | { name: 'endpoints'; scanId?: string }
  | { name: 'evidence'; scanId?: string }
  | { name: 'reports' }
  | { name: 'settings' }
  | { name: 'finding-detail'; scanId: string; findingId: string };

export const LATEST_SCAN_KEY = 'shulker.latestScan';
export const THEME_KEY = 'shulker.theme';
export const SIDEBAR_KEY = 'shulker.sidebarCollapsed';
export type Theme = 'dark' | 'light';

/* ---------------- Scan context ---------------- */

interface ScanCtx {
  latest: ScanListItem | null;
  loading: boolean;
  backendOnline: boolean;
  refresh: () => void;
  go: (p: Page) => void;
}

const ScanContext = createContext<ScanCtx>({
  latest: null,
  loading: true,
  backendOnline: false,
  refresh: () => undefined,
  go: () => undefined,
});

export const useScanCtx = () => useContext(ScanContext);

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [page, setPage] = useState<Page>({ name: 'overview' });
  const [scans, setScans] = useState<ScanListItem[] | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  // Persisted sidebar state also drives the CSS rail fallback for small screens.
  useEffect(() => {
    document.documentElement.setAttribute('data-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  }, [sidebarCollapsed]);

  // Poll scan history; doubles as the backend liveness signal.
  useEffect(() => {
    const refresh = () => {
      api.scans().then((all) => {
        setScans(all);
        setBackendOnline(true);
      }).catch(() => {
        setBackendOnline(false);
        setScans((prev) => prev ?? []);
      });
    };
    refresh();
    api.health().then((h) => {
      setBackendOnline(true);
      setAiConfigured(h.gemini.configured);
    }).catch(() => setBackendOnline(false));
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => {
    api.scans().then((all) => {
      setScans(all);
      setBackendOnline(true);
    }).catch(() => {
      setBackendOnline(false);
      setScans((prev) => prev ?? []);
    });
  };

  const go = (p: Page) => {
    setPage(p);
    document.querySelector('.main')?.scrollTo({ top: 0 });
  };

  const latest = scans?.[0] ?? null;
  const loading = scans === null;
  const ctx: ScanCtx = useMemo(
    () => ({ latest, loading, backendOnline, refresh, go }),
    [latest, loading, backendOnline],
  );

  const nav: Array<{ key: Page['name']; icon: IconName; label: string; badge?: number }> = [
    { key: 'overview', icon: 'dashboard', label: 'Dashboard' },
    { key: 'scan', icon: 'play', label: 'New Scan' },
    { key: 'findings', icon: 'flag', label: 'Findings', badge: latest?.summary?.confirmed || undefined },
    { key: 'endpoints', icon: 'grid', label: 'Endpoints' },
    { key: 'evidence', icon: 'terminal', label: 'Evidence' },
    { key: 'reports', icon: 'download', label: 'Reports' },
    { key: 'settings', icon: 'settings', label: 'Settings' },
  ];
  const intel: Array<{ key: Page['name']; icon: IconName; label: string }> = [
    { key: 'inventory', icon: 'list', label: 'API Inventory' },
    { key: 'attack-surface', icon: 'target', label: 'Attack Surface' },
    { key: 'coverage', icon: 'check', label: 'Coverage Report' },
    { key: 'graph', icon: 'bolt', label: 'Resource Graph' },
    { key: 'activity', icon: 'clock', label: 'Activity' },
  ];

  const activeKey: Page['name'] = page.name === 'finding-detail' ? 'findings' : page.name;
  const titles: Record<string, string> = {
    overview: 'Dashboard', scan: 'New Scan', scans: 'Scan History', findings: 'Findings',
    'finding-detail': 'Finding Detail', endpoints: 'Endpoint Explorer', evidence: 'Evidence',
    reports: 'Reports', settings: 'Settings', inventory: 'API Inventory',
    'attack-surface': 'Attack Surface', coverage: 'Coverage Report', graph: 'Resource Graph', activity: 'Activity',
  };

  const toggleSidebar = () => setSidebarCollapsed((v) => !v);

  return (
    <ScanContext.Provider value={ctx}>
      <div className="app">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          activeKey={activeKey}
          go={go}
          nav={nav}
          intel={intel}
          backendOnline={backendOnline}
          aiConfigured={aiConfigured}
        />
        <div className="main-col">
          <Topbar
            latest={latest}
            backendOnline={backendOnline}
            go={go}
            title={titles[page.name] ?? 'Shulker'}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          />
          <main className="main">
            <div className="main-inner" key={page.name + ('scanId' in page ? page.scanId ?? '' : '') + ('findingId' in page ? page.findingId : '')}>
              {!backendOnline && (
                <div className="notice bad mb">
                  <Icon name="alert" />
                  <span><strong>Backend offline.</strong> Start it with <code className="inline">npm run dev:api</code> — the dashboard reconnects automatically.</span>
                </div>
              )}
              {page.name === 'overview' && <Overview />}
              {page.name === 'scan' && <NewScan />}
              {page.name === 'scans' && <ScanList />}
              {page.name === 'findings' && <FindingsPage scanId={page.scanId} />}
              {page.name === 'finding-detail' && <FindingDetail scanId={page.scanId} findingId={page.findingId} />}
              {page.name === 'endpoints' && <EndpointsPage scanId={page.scanId} />}
              {page.name === 'evidence' && <EvidencePage scanId={page.scanId} />}
              {page.name === 'reports' && <ReportsPage />}
              {page.name === 'settings' && <SettingsPage theme={theme} setTheme={setTheme} />}
              {page.name === 'inventory' && <InventoryPage />}
              {page.name === 'attack-surface' && <AttackSurfacePage />}
              {page.name === 'coverage' && <CoveragePage />}
              {page.name === 'graph' && <ResourceGraphPage />}
              {page.name === 'activity' && <ActivityPage />}
            </div>
          </main>
          <Footer />
        </div>
      </div>
    </ScanContext.Provider>
  );
}

/* ---------------- Sidebar ---------------- */

interface NavItemDef {
  key: Page['name'];
  icon: IconName;
  label: string;
  badge?: number;
}

function Sidebar({ collapsed, onToggle, activeKey, go, nav, intel, backendOnline, aiConfigured }: {
  collapsed: boolean;
  onToggle: () => void;
  activeKey: Page['name'];
  go: (p: Page) => void;
  nav: NavItemDef[];
  intel: NavItemDef[];
  backendOnline: boolean;
  aiConfigured: boolean;
}) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Primary navigation">
      <button
        type="button"
        className="icon-btn sidebar-collapse-btn"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} />
      </button>

      <div className="logo">
        <div className="logo-mark"><Icon name="shield" /></div>
        <div className="logo-text">
          <div className="logo-name">Shulker</div>
          <div className="logo-tag">Zero-Trust API Scanner</div>
        </div>
      </div>

      <nav className="nav">
        {nav.map((item) => <NavLink key={item.key} item={item} activeKey={activeKey} go={go} collapsed={collapsed} />)}
        <div className="nav-section">Discovery &amp; Intelligence</div>
        {intel.map((item) => <NavLink key={item.key} item={item} activeKey={activeKey} go={go} collapsed={collapsed} />)}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-body">
          <div className="status-box">
            <div className="status-row">
              <span className="status-dot green" />
              <span>Environment<br /><strong>Authorized Sandbox</strong></span>
              {backendOnline && <span className="type-chip scope-chip-inline">SAFE</span>}
            </div>
            <div className="status-row">
              <span className={`status-dot ${backendOnline ? 'cyan' : 'red'}`} />
              <span>Scanner<br /><strong>{backendOnline ? 'Connected' : 'Offline'}</strong></span>
            </div>
            <div className="status-row">
              <span className="status-dot green" />
              <span>Engine<br /><strong>{aiConfigured ? 'AI + Deterministic' : 'Deterministic Verification'}</strong></span>
            </div>
          </div>
        </div>
        <div className="sidebar-footer-mini" title={backendOnline ? 'Scanner connected' : 'Scanner offline'}>
          <span className={`status-dot ${backendOnline ? 'cyan' : 'red'}`} />
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, activeKey, go, collapsed }: {
  item: NavItemDef;
  activeKey: Page['name'];
  go: (p: Page) => void;
  collapsed: boolean;
}) {
  const active = activeKey === item.key;
  return (
    <a
      className={`nav-item ${active ? 'active' : ''}`}
      href="#"
      role="link"
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      onClick={(e) => { e.preventDefault(); go({ name: item.key } as Page); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go({ name: item.key } as Page);
        }
      }}
    >
      <span className="nav-icon"><Icon name={item.icon} /></span>
      <span className="lbl">{item.label}</span>
      {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
    </a>
  );
}

/* ---------------- Topbar ---------------- */

function Topbar({ latest, backendOnline, go, title, theme, onToggleTheme }: {
  latest: ScanListItem | null;
  backendOnline: boolean;
  go: (p: Page) => void;
  title: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const running = latest?.status === 'running';
  return (
    <div className="topbar">
      <div className="topbar-title">
        <span className="status-dot green" />
        <b>{title}</b>
      </div>
      <span className="topbar-divider" />
      <div className="topbar-title">
        Target: <b>ShulkerLab (Local)</b>
      </div>
      <span className={`status-pill ${running ? 'potential' : latest?.status === 'complete' ? 'pass' : 'skipped'}`}>
        {running ? 'SCAN RUNNING' : latest?.status === 'complete' ? 'SCAN COMPLETED' : 'SCAN IDLE'}
      </span>
      <div className="topbar-meta">
        <span>Last scan: <b>{fmtTime(latest?.finishedAt ?? latest?.startedAt)}</b></span>
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-meta">
        <span className="scope-chip">
          <span className="status-dot green" style={{ width: 5, height: 5 }} /> AUTHORIZED SANDBOX
        </span>
        <span className="faint">{backendOnline ? '● online' : '○ offline'}</span>
      </div>
      <button
        className="icon-btn"
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button className="icon-btn" title="Settings" aria-label="Open settings" onClick={() => go({ name: 'settings' })}>
        <Icon name="settings" />
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => go({ name: 'scan' })}><Icon name="plus" /> New Scan</button>
    </div>
  );
}

/* ---------------- Footer ---------------- */

function Footer() {
  return (
    <div className="app-footer">
      <span>Shulker <span className="faint">v1.1.0</span></span>
      <span className="faint">Zero-Trust API Security Platform</span>
      <div className="spacer" />
      <span className="faint">Built for security teams</span>
      <span className="faint">·</span>
      <span className="faint">Powered by AI</span>
      <span className="status-dot green" style={{ width: 6, height: 6 }} />
      <span className="faint">Local Environment</span>
    </div>
  );
}
