import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExistence } from '../../src/decision-layer/profile.js';

// The invariant: an unchecked state must never read as absence.
//
// "The systems of record deny this customer" and "we could not reach the
// systems of record" arrive in the same shape — null identity, both sections
// unavailable — but they are opposite findings. Asserting the first from the
// second is a false statement about the CRM, shown precisely when an operator
// has no way to catch it. NOT_FOUND must be earned; UNVERIFIED is the default.

const REF = { customerId: null, externalCustomerId: 'CUST-0001' };
const IN_LEDGER = { customerId: '1004', externalCustomerId: '1004' };

// A source that answered and said no.
const denies = () => ({ available: false, denied: true });
// A source that could not be asked: transport, auth, or unconfigured.
const unreachable = () => ({ available: false, denied: false });
const answers = () => ({ available: true, denied: false });

test('both systems of record unreachable is UNVERIFIED, never NOT_FOUND', () => {
  const result = resolveExistence(REF, unreachable(), unreachable());
  assert.equal(result.resolution, 'UNVERIFIED');
  assert.equal(result.exists, null, 'exists must be null — unknown, not absent');
  assert.equal(result.notFoundReason, null, 'an unchecked state must not produce a denial');
  assert.deepEqual(result.unreachable, ['Salesforce', 'Stripe']);
  assert.match(result.resolutionReason, /not a statement that the customer does not exist/);
  assert.doesNotMatch(result.resolutionReason, /No customer matches/);
});

test('one source denying while the other is unreachable is still UNVERIFIED', () => {
  // The unreachable source could hold the record. A single denial is not enough.
  for (const [sf, st] of [[denies(), unreachable()], [unreachable(), denies()]]) {
    const result = resolveExistence(REF, sf, st);
    assert.equal(result.resolution, 'UNVERIFIED');
    assert.equal(result.exists, null);
    assert.equal(result.notFoundReason, null);
  }
});

test('NOT_FOUND is earned: every source answered and all denied', () => {
  const result = resolveExistence(REF, denies(), denies());
  assert.equal(result.resolution, 'NOT_FOUND');
  assert.equal(result.exists, false);
  assert.deepEqual(result.deniedBy, ['Salesforce', 'Stripe']);
  assert.deepEqual(result.unreachable, []);
  assert.match(result.notFoundReason, /No customer matches "CUST-0001"/);
});

test('a customer known to the ledger survives a total upstream outage', () => {
  // Regression: the two-state predecessor reported a valid customer as absent
  // whenever both upstreams were down, telling an operator the CRM had no
  // such record. The ledger already knows they exist.
  const result = resolveExistence(IN_LEDGER, unreachable(), unreachable());
  assert.equal(result.resolution, 'LEDGER');
  assert.equal(result.exists, true);
  assert.equal(result.notFoundReason, null);
  assert.deepEqual(result.unreachable, ['Salesforce', 'Stripe']);
});

test('an upstream that recognises a customer absent from the ledger is UPSTREAM', () => {
  // A real Salesforce account that has not been synced yet.
  const result = resolveExistence(REF, answers(), unreachable());
  assert.equal(result.resolution, 'UPSTREAM');
  assert.equal(result.exists, true);
  assert.equal(result.notFoundReason, null);
});

test('no combination without a positive denial can ever reach NOT_FOUND', () => {
  // Exhaustive: every reachable state of both sources. This is the guard that
  // survives a future refactor of identity resolution.
  const states = { answers: answers(), denies: denies(), unreachable: unreachable() };
  for (const [sfName, sf] of Object.entries(states)) {
    for (const [stName, st] of Object.entries(states)) {
      for (const identity of [REF, IN_LEDGER]) {
        const result = resolveExistence(identity, sf, st);
        const where = `${sfName}/${stName}/${identity.customerId ? 'in-ledger' : 'unknown'}`;

        if (result.resolution === 'NOT_FOUND') {
          assert.ok(sf.denied || st.denied, `${where}: NOT_FOUND without any denial`);
          assert.ok(!result.unreachable.length, `${where}: NOT_FOUND while a source was unreachable`);
          assert.equal(identity.customerId, null, `${where}: NOT_FOUND for a customer in the ledger`);
        }
        // Absence may only ever be asserted by NOT_FOUND.
        if (result.exists === false) assert.equal(result.resolution, 'NOT_FOUND', `${where}: exists:false outside NOT_FOUND`);
        if (result.notFoundReason) assert.equal(result.resolution, 'NOT_FOUND', `${where}: denial prose outside NOT_FOUND`);
        assert.ok(['LEDGER', 'UPSTREAM', 'NOT_FOUND', 'UNVERIFIED'].includes(result.resolution), `${where}: unknown resolution`);
      }
    }
  }
});

test('a missing denied flag is treated as unreachable, not as a denial', () => {
  // Defensive: a source that predates the denied flag must degrade to "unknown"
  // rather than silently counting as a denial.
  const result = resolveExistence(REF, { available: false }, { available: false });
  assert.equal(result.resolution, 'UNVERIFIED');
  assert.equal(result.notFoundReason, null);
});
