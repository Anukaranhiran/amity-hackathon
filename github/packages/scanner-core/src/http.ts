/**
 * Bounded HTTP execution primitives for the scanner.
 *
 * Guarantees:
 *  - request timeout (AbortController)
 *  - response size cap (never buffer more than maxBytes)
 *  - no redirects followed (evidence must reflect the real first response)
 *  - response body is evidence-redacted before it is ever stored
 */
import { redactBody, redactHeaders, REDACTED, maskSensitiveStrings } from '@shulker/shared';

export interface SafeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Raw body — in-memory ONLY, used for detection logic. Never persisted. */
  bodyText: string;
  /** Redacted view of the body — safe for evidence, reports and logs. */
  redactedBody: string;
  bodyTruncated: boolean;
  durationMs: number;
  error?: 'timeout' | 'network' | 'too_large';
}

const REDACTION_NOTE = {
  authorization: `Bearer ${REDACTED}`,
};

export class SafeHttpClient {
  private readonly baseUrl: string;
  private readonly opts: { timeoutMs: number; maxBytes?: number; defaultHeaders?: Record<string, string> };
  constructor(baseUrl: string, opts: { timeoutMs: number; maxBytes?: number; defaultHeaders?: Record<string, string> } = { timeoutMs: 10_000 }) {
    this.baseUrl = baseUrl;
    this.opts = opts;
  }

  async request(
    method: string,
    path: string,
    opts: { headers?: Record<string, string>; body?: unknown } = {},
  ): Promise<SafeResponse> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    const url = joinUrl(this.baseUrl, path);
    const maxBytes = this.opts.maxBytes ?? 512 * 1024;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'user-agent': 'Shulker/1.0 (+authorized-scanner)',
          ...(this.opts.defaultHeaders ?? {}),
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        redirect: 'manual',
        signal: controller.signal,
      });

      // Cap response size while streaming.
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let truncated = false;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - maxBytes))));
            truncated = true;
            void reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = k === 'authorization' ? REDACTION_NOTE.authorization : maskSensitiveStrings(v);
      });

      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers,
        bodyText: text,
        redactedBody: redactBody(text, 16_000),
        bodyTruncated: truncated,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = controller.signal.aborted || /abort/i.test(message);
      return {
        ok: false,
        status: 0,
        statusText: '',
        headers: {},
        bodyText: '',
        redactedBody: '',
        bodyTruncated: false,
        durationMs: Date.now() - started,
        error: isTimeout ? 'timeout' : /body|size/i.test(message) ? 'too_large' : 'network',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Redacted view of a request for evidence purposes. */
  static evidenceRequest(method: string, url: string, headers: Record<string, string>, body?: unknown) {
    return {
      method: method.toUpperCase(),
      url,
      headers: redactHeaders(headers),
      body: body !== undefined ? redactBody(JSON.stringify(body), 2000) : undefined,
    };
  }
}

export function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
