const SF_FIELDS = Object.freeze({
  Balance__c: 'balance', Oldest_Debt_Days__c: 'oldestDebtDays', Hardship_Status__c: 'hardshipStatus',
  Hardship_Review_Due_At__c: 'hardshipReviewDueAt', Financial_Stress_Signal__c: 'financialStressSignals',
  Missed_Payments_90d__c: 'missedPayments90d', Partial_Payments_90d__c: 'partialPayments90d',
  Current_Plan__c: 'currentPlan', Best_Offer_Opt_Out__c: 'bestOfferOptOut', Sensitive_Customer__c: 'sensitiveCustomer'
});

function source(field, value, system, lastUpdated, confidence = 1, extractionMethod = 'API') {
  return { field, value, source: system, lastUpdated, confidence, extractionMethod };
}

export function normalizeSalesforceAccount(account, receivedAt = new Date().toISOString()) {
  if (!account?.Id) throw new Error('Salesforce Account.Id is required');
  const state = {};
  const sources = [];
  for (const [sfField, field] of Object.entries(SF_FIELDS)) {
    if (!(sfField in account)) continue;
    const raw = account[sfField];
    const value = field === 'financialStressSignals' ? (Array.isArray(raw) ? raw : String(raw || '').split(';').filter(Boolean)) : raw;
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
