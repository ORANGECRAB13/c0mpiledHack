// Best-offer pricing.
//
// Two providers are selectable via PRICING_PROVIDER:
//   none | unavailable  (DEFAULT) — no pricing source; reports "we do not know".
//   tariff-table        — computes a comparison from the customer's own paid
//                         Stripe invoices against the declared demo tariff
//                         table in ./data/tariffs.json.
//
// `none` stays the default because a saving lands in state.bestOffer, is hashed
// into the snapshot, and becomes part of a regulator-facing evidence record.
// Whatever goes in there must be either real or absent — never a guess. The
// tariff-table provider is opt-in and every figure it returns carries its
// provenance and derivation so a modelled saving can never read as a quoted one.

import {
  TARIFF_VERSION, TARIFF_PROVENANCE, planFor, monthlySpendFrom,
  annualKwhFrom, annualCostOf, eligiblePlans, round2,
} from './tariffs.js';

// Providers take (state, context). `context.billing` is the raw Stripe billing
// read the service already performs; a provider that does not need it ignores
// the argument.
export class BestOfferProvider {
  async findBestOffer(_customerState) { throw new Error('BestOfferProvider.findBestOffer must be implemented'); }
}

/**
 * Reports that no offer comparison could be performed. This is the default
 * because no pricing source is wired up. Downstream policy treats an
 * unavailable offer as missing evidence, never as "no cheaper offer exists".
 */
export class UnavailableBestOfferProvider extends BestOfferProvider {
  constructor(reason = 'No tariff/pricing source configured (PRICING_PROVIDER unset).') { super(); this.reason = reason; }
  async findBestOffer(_state) {
    return { available: false, reason: this.reason, source: 'NONE', checkedAt: null };
  }
}

/**
 * Explicit fixtures only — used by tests that need a deterministic offer.
 * Never selected by pricingProvider(); it must be constructed on purpose.
 */
export class StaticBestOfferProvider extends BestOfferProvider {
  constructor(offers = {}) { super(); this.offers = offers; }
  async findBestOffer(state) {
    const offer = this.offers[state?.currentPlan];
    if (!offer) return { available: false, reason: `No offer fixture for plan ${state?.currentPlan ?? 'UNKNOWN'}`, source: 'FIXTURE', checkedAt: null };
    return { available: true, source: 'FIXTURE', ...offer };
  }
}

/**
 * A real comparison, computed from the customer's own paid Stripe invoices
 * against the declared tariff table (src/decision-layer/data/tariffs.json).
 *
 * Derivation, end to end:
 *   1. average the customer's PAID invoices by distinct billing month → annual spend;
 *   2. back that spend out to annual kWh using the tariff of the plan they are
 *      ALREADY on (the stated assumption: those bills were priced on that plan);
 *   3. re-price that same kWh on every eligible plan;
 *   4. the cheapest wins, less any exit fee, as a year-one saving.
 *
 * There is no fallback. A customer with too little billing history returns
 * `available:false` with the reason, which the policy reads as missing
 * evidence — a guess here would be hashed into a regulator-facing record.
 *
 * The saving is MODELLED, not quoted. `source`, `provenance` and `basis`
 * travel with it so nobody downstream can mistake it for a retailer quote.
 */
export class TariffTableBestOfferProvider extends BestOfferProvider {
  constructor({ clock = () => new Date().toISOString() } = {}) { super(); this.clock = clock; }

  async findBestOffer(state, context = {}) {
    const checkedAt = this.clock();
    const unavailable = (reason, extra = {}) => ({
      available: false, reason, source: TARIFF_VERSION, provenance: TARIFF_PROVENANCE, checkedAt, ...extra,
    });

    const currentPlan = state?.currentPlan;
    const current = planFor(currentPlan);
    if (!current) return unavailable(`Current plan ${currentPlan ?? 'UNKNOWN'} is not in tariff table ${TARIFF_VERSION}; no comparison basis exists.`);

    const spend = monthlySpendFrom(context.billing);
    if (!spend.ok) return unavailable(spend.reason, { basis: { billingMonths: spend.months || [] } });

    const derived = annualKwhFrom(spend.annualSpend, current);
    if (!derived.ok) return unavailable(derived.reason, { basis: { annualSpend: spend.annualSpend, billingMonths: spend.months } });

    const { plans, excluded, onHardshipPlan, hardship } = eligiblePlans(state);
    const currentAnnualCost = annualCostOf(current, derived.annualKwh);
    const priced = plans
      .map((plan) => ({
        planId: plan.planId,
        annualCost: annualCostOf(plan, derived.annualKwh),
        exitFee: Number(current.exitFeeDollars || 0),
      }))
      .map((o) => ({ ...o, annualSaving: round2(currentAnnualCost - o.annualCost - o.exitFee) }))
      .sort((a, b) => a.annualSaving - b.annualSaving)
      .reverse();

    const basis = {
      derivation: 'PAID_INVOICE_SPEND_TO_KWH_THEN_REPRICE',
      billingMonths: spend.months,
      billingMonthCount: spend.monthCount,
      paidInvoiceTotal: spend.paidTotal,
      monthlySpend: spend.monthlySpend,
      annualSpend: spend.annualSpend,
      consumptionAssumption: `Annual consumption of ${derived.annualKwh} kWh derived by removing the $${derived.supplyYear} annual supply charge of ${currentPlan} and dividing the remainder by its ${derived.effectiveRate} c/kWh effective rate. Assumes the paid bills were priced on the customer's current plan for their whole period; no plan-change history is available to verify that.`,
      annualKwh: derived.annualKwh,
      currentPlan,
      currentAnnualCost,
      candidatesConsidered: priced.map(({ planId, annualCost, annualSaving }) => ({ planId, annualCost, annualSaving })),
      candidatesExcluded: excluded,
      hardship,
      onHardshipPlan,
      hardshipProtected: onHardshipPlan,
      tariffTableVersion: TARIFF_VERSION,
      tariffEffectiveFrom: TARIFF_PROVENANCE.effectiveFrom,
      modelled: true,
      quoted: false,
    };

    if (onHardshipPlan) {
      basis.hardshipNote = `Customer is on the hardship plan ${currentPlan}. Only other hardship plans were compared; a move onto a nominally cheaper commercial plan would remove tailored-assistance protections and is not made automatically.`;
    }

    const best = priced[0];
    if (!best) return unavailable(`No eligible alternative plan for ${currentPlan} after eligibility filtering.`, { basis });
    if (!(best.annualSaving > 0)) {
      return unavailable(`No eligible plan beats ${currentPlan} at ${derived.annualKwh} kWh/yr (best alternative ${best.planId} at $${best.annualCost} vs $${currentAnnualCost}).`, { basis });
    }

    return {
      available: true,
      planId: best.planId,
      annualSaving: best.annualSaving,
      annualCost: best.annualCost,
      exitFee: best.exitFee,
      basis,
      provenance: TARIFF_PROVENANCE,
      source: TARIFF_VERSION,
      checkedAt,
    };
  }
}

const REGISTRY = new Map([
  ['tariff-table', () => new TariffTableBestOfferProvider()],
  ['none', () => new UnavailableBestOfferProvider()],
  ['unavailable', () => new UnavailableBestOfferProvider()],
]);

/** Register a real provider factory (e.g. a retailer tariff API) by name. */
export function registerPricingProvider(kind, factory) { REGISTRY.set(String(kind).toLowerCase(), factory); }

export function pricingProvider() {
  const kind = (process.env.PRICING_PROVIDER || 'none').toLowerCase();
  const factory = REGISTRY.get(kind);
  if (!factory) throw new Error(`Pricing provider ${kind} is not configured`);
  return factory();
}
