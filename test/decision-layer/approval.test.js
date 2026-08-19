import test from 'node:test';
import assert from 'node:assert/strict';

test('non-agreed verdict requires a reason at the API contract', () => {
  const validate = (body) => body.verdict === 'AGREED' || Boolean(String(body.overrideReason || '').trim());
  assert.equal(validate({ verdict: 'OVERRIDDEN' }), false);
  assert.equal(validate({ verdict: 'REJECTED', overrideReason: 'Evidence contradicts CRM' }), true);
  assert.equal(validate({ verdict: 'AGREED' }), true);
});
