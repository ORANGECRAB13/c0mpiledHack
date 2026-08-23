import test from 'node:test';
import assert from 'node:assert/strict';
import { billingSection, reconcile, captureSnapshot } from '../../src/decision-layer/service.js';
import { pricingProvider, UnavailableBestOfferProvider, StaticBestOfferProvider } from '../../src/decision-layer/pricing.js';
import { seedDecisionLayer } from '../../src/decision-layer/seed.js';
import { inputFor, sha256 } from '../../src/decision-layer/hash.js';

const customer = Object.freeze({
  id: 'C-1',
  external_customer_id: 'AU-1',
  current_state: Object.freeze({ balance: 1881, oldestDebtDays: 212, currentPlan: 'Standard Flexi' }),
  current_sources: Object.freeze([]),
});

test('billingSection reports unavailable rather than a zero when Stripe fails', () => {
  const section = billingSection({ available: false, error: 'Stripe is not configured (STRIPE_API_KEY unset).' });
  assert.equal(section.available, false);
  assert.equal(section.openAmount, null);
  assert.equal(section.oldestOverdueDays, null);
  assert.equal(section.currency, null);
  assert.match(section.error, /not configured/);
});

test('billingSection projects the fixed contract from a live Stripe read', () => {
  const section = billingSection({ available: true, openAmount: 1881.004, oldestOverdueDays: 212, currency: 'aud', invoices: [] });
  assert.deepEqual(section, { available: true, openAmount: 1881, oldestOverdueDays: 212, currency: 'aud', error: null });
});

test('reconcile matches CRM arrears against billing open amount', () => {
  assert.deepEqual(reconcile(1881, 1881), { crmArrears: 1881, billingOpenAmount: 1881, delta: 0, matched: true });
  const near = reconcile(1881.4, 1881);
  assert.equal(near.delta, 0.4);
  assert.equal(near.matched, true, 'sub-dollar differences are rounding, not a discrepancy');
  const off = reconcile(1881, 1200);
  assert.equal(off.delta, 681);
  assert.equal(off.matched, false);
});

test('reconcile is null on both sides when either system is unavailable', () => {
  for (const [crm, billing] of [[null, 1881], [1881, null], [null, null]]) {
    const result = reconcile(crm, billing);
    assert.equal(result.delta, null);
    assert.equal(result.matched, null, 'unknown must never read as agreement');
  }
});

test('snapshot always carries the billing contract and STRIPE provenance', () => {
  const billing = billingSection({ available: true, openAmount: 1881, oldestOverdueDays: 212, currency: 'aud' });
  const reconciliation = reconcile(customer.current_state.balance, billing.openAmount);
  const snapshot = captureSnapshot(customer, '2026-10-02T00:00:00.000Z', { billing, reconciliation });

  assert.deepEqual(snapshot.state.billing, { available: true, openAmount: 1881, oldestOverdueDays: 212, currency: 'aud', error: null });
  assert.equal(snapshot.state.reconciliation.matched, true);
  const sources = snapshot.sources.filter((s) => s.source === 'STRIPE');
  assert.deepEqual(sources.map((s) => s.field).sort(), ['billing', 'reconciliation']);
  assert.equal(sources.find((s) => s.field === 'billing').extractionMethod, 'STRIPE_INVOICE_AGGREGATE');
  assert.equal(sources.find((s) => s.field === 'reconciliation').extractionMethod, 'CRM_BILLING_RECONCILIATION');
});

test('a snapshot captured without a billing read degrades to unavailable, not zero', () => {
  const snapshot = captureSnapshot(customer, '2026-10-02T00:00:00.000Z', {});
  assert.equal(snapshot.state.billing.available, false);
  assert.equal(snapshot.state.billing.openAmount, null);
  assert.equal(snapshot.state.reconciliation.matched, null);
  assert.equal(snapshot.sources.find((s) => s.field === 'billing').extractionMethod, 'STRIPE_UNAVAILABLE');
});

test('the default pricing provider reports UNAVAILABLE instead of a fabricated saving', async () => {
  const previous = process.env.PRICING_PROVIDER;
  delete process.env.PRICING_PROVIDER;
  try {
    const offer = await pricingProvider().findBestOffer(customer.current_state);
    assert.equal(offer.available, false);
    assert.match(offer.reason, /pricing source/i);
    assert.equal(offer.annualSaving, undefined, 'no invented saving may reach the snapshot');
  } finally {
    if (previous === undefined) delete process.env.PRICING_PROVIDER; else process.env.PRICING_PROVIDER = previous;
  }
});

test('an unavailable offer is hashed into the snapshot as unavailable', async () => {
  const bestOffer = await new UnavailableBestOfferProvider().findBestOffer(customer.current_state);
  const snapshot = captureSnapshot(customer, '2026-10-02T00:00:00.000Z', { bestOffer });
  assert.equal(snapshot.state.bestOffer.available, false);
  assert.ok(snapshot.snapshotHash);
});

test('a plugged-in provider can still supply a real offer', async () => {
  const provider = new StaticBestOfferProvider({ 'Standard Flexi': { planId: 'Assisted Essentials', annualSaving: 216 } });
  assert.deepEqual(await provider.findBestOffer({ currentPlan: 'Standard Flexi' }), { available: true, source: 'FIXTURE', planId: 'Assisted Essentials', annualSaving: 216 });
  assert.equal((await provider.findBestOffer({ currentPlan: 'Other' })).available, false);
});

test('synthetic seeding refuses to run without an explicit opt-in', async () => {
  const previous = process.env.ALLOW_SYNTHETIC_SEED;
  delete process.env.ALLOW_SYNTHETIC_SEED;
  try {
    await assert.rejects(() => seedDecisionLayer(), /ALLOW_SYNTHETIC_SEED/);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_SYNTHETIC_SEED; else process.env.ALLOW_SYNTHETIC_SEED = previous;
  }
});

test('an observation timestamp never changes the input hash', () => {
  // bestOffer.checkedAt is stamped on every pricing call. It sits inside a
  // declared readField, so before this was stripped every evaluation produced a
  // new inputHash, the skip check never matched, and an unchanged customer
  // accumulated a full decision per run.
  const readFields = ['balance', 'bestOffer'];
  const at = (checkedAt) => ({
    balance: 1200,
    bestOffer: { available: true, planId: 'Hardship Saver', annualSaving: 210, checkedAt },
  });

  const first = sha256(inputFor(at('2026-08-23T09:00:00.000Z'), readFields));
  const later = sha256(inputFor(at('2026-08-23T11:47:12.913Z'), readFields));
  assert.equal(first, later, 'same offer checked twice must hash identically');

  // A real change to the offer must still move the hash.
  const cheaper = sha256(inputFor({
    balance: 1200,
    bestOffer: { available: true, planId: 'Hardship Saver', annualSaving: 260, checkedAt: '2026-08-23T09:00:00.000Z' },
  }, readFields));
  assert.notEqual(first, cheaper, 'a changed saving must change the hash');
});
