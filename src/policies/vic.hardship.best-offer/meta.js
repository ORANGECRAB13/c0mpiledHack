export const policyId = 'vic.hardship.best-offer';

export const common = Object.freeze({
  id: policyId,
  jurisdiction: 'VIC',
  owner: 'Compliance',
  readFields: Object.freeze([
    'balance', 'oldestDebtDays', 'hardshipStatus', 'hardshipReviewDueAt',
    'financialStressSignals', 'missedPayments90d', 'partialPayments90d',
    'currentPlan', 'bestOfferOptOut', 'sensitiveCustomer', 'bestOffer'
  ]),
  evidenceRequirements: Object.freeze([
    'balance', 'oldestDebtDays', 'hardshipStatus', 'currentPlan', 'bestOfferOptOut'
  ]),
  citations: Object.freeze([
    { instrument: 'Energy Retail Code of Practice v7', clauses: '76–79' },
    { instrument: 'Energy Retail Code of Practice — Energy Consumer Reforms Amendment 2025', clauses: 'best offer and disconnection protections' }
  ])
});

// A stable decision key intentionally excludes policy name and version. If this
// policy splits, each successor declares the lineage key(s) it inherits.
export function decisionKeyFor(customerId) {
  return `eligibility:${customerId}:best_offer`;
}
