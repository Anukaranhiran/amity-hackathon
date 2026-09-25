const BASE = 'http://127.0.0.1:8600';
const demo = await (await fetch(`${BASE}/api/demo`, { method: 'POST' })).json();
console.log('demo scan:', demo.id);
let scan;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const list = await (await fetch(`${BASE}/api/scans`)).json();
  scan = list.find((s) => s.id === demo.id);
  if (scan && scan.status !== 'running') break;
}
console.log(`scan: ${scan.status} confirmed=${scan.summary.confirmed} potential=${scan.summary.potential} tests=${scan.summary.testsTotal} passed=${scan.summary.testsPassed} endpoints=${scan.summary.endpointsTested}/${scan.summary.endpointsDiscovered}`);
const full = await (await fetch(`${BASE}/api/scans/${demo.id}`)).json();
for (const f of full.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.status} ${f.method} ${f.endpoint} (${f.type})`);
console.log('JWT leak:', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(JSON.stringify(full)) ? 'LEAK!' : 'clean');
const rpt = await (await fetch(`${BASE}/api/reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scanId: demo.id, format: 'html' }) })).json();
console.log('report html:', (rpt.content || '').length, 'bytes, findings:', rpt.findings);
const sse = await (await fetch(`${BASE}/api/scan/${demo.id}/events`)).text();
console.log('SSE replay events:', sse.split('\n').filter((l) => l.startsWith('data:')).length);
const html = await (await fetch(`${BASE}/`)).text();
console.log('dashboard html:', html.includes('root') && html.includes('.js') ? 'serves app shell' : 'MISSING');
const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
if (assetPath) {
  const asset = await fetch(`${BASE}/${assetPath.replace(/^\.\//, '')}`);
  console.log('dashboard js asset:', asset.ok ? `${(await asset.arrayBuffer()).byteLength}B OK` : asset.status);
}
console.log('done');
process.exit(0);
