/**
 * Gemini AI reasoning layer.
 *
 * The LLM NEVER executes anything and is NEVER the source of truth. It
 * produces structured hypotheses about authorization boundaries. Every
 * response is validated against a strict schema; anything invalid is
 * discarded and the deterministic rules take over. If Gemini is unavailable
 * the scan continues with deterministic reasoning only.
 */
import type { ApiSpecModel, EndpointModel } from '@shulker/shared';

export interface EndpointHypothesis {
  resource: string;
  ownershipLikely: boolean;
  authorizationBoundary: string;
  riskTypes: string[];
  priority: 'high' | 'medium' | 'low';
  reason: string;
  recommendedTests: string[];
}

export interface AiStatus {
  status: 'ok' | 'unavailable' | 'disabled';
  note: string;
}

const SYSTEM_PROMPT = `You are an API security analyst. For each endpoint you receive, assess the
authorization boundary. Reply ONLY with a JSON object mapping each endpoint id to an object with keys:
resource (string), ownershipLikely (boolean), authorizationBoundary (string),
riskTypes (array of strings from: BOLA, BFLA, EXPOSURE, RATE_LIMIT, NONE),
priority ("high"|"medium"|"low"), reason (string, one sentence),
recommendedTests (array of strings).
Do not invent endpoints. Do not include markdown fences. Do not suggest targets.`;

export function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function aiStatusNote(): AiStatus {
  if (!aiEnabled()) {
    return {
      status: 'disabled',
      note: 'AI reasoning unavailable — using deterministic security rules.',
    };
  }
  return { status: 'ok', note: `Gemini reasoning active (${process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'}).` };
}

export async function generateHypotheses(
  spec: ApiSpecModel,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ hypotheses: Map<string, EndpointHypothesis>; status: AiStatus }> {
  const note = aiStatusNote();
  const hypotheses = new Map<string, EndpointHypothesis>();
  if (note.status !== 'ok') return { hypotheses, status: note };

  const relevant = spec.endpoints.filter((e) => !e.isAuthEndpoint).slice(0, 40);
  const input = {
    apiTitle: spec.title,
    endpoints: relevant.map((e) => ({
      id: e.id,
      method: e.method,
      path: e.path,
      summary: e.summary,
      description: e.description,
      auth: e.auth,
      params: e.params.map((p) => `${p.in}:${p.name}:${p.type}`),
      responseFields: e.responseProps.slice(0, 20),
      adminLikely: e.adminLikely,
    })),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) {
      return { hypotheses, status: { status: 'unavailable', note: `AI reasoning unavailable (HTTP ${res.status}) — using deterministic security rules.` } };
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const parsed: unknown = JSON.parse(stripFences(text));
    if (!isRecord(parsed)) throw new Error('AI response was not an object');
    for (const [endpointId, value] of Object.entries(parsed)) {
      const h = validateHypothesis(endpointId, value);
      if (h) hypotheses.set(endpointId, h);
    }
    return {
      hypotheses,
      status: {
        status: 'ok',
        note: `Gemini reasoning active — ${hypotheses.size} endpoint hypotheses validated.`,
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    return {
      hypotheses,
      status: { status: 'unavailable', note: `AI reasoning unavailable (${reason}) — using deterministic security rules.` },
    };
  }
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  return trimmed;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Strict validation: anything outside the expected shape is rejected wholesale. */
export function validateHypothesis(endpointId: string, value: unknown): EndpointHypothesis | null {
  if (!isRecord(value)) return null;
  const resource = typeof value.resource === 'string' ? value.resource : '';
  const reason = typeof value.reason === 'string' ? value.reason : '';
  if (!resource || !reason) return null;
  const riskTypes = Array.isArray(value.riskTypes)
    ? value.riskTypes.filter((r): r is string => typeof r === 'string' && ['BOLA', 'BFLA', 'EXPOSURE', 'RATE_LIMIT', 'NONE'].includes(r))
    : [];
  const priority = ['high', 'medium', 'low'].includes(value.priority as string)
    ? (value.priority as EndpointHypothesis['priority'])
    : 'medium';
  return {
    resource,
    ownershipLikely: value.ownershipLikely === true,
    authorizationBoundary:
      typeof value.authorizationBoundary === 'string' ? value.authorizationBoundary : 'unspecified',
    riskTypes,
    priority,
    reason: reason.slice(0, 400),
    recommendedTests: Array.isArray(value.recommendedTests)
      ? value.recommendedTests.filter((t): t is string => typeof t === 'string').slice(0, 6)
      : [],
  };
}
