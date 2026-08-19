export const policyId = 'vic.hardship.best-offer';

// ---------------------------------------------------------------------------
// Citations
//
// The obligations this policy models live in Division 2A ("Automatic best
// offer") of the Energy Retail Code of Practice, inserted after clause 132 by
// the Energy Consumer Reforms Amendment 2025, plus clause 187 (disconnection).
//
// NOTE: earlier versions of this file cited "ERCoP v7 cl 76-79". That was
// wrong. In ERCoP v6 those clauses are 76 request for final bill, 77 additional
// retail charges, 78 merchant service fees, 79 dishonoured payments — nothing
// to do with hardship. Do not reintroduce that string.
// ---------------------------------------------------------------------------
export const CLAUSES = Object.freeze({
  disconnectionThreshold: 'ERCoP cl 187(2)',
  tailoredAssistance: 'ERCoP cl 132B(2)(a)',
  highDebt: 'ERCoP cl 132B(2)(b), cl 132B(3)',
  bestAvailableOffer: 'ERCoP cl 132C; cl 109(3)',
  optOut: 'ERCoP cl 132D(5)-(6)',
  requiredEvidence: 'ERCoP cl 132G',
  sensitiveCustomer: 'ERCoP cl 132F'
});

// Schedule 1 civil-penalty provisions. Carried on the reason objects so an
// operator can see which findings sit against penalty exposure rather than
// against a merely descriptive obligation.
export const PENALTY_PROVISIONS = Object.freeze({
  disconnectionThreshold: 'ERCoP Sch 1 — cl 187(2)',
  tailoredAssistance: 'ERCoP Sch 1 — cl 132B(1)',
  highDebt: 'ERCoP Sch 1 — cl 132B(1)',
  bestAvailableOffer: 'ERCoP Sch 1 — cl 132C(1)',
  optOut: 'ERCoP Sch 1 — cl 132D(6)',
  requiredEvidence: 'ERCoP Sch 1 — cl 132G(1), cl 132G(2)',
  // 132F (risk of harm) is not itself listed as a civil-penalty provision in
  // Schedule 1; the penalty attaches to the notice obligations around it.
  sensitiveCustomer: null
});

// ---------------------------------------------------------------------------
// Eligibility thresholds
//
// cl 132B(2)(b) defers to an arrears amount PUBLISHED BY THE ESC in a guideline
// under s13 of the Essential Services Commission Act. cl 132B(3) supplies
// $1,000 only "if an amount has not been published". So $1,000 is a FALLBACK:
// a new guideline can move it without any Code amendment. It therefore lives
// here with its provenance, never as a bare literal in the rule body — this is
// exactly the drift the engine exists to detect.
//
// The amount is assessed PER FUEL (electricity and gas separately, cl 132B(3)),
// and under cl 187(2) arrears are assessed INCLUSIVE OF GST.
// ---------------------------------------------------------------------------
export const ARREARS_THRESHOLD = Object.freeze({
  value: 1000,
  currency: 'AUD',
  source: 'ERCoP cl 132B(3) fallback',
  supersededByGuideline: false,
  guidelinePower: 'Essential Services Commission Act 2001 (Vic) s 13',
  perFuel: true,
  gstInclusive: true
});

export const ARREARS_AGE = Object.freeze({
  months: 3,
  source: 'ERCoP cl 132B(2)(b)',
  // The clause says "three months or more" — calendar months, not 90 days.
  unit: 'CALENDAR_MONTHS'
});

// ---------------------------------------------------------------------------
// Scheduled obligations (Division 2A). Expressed as metadata so a scheduler can
// consume them; this policy does not and must not run a clock (invariant I1).
// Every one of these is a Schedule 1 civil-penalty provision.
// ---------------------------------------------------------------------------
export const SCHEDULED_OBLIGATIONS = Object.freeze([
  Object.freeze({
    key: 'eligibility_sweep',
    citation: 'ERCoP cl 132B(4)',
    penaltyProvision: 'ERCoP Sch 1 — cl 132B(4)',
    description: 'Assess every residential customer in arrears for automatic best offer eligibility.',
    cadence: Object.freeze({ every: 6, unit: 'CALENDAR_MONTHS' }),
    scope: 'ALL_RESIDENTIAL_IN_ARREARS',
    anchor: 'lastEligibilitySweepAt'
  }),
  Object.freeze({
    key: 'initial_best_offer_check',
    citation: 'ERCoP cl 132C(1)(a)',
    penaltyProvision: 'ERCoP Sch 1 — cl 132C(1)',
    description: 'Perform the deemed best offer check within 10 business days of the customer becoming eligible.',
    deadline: Object.freeze({ within: 10, unit: 'BUSINESS_DAYS' }),
    scope: 'PER_CUSTOMER',
    anchor: 'becameEligibleAt'
  }),
  Object.freeze({
    key: 'recurring_best_offer_check',
    citation: 'ERCoP cl 132C(1)(b)',
    penaltyProvision: 'ERCoP Sch 1 — cl 132C(1)',
    description: 'Repeat the best offer check periodically after the initial check.',
    // Opt-out does NOT stop the obligation — it lengthens the interval. A
    // scheduler that treats opt-out as "switch off" under-performs the Code.
    cadence: Object.freeze({ every: 6, unit: 'CALENDAR_MONTHS' }),
    cadenceWhenOptedOut: Object.freeze({ every: 12, unit: 'CALENDAR_MONTHS' }),
    optOutChangesSchedule: true,
    scope: 'PER_CUSTOMER',
    anchor: 'lastBestOfferCheckAt'
  }),
  Object.freeze({
    key: 'negative_check_notice',
    citation: 'ERCoP cl 132D(1)',
    penaltyProvision: 'ERCoP Sch 1 — cl 132D(1)',
    description: 'Notify the customer within 5 business days of a check that found no better offer.',
    deadline: Object.freeze({ within: 5, unit: 'BUSINESS_DAYS' }),
    scope: 'PER_CUSTOMER',
    anchor: 'lastNegativeCheckAt'
  })
]);

export const common = Object.freeze({
  id: policyId,
  jurisdiction: 'VIC',
  owner: 'Compliance',
  readFields: Object.freeze([
    'balance', 'oldestDebtDays', 'hardshipStatus', 'hardshipReviewDueAt',
    'financialStressSignals', 'missedPayments90d', 'partialPayments90d',
    'currentPlan', 'bestOfferOptOut', 'sensitiveCustomer', 'bestOffer',
    // Optional, honesty-bearing inputs. Absent is a valid, recorded state.
    'oldestDebtSince', 'fuels', 'fuelArrears', 'balanceIncludesGst',
    // Billing reconciliation: the arrears figure that drives a regulatory
    // threshold must be corroborated, not merely asserted by the CRM.
    'billing', 'reconciliation'
  ]),
  evidenceRequirements: Object.freeze([
    'balance', 'oldestDebtDays', 'hardshipStatus', 'currentPlan', 'bestOfferOptOut'
  ]),
  scheduledObligations: SCHEDULED_OBLIGATIONS,
  citations: Object.freeze([
    { instrument: 'Energy Retail Code of Practice', clauses: 'cl 132A–132G (Division 2A — Automatic best offer)' },
    { instrument: 'Energy Retail Code of Practice', clauses: 'cl 187(2) (disconnection — arrears threshold, GST inclusive)' },
    { instrument: 'Energy Retail Code of Practice', clauses: 'cl 109(3) (negative best offer result)' },
    { instrument: 'Energy Retail Code of Practice — Energy Consumer Reforms Amendment 2025', clauses: 'inserts Division 2A and cl 187(2)' }
  ])
});

// A stable decision key intentionally excludes policy name and version. If this
// policy splits, each successor declares the lineage key(s) it inherits.
export function decisionKeyFor(customerId) {
  return `eligibility:${customerId}:best_offer`;
}
