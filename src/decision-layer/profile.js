import { ledgerPool } from './db.js';
import { readSalesforceAccount } from './salesforce-read.js';
import { normalizeSalesforceAccount } from './normalizer.js';
import { readStripeBilling } from './stripe-read.js';

// The customer profile the compliance workspace renders: the CRM record and
// the billing record side by side, plus whether they agree. Two systems
// disagreeing about how much a customer owes is itself a compliance finding,
// so the reconciliation is part of the payload rather than hidden.

const number = (value) => (value === null || value === undefined ? null : Number(value));

function salesforceSection(account) {
  const normalized = normalizeSalesforceAccount(account);
  return {
    available: true,
    error: null,
    accountId: account.Id,
    lastModified: account.LastModifiedDate || null,
    arrearsBalance: number(normalized.state.balance),
    oldestDebtDays: number(normalized.state.oldestDebtDays),
    hardshipStatus: normalized.state.hardshipStatus ?? 'NONE',
    hardshipStatusRaw: account.Hardship_Status__c ?? null,
    hardshipEnteredAt: account.Hardship_Entered_At__c ?? null,
    hardshipReviewDueAt: account.Hardship_Review_Due_At__c ?? null,
    financialStressSignals: normalized.state.financialStressSignals || [],
    missedPayments90d: number(normalized.state.missedPayments90d),
    partialPayments90d: number(normalized.state.partialPayments90d),
    currentPlan: normalized.state.currentPlan ?? null,
    bestOfferOptOut: Boolean(normalized.state.bestOfferOptOut),
    sensitiveCustomer: Boolean(normalized.state.sensitiveCustomer),
  };
}

/** Resolve a ledger customer id or an External_Customer_Id__c to both. */
async function resolveIdentity(reference) {
  const { rows } = await ledgerPool().query(
    'SELECT id, external_customer_id, name, jurisdiction FROM customer WHERE id=$1 OR external_customer_id=$1 LIMIT 1',
    [String(reference)],
  );
  if (rows[0]) {
    return { customerId: rows[0].id, externalCustomerId: rows[0].external_customer_id, name: rows[0].name, jurisdiction: rows[0].jurisdiction };
  }
  // Not in the ledger yet — the CRM is still the authority on who this is.
  return { customerId: null, externalCustomerId: String(reference), name: null, jurisdiction: null };
}

export async function buildCustomerProfile(reference) {
  const identity = await resolveIdentity(reference);

  let salesforce;
  let account = null;
  try {
    account = await readSalesforceAccount(identity.externalCustomerId);
    salesforce = salesforceSection(account);
  } catch (error) {
    // error.notFound is set only by the zero-rows throw in salesforce-read.js —
    // the org answered and denied the customer. Anything else (transport, auth,
    // config) means we never got an answer at all.
    salesforce = { available: false, denied: error.notFound === true, error: error.message, financialStressSignals: [] };
  }

  const stripe = await readStripeBilling(identity.externalCustomerId);

  const salesforceArrears = salesforce.available ? salesforce.arrearsBalance : null;
  const stripeOpenAmount = stripe.available ? stripe.openAmount : null;
  const delta = salesforceArrears !== null && stripeOpenAmount !== null
    ? Math.round((salesforceArrears - stripeOpenAmount) * 100) / 100
    : null;

  // Three findings share one payload shape and must never be conflated:
  //   the customer exists · the systems of record deny it · we could not ask.
  //
  // The last two look identical from here — null identity, both sections
  // unavailable — but "no such customer" claimed on the strength of an outage
  // is a false statement about the CRM, shown at the moment an operator is
  // least able to catch it. A denial is only a denial when something actually
  // answered, so UNVERIFIED is the default and NOT_FOUND must be earned.
  const deniedBy = [
    salesforce.denied ? 'Salesforce' : null,
    stripe.denied ? 'Stripe' : null,
  ].filter(Boolean);
  const unreachable = [
    !salesforce.available && !salesforce.denied ? 'Salesforce' : null,
    !stripe.available && !stripe.denied ? 'Stripe' : null,
  ].filter(Boolean);

  let resolution;
  if (identity.customerId) resolution = 'LEDGER';
  else if (salesforce.available || stripe.available) resolution = 'UPSTREAM';
  else if (deniedBy.length && !unreachable.length) resolution = 'NOT_FOUND';
  else resolution = 'UNVERIFIED';

  const exists = resolution === 'LEDGER' || resolution === 'UPSTREAM';
  const notFoundReason = resolution === 'NOT_FOUND'
    ? `No customer matches "${identity.externalCustomerId}" — ${deniedBy.join(' and ')} ${deniedBy.length > 1 ? 'both' : ''} searched and returned no record.`.replace(/\s+/g, ' ')
    : null;
  const resolutionReason = notFoundReason || (resolution === 'UNVERIFIED'
    ? `Could not verify whether "${identity.externalCustomerId}" exists: ${unreachable.join(' and ')} ${unreachable.length > 1 ? 'are' : 'is'} unreachable, and the customer is not in the decision ledger. This is not a statement that the customer does not exist.`
    : null);

  return {
    // 'LEDGER' | 'UPSTREAM' | 'NOT_FOUND' | 'UNVERIFIED'.
    // Branch on this, not on truthiness — `exists` is null when unknown, and
    // `!exists` would read an outage as a missing customer.
    resolution,
    exists: resolution === 'NOT_FOUND' ? false : (exists ? true : null),
    resolutionReason,
    notFoundReason,
    deniedBy,
    unreachable,
    customerId: identity.customerId,
    externalCustomerId: identity.externalCustomerId,
    name: account?.Name || identity.name || null,
    jurisdiction: account?.BillingState || identity.jurisdiction || 'VIC',
    salesforce,
    stripe,
    reconciliation: {
      salesforceArrears,
      stripeOpenAmount,
      delta,
      matched: delta === null ? null : Math.abs(delta) < 1,
    },
  };
}
