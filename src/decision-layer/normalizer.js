// Two orgs, two names for the same money: the seeded compliance org calls it
// Arrears_Balance__c. Both map to `balance`; the more specific name wins when
// an org somehow carries both.
const SF_FIELDS = Object.freeze({
  Balance__c: 'balance', Arrears_Balance__c: 'balance',
  Oldest_Debt_Days__c: 'oldestDebtDays', Hardship_Status__c: 'hardshipStatus',
  Hardship_Review_Due_At__c: 'hardshipReviewDueAt', Financial_Stress_Signal__c: 'financialStressSignals',
  Missed_Payments_90d__c: 'missedPayments90d', Partial_Payments_90d__c: 'partialPayments90d',
  Current_Plan__c: 'currentPlan', Best_Offer_Opt_Out__c: 'bestOfferOptOut', Sensitive_Customer__c: 'sensitiveCustomer'
});
const SF_FIELD_PRECEDENCE = Object.freeze({ balance: ['Arrears_Balance__c', 'Balance__c'] });

// CRM hardship vocabulary is operational shorthand; the policy reasons in the
// regulation's terms. Translating here keeps that vocabulary out of the rules.
const HARDSHIP_STATUS = Object.freeze({
  active: 'TAILORED_ASSISTANCE',
  tailored_assistance: 'TAILORED_ASSISTANCE',
  requested: 'PAYMENT_DIFFICULTY',
  payment_difficulty: 'PAYMENT_DIFFICULTY',
  none: 'NONE',
  exited: 'NONE',
});

function canonicalHardshipStatus(raw) {
  if (raw === null || raw === undefined || raw === '') return raw;
  const key = String(raw).trim().toLowerCase();
  // An unrecognised status must not silently read as "no assistance" — pass it
  // through so the policy's evidence check can see something unexpected.
  return HARDSHIP_STATUS[key] ?? raw;
}

function source(field, value, system, lastUpdated, confidence = 1, extractionMethod = 'API') {
  return { field, value, source: system, lastUpdated, confidence, extractionMethod };
}

export function normalizeSalesforceAccount(account, receivedAt = new Date().toISOString()) {
  if (!account?.Id) throw new Error('Salesforce Account.Id is required');
  const state = {};
  const sources = [];
  for (const [sfField, field] of Object.entries(SF_FIELDS)) {
    if (!(sfField in account)) continue;
    const preferred = SF_FIELD_PRECEDENCE[field]?.find((name) => name in account);
    if (preferred && preferred !== sfField) continue;

    const raw = account[sfField];
    let value = raw;
    if (field === 'financialStressSignals') {
      // Orgs model this either as a multi-select string or as a checkbox with a
      // separate reason. A checkbox must not stringify — `false` would become
      // ['false'], a non-empty list that reads as "stress detected".
      if (Array.isArray(raw)) value = raw;
      else if (typeof raw === 'boolean') value = raw ? [account.Financial_Stress_Reason__c || 'FINANCIAL_STRESS'] : [];
      else value = String(raw || '').split(';').filter(Boolean);
    } else if (field === 'hardshipStatus') {
      value = canonicalHardshipStatus(raw);
    }
    state[field] = value;
    sources.push(source(field, value, 'SALESFORCE', account.LastModifiedDate || receivedAt));
  }
  return {
    customerId: account.External_Customer_Id__c || account.Id,
    name: account.Name || 'Synthetic customer', jurisdiction: account.BillingState || 'VIC', state, sources
  };
}

export function normalizeOperationalEvent(event) {
  if (!event?.customerId || !event?.type || !event?.origin) throw new Error('Event customerId, type and origin are required');
  const changes = event.payload?.changes || event.payload || {};
  const state = {};
  const sources = [];
  for (const [field, raw] of Object.entries(changes)) {
    const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    state[field] = value;
    sources.push(source(field, value, event.origin, raw?.lastUpdated || event.occurredAt, raw?.confidence ?? 1, raw?.extractionMethod || 'EVENT'));
  }
  return { state, sources };
}

export function mergeNormalized(current = {}, incoming) {
  const state = { ...(current.state || {}), ...incoming.state };
  const sourceMap = new Map((current.sources || []).map((item) => [item.field, item]));
  for (const item of incoming.sources || []) sourceMap.set(item.field, item);
  return { state, sources: [...sourceMap.values()] };
}
