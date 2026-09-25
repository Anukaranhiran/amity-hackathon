/**
 * Evidence engine: turns raw request/response pairs into redacted,
 * reproducible evidence records and proof-of-concept commands.
 */
import type { EvidenceData, FindingType, Poc } from '@shulker/shared';
import { REDACTED, maskSensitiveStrings } from '@shulker/shared';
import { SafeHttpClient, type SafeResponse } from './http.ts';

export interface EvidenceInput {
  findingId: string;
  testId: string;
  endpoint: string;
  method: string;
  actorLabel: string;
  pathTemplate: string;
  concretePath: string;
  headers: Record<string, string>;
  body?: unknown;
  response: SafeResponse;
  expected: string;
  actual: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export class EvidenceEngine {
  private readonly client: SafeHttpClient;
  constructor(client: SafeHttpClient) {
    this.client = client;
  }

  build(input: EvidenceInput): EvidenceData {
    const url = `${this.client['baseUrl']}${input.concretePath}`;
    return {
      id: `ev_${input.findingId}_${input.testId}`,
      findingId: input.findingId,
      timestamp: new Date().toISOString(),
      endpoint: input.pathTemplate,
      method: input.method.toUpperCase(),
      actorLabel: input.actorLabel,
      request: SafeHttpClient.evidenceRequest(input.method, url, input.headers, input.body),
      response: {
        status: input.response.status,
        headers: input.response.headers,
        body: input.response.redactedBody ?? maskSensitiveStrings(input.response.bodyText),
      },
      expected: input.expected,
      actual: input.actual,
      reason: input.reason,
      confidence: input.confidence,
      testId: input.testId,
      durationMs: input.response.durationMs,
    };
  }
}

export function buildPoc(opts: {
  type: FindingType;
  baseUrl: string;
  method: string;
  concretePath: string;
  body?: unknown;
  actorLabel: string;
}): Poc {
  const url = `${opts.baseUrl}${opts.concretePath}`;
  const parts = [`curl -X ${opts.method.toUpperCase()} '${url}'`];
  parts.push(`  -H 'Authorization: Bearer ${REDACTED}_${opts.actorLabel.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_TOKEN'`);
  if (opts.body !== undefined) {
    parts.push(`  -H 'Content-Type: application/json'`);
    parts.push(`  -d '${JSON.stringify(opts.body)}'`);
  }
  const curl = parts.join(' \\\n');

  const bodyLine =
    opts.body !== undefined
      ? `\n${JSON.stringify(opts.body, null, 2)}\n`
      : '';
  const http = `${opts.method.toUpperCase()} ${opts.concretePath} HTTP/1.1\nHost: ${new URL(opts.baseUrl).host}\nAuthorization: Bearer ${REDACTED}\nContent-Type: application/json${bodyLine}`;
  return { curl, http };
}
