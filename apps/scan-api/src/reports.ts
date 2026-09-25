/**
 * Report generator: JSON, Markdown, and self-contained HTML exports from a
 * completed scan. Evidence and PoCs are included with tokens redacted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanResult } from '@shulker/shared';
import { SEVERITY_ORDER } from '@shulker/shared';

const REPORTS_DIR = process.env.SHULKER_DATA_DIR
  ? join(process.env.SHULKER_DATA_DIR, 'reports')
  : join(process.cwd(), 'data', 'reports');

function ensureReportsDir(): string {
  mkdirSync(REPORTS_DIR, { recursive: true });
  return REPORTS_DIR;
}

function execSummary(scan: ScanResult): string {
  const s = scan.summary;
  const parts: string[] = [];
  parts.push(
    `Shulker tested ${s.endpointsTested} of ${s.endpointsDiscovered} discovered endpoints on ${scan.target} with ${s.testsTotal} controlled security tests in ${(s.durationMs / 1000).toFixed(1)} seconds.`,
  );
  if (s.confirmed > 0) {
    const worst = SEVERITY_ORDER.find((sev) => (s.bySeverity[sev] ?? 0) > 0);
    parts.push(
      `The scan CONFIRMED ${s.confirmed} authorization/data-exposure issue${s.confirmed === 1 ? '' : 's'}${worst ? ` (highest severity: ${worst.toUpperCase()})` : ''}. Each finding includes reproducible proof-of-concept requests and remediation guidance.`,
    );
  } else {
    parts.push('No confirmed authorization or data-exposure issues were found. Secure controls passed their verification tests.');
  }
  if (s.potential > 0) {
    parts.push(`${s.potential} potential issue${s.potential === 1 ? '' : 's'} require${s.potential === 1 ? 's' : ''} manual review.`);
  }
  if (scan.aiStatus === 'ok') {
    parts.push('AI-assisted reasoning was used to prioritize authorization boundaries; every finding was verified deterministically against live responses.');
  } else {
    parts.push('AI reasoning was not used for this scan; all checks were produced by deterministic security rules.');
  }
  return parts.join(' ');
}

export function renderMarkdown(scan: ScanResult): string {
  const s = scan.summary;
  const lines: string[] = [];
  lines.push(`# Shulker Security Report`);
  lines.push('');
  lines.push(`> *Find the API vulnerability before the breach headline does.*`);
  lines.push('');
  lines.push(`- **Target:** ${scan.target}`);
  lines.push(`- **Specification:** ${scan.title}`);
  lines.push(`- **Started:** ${scan.startedAt}`);
  lines.push(`- **Duration:** ${(s.durationMs / 1000).toFixed(1)}s`);
  lines.push(`- **AI reasoning:** ${scan.aiStatus}${scan.aiNote ? ` — ${scan.aiNote}` : ''}`);
  lines.push('');
  lines.push(`## Executive summary`);
  lines.push('');
  lines.push(execSummary(scan));
  lines.push('');
  lines.push(`## Coverage`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Endpoints discovered | ${s.endpointsDiscovered} |`);
  lines.push(`| Endpoints tested | ${s.endpointsTested} |`);
  lines.push(`| Tests executed | ${s.testsTotal} |`);
  lines.push(`| Tests passed | ${s.testsPassed} |`);
  lines.push(`| Tests failed | ${s.testsFailed} |`);
  lines.push('');
  lines.push(`## Findings`);
  lines.push('');
  if (scan.findings.length === 0) {
    lines.push('_No findings._ All executed security checks passed.');
    lines.push('');
  }
  const sorted = [...scan.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  for (const f of sorted) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push('');
    lines.push(`- **Status:** ${f.status.toUpperCase()} · **Confidence:** ${f.confidence}`);
    lines.push(`- **Endpoint:** \`${f.method} ${f.endpoint}\``);
    if (f.requestingIdentity) lines.push(`- **Requesting identity:** ${f.requestingIdentity}`);
    if (f.resourceOwner) lines.push(`- **Resource owner:** ${f.resourceOwner}`);
    lines.push('');
    lines.push(f.description);
    lines.push('');
    lines.push(`**Expected:** ${f.expectedBehavior}  `);
    lines.push(`**Actual:** ${f.actualBehavior}  `);
    lines.push(`**Why ${f.severity}:** ${f.severityReason}`);
    lines.push('');
    lines.push('**Proof of concept**');
    lines.push('');
    lines.push('```bash');
    lines.push(f.poc.curl);
    lines.push('```');
    lines.push('');
    lines.push(`**Remediation:** ${f.recommendation}`);
    lines.push('');
  }
  lines.push(`## Methodology`);
  lines.push('');
  lines.push('Shulker ingests the OpenAPI specification, infers authorization boundaries, then executes bounded deterministic tests against the explicitly authorized target: cross-user object access (BOLA), response schema vs. sensitive-field analysis (excessive data exposure), privileged endpoint access (BFLA) and bounded rate-limit probes. Evidence is captured with secrets redacted. AI output is treated as hypotheses only — never as proof.');
  lines.push('');
  return lines.join('\n');
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#64748b',
};

export function renderHtml(scan: ScanResult): string {
  const s = scan.summary;
  const esc = (t: string): string =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const findings = [...scan.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const findingCards = findings.length === 0
    ? `<div class="card ok">All executed security checks passed. No findings.</div>`
    : findings.map((f) => `
      <div class="card finding">
        <div class="row">
          <span class="sev" style="background:${SEV_COLOR[f.severity] ?? '#64748b'}">${esc(f.severity.toUpperCase())}</span>
          <span class="status">${esc(f.status.toUpperCase())}</span>
          <span class="conf">confidence: ${esc(f.confidence)}</span>
        </div>
        <h3>${esc(f.title)}</h3>
        <div class="ep"><code>${esc(f.method)} ${esc(f.endpoint)}</code></div>
        <p>${esc(f.description)}</p>
        <div class="grid2">
          <div><strong>Expected</strong><p>${esc(f.expectedBehavior)}</p></div>
          <div><strong>Actual</strong><p>${esc(f.actualBehavior)}</p></div>
        </div>
        <p class="why"><strong>Why ${esc(f.severity)}:</strong> ${esc(f.severityReason)}</p>
        <details><summary>Proof of concept</summary><pre>${esc(f.poc.curl)}</pre></details>
        <p class="fix"><strong>Remediation:</strong> ${esc(f.recommendation)}</p>
      </div>`).join('\n');

  const evidenceRows = scan.evidence.map((e) => `
    <div class="card ev">
      <div class="row"><strong>${esc(e.method)} ${esc(e.request.url)}</strong><span>${e.response.status} · ${e.durationMs}ms</span></div>
      <pre class="req">${esc(e.request.method)} ${esc(e.request.url)}
${Object.entries(e.request.headers).map(([k, v]) => `${k}: ${esc(v)}`).join('\n')}${e.request.body ? `\n\n${esc(e.request.body)}` : ''}</pre>
      <pre class="res">HTTP ${e.response.status}
${esc(e.response.body.slice(0, 1200))}</pre>
      <div class="row muted"><span>expected: ${esc(e.expected)}</span><span>actual: ${esc(e.actual)}</span></div>
    </div>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Shulker Report — ${esc(scan.title)}</title>
<style>
  :root { color-scheme: dark; }
  body { background:#0b0f17; color:#e2e8f0; font:15px/1.6 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; margin:0; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 48px 24px 96px; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; }
  .tag { color:#7dd3fc; font-size:13px; }
  .meta { display:flex; flex-wrap:wrap; gap:18px; color:#94a3b8; font-size:13px; margin: 18px 0 30px; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:30px; }
  .kpi { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:14px 16px; }
  .kpi .n { font-size:26px; font-weight:650; }
  .kpi .l { color:#94a3b8; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
  .card { background:#111827; border:1px solid #1f2937; border-radius:14px; padding:20px 22px; margin-bottom:16px; }
  .card.ok { border-color:#14532d; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:12px; color:#94a3b8; }
  .sev { color:#0b0f17; font-weight:700; padding:2px 10px; border-radius:999px; }
  .status { font-weight:700; letter-spacing:.06em; }
  .ep { margin: 8px 0; }
  code { background:#0b0f17; border:1px solid #1f2937; padding:2px 8px; border-radius:6px; font-size:13px; }
  pre { background:#0b0f17; border:1px solid #1f2937; border-radius:10px; padding:14px; overflow:auto; font-size:12.5px; line-height:1.5; }
  h2 { font-size:19px; margin:34px 0 14px; letter-spacing:-0.01em; }
  h3 { margin: 10px 0 4px; font-size: 16px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .grid2 p { margin: 4px 0 0; color:#cbd5e1; }
  .why { color:#fca5a5; } .fix { color:#86efac; }
  .muted { color:#64748b; }
  details summary { cursor:pointer; color:#7dd3fc; margin: 8px 0; }
  @media print { body { background:#fff; color:#111; } .card, pre, code { background:#fff; border-color:#ddd; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="tag">SHULKER · AUTHORIZED SECURITY SCAN</div>
  <h1>${esc(scan.title)}</h1>
  <div class="meta">
    <span>Target: <strong>${esc(scan.target)}</strong></span>
    <span>Started: ${esc(scan.startedAt)}</span>
    <span>Duration: ${(s.durationMs / 1000).toFixed(1)}s</span>
    <span>AI: ${esc(scan.aiStatus)}</span>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="n">${s.endpointsDiscovered}</div><div class="l">Endpoints discovered</div></div>
    <div class="kpi"><div class="n">${s.endpointsTested}</div><div class="l">Endpoints tested</div></div>
    <div class="kpi"><div class="n">${s.testsTotal}</div><div class="l">Tests executed</div></div>
    <div class="kpi"><div class="n">${s.testsPassed}</div><div class="l">Tests passed</div></div>
    <div class="kpi"><div class="n">${s.confirmed}</div><div class="l">Confirmed</div></div>
    <div class="kpi"><div class="n">${s.potential}</div><div class="l">Potential</div></div>
  </div>
  <h2>Executive summary</h2>
  <div class="card">${esc(execSummary(scan))}</div>
  <h2>Findings</h2>
  ${findingCards}
  <h2>Evidence</h2>
  ${evidenceRows || '<div class="card muted">No evidence records.</div>'}
  <h2>Methodology</h2>
  <div class="card">Shulker ingests the OpenAPI specification, infers authorization boundaries, and executes bounded deterministic tests against the explicitly authorized target: cross-user object access (BOLA), response-vs-contract field analysis (excessive data exposure), privileged endpoint access (BFLA), and bounded rate-limit probes. Evidence is captured with secrets redacted. AI output is treated as hypotheses only — never as proof.</div>
</div>
</body>
</html>`;
}

export function writeReport(scan: ScanResult, format: 'json' | 'md' | 'html'): string {
  const dir = ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = format === 'json' ? 'json' : format === 'md' ? 'md' : 'html';
  const file = join(dir, `shulker-report-${stamp}.${ext}`);
  const content =
    format === 'json' ? JSON.stringify(scan, null, 2) : format === 'md' ? renderMarkdown(scan) : renderHtml(scan);
  writeFileSync(file, content, 'utf8');
  return file;
}
