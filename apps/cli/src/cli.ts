#!/usr/bin/env node
/**
 * Shulker CLI — CI/CD-friendly scanning.
 *
 *   node apps/cli/src/cli.ts scan --target http://127.0.0.1:8700 --spec apps/sandbox/spec.json
 *   node apps/cli/src/cli.ts demo
 *   node apps/cli/src/cli.ts scan --demo           # equivalent to demo
 *
 * Exit codes: 0 = no blocking findings; 1 = findings at/above --fail-on severity;
 * 2 = scan error (invalid spec, unreachable target, auth failure…).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ScanEngine } from '@shulker/scanner-core';
import type { ScanConfig, ScanResult, Severity } from '@shulker/shared';
import { SEVERITY_ORDER } from '@shulker/shared';

interface Args {
  target?: string;
  spec?: string;
  demo?: boolean;
  budget?: number;
  failOn?: Severity;
  noAi?: boolean;
  out?: string;
  timeoutMs?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--target': args.target = argv[++i]; break;
      case '--spec': args.spec = argv[++i]; break;
      case '--demo': args.demo = true; break;
      case '--budget': args.budget = Number(argv[++i]); break;
      case '--fail-on': args.failOn = argv[++i] as Severity; break;
      case '--no-ai': args.noAi = true; break;
      case '--out': args.out = argv[++i]; break;
      case '--timeout': args.timeoutMs = Number(argv[++i]); break;
      default:
        if (!a.startsWith('--')) { /* positional */ } else { console.error(`Unknown option ${a}`); process.exit(2); }
    }
  }
  return args;
}

const SEV_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

async function loadSandboxSpec(): Promise<{ target: string; spec: string }> {
  // Start the sandbox in-process for --demo / --spec sandbox usage.
  const sandbox = await import('../../sandbox/src/server.ts');
  const { server, port } = await sandbox.startSandbox(0);
  const target = `http://127.0.0.1:${port}`;
  void server; // keep alive for the duration of the scan
  const specModule = await import('../../sandbox/src/openapi.ts');
  return { target, spec: JSON.stringify(specModule.OPENAPI_SPEC) };
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (cmd !== 'scan' && cmd !== 'demo') {
    console.log(`Shulker CLI

Usage:
  node apps/cli/src/cli.ts scan --target <url> --spec <file> [options]
  node apps/cli/src/cli.ts demo                       # sandbox + built-in spec

Options:
  --target <url>      Base URL of the authorized API (loopback/private only)
  --spec <file>       OpenAPI .json/.yaml file
  --budget <n>        Max requests (default 120)
  --fail-on <sev>     Exit 1 when findings at/above this severity (default high)
  --no-ai             Disable Gemini reasoning for this run
  --timeout <ms>      Per-request timeout (default 10000)
  --out <file>        Write JSON result to file`);
    process.exit(0);
  }

  let target = args.target;
  let specText: string | undefined;

  if (args.spec === 'sandbox' || args.demo || (!args.spec && !target)) {
    const sb = await loadSandboxSpec();
    target = target && !args.demo ? target : sb.target;
    specText = args.spec && args.spec !== 'sandbox' ? specText : sb.spec;
    if (!target) target = sb.target;
    if (!specText) specText = sb.spec;
  } else if (args.spec) {
    specText = readFileSync(resolve(args.spec), 'utf8');
  }
  if (!target || !specText) {
    console.error('error: --target and --spec are required (or use --demo)');
    process.exit(2);
  }

  const config: ScanConfig = {
    target,
    spec: specText,
    actors: [
      { key: 'alice', label: 'User A (Alice)', username: 'alice@example.com', password: 'alice-password-1' },
      { key: 'bob', label: 'User B (Bob)', username: 'bob@example.com', password: 'bob-password-2' },
    ],
    budget: args.budget ?? 120,
    timeoutMs: args.timeoutMs ?? 10_000,
    concurrency: 4,
    aiEnabled: !args.noAi,
    rateLimitProbeCount: 12,
  };

  console.error(`[shulker] target: ${target}`);
  console.error(`[shulker] scope:  AUTHORIZED SANDBOX (loopback/private enforced)`);
  console.error(`[shulker] ai:     ${config.aiEnabled ? 'gemini (falls back to deterministic rules)' : 'deterministic rules'}`);

  let lastPhase = '';
  const result: ScanResult = await new ScanEngine(config, {
    onEvent: (e) => {
      if (e.phase !== lastPhase) {
        lastPhase = e.phase;
        console.error(`\n[phase] ${e.phase}`);
      }
      if (['ENDPOINTS_DISCOVERED', 'AUTH_OK', 'RESOURCE_MODEL', 'AI_HYPOTHESES', 'AI_FALLBACK', 'FINDINGS_READY', 'SCAN_DONE', 'AUTHENTICATION_FAILED', 'INVALID_OPENAPI'].includes(e.type)) {
        console.error(`  ${e.message}`);
      }
    },
    isCancelled: () => false,
  }).run();

  if (args.out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.out, JSON.stringify(result, null, 2));
    console.error(`[shulker] wrote ${args.out}`);
  }

  const s = result.summary;
  console.log('');
  console.log('Scan complete');
  console.log(`  Endpoints: ${s.endpointsDiscovered} discovered / ${s.endpointsTested} tested`);
  console.log(`  Tests:     ${s.testsTotal} executed, ${s.testsPassed} passed, ${s.testsFailed} failed`);
  console.log(`  Findings:  ${s.confirmed} confirmed, ${s.potential} potential`);
  for (const f of result.findings.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])) {
    console.log(`    [${f.severity.toUpperCase().padEnd(8)}] ${f.status.padEnd(10)} ${f.method} ${f.endpoint} — ${f.title}`);
  }

  if (result.error) process.exit(2);
  const failOn = args.failOn ?? 'high';
  const threshold = SEV_RANK[failOn] ?? SEV_RANK.high;
  const blocking = result.findings.filter((f) => (SEV_RANK[f.severity] ?? 0) >= threshold && f.status === 'confirmed');
  if (blocking.length > 0) {
    console.error(`\n[shulker] ${blocking.length} finding(s) at or above ${failOn} — exit 1 (CI gate)`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[shulker] fatal:', err instanceof Error ? err.message : err);
  process.exit(2);
});
