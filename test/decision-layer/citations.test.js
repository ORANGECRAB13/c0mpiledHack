import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveVersionAt } from '../../src/policies/index.js';
import { CLAUSES, PENALTY_PROVISIONS, SCHEDULED_OBLIGATIONS, ARREARS_THRESHOLD, common } from '../../src/policies/vic.hardship.best-offer/meta.js';

const policyDir = fileURLToPath(new URL('../../src/policies/vic.hardship.best-offer/', import.meta.url));

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

test('the wrong "cl 76-79" citation appears nowhere in the policy source', () => {
  for (const file of readdirSync(policyDir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(policyDir + file, 'utf8');
    // The comment in meta.js names the bad string in order to warn about it.
    const offenders = text.split('\n').filter((line) => /76\s*[–-]\s*79/.test(line) && !line.trim().startsWith('//'));
    assert.deepEqual(offenders, [], `${file} still cites clauses 76-79`);
  }
});

test('citation strings map to the corrected Division 2A clauses', () => {
  assert.equal(CLAUSES.disconnectionThreshold, 'ERCoP cl 187(2)');
  assert.equal(CLAUSES.tailoredAssistance, 'ERCoP cl 132B(2)(a)');
  assert.equal(CLAUSES.highDebt, 'ERCoP cl 132B(2)(b), cl 132B(3)');
  assert.equal(CLAUSES.bestAvailableOffer, 'ERCoP cl 132C; cl 109(3)');
  assert.equal(CLAUSES.optOut, 'ERCoP cl 132D(5)-(6)');
  assert.equal(CLAUSES.requiredEvidence, 'ERCoP cl 132G');
  assert.equal(CLAUSES.sensitiveCustomer, 'ERCoP cl 132F');
});

test('emitted reasons carry the corrected citations and a penalty provision field', () => {
  const result = v13().evaluate(snap());
  const expected = {
    'tailored assistance': CLAUSES.tailoredAssistance,
    'high debt': CLAUSES.highDebt,
    'Best available offer': CLAUSES.bestAvailableOffer,
    'Customer opt-out': CLAUSES.optOut,
    'Sensitive-customer': CLAUSES.sensitiveCustomer,
    'Arrears corroboration': CLAUSES.requiredEvidence
  };
  for (const [rule, citation] of Object.entries(expected)) {
    assert.equal(find(result, rule).citation, citation, rule);
  }
  for (const r of result.reasons) {
    assert.ok('penaltyProvision' in r, `${r.rule} lacks penaltyProvision`);
    assert.ok(!/76.79/.test(r.citation));
  }
  assert.equal(find(result, 'high debt').penaltyProvision, PENALTY_PROVISIONS.highDebt);
  assert.equal(find(result, 'Sensitive-customer').penaltyProvision, null);
});

test('insufficient-evidence path cites cl 132G', () => {
  const result = v13().evaluate({ state: { ...base, balance: null } });
  assert.equal(result.outcome, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.reasons[0].citation, CLAUSES.requiredEvidence);
  assert.equal(result.reasons[0].penaltyProvision, PENALTY_PROVISIONS.requiredEvidence);
});

test('the $1,000 threshold is config with provenance, not a literal', () => {
  assert.equal(ARREARS_THRESHOLD.value, 1000);
  assert.equal(ARREARS_THRESHOLD.source, 'ERCoP cl 132B(3) fallback');
  assert.equal(ARREARS_THRESHOLD.supersededByGuideline, false);
  assert.equal(ARREARS_THRESHOLD.perFuel, true);
  const r = find(v13().evaluate(snap({ fuels: ['electricity'] })), 'high debt');
  assert.equal(r.thresholdValue, 1000);
  assert.equal(r.thresholdSource, 'ERCoP cl 132B(3) fallback');
  // No hardcoded ">= 1000" comparison left in the rule body.
  assert.ok(!/>=\s*1000/.test(readFileSync(policyDir + 'evaluate.js', 'utf8')));
  assert.ok(!/>=\s*90\b/.test(readFileSync(policyDir + 'evaluate.js', 'utf8')));
});

test('scheduled Division 2A obligations are exposed as policy metadata', () => {
  const keys = SCHEDULED_OBLIGATIONS.map((o) => o.key);
  assert.deepEqual(keys, ['eligibility_sweep', 'initial_best_offer_check', 'recurring_best_offer_check', 'negative_check_notice']);
  const byKey = Object.fromEntries(SCHEDULED_OBLIGATIONS.map((o) => [o.key, o]));
  assert.equal(byKey.eligibility_sweep.citation, 'ERCoP cl 132B(4)');
  assert.equal(byKey.initial_best_offer_check.deadline.within, 10);
  assert.equal(byKey.initial_best_offer_check.deadline.unit, 'BUSINESS_DAYS');
  assert.equal(byKey.negative_check_notice.deadline.within, 5);
  // Opt-out lengthens the cycle rather than switching the obligation off.
  assert.equal(byKey.recurring_best_offer_check.cadence.every, 6);
  assert.equal(byKey.recurring_best_offer_check.cadenceWhenOptedOut.every, 12);
  assert.equal(byKey.recurring_best_offer_check.optOutChangesSchedule, true);
  for (const o of SCHEDULED_OBLIGATIONS) assert.ok(o.penaltyProvision.startsWith('ERCoP Sch 1'));
  assert.deepEqual(v13().metadata.scheduledObligations, SCHEDULED_OBLIGATIONS);
});

test('billing and reconciliation are declared readFields', () => {
  assert.ok(common.readFields.includes('billing'));
  assert.ok(common.readFields.includes('reconciliation'));
  assert.deepEqual(v12().metadata.readFields, v13().metadata.readFields);
});

test('v1.2.0 claims no ERCoP monetary floor and keeps $300 as a non-binding reference', async () => {
  const mod = await import('../../src/policies/vic.hardship.best-offer/v1.2.0.js');
  assert.equal(mod.referenceFigures.disconnectionPracticeFloor.value, 300);
  assert.equal(mod.referenceFigures.disconnectionPracticeFloor.binding, false);
  assert.match(mod.referenceFigures.disconnectionPracticeFloor.source, /NOT an ERCoP clause/);
  const r = find(v12().evaluate(snap({ balance: 400 })), 'Disconnection threshold');
  assert.equal(r.status, 'NO_MONETARY_FLOOR');
  assert.equal(r.thresholdValue, null);
  assert.match(r.citation, /v6 cl 187/);
});
