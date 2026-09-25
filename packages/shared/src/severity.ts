import type { Confidence, FindingType, Severity } from './types.ts';

export interface SeverityInput {
  type: FindingType;
  confidence: Confidence;
  crossUser?: boolean;
  sensitiveFieldLevel?: 'high' | 'medium' | 'low';
  adminAction?: boolean;
  adminRead?: boolean;
}

export interface SeverityVerdict {
  severity: Severity;
  reason: string;
}

const CONF_NOTE: Record<Confidence, string> = {
  high: 'verified with a controlled reproduction',
  medium: 'verified under bounded test conditions',
  low: 'detected heuristically and not fully verified',
};

export function computeSeverity(input: SeverityInput): SeverityVerdict {
  const conf = CONF_NOTE[input.confidence] ?? CONF_NOTE.medium;
  switch (input.type) {
    case 'bfla':
      if (input.adminAction) {
        return {
          severity: 'critical',
          reason: `A non-privileged user was able to perform a privileged administrative action (${conf}). This is a direct privilege-escalation path.`,
        };
      }
      return {
        severity: 'high',
        reason: `A non-privileged user was able to read an administrative, privileged-only resource (${conf}).`,
      };
    case 'bola':
      if (input.crossUser) {
        return {
          severity: 'high',
          reason: `An authenticated user could read another user's private resource (${conf}). The API checks authentication but not object ownership.`,
        };
      }
      return {
        severity: 'medium',
        reason: `Object-level access could not be conclusively verified (${conf}).`,
      };
    case 'excessive_data_exposure': {
      const lvl = input.sensitiveFieldLevel ?? 'low';
      if (lvl === 'high') {
        return {
          severity: 'high',
          reason: `The response exposes credential material such as password hashes or tokens (${conf}). This data should never leave the server.`,
        };
      }
      if (lvl === 'medium') {
        return {
          severity: 'medium',
          reason: `The response exposes internal or administrative metadata that clients should not receive (${conf}).`,
        };
      }
      return {
        severity: 'low',
        reason: `The response exposes low-sensitivity metadata beyond the documented contract (${conf}).`,
      };
    }
    case 'weak_rate_limiting':
      return {
        severity: 'medium',
        reason: `No rate limiting was observed under the configured bounded test (${conf}). Unthrottled authentication endpoints enable brute-force and credential-stuffing attacks.`,
      };
    default:
      return { severity: 'info', reason: 'Informational observation.' };
  }
}

export function severityRank(s: Severity): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s];
}
