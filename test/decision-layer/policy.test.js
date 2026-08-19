import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVersionAt } from '../../src/policies/index.js';
import { stableJson, sha256 } from '../../src/decision-layer/hash.js';

const snapshot = Object.freeze({ state: Object.freeze({
  asOf: '2026-10-02T00:00:00.000Z', balance: 312, oldestDebtDays: 45,
  hardshipStatus: 'PAYMENT_DIFFICULTY', hardshipReviewDueAt: null,
  financialStressSignals: Object.freeze(['PARTIAL_PAYMENT']), missedPayments90d: 1,
  partialPayments90d: 2, currentPlan: 'Standard Flexi', bestOfferOptOut: false,
  sensitiveCustomer: true, bestOffer: Object.freeze({ planId: 'Assisted Essentials', annualSaving: 216 })
}) });

test('version resolver selects by evaluation date and honors a pin', () => {
  assert.equal(resolveVersionAt('vic.hardship.best-offer', '2026-09-30T00:00:00Z').metadata.version, '1.2.0');
  assert.equal(resolveVersionAt('vic.hardship.best-offer', '2026-10-02T00:00:00Z').metadata.version, '1.3.0');
  assert.equal(resolveVersionAt('vic.hardship.best-offer', '2027-01-01T00:00:00Z', '1.2.0').metadata.version, '1.2.0');
});

test('policy evaluation is byte-identical across 100 runs', () => {
  const policy = resolveVersionAt('vic.hardship.best-offer', snapshot.state.asOf);
  const expected = stableJson(policy.evaluate(snapshot));
  for (let i = 0; i < 100; i += 1) assert.equal(stableJson(policy.evaluate(snapshot)), expected);
  assert.equal(policy.evaluate(snapshot).outcome, 'ACTION_REQUIRED');
});

test('stable hashing ignores object key insertion order', () => {
  assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
});
