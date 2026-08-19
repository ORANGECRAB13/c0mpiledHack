import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, CATEGORIES, severityFor } from '../../src/decision-layer/http.js';
import { statusForVerdict, assertApprovalRule, STATUS_FOR_VERDICT } from '../../src/decision-layer/repository.js';

// --- I4: NO_CHANGE never enters the actionable queue ------------------------

test('NO_CHANGE is its own category and is never actionable', () => {
  const category = categorize({ hardshipStatus: 'NONE' }, 'NO_CHANGE');
  assert.equal(category.key, 'NO_CHANGE');
  assert.equal(category.actionable, false);
});

test('only ACTION_REQUIRED and INSUFFICIENT_EVIDENCE are actionable', () => {
  const actionable = Object.values(CATEGORIES).filter((c) => c.actionable).map((c) => c.key).sort();
  assert.deepEqual(actionable, ['ACTION_REQUIRED', 'INSUFFICIENT_EVIDENCE']);
});

// --- categories come from real outcomes and real CRM state ------------------

test('an evaluated ACTION_REQUIRED wins over every state flag', () => {
  const category = categorize({ sensitiveCustomer: true, bestOfferOptOut: true }, 'ACTION_REQUIRED');
  assert.equal(category.key, 'ACTION_REQUIRED');
  assert.deepEqual(category.flags, ['SENSITIVE', 'OPTED_OUT']);
});

test('sensitive / opted-out / tailored are read from Salesforce state, not invented', () => {
  assert.equal(categorize({ sensitiveCustomer: true }, 'NO_CHANGE').key, 'SENSITIVE_CUSTOMER');
  assert.equal(categorize({ bestOfferOptOut: true }, 'NO_CHANGE').key, 'OPTED_OUT');
  assert.equal(categorize({ hardshipStatus: 'TAILORED_ASSISTANCE' }, 'NO_CHANGE').key, 'ON_TAILORED_ASSISTANCE');
  assert.equal(categorize({ hardshipStatus: 'PAYMENT_DIFFICULTY' }, 'NO_CHANGE').key, 'ON_TAILORED_ASSISTANCE');
});

test('a never-evaluated customer is NOT_EVALUATED, not NO_CHANGE', () => {
  assert.equal(categorize({ hardshipStatus: 'NONE' }, null).key, 'NOT_EVALUATED');
});

test('an open action makes a lineage outcome actionable', () => {
  assert.equal(categorize({}, null, { hasOpenAction: true }).key, 'ACTION_REQUIRED');
});

test('INSUFFICIENT_EVIDENCE is surfaced rather than hidden behind a state flag', () => {
  assert.equal(categorize({ sensitiveCustomer: true }, 'INSUFFICIENT_EVIDENCE').key, 'INSUFFICIENT_EVIDENCE');
});

// --- the approval rule, per item -------------------------------------------

test('overrideReason is required per item whenever verdict != AGREED', () => {
  assert.doesNotThrow(() => assertApprovalRule({ actorId: 'officer-1', verdict: 'AGREED' }));
  assert.throws(() => assertApprovalRule({ actorId: 'officer-1', verdict: 'REJECTED' }), /overrideReason is required/);
  assert.throws(() => assertApprovalRule({ actorId: 'officer-1', verdict: 'OVERRIDDEN', overrideReason: '   ' }), /overrideReason is required/);
  assert.doesNotThrow(() => assertApprovalRule({ actorId: 'officer-1', verdict: 'OVERRIDDEN', overrideReason: 'CRM contradicts billing' }));
});

test('actorId is required on every approval row', () => {
  assert.throws(() => assertApprovalRule({ verdict: 'AGREED' }), /actorId is required/);
});

test('an unknown verdict is rejected rather than defaulted', () => {
  assert.throws(() => assertApprovalRule({ actorId: 'a', verdict: 'APPROVED' }), /Unknown verdict/);
});

test('a bulk batch validates every item, not just the first', () => {
  const items = [
    { actionId: 'a', verdict: 'AGREED' },
    { actionId: 'b', verdict: 'REJECTED' }, // no reason
  ];
  const violations = items.filter((item) => {
    try { assertApprovalRule({ ...item, actorId: 'officer-1' }); return false; } catch { return true; }
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].actionId, 'b');
});

// --- verdict -> action status ----------------------------------------------

test('REJECTED marks the action REJECTED, not DONE', () => {
  assert.equal(statusForVerdict('REJECTED'), 'REJECTED');
});

test('AGREED queues the action; OVERRIDDEN closes it out (unchanged semantics)', () => {
  assert.equal(statusForVerdict('AGREED'), 'PENDING');
  assert.equal(statusForVerdict('OVERRIDDEN'), 'DONE');
});

test('every approval verdict has an explicit status mapping', () => {
  assert.deepEqual(Object.keys(STATUS_FOR_VERDICT).sort(), ['AGREED', 'OVERRIDDEN', 'REJECTED']);
});

// --- reason status -> display severity -------------------------------------

test('conflict and evidence-gap statuses never render as a passing check', () => {
  for (const status of ['CONFLICT_MATERIAL', 'INSUFFICIENT_EVIDENCE', 'MISSING', 'FUEL_SPLIT_UNKNOWN']) {
    assert.equal(severityFor(status), 'BLOCKING', status);
  }
  for (const status of ['CONFLICT', 'UNVERIFIED', 'OPTED_OUT', 'GST_EXCLUSIVE', 'BLOCKED', 'NOT_AVAILABLE']) {
    assert.equal(severityFor(status), 'ATTENTION', status);
  }
});

test('an unknown reason status defaults to ATTENTION, never PASS', () => {
  assert.equal(severityFor('SOME_FUTURE_STATUS'), 'ATTENTION');
  assert.equal(severityFor(undefined), 'ATTENTION');
});

test('only genuinely clean statuses pass', () => {
  for (const status of ['CLEAR', 'MATCHED', 'GST_INCLUSIVE']) assert.equal(severityFor(status), 'PASS', status);
  for (const status of ['NO_MONETARY_FLOOR', 'NO_LOWER_OFFER', 'NOT_TRIGGERED']) assert.equal(severityFor(status), 'INFO', status);
});
