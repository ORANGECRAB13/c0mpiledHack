function reason(rule, status, citation, explanation) {
  return { rule, status, citation, explanation };
}

export function evaluateBestOffer(snapshot, { disconnectionFloor, version }) {
  const state = snapshot.state || snapshot;
  const missing = ['asOf', 'balance', 'oldestDebtDays', 'hardshipStatus', 'currentPlan', 'bestOfferOptOut']
    .filter((field) => state[field] === undefined || state[field] === null);
  if (missing.length) {
    return {
      outcome: 'INSUFFICIENT_EVIDENCE',
      reasons: [reason('Required evidence', 'MISSING', 'ERCoP v7 cl 76–79', `Missing: ${missing.join(', ')}`)]
    };
  }

  const tailored = ['TAILORED_ASSISTANCE', 'PAYMENT_DIFFICULTY'].includes(state.hardshipStatus);
  const highDebt = Number(state.balance) >= 1000 && Number(state.oldestDebtDays) >= 90;
  const optedOut = Boolean(state.bestOfferOptOut);
  const cheaperOffer = state.bestOffer && state.bestOffer.planId !== state.currentPlan && Number(state.bestOffer.annualSaving || 0) > 0;
  const switchRequired = (tailored || highDebt) && !optedOut && cheaperOffer;
  const reasons = [
    reason(`$${disconnectionFloor.toLocaleString('en-AU')} disconnection threshold`, Number(state.balance) < disconnectionFloor ? 'BLOCKED' : 'REVIEW', `ERCoP ${version} disconnection protections`, Number(state.balance) < disconnectionFloor ? `Balance $${Number(state.balance).toFixed(2)} is below the floor.` : 'Floor met; all other protections still apply.'),
    reason('Automatic best offer — tailored assistance', tailored ? 'APPLIES' : 'NOT_TRIGGERED', 'ERCoP v7 cl 76–79', tailored ? 'Customer is receiving tailored assistance.' : 'Tailored assistance is not active.'),
    reason('Automatic best offer — high debt', highDebt ? 'APPLIES' : 'NOT_TRIGGERED', 'ERCoP v7 cl 76–79', highDebt ? 'Debt is at least $1,000 and at least 90 days old.' : 'The separate $1,000 and 90-day trigger is not met.'),
    reason('Best available offer', cheaperOffer ? 'AVAILABLE' : 'NO_LOWER_OFFER', 'ERCoP v7 cl 76–79', cheaperOffer ? `${state.bestOffer.planId} saves $${Number(state.bestOffer.annualSaving).toFixed(2)} annually.` : 'Pricing provider returned no cheaper eligible offer.'),
    reason('Customer opt-out', optedOut ? 'OPTED_OUT' : 'CLEAR', 'ERCoP v7 cl 76–79', optedOut ? 'A recorded opt-out prevents automatic switching.' : 'No opt-out is recorded.'),
    reason('Sensitive-customer recovery protection', state.sensitiveCustomer ? 'BLOCKED' : 'CLEAR', 'ERCoP v7 customer protections', state.sensitiveCustomer ? 'Disconnection cannot be used as a recovery step.' : 'No sensitive-customer marker is present.')
  ];

  return { outcome: switchRequired ? 'ACTION_REQUIRED' : 'NO_CHANGE', reasons };
}
