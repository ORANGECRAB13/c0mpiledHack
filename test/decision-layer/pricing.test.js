import test from 'node:test';
import assert from 'node:assert/strict';
import { TariffTableBestOfferProvider, UnavailableBestOfferProvider, pricingProvider } from '../../src/decision-layer/pricing.js';
import { planFor, annualCostOf, annualKwhFrom, monthlySpendFrom, eligiblePlans, TARIFF_TABLE } from '../../src/decision-layer/tariffs.js';

const CHECKED_AT = '2026-08-19T00:00:00.000Z';
const provider = new TariffTableBestOfferProvider({ clock: () => CHECKED_AT });

const paid = (month, amount) => ({ status: 'paid', amount, description: `Electricity usage — ${month}`, createdAt: `${month}-01T00:00:00.000Z` });
const billing = (invoices) => ({ available: true, error: null, invoices });

// Nadia Donnelly (customer 1009), shape taken from the live profile endpoint:
// three settled $627 monthly bills plus one open $1,881 arrears invoice.
const NADIA_BILLING = billing([
  { status: 'open', amount: 1881, description: 'Outstanding balance — 212 days overdue', createdAt: '2026-08-19T10:22:20.000Z' },
  paid('2026-05', 627), paid('2026-04', 627), paid('2026-03', 627),
]);
const NADIA_STATE = { currentPlan: 'Time-of-Use Plus', hardshipStatus: 'NONE', balance: 1881 };

test('the tariff table declares its provenance as modelled, not quoted', () => {
  assert.equal(TARIFF_TABLE.version, 'TARIFF_TABLE_V1');
  assert.match(TARIFF_TABLE.provenance.isNot, /NOT a retailer's live pricing/);
  assert.ok(TARIFF_TABLE.provenance.effectiveFrom);
  assert.equal(TARIFF_TABLE.plans.length, 6);
});

test('spend baseline uses paid invoices only — the open arrears invoice is a debt, not consumption', () => {
  const spend = monthlySpendFrom(NADIA_BILLING);
  assert.equal(spend.ok, true);
  assert.deepEqual(spend.months, ['2026-03', '2026-04', '2026-05']);
  assert.equal(spend.monthlySpend, 627);
  assert.equal(spend.annualSpend, 7524);
});

test('duplicate invoices inside one billing month do not double-count the month', () => {
  const spend = monthlySpendFrom(billing([paid('2026-03', 300), paid('2026-03', 300), paid('2026-04', 600), paid('2026-05', 600)]));
  assert.equal(spend.monthCount, 3);
  assert.equal(spend.monthlySpend, 600);
});

test('consumption derivation round-trips: re-pricing the derived kWh on the current plan reproduces annual spend', () => {
  const current = planFor('Time-of-Use Plus');
  const derived = annualKwhFrom(7524, current);
  assert.equal(derived.ok, true);
  assert.ok(Math.abs(annualCostOf(current, derived.annualKwh) - 7524) < 1);
});

test('a real derivation for customer 1009 carries its full basis and provenance', async () => {
  const offer = await provider.findBestOffer(NADIA_STATE, { billing: NADIA_BILLING });
  assert.equal(offer.available, true);
  assert.equal(offer.source, 'TARIFF_TABLE_V1');
  assert.equal(offer.checkedAt, CHECKED_AT);
  assert.equal(offer.basis.modelled, true);
  assert.equal(offer.basis.quoted, false);
  assert.equal(offer.basis.annualSpend, 7524);
  assert.equal(offer.basis.billingMonthCount, 3);
  assert.ok(offer.basis.annualKwh > 0);
  assert.match(offer.basis.consumptionAssumption, /Assumes the paid bills were priced on the customer's current plan/);
  assert.ok(offer.provenance.isNot);
  // Saving is genuinely computed, not asserted: it equals the modelled cost gap
  // less the current plan's exit fee.
  assert.equal(offer.annualSaving, Math.round((offer.basis.currentAnnualCost - offer.annualCost - offer.exitFee) * 100) / 100);
});

test('thin billing history returns unavailable with a reason — never a guess', async () => {
  const offer = await provider.findBestOffer(NADIA_STATE, { billing: billing([paid('2026-05', 627)]) });
  assert.equal(offer.available, false);
  assert.match(offer.reason, /Only 1 distinct paid billing month/);
  assert.equal(offer.annualSaving, undefined);
});

test('unavailable Stripe billing returns unavailable, not zero', async () => {
  const offer = await provider.findBestOffer(NADIA_STATE, { billing: { available: false, error: 'Stripe is not configured.', invoices: [] } });
  assert.equal(offer.available, false);
  assert.match(offer.reason, /Billing history unavailable/);
});

test('the customer is never recommended the plan they are already on', async () => {
  for (const plan of TARIFF_TABLE.plans) {
    const state = { currentPlan: plan.planId, hardshipStatus: plan.eligibility?.hardshipOnly ? 'TAILORED_ASSISTANCE' : 'NONE' };
    const offer = await provider.findBestOffer(state, { billing: NADIA_BILLING });
    if (offer.available) assert.notEqual(offer.planId, plan.planId);
    assert.ok(eligiblePlans(state).plans.every((p) => p.planId !== plan.planId));
  }
});

test('hardship-only plans are not offered to customers not in hardship', async () => {
  const offer = await provider.findBestOffer(NADIA_STATE, { billing: NADIA_BILLING });
  assert.equal(offer.available, true);
  assert.equal(planFor(offer.planId).eligibility?.hardshipOnly, undefined);
  const excluded = offer.basis.candidatesExcluded.map((e) => e.reason);
  assert.ok(excluded.includes('HARDSHIP_ONLY_PLAN'));
});

test('a customer on a hardship plan is never moved onto a commercial plan', async () => {
  const state = { currentPlan: 'Assisted Essentials', hardshipStatus: 'TAILORED_ASSISTANCE' };
  const offer = await provider.findBestOffer(state, { billing: NADIA_BILLING });
  const eligible = eligiblePlans(state);
  assert.equal(eligible.onHardshipPlan, true);
  assert.ok(eligible.plans.every((p) => p.eligibility?.hardshipOnly));
  assert.ok(eligible.excluded.some((e) => e.reason === 'WOULD_MOVE_OFF_HARDSHIP_PLAN'));
  if (offer.basis) {
    assert.equal(offer.basis.hardshipProtected, true);
    assert.match(offer.basis.hardshipNote, /would remove tailored-assistance protections/);
  }
});

test('Solar Saver is never recommended without a solar marker in the snapshot', async () => {
  const state = { currentPlan: 'Standard Flexi', hardshipStatus: 'NONE' };
  assert.ok(eligiblePlans(state).plans.every((p) => p.planId !== 'Solar Saver'));
  assert.ok(eligiblePlans({ ...state, solar: true }).plans.some((p) => p.planId === 'Solar Saver'));
});

test('a plan absent from the tariff table yields unavailable, not a comparison', async () => {
  const offer = await provider.findBestOffer({ currentPlan: 'Mystery Plan' }, { billing: NADIA_BILLING });
  assert.equal(offer.available, false);
  assert.match(offer.reason, /not in tariff table/);
});

test('spend below the annual supply charge cannot yield consumption', async () => {
  const offer = await provider.findBestOffer(NADIA_STATE, { billing: billing([paid('2026-03', 10), paid('2026-04', 10), paid('2026-05', 10)]) });
  assert.equal(offer.available, false);
  assert.match(offer.reason, /does not exceed/);
});

test('PRICING_PROVIDER selection: none is the default, tariff-table is opt-in', () => {
  const saved = process.env.PRICING_PROVIDER;
  try {
    delete process.env.PRICING_PROVIDER;
    assert.ok(pricingProvider() instanceof UnavailableBestOfferProvider);
    process.env.PRICING_PROVIDER = 'tariff-table';
    assert.ok(pricingProvider() instanceof TariffTableBestOfferProvider);
  } finally {
    if (saved === undefined) delete process.env.PRICING_PROVIDER; else process.env.PRICING_PROVIDER = saved;
  }
});
