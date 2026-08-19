import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSalesforceAccount, mergeNormalized } from '../../src/decision-layer/normalizer.js';

test('Salesforce account is removed at the normalization boundary', () => {
  const normalized = normalizeSalesforceAccount({ Id: '001-test', External_Customer_Id__c: 'cust-1', Name: 'Synthetic Person', BillingState: 'VIC', Balance__c: 1000, Current_Plan__c: 'Standard Flexi', LastModifiedDate: '2026-08-01T00:00:00Z' });
  assert.deepEqual(normalized.state, { balance: 1000, currentPlan: 'Standard Flexi' });
  assert.equal(JSON.stringify(normalized).includes('Balance__c'), false);
  assert.equal(normalized.sources[0].source, 'SALESFORCE');
});

test('new provenance replaces only the source for changed fields', () => {
  const merged = mergeNormalized({ state: { balance: 10, currentPlan: 'A' }, sources: [{ field: 'currentPlan', value: 'A', source: 'PRICING' }] }, { state: { balance: 20 }, sources: [{ field: 'balance', value: 20, source: 'BILLING' }] });
  assert.deepEqual(merged.state, { balance: 20, currentPlan: 'A' });
  assert.equal(merged.sources.length, 2);
});

test('the compliance org field name maps onto balance', () => {
  const normalized = normalizeSalesforceAccount({ Id: '001-a', Arrears_Balance__c: 1080, LastModifiedDate: '2026-08-01T00:00:00Z' });
  assert.equal(normalized.state.balance, 1080);
  assert.equal(JSON.stringify(normalized).includes('Arrears_Balance__c'), false);
});

test('the more specific balance field wins when an org carries both', () => {
  const normalized = normalizeSalesforceAccount({ Id: '001-b', Balance__c: 1, Arrears_Balance__c: 1080 });
  assert.equal(normalized.state.balance, 1080);
  assert.equal(normalized.sources.filter((s) => s.field === 'balance').length, 1);
});

test('CRM hardship shorthand is translated into the policy vocabulary', () => {
  const status = (raw) => normalizeSalesforceAccount({ Id: '001-c', Hardship_Status__c: raw }).state.hardshipStatus;
  assert.equal(status('active'), 'TAILORED_ASSISTANCE');
  assert.equal(status('requested'), 'PAYMENT_DIFFICULTY');
  assert.equal(status('none'), 'NONE');
  assert.equal(status('exited'), 'NONE');
  // Already-canonical values survive a second pass unchanged.
  assert.equal(status('TAILORED_ASSISTANCE'), 'TAILORED_ASSISTANCE');
  // An unknown status must not quietly read as "no assistance".
  assert.equal(status('under_review'), 'under_review');
});

test('a false stress checkbox yields no signals rather than the string false', () => {
  const off = normalizeSalesforceAccount({ Id: '001-d', Financial_Stress_Signal__c: false });
  assert.deepEqual(off.state.financialStressSignals, []);
  const on = normalizeSalesforceAccount({ Id: '001-e', Financial_Stress_Signal__c: true, Financial_Stress_Reason__c: 'reduced work hours' });
  assert.deepEqual(on.state.financialStressSignals, ['reduced work hours']);
  const multi = normalizeSalesforceAccount({ Id: '001-f', Financial_Stress_Signal__c: 'a;b' });
  assert.deepEqual(multi.state.financialStressSignals, ['a', 'b']);
});
