import { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribeScanEvents, type ScanEvent } from '../api';
import { LATEST_SCAN_KEY, useScanCtx } from '../App';
import { Icon, fmtTime, useCopy, useToast } from '../ui';
import { TEMPLATES, templateSpec, type TemplateId } from '../templates';

interface DemoTarget { id: string; target: string; note: string }
type AuthMethod = 'none' | 'api-key' | 'bearer' | 'basic';
type ContractSource = 'sandbox' | 'openapi-url' | 'openapi-file' | 'postman' | 'har';

const AUTH_PROVIDERS: Array<{ name: string; url: string }> = [
  { name: 'GitHub', url: 'https://github.com/settings/tokens' },
  { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  { name: 'Stripe', url: 'https://dashboard.stripe.com/apikeys' },
];

const PHASES: Array<{ key: string; label: string }> = [
  { key: 'parse', label: 'Discovering endpoints' },
  { key: 'auth', label: 'Testing authentication' },
  { key: 'hypotheses', label: 'Resource modeling' },
  { key: 'testing', label: 'Testing authorization' },
  { key: 'analysis', label: 'Testing rate limits' },
  { key: 'findings', label: 'Generating findings' },
  { key: 'done', label: 'Report ready' },
];

export function NewScan() {
  const toast = useToast();
  const { go, refresh } = useScanCtx();

  /* ---- mode ---- */
  const [mode, setMode] = useState<'sandbox' | 'real'>('sandbox');

  /* ---- contract mode: built-in template vs custom (state preserved per side) ---- */
  const [contractMode, setContractMode] = useState<'template' | 'custom'>('template');
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  /* ---- real API config ---- */
  const [target, setTarget] = useState('http://127.0.0.1:8700');
  const [contract, setContract] = useState<ContractSource>('openapi-url');
  const [specUrl, setSpecUrl] = useState('http://127.0.0.1:8700/openapi.json');
  const [specText, setSpecText] = useState('');
  const [specValid, setSpecValid] = useState<{ valid: boolean; error?: string; title?: string; endpointCount?: number; endpoints?: Array<{ method: string; path: string; auth: string }> } | null>(null);
  const [validating, setValidating] = useState(false);

  const [authMethod, setAuthMethod] = useState<AuthMethod>('none');
  const [apiKeyName, setApiKeyName] = useState('x-api-key');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [basicUser, setBasicUser] = useState('');
  const [basicPass, setBasicPass] = useState('');
  const [customHeaders, setCustomHeaders] = useState<Array<{ k: string; v: string }>>([{ k: '', v: '' }]);
  const [allowExternal, setAllowExternal] = useState(false);

  const [budget, setBudget] = useState(120);
  const [probeCount, setProbeCount] = useState(12);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  /* ---- run ---- */
  const [starting, setStarting] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [done, setDone] = useState(false);
  const [scanTarget, setScanTarget] = useState('');
  const closeRef = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const attach = useCallback((id: string, tgt?: string) => {
    setScanId(id);
    setDone(false);
    setEvents([]);
    if (tgt) setScanTarget(tgt);
    closeRef.current?.();
    closeRef.current = subscribeScanEvents(id, (ev) => {
      setEvents((prev) => [...prev.slice(-400), ev]);
      if (ev.type === 'SCAN_DONE') {
        refresh();
        toast.push(ev.message.includes('halted') ? 'err' : 'ok', 'Scan finished', ev.message);
      }
    }, () => setDone(true));
  }, [refresh, toast]);

  useEffect(() => {
    const onDemo = (e: Event) => {
      const { id, target: tgt } = (e as CustomEvent<{ id: string; target?: string }>).detail;
      attach(id, tgt);
    };
    window.addEventListener('shulker:demo-started', onDemo);
    return () => {
      window.removeEventListener('shulker:demo-started', onDemo);
      closeRef.current?.();
    };
  }, [attach]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  useEffect(() => () => closeRef.current?.(), []);

  const runDemo = async () => {
    setStarting(true);
    try {
      const r: DemoTarget = await api.demo();
      localStorage.setItem(LATEST_SCAN_KEY, r.id);
      attach(r.id, r.target);
    } catch (e) {
      toast.push('err', 'Demo failed', e instanceof Error ? e.message : 'unknown error');
    } finally {
      setStarting(false);
    }
  };

  const validate = async () => {
    setValidating(true);
    try {
      const v = contractMode === 'template' && template
        ? await api.validateSpec(templateSpec(template))
        : contract === 'openapi-url'
          ? await api.inventoryImportUrl(specUrl, allowExternal).then((r) => ({ valid: true as const, title: r.source, endpointCount: r.endpoints, endpoints: [] as Array<{ method: string; path: string; auth: string }>, error: undefined }))
          : await api.validateSpec(specText);
      setSpecValid(v);
      if (!v.valid) toast.push('err', 'Contract invalid', v.error ?? 'Could not parse the provided contract.');
    } catch (e) {
      setSpecValid({ valid: false, error: e instanceof Error ? e.message : 'validation failed' });
    } finally {
      setValidating(false);
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      const spec = contractMode === 'template' && template
        ? templateSpec(template)
        : contract === 'openapi-url' ? specUrl : (specText || 'sandbox');
      const r = await api.startScan({
        target,
        spec,
        useSandboxSpec: contract === 'sandbox',
        confirmAuthorized: confirmed,
        budget,
        rateLimitProbeCount: probeCount,
        aiEnabled,
        allowExternal,
        auth: {
          mode: authMethod,
          apiKeyName,
          apiKeyValue,
          bearerToken,
          basicUser,
          basicPass,
          customHeaders: customHeaders.filter((h) => h.k.trim() && h.v.trim()),
        },
      });
      localStorage.setItem(LATEST_SCAN_KEY, r.id);
      attach(r.id, target);
    } catch (e) {
      toast.push('err', 'Scan failed to start', e instanceof Error ? e.message : 'unknown error');
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!scanId) return;
    try {
      await api.cancelScan(scanId);
      toast.push('info', 'Scan cancelled', 'No further requests will be sent to the target.');
    } catch (e) {
      toast.push('err', 'Cancel failed', e instanceof Error ? e.message : 'unknown error');
    }
  };

  /* ---- live scan metrics ---- */
  const running = scanId !== null && !done;
  const currentPhase = [...events].reverse().find((e) => e.phase !== 'init')?.phase ?? 'init';
  const phaseIdx = PHASES.findIndex((p) => p.key === currentPhase);
  const progress = done ? 100 : scanId ? Math.max(8, ((phaseIdx + 1) / PHASES.length) * 92) : 0;
  const endpointsFound = events.find((e) => e.type === 'ENDPOINTS_DISCOVERED');
  const authOk = events.find((e) => e.type === 'AUTH_OK');
  const resourceModel = events.find((e) => e.type === 'RESOURCE_MODEL');
  const findingsReady = events.find((e) => e.type === 'FINDINGS_READY');

  const timelineSteps = [
    { label: 'Target validated', done: Boolean(scanId) },
    { label: authOk ? authOk.message : 'Authentication…', done: Boolean(authOk), active: running && !authOk },
    { label: endpointsFound ? endpointsFound.message : 'Contract loading…', done: Boolean(endpointsFound), active: running && !endpointsFound },
    { label: resourceModel ? resourceModel.message : 'Resource discovery…', done: Boolean(resourceModel), active: running && !resourceModel },
    { label: findingsReady ? findingsReady.message : 'Testing authorization…', done: Boolean(findingsReady), active: running && !findingsReady },
    { label: 'Evidence collection', done: Boolean(findingsReady), active: running && Boolean(findingsReady) && !done },
    { label: 'Report generation', done },
  ];

  const authValid =
    authMethod === 'none' ||
    authMethod === 'api-key' && apiKeyValue.trim() !== '' ||
    authMethod === 'bearer' && bearerToken.trim() !== '' ||
    authMethod === 'basic' && basicUser.trim() !== '' && basicPass.trim() !== '' ||
    customHeaders.some((h) => h.k.trim() && h.v.trim());

  const targetIsExternal = (() => {
    try {
      const h = new URL(target).hostname;
      return !(h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost') ||
        /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local'));
    } catch { return false; }
  })();

  const canStart =
    mode === 'sandbox' ||
    (Boolean(target) && confirmed && authValid && (!targetIsExternal || allowExternal) && (
      (contractMode === 'template' && template !== null) ||
      contract === 'sandbox' ||
      (contract === 'openapi-url' && Boolean(specUrl)) ||
      Boolean(specText)
    ));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">New Security Test</div>
          <h1 className="page-title">{running ? 'Scanning…' : 'New Scan'}</h1>
          <p className="page-sub">
            {running
              ? <>Testing <b style={{ color: 'var(--text)' }}>{scanTarget || target}</b> with bounded, authorized security tests.</>
              : 'Pick a scan mode, provide a contract and authentication, then run bounded tests. Local targets are always allowed; external targets require explicit authorization.'}
          </p>
        </div>
        {running && <button className="btn btn-danger" onClick={cancel}><Icon name="x" /> Cancel</button>}
        {done && (
          <div className="page-head-actions">
            <button className="btn btn-primary" onClick={() => scanId && go({ name: 'findings', scanId })}><Icon name="flag" /> Findings</button>
            <button className="btn btn-ghost" onClick={() => scanId && go({ name: 'evidence', scanId })}>Evidence</button>
            <button className="btn btn-ghost" onClick={() => scanId && go({ name: 'reports' })}><Icon name="download" /> Reports</button>
          </div>
        )}
      </div>

      {/* ---- STEP 1: scan mode ---- */}
      <div className="panel mb">
        <div className="panel-title mb"><Icon name="bolt" /> Scan mode</div>
        <div className="row" style={{ gap: 10 }}>
          <button className={`btn ${mode === 'sandbox' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('sandbox')} disabled={running}>
            <Icon name="target" /> Local Sandbox (ShulkerLab)
          </button>
          <button className={`btn ${mode === 'real' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('real')} disabled={running}>
            <Icon name="grid" /> Real API
          </button>
        </div>

        {mode === 'sandbox' && (
          <>
            <div className="notice good mt" style={{ marginBottom: 0 }}>
              <Icon name="check" />
              <span><b>Local Sandbox Mode</b> — deliberately vulnerable API used to demonstrate BOLA, BFLA, Data Exposure and Rate Limiting findings. Target: <span className="mono">http://127.0.0.1:8700</span></span>
            </div>
            <button className="btn btn-primary mt" onClick={runDemo} disabled={starting}>
              <Icon name="play" /> {starting ? 'Starting…' : 'Run Demo Scan'}
            </button>
          </>
        )}

        {mode === 'real' && (
          <div className="notice mt" style={{ marginBottom: 0, borderColor: 'var(--border-accent)' }}>
            <Icon name="info" />
            <span>
              {targetIsExternal && allowExternal
                ? <><b>External Authorized Mode</b> — public targets accepted. Authorization confirmation is still required below.</>
                : targetIsExternal && !allowExternal
                  ? <><b>External target detected.</b> Enable "Allow External Targets" below and confirm authorization to scan it.</>
                  : <><b>Local Mode</b> — loopback / private target, always permitted.</>}
            </span>
          </div>
        )}
      </div>

      {/* ---- REAL API: steps 2+ ---- */}
      {mode === 'real' && (
        <>
          {/* STEP 2 — target */}
          <div className="panel mb">
            <div className="panel-title mb"><Icon name="target" /> API target</div>
            <label className="field">
              <span>Target base URL (local networks always allowed; public targets require authorization below)</span>
              <input type="url" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://api.your-company.com" disabled={running} />
            </label>
            <label className="check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={allowExternal} onChange={(e) => setAllowExternal(e.target.checked)} disabled={running} />
              <span><b>Allow External Targets</b> — accept public HTTPS targets and public OpenAPI URLs.</span>
            </label>
            {allowExternal && (
              <div className="notice warn mt" style={{ marginBottom: 0 }}>
                <Icon name="alert" />
                <span><b>Only scan APIs you own or are authorized to test.</b> Scanning third-party systems without permission is illegal in most jurisdictions. All requests remain budget-bounded and rate-limited.</span>
              </div>
            )}
          </div>

          {/* STEP 2b — quick API templates */}
          <div className="panel mb">
            <div className="row between mb">
              <div className="panel-title"><Icon name="bolt" /> Quick API Templates</div>
              <div className="filter-row">
                <button className={`btn btn-sm ${contractMode === 'template' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setContractMode('template')} disabled={running}>Use Built-in Template</button>
                <button className={`btn btn-sm ${contractMode === 'custom' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setContractMode('custom')} disabled={running}>Use Custom Contract</button>
              </div>
            </div>

            {contractMode === 'template' ? (
              <>
                <div className="tpl-grid">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      className={`tpl-card ${template === t.id ? 'selected' : ''}`}
                      onClick={() => {
                        setTemplate(t.id);
                        setTarget(t.target);
                        setAuthMethod(t.authMode);
                        if (t.headerName) setApiKeyName(t.headerName);
                        setAllowExternal(true);
                        setSpecValid(null);
                      }}
                      disabled={running}
                    >
                      <span className="tpl-name">{t.label}</span>
                      <span className="tpl-meta">{t.description}</span>
                    </button>
                  ))}
                </div>

                {template && template !== 'custom' && (
                  <div className="notice good mt" style={{ marginBottom: 0 }}>
                    <Icon name="check" />
                    <span>
                      <b>{TEMPLATES.find((t) => t.id === template)?.label}</b> — target, authentication and a valid OpenAPI 3.0.3 contract are auto-filled. Get a key at <a className="link" href={TEMPLATES.find((t) => t.id === template)?.keyUrl} target="_blank" rel="noreferrer">the provider console ↗</a>.{' '}
                      <a className="link" onClick={() => setPreviewOpen(true)}>View Generated Contract</a>
                    </span>
                  </div>
                )}
                {!template && (
                  <p className="faint mt" style={{ marginBottom: 0 }}>Pick a provider to auto-fill target + auth + contract — no file upload needed. Or switch to Custom Contract for your own API.</p>
                )}
              </>
            ) : (
              <p className="faint mt" style={{ marginBottom: 0 }}>Configure your own API below — target, contract import and authentication. Previously entered values are preserved when you switch back.</p>
            )}
          </div>

          {/* STEP 3 — contract import (custom mode only) */}
          <div className="panel mb" style={{ display: contractMode === 'template' ? 'none' : undefined }}>
            <div className="panel-title mb"><Icon name="file" /> Contract source</div>
            <div className="filter-row">
              {([
                ['openapi-url', 'OpenAPI URL'],
                ['openapi-file', 'Upload OpenAPI file'],
                ['postman', 'Postman Collection'],
                ['har', 'HAR file'],
              ] as const).map(([k, label]) => (
                <button key={k} className={`btn btn-sm ${contract === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setContract(k); setSpecValid(null); }} disabled={running}>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt">
              {contract === 'openapi-url' && (
                <label className="field">
                  <span>OpenAPI spec URL</span>
                  <input type="url" value={specUrl} onChange={(e) => { setSpecUrl(e.target.value); setSpecValid(null); }} placeholder="http://127.0.0.1:8700/openapi.json" disabled={running} />
                </label>
              )}
              {contract === 'openapi-file' && (
                <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                  <Icon name="upload" /> Choose OpenAPI file (.json / .yaml)
                  <input type="file" accept=".json,.yaml,.yml" style={{ display: 'none' }} disabled={running} onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    setSpecText(text);
                    setSpecValid(null);
                  }} />
                </label>
              )}
              {contract === 'postman' && (
                <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                  <Icon name="upload" /> Choose Postman Collection (.json)
                  <input type="file" accept=".json" style={{ display: 'none' }} disabled={running} onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    setSpecText(text);
                    setSpecValid(null);
                  }} />
                </label>
              )}
              {contract === 'har' && (
                <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                  <Icon name="upload" /> Choose HAR file (.har)
                  <input type="file" accept=".har,.json" style={{ display: 'none' }} disabled={running} onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    setSpecText(text);
                    setSpecValid(null);
                  }} />
                </label>
              )}
            </div>

            <div className="row mt" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={validate} disabled={validating || running || (contract === 'openapi-url' ? !specUrl : !specText)}>
                <Icon name="check" /> {validating ? 'Validating…' : 'Validate contract'}
              </button>
              {contract === 'openapi-url' && <span className="faint" style={{ fontSize: 12 }}>Validation imports the spec into the inventory so you can preview endpoints.</span>}
            </div>

            {specValid && (
              <div className={`notice mt ${specValid.valid ? 'good' : 'bad'}`}>
                <Icon name={specValid.valid ? 'check' : 'alert'} />
                <span>
                  {specValid.valid
                    ? <><b>{specValid.title ?? 'Contract'}</b> — {specValid.endpointCount ?? 0} endpoints parsed.</>
                    : specValid.error}
                </span>
              </div>
            )}

            {/* STEP 4 — discovery preview (custom mode) */}
            {contractMode === 'custom' && specValid?.valid && specValid.endpoints && specValid.endpoints.length > 0 && (
              <div className="mt">
                <div className="section-label mb">Discovered endpoints preview</div>
                <div className="row between faint" style={{ fontSize: 12 }}>
                  <span><b style={{ color: 'var(--text)' }}>{specValid.endpoints.length}</b> endpoints</span>
                  <span><b style={{ color: 'var(--text)' }}>{specValid.endpoints.filter((e) => e.auth !== 'none').length}</b> protected</span>
                  <span><b style={{ color: 'var(--text)' }}>{specValid.endpoints.filter((e) => e.auth === 'none').length}</b> public</span>
                </div>
                <div className="endpoint-preview mt">
                  {specValid.endpoints.slice(0, 8).map((e, i) => (
                    <div key={i} className="endpoint-preview-row">
                      <span className={`method-chip ${e.method.toLowerCase()}`}>{e.method}</span>
                      <span className="mono">{e.path}</span>
                      <span className={`status-pill ${e.auth !== 'none' ? 'pass' : 'potential'}`} style={{ marginLeft: 'auto', fontSize: 9.5 }}>{e.auth === 'none' ? 'PUBLIC' : 'PROTECTED'}</span>
                    </div>
                  ))}
                  {specValid.endpoints.length > 8 && <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>+ {specValid.endpoints.length - 8} more…</div>}
                </div>
              </div>
            )}
          </div>

          {/* STEP 5 — authentication */}
          <div className="panel mb">
            <div className="panel-title mb"><Icon name="lock" /> Authentication</div>
            <div className="filter-row">
              {([
                ['none', 'None'],
                ['api-key', 'API Key'],
                ['bearer', 'Bearer Token'],
                ['basic', 'Basic Auth'],
              ] as const).map(([k, label]) => (
                <button key={k} className={`btn btn-sm ${authMethod === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAuthMethod(k)} disabled={running}>
                  {label}
                </button>
              ))}
            </div>

            {authMethod === 'api-key' && (
              <>
                <div className="grid2 mt" style={{ gap: 10 }}>
                  <label className="field">
                    <span>Header name</span>
                    <input type="text" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} placeholder="x-api-key" disabled={running} />
                  </label>
                  <label className="field">
                    <span>Key value (redacted in all reports)</span>
                    <input type="text" value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)} placeholder="sk-…" disabled={running} />
                  </label>
                </div>
                <div className="auth-example mt">
                  <div className="section-label">Request header preview</div>
                  <code className="inline">{apiKeyName || 'x-api-key'}: YOUR_KEY</code>
                </div>
                <div className="auth-example mt">
                  <div className="section-label">Common providers</div>
                  <div className="row" style={{ gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
                    {AUTH_PROVIDERS.map((p) => (
                      <a key={p.name} className="link" href={p.url} target="_blank" rel="noreferrer">{p.name} tokens ↗</a>
                    ))}
                  </div>
                </div>
              </>
            )}
            {authMethod === 'bearer' && (
              <>
                <label className="field mt">
                  <span>Bearer token (redacted in all reports)</span>
                  <input type="text" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs…" disabled={running} />
                </label>
                <div className="auth-example mt">
                  <div className="section-label">Request header preview</div>
                  <code className="inline">Authorization: Bearer YOUR_TOKEN</code>
                </div>
              </>
            )}
            {authMethod === 'basic' && (
              <>
                <div className="grid2 mt" style={{ gap: 10 }}>
                  <label className="field">
                    <span>Username</span>
                    <input type="text" value={basicUser} onChange={(e) => setBasicUser(e.target.value)} placeholder="user" disabled={running} />
                  </label>
                  <label className="field">
                    <span>Password (redacted in all reports)</span>
                    <input type="password" value={basicPass} onChange={(e) => setBasicPass(e.target.value)} placeholder="••••••••" disabled={running} />
                  </label>
                </div>
                <div className="auth-example mt">
                  <div className="section-label">Request header preview</div>
                  <code className="inline">Authorization: Basic BASE64(user:pass)</code>
                </div>
              </>
            )}
            {authMethod === 'none' && (
              <p className="faint mt" style={{ marginBottom: 0 }}>Requests are sent unauthenticated. Authentication-bypass and object-access tests run against public endpoints only.</p>
            )}

            {/* Custom headers — always available regardless of auth method */}
            <div className="mt">
              <div className="section-label mb">Custom headers (sent with every request)</div>
              {customHeaders.map((h, i) => (
                <div key={i} className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'center', marginBottom: 8 }}>
                  <input type="text" value={h.k} placeholder="Header name" onChange={(e) => setCustomHeaders((rs) => rs.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))} style={{ flex: 1 }} disabled={running} />
                  <input type="text" value={h.v} placeholder="Value (redacted in reports)" onChange={(e) => setCustomHeaders((rs) => rs.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))} style={{ flex: 2 }} disabled={running} />
                  <button className="icon-btn" onClick={() => setCustomHeaders((rs) => rs.filter((_, j) => j !== i))} disabled={running} aria-label="Remove header"><Icon name="x" /></button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setCustomHeaders((rs) => [...rs, { k: '', v: '' }])} disabled={running}>
                <Icon name="plus" /> Add header
              </button>
            </div>
          </div>

          {/* STEP 6 — profile + authorization */}
          <div className="panel mb">
            <div className="panel-title mb"><Icon name="settings" /> Scan profile</div>
            <div className="grid2" style={{ gap: 10 }}>
              <label className="field">
                <span>Request budget</span>
                <input type="number" value={budget} min={10} max={400} onChange={(e) => setBudget(Number(e.target.value))} disabled={running} />
              </label>
              <label className="field">
                <span>Rate-limit probes</span>
                <input type="number" value={probeCount} min={5} max={25} onChange={(e) => setProbeCount(Number(e.target.value))} disabled={running} />
              </label>
            </div>
            <label className="check mt">
              <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} disabled={running} />
              <span>AI reasoning (Gemini hypotheses — deterministic verification always applies)</span>
            </label>
            <label className="check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={running} />
              <span>I own this API or am explicitly authorized to security-test it. The scan sends up to <b style={{ color: 'var(--text)' }}>{budget + probeCount + 10}</b> controlled requests.</span>
            </label>
            <button className="btn btn-primary mt" onClick={start} disabled={!canStart || starting}>
              <Icon name="play" /> {starting ? 'Starting…' : 'Run scan'}
            </button>
            {!canStart && !starting && (
              <div className="faint mt" style={{ fontSize: 12 }}>
                {!confirmed
                  ? 'Confirm authorization above to enable scanning.'
                  : targetIsExternal && !allowExternal
                    ? 'This is an external target — enable "Allow External Targets" above to scan it.'
                    : 'Provide a target and a contract source to enable scanning.'}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- live monitor ---- */}
      {scanId && (
        <>
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title"><Icon name="target" /> {scanTarget || target}</div>
              <span className={`status-pill ${done ? 'pass' : running ? 'potential' : 'fail'}`}>{done ? 'COMPLETED' : running ? 'RUNNING' : 'STOPPED'}</span>
            </div>
            <div className="progress-track mb" style={{ height: 10 }}>
              <div className={`progress-fill ${done ? 'done' : ''}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="row between faint mb" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
              <span>{progress.toFixed(0)}%</span>
              <span>{events.length} events</span>
            </div>
            <div className="timeline">
              {timelineSteps.map((s, i) => (
                <div key={i} className={`tl-step ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}`}>
                  <div className="tl-dot">{s.done ? '✓' : s.active ? '●' : '○'}</div>
                  <div className="tl-label">{s.label}</div>
                </div>
              ))}
            </div>
            {done && (
              <div className="notice good mt">
                <Icon name="check" />
                <span>Scan complete — <a className="link" onClick={() => go({ name: 'findings', scanId: scanId! })}>findings</a> · <a className="link" onClick={() => go({ name: 'evidence', scanId: scanId! })}>evidence</a> · <a className="link" onClick={() => go({ name: 'reports' })}>reports</a>.</span>
              </div>
            )}
          </div>

          <div className="panel mt" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head">
              <div className="panel-title"><Icon name="terminal" /> Live Event Stream</div>
              <span className="faint mono">{done ? 'stream closed' : 'streaming…'}</span>
            </div>
            <div className="event-log" ref={logRef} style={{ flex: 1, maxHeight: 380 }}>
              {events.length === 0 && <span className="faint">Waiting for scanner events…</span>}
              {events.map((e, i) => (
                <div key={`${e.seq}-${i}`} className={`ev ${e.type.includes('FAIL') || e.type.includes('ERROR') || e.type.includes('HALT') ? 'bad' : e.type.includes('FINDING') || e.type.includes('FALLBACK') ? 'warn' : e.type.includes('DONE') || e.type.includes('OK') ? 'ok' : ''}`}>
                  <span className="ts">{fmtTime(e.ts)}</span>
                  <span className="tag">{e.type}</span>
                  <span>{e.message}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {/* ---- generated contract preview modal ---- */}
      {previewOpen && template && template !== 'custom' && (
        <ContractPreview
          title={TEMPLATES.find((t) => t.id === template)?.label ?? 'Contract'}
          json={templateSpec(template)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

/* Modal: view / copy / download the generated OpenAPI contract. */
function ContractPreview({ title, json, onClose }: { title: string; json: string; onClose: () => void }) {
  const [copied, copy] = useCopy();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shulker-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-openapi.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between mb">
          <h3 style={{ margin: 0 }}>Generated contract — {title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="filter-row mb">
          <button className="btn btn-sm btn-ghost" onClick={() => copy(json)}>{copied ? <><Icon name="check" /> Copied</> : <><Icon name="copy" /> Copy JSON</>}</button>
          <button className="btn btn-sm btn-ghost" onClick={download}><Icon name="download" /> Download JSON</button>
          <span className="faint" style={{ fontSize: 11.5, marginLeft: 'auto' }}>OpenAPI 3.0.3 · valid · importable without a file</span>
        </div>
        <pre className="contract-preview-json">{json}</pre>
      </div>
    </div>
  );
}
