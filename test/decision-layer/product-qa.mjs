import assert from 'node:assert/strict';

const frontend = 'http://127.0.0.1:5188';
const api = 'http://127.0.0.1:5182/api/decision-layer';

async function json(path, options) {
  const response = await fetch(`${api}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const checks = [];
const record = (name, fn) => checks.push(Promise.resolve().then(fn).then(() => ({ name, passed: true }), (error) => ({ name, passed: false, error: error.message })));

record('frontend responds with the React root', async () => {
  const response = await fetch(frontend);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="root"/);
});

record('ledger health is live', async () => {
  const { response, body } = await json('/health');
  assert.equal(response.status, 200);
  assert.equal(body.ledger.connected, true);
  assert.equal(body.synthetic, true);
});

const customersResult = await json('/customers');
assert.equal(customersResult.response.status, 200);
const customers = customersResult.body.customers;
assert.ok(customers.length >= 12, 'expected all synthetic customers');

record('queue contains unique, navigable customer IDs', () => {
  assert.equal(new Set(customers.map((item) => item.id)).size, customers.length);
  for (const item of customers) {
    assert.ok(item.id && item.customer && item.workflow && item.status && item.action);
  }
});

for (const customer of customers) {
  record(`case opens: ${customer.id} ${customer.customer}`, async () => {
    const { response, body } = await json(`/cases/${encodeURIComponent(customer.id)}`);
    assert.equal(response.status, 200);
    const value = body.case;
    assert.equal(value.id, customer.id);
    assert.equal(value.synthetic, true);
    assert.ok(Array.isArray(value.snapshot) && value.snapshot.length > 0);
    assert.ok(Array.isArray(value.sources) && value.sources.length > 0);
    assert.ok(Array.isArray(value.rules));
    assert.ok(Array.isArray(value.events));
    assert.ok(value.recommendation && value.recommendationSummary && value.policyVersion);
  });
}

record('Amelia has regulator-facing evidence and an approval action', async () => {
  const { body } = await json('/cases/C-10482');
  assert.equal(body.case.customer, 'Amelia Hart');
  assert.ok(body.case.rules.length >= 6);
  assert.match(body.case.rules.map((rule) => rule.join(' ')).join(' '), /1,000 disconnection threshold/i);
  assert.ok(body.case.snapshotHash);
  assert.ok(body.case.decisionId);
  assert.ok(body.case.actionId);
});

record('unknown case returns a useful 404', async () => {
  const { response, body } = await json('/cases/DOES-NOT-EXIST');
  assert.equal(response.status, 404);
  assert.match(body.error, /not found/i);
});

record('override without reason is rejected at API boundary', async () => {
  const { body: amelia } = await json('/cases/C-10482');
  const { response, body } = await json(`/actions/${amelia.case.actionId}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actorId: 'qa-officer', verdict: 'OVERRIDDEN' }) });
  assert.equal(response.status, 422);
  assert.match(body.error, /overrideReason is required/);
});

record('audit records preserve policy and snapshot hashes', async () => {
  const { response, body } = await json('/audit');
  assert.equal(response.status, 200);
  assert.ok(body.records.length > 0);
  for (const item of body.records) {
    assert.ok(item.policy_id && item.policy_version && item.snapshot_hash && item.created_at);
  }
});

record('policy library exposes both real VIC versions', async () => {
  const { body } = await json('/policies');
  const keys = body.policies.map((item) => `${item.id}@${item.version}`);
  assert.ok(keys.includes('vic.hardship.best-offer@1.2.0'));
  assert.ok(keys.includes('vic.hardship.best-offer@1.3.0'));
});

const results = await Promise.all(checks);
const failures = results.filter((item) => !item.passed);
console.log(JSON.stringify({ passed: results.length - failures.length, failed: failures.length, results }, null, 2));
if (failures.length) process.exitCode = 1;
