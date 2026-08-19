#!/usr/bin/env node
/**
 * Push a compliance customer record into Salesforce.
 *
 * Upserts by External_Customer_Id__c, so re-running updates the same Account
 * instead of creating duplicates. Auth is whatever org the Salesforce CLI is
 * already logged into (`sf org login web`) — no credentials live in this repo.
 *
 *   node scripts/salesforce-seed.mjs [path/to/customer.json] [--alias myorg]
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const API = 'v62.0';

const args = process.argv.slice(2);
const aliasIndex = args.indexOf('--alias');
const alias = aliasIndex >= 0 ? args[aliasIndex + 1] : null;
const file = args.find((a) => a.endsWith('.json')) || 'salesforce/data/customer-123.json';

// The CLI ships its own node; a stale NODE_OPTIONS preload in the parent shell
// crashes it, so start every child from a clean slate.
const env = { ...process.env };
delete env.NODE_OPTIONS;

const sf = async (sfArgs) => {
  const { stdout } = await run('sf', sfArgs, { env, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
};

/** Map the compliance JSON onto the Account custom fields. */
export function toAccountFields(c) {
  return {
    Name: c.name || `Customer ${c.customer_id}`,
    External_Customer_Id__c: String(c.customer_id),
    Arrears_Balance__c: c.account?.balance ?? null,
    Oldest_Debt_Days__c: c.account?.oldest_debt_days ?? null,
    Current_Plan__c: c.account?.current_plan ?? null,
    Missed_Payments_90d__c: c.payments?.missed_payments_90d ?? null,
    Partial_Payments_90d__c: c.payments?.partial_payments_90d ?? null,
    Hardship_Status__c: c.hardship?.status ?? null,
    Hardship_Entered_At__c: c.hardship?.entered_at ?? null,
    Hardship_Review_Due_At__c: c.hardship?.review_due_at ?? null,
    Financial_Stress_Signal__c: Boolean(c.crm?.financial_stress_signal),
    Financial_Stress_Reason__c: c.crm?.reason ?? null,
    Best_Offer_Opt_Out__c: Boolean(c.preferences?.best_offer_opt_out),
  };
}

const main = async () => {
  const customer = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
  const fields = toAccountFields(customer);
  const externalId = fields.External_Customer_Id__c;

  // Salesforce rejects the external id in the body when it is in the URL.
  const body = { ...fields };
  delete body.External_Customer_Id__c;

  const request = [
    'api', 'request', 'rest',
    `/services/data/${API}/sobjects/Account/External_Customer_Id__c/${encodeURIComponent(externalId)}`,
    '--method', 'PATCH',
    '--body', JSON.stringify(body),
  ];
  if (alias) request.push('--target-org', alias);

  const result = await sf(request);
  const id = result.id || result.Id;
  console.log(`${result.created ? 'Created' : 'Updated'} Account ${id} for customer ${externalId}`);

  // Read it straight back so the output proves what actually landed in the org.
  const soql = `SELECT Id, Name, ${Object.keys(fields).filter((k) => k !== 'Name').join(', ')} FROM Account WHERE External_Customer_Id__c = '${externalId}'`;
  const query = ['data', 'query', '--query', soql, '--json'];
  if (alias) query.push('--target-org', alias);
  const read = await sf(query);
  console.log(JSON.stringify(read.result?.records?.[0] ?? read, null, 2));
};

main().catch((error) => {
  console.error(error.stderr || error.message);
  process.exit(1);
});
