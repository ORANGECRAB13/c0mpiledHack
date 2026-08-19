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
