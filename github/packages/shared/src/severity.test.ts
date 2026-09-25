import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSeverity } from './severity.ts';

test('cross-user BOLA is high with a reason', () => {
  const v = computeSeverity({ type: 'bola', confidence: 'high', crossUser: true });
  assert.equal(v.severity, 'high');
  assert.ok(v.reason.includes('another user'));
});

test('BFLA privileged action is critical', () => {
  const v = computeSeverity({ type: 'bfla', confidence: 'high', adminAction: true });
  assert.equal(v.severity, 'critical');
});

test('exposure severity follows sensitive field level', () => {
  assert.equal(computeSeverity({ type: 'excessive_data_exposure', confidence: 'high', sensitiveFieldLevel: 'high' }).severity, 'high');
  assert.equal(computeSeverity({ type: 'excessive_data_exposure', confidence: 'medium', sensitiveFieldLevel: 'medium' }).severity, 'medium');
  assert.equal(computeSeverity({ type: 'excessive_data_exposure', confidence: 'low', sensitiveFieldLevel: 'low' }).severity, 'low');
});

test('weak rate limiting is medium with bounded-test wording', () => {
  const v = computeSeverity({ type: 'weak_rate_limiting', confidence: 'medium' });
  assert.equal(v.severity, 'medium');
  assert.ok(v.reason.includes('bounded test'));
});
