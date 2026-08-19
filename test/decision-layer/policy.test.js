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

// ---------------------------------------------------------------------------
// Regulatory-correctness behaviours
// ---------------------------------------------------------------------------

const base = Object.freeze({
  asOf: '2026-10-02T00:00:00.000Z', balance: 1500, oldestDebtDays: 200,
  hardshipStatus: 'NONE', hardshipReviewDueAt: null,
  financialStressSignals: [], missedPayments90d: 0, partialPayments90d: 0,
  currentPlan: 'Standard Flexi', bestOfferOptOut: false, sensitiveCustomer: false,
  bestOffer: { planId: 'Assisted Essentials', annualSaving: 216 }
});
const snap = (over = {}) => ({ state: { ...base, ...over } });
const v13 = () => resolveVersionAt('vic.hardship.best-offer', '2026-10-02T00:00:00Z');
const v12 = () => resolveVersionAt('vic.hardship.best-offer', '2026-09-30T00:00:00Z');
const find = (result, rule) => result.reasons.find((r) => r.rule.includes(rule));

test('the disconnection floor gates a conclusion, so v1.2.0 and v1.3.0 differ', () => {
  const state = snap({ balance: 400, oldestDebtDays: 10 });
  const before = v12().evaluate(state);
  const after = v13().evaluate(state);
  assert.equal(before.disconnectionPermitted, true);
  assert.equal(after.disconnectionPermitted, false);
  assert.equal(find(after, 'Disconnection for arrears').status, 'NOT_AVAILABLE');
  assert.equal(find(before, 'Disconnection for arrears').status, 'AVAILABLE');
  assert.notEqual(stableJson(before.reasons), stableJson(after.reasons));
});

test('a sensitive-customer marker blocks disconnection regardless of the floor', () => {
  const result = v13().evaluate(snap({ sensitiveCustomer: true, fuels: ['electricity'] }));
  assert.equal(result.disconnectionPermitted, false);
  assert.match(find(result, 'Disconnection for arrears').explanation, /sensitive-customer marker/);
});

test('"three months or more" is calendar months, not 90 days', () => {
  // 1 Dec -> 1 Mar is 90 days AND three calendar months: eligible.
  const dec = v13().evaluate(snap({ asOf: '2026-03-01T00:00:00.000Z', oldestDebtSince: '2025-12-01T00:00:00.000Z', fuels: ['electricity'] }));
  assert.equal(find(dec, 'high debt').status, 'APPLIES');
  // 1 Jan -> 1 Apr is three calendar months but 90 days lands on 31 Mar. On
  // 31 Mar the day-count test would say yes; the calendar test says no.
  const jan = v13().evaluate(snap({ asOf: '2026-03-31T00:00:00.000Z', oldestDebtSince: '2026-01-01T00:00:00.000Z', fuels: ['electricity'] }));
  assert.equal(find(jan, 'high debt').status, 'NOT_TRIGGERED');
  const apr = v13().evaluate(snap({ asOf: '2026-04-01T00:00:00.000Z', oldestDebtSince: '2026-01-01T00:00:00.000Z', fuels: ['electricity'] }));
  assert.equal(find(apr, 'high debt').status, 'APPLIES');
  assert.equal(find(apr, 'high debt').ageUnit, 'CALENDAR_MONTHS');
});

test('a derived debt start date is disclosed as derived', () => {
  const r = find(v13().evaluate(snap({ fuels: ['electricity'] })), 'high debt');
  assert.match(r.explanation, /derived from oldestDebtDays/);
});

test('dual-fuel eligibility is never assumed from an aggregate balance', () => {
  // $600 + $600: aggregate clears $1,000, neither fuel does.
  const split = v13().evaluate(snap({ balance: 1200, fuelArrears: { electricity: 600, gas: 600 } }));
  assert.equal(find(split, 'high debt').status, 'NOT_TRIGGERED');
  assert.equal(find(split, 'high debt').assessmentBasis, 'PER_FUEL');

  // Same aggregate, no split recorded: we cannot assert eligibility either way.
  const unknown = v13().evaluate(snap({ balance: 1200 }));
  assert.equal(find(unknown, 'high debt').status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(find(unknown, 'high debt').assessmentBasis, 'FUEL_SPLIT_UNKNOWN');
  assert.match(find(unknown, 'high debt').explanation, /no electricity\/gas split/);
  assert.equal(unknown.outcome, 'INSUFFICIENT_EVIDENCE');

  // Aggregate under the threshold is conclusive without any split.
  const low = v13().evaluate(snap({ balance: 400 }));
  assert.equal(find(low, 'high debt').status, 'NOT_TRIGGERED');
  assert.equal(find(low, 'high debt').assessmentBasis, 'AGGREGATE_CONCLUSIVE');
});

test('GST basis of the balance is surfaced rather than assumed', () => {
  const unknown = find(v13().evaluate(snap({ fuels: ['electricity'] })), 'GST basis');
  assert.equal(unknown.status, 'UNVERIFIED');
  assert.match(unknown.explanation, /inclusive of GST/);
  assert.equal(find(v13().evaluate(snap({ fuels: ['electricity'], balanceIncludesGst: true })), 'GST basis').status, 'GST_INCLUSIVE');
  assert.equal(find(v13().evaluate(snap({ fuels: ['electricity'], balanceIncludesGst: false })), 'GST basis').status, 'GST_EXCLUSIVE');
});

test('CRM vs billing disagreement is a compliance finding', () => {
  const matched = v13().evaluate(snap({
    fuels: ['electricity'],
    billing: { available: true, openAmount: 1500, oldestOverdueDays: 200, currency: 'AUD' },
    reconciliation: { crmArrears: 1500, billingOpenAmount: 1500, delta: 0, matched: true }
  }));
  assert.equal(find(matched, 'Arrears corroboration').status, 'MATCHED');

  // Immaterial delta: recorded, but does not blind the evaluation.
  const minor = v13().evaluate(snap({
    fuels: ['electricity'],
    billing: { available: true, openAmount: 1487, oldestOverdueDays: 200, currency: 'AUD' },
    reconciliation: { crmArrears: 1500, billingOpenAmount: 1487, delta: 13, matched: false }
  }));
  assert.equal(find(minor, 'Arrears corroboration').status, 'CONFLICT');
  assert.notEqual(minor.outcome, 'INSUFFICIENT_EVIDENCE');

  // Threshold-straddling delta: the arrears figure cannot support a conclusion.
  const material = v13().evaluate(snap({
    fuels: ['electricity'],
    billing: { available: true, openAmount: 820, oldestOverdueDays: 200, currency: 'AUD' },
    reconciliation: { crmArrears: 1500, billingOpenAmount: 820, delta: 680, matched: false }
  }));
  assert.equal(find(material, 'Arrears corroboration').status, 'CONFLICT_MATERIAL');
  assert.equal(material.outcome, 'INSUFFICIENT_EVIDENCE');

  const down = v13().evaluate(snap({ fuels: ['electricity'], billing: { available: false, openAmount: null, oldestOverdueDays: null, currency: null } }));
  assert.equal(find(down, 'Arrears corroboration').status, 'UNVERIFIED');
  assert.match(find(down, 'Arrears corroboration').explanation, /unavailable/);
});

test('opt-out changes the schedule, not just the switch', () => {
  const r = find(v13().evaluate(snap({ bestOfferOptOut: true, fuels: ['electricity'] })), 'Customer opt-out');
  assert.equal(r.status, 'OPTED_OUT');
  assert.match(r.explanation, /12-month cycle/);
});

test('evaluate() reads no clock: the result depends only on snapshot asOf', () => {
  const state = snap({ fuels: ['electricity'] });
  const realNow = Date.now;
  Date.now = () => { throw new Error('evaluate() must not read the clock (invariant I1)'); };
  try {
    assert.equal(stableJson(v13().evaluate(state)), stableJson(v13().evaluate(state)));
  } finally {
    Date.now = realNow;
  }
});
