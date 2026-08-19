import { normalizeSalesforceAccount } from './normalizer.js';
import { soql, soqlAll } from './salesforce-auth.js';

export const ACCOUNT_FIELDS = [
  'Id', 'Name', 'BillingState', 'LastModifiedDate', 'External_Customer_Id__c',
  'Arrears_Balance__c', 'Oldest_Debt_Days__c', 'Hardship_Status__c', 'Hardship_Entered_At__c',
  'Hardship_Review_Due_At__c', 'Financial_Stress_Signal__c', 'Financial_Stress_Reason__c',
  'Missed_Payments_90d__c', 'Partial_Payments_90d__c', 'Current_Plan__c',
  'Best_Offer_Opt_Out__c', 'Sensitive_Customer__c',
];

const escape = (value) => String(value).replaceAll("'", "\\'");

/** The raw Account row, before policy-facing normalization. */
export async function readSalesforceAccount(externalCustomerId) {
  const query = `SELECT ${ACCOUNT_FIELDS.join(',')} FROM Account WHERE External_Customer_Id__c='${escape(externalCustomerId)}' LIMIT 1`;
  const body = await soql(query);
  if (!body.records?.length) throw new Error(`No Salesforce Account for ${externalCustomerId}`);
  return body.records[0];
}

export async function readSalesforceCustomer(externalCustomerId) {
  return normalizeSalesforceAccount(await readSalesforceAccount(externalCustomerId));
}

/**
 * The whole compliance customer book, normalized. This is what replaces the
 * hardcoded seed list: the queue is whatever the CRM actually holds.
 */
export async function listSalesforceCustomers({ limit = null } = {}) {
  const query = `SELECT ${ACCOUNT_FIELDS.join(',')} FROM Account WHERE External_Customer_Id__c != null ORDER BY External_Customer_Id__c${limit ? ` LIMIT ${Number(limit)}` : ''}`;
  const records = await soqlAll(query);
  return records.map((account) => ({ account, normalized: normalizeSalesforceAccount(account) }));
}
