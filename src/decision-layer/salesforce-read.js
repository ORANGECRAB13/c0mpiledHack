import { normalizeSalesforceAccount } from './normalizer.js';

function config() {
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;
  const accessToken = process.env.SALESFORCE_ACCESS_TOKEN;
  if (!instanceUrl || !accessToken) throw new Error('Salesforce read is not configured. Set SALESFORCE_INSTANCE_URL and SALESFORCE_ACCESS_TOKEN.');
  return { instanceUrl: instanceUrl.replace(/\/$/, ''), accessToken };
}

export async function readSalesforceCustomer(externalCustomerId) {
  const { instanceUrl, accessToken } = config();
  const fields = ['Id','Name','BillingState','LastModifiedDate','External_Customer_Id__c','Arrears_Balance__c','Oldest_Debt_Days__c','Hardship_Status__c','Hardship_Entered_At__c','Hardship_Review_Due_At__c','Financial_Stress_Signal__c','Financial_Stress_Reason__c','Missed_Payments_90d__c','Partial_Payments_90d__c','Current_Plan__c','Best_Offer_Opt_Out__c','Sensitive_Customer__c'];
  const escaped = String(externalCustomerId).replaceAll("'", "\\'");
  const query = `SELECT ${fields.join(',')} FROM Account WHERE External_Customer_Id__c='${escaped}' LIMIT 1`;
  const response = await fetch(`${instanceUrl}/services/data/v61.0/query?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Salesforce query failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  if (!body.records?.length) throw new Error(`No Salesforce Account for ${externalCustomerId}`);
  return normalizeSalesforceAccount(body.records[0]);
}
