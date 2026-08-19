import { randomUUID } from 'node:crypto';
import { sha256, inputFor, stableJson } from './hash.js';
import { normalizeOperationalEvent, mergeNormalized } from './normalizer.js';
import { pricingProvider } from './pricing.js';
import { readStripeBilling } from './stripe-read.js';
import { resolveVersionAt } from '../policies/index.js';
import { decisionKeyFor } from '../policies/vic.hardship.best-offer/meta.js';
import { ledgerPool, withTransaction } from './db.js';
import * as repo from './repository.js';

const POLICY_ID = 'vic.hardship.best-offer';
const EVALUATIONS_PER_HOUR = Number(process.env.EVALUATIONS_PER_CUSTOMER_HOUR || 25);

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * The billing half of the snapshot, in the fixed contract the policy reads.
 * Mirrors the reconciliation src/decision-layer/profile.js renders for display
 * — the same comparison, but now as evidence rather than decoration.
 * An unreachable or unconfigured Stripe is reported as unavailable; it is
 * never coerced to zero, because "owes nothing" and "we could not look" are
 * different facts and only one of them is safe to act on.
 */
export function billingSection(stripe) {
  if (!stripe || stripe.available !== true) {
    return { available: false, openAmount: null, oldestOverdueDays: null, currency: null, error: stripe?.error || 'Stripe billing unavailable.' };
  }
  return {
    available: true,
    openAmount: stripe.openAmount === null || stripe.openAmount === undefined ? null : round2(Number(stripe.openAmount)),
    oldestOverdueDays: stripe.oldestOverdueDays === null || stripe.oldestOverdueDays === undefined ? null : Number(stripe.oldestOverdueDays),
    currency: stripe.currency || null,
    error: null,
  };
}

/** CRM arrears vs billing open amount. Null on either side ⇒ null delta, null match. */
export function reconcile(crmArrears, billingOpenAmount) {
  const crm = crmArrears === null || crmArrears === undefined ? null : Number(crmArrears);
  const billing = billingOpenAmount === null || billingOpenAmount === undefined ? null : Number(billingOpenAmount);
  const delta = crm !== null && billing !== null ? round2(crm - billing) : null;
  return { crmArrears: crm, billingOpenAmount: billing, delta, matched: delta === null ? null : Math.abs(delta) < 1 };
}

const UNAVAILABLE_BILLING = Object.freeze({ available: false, openAmount: null, oldestOverdueDays: null, currency: null, error: 'Billing was not read for this snapshot.' });

function billingSources(billing, reconciliation, at) {
  const method = billing.available ? 'STRIPE_INVOICE_AGGREGATE' : 'STRIPE_UNAVAILABLE';
  return [
    { field: 'billing', value: billing, source: 'STRIPE', lastUpdated: at, confidence: billing.available ? 1 : 0, extractionMethod: method },
    { field: 'reconciliation', value: reconciliation, source: 'STRIPE', lastUpdated: at, confidence: reconciliation.delta === null ? 0 : 1, extractionMethod: billing.available ? 'CRM_BILLING_RECONCILIATION' : 'STRIPE_UNAVAILABLE' },
  ];
}

export function captureSnapshot(customer, evaluatedAt, extraState = {}) {
  const billing = extraState.billing || UNAVAILABLE_BILLING;
  const reconciliation = extraState.reconciliation
    || reconcile(billing.available ? customer.current_state?.balance ?? null : null, billing.openAmount);
  const state = { ...customer.current_state, ...extraState, billing, reconciliation, asOf: evaluatedAt };
  const sources = [
    ...(customer.current_sources || []),
    ...billingSources(billing, reconciliation, evaluatedAt),
    { field: 'asOf', value: evaluatedAt, source: 'VOCARE', lastUpdated: evaluatedAt, confidence: 1, extractionMethod: 'INJECTED_CLOCK' },
  ];
  const snapshot = { customerId: customer.id, capturedAt: evaluatedAt, asOf: evaluatedAt, state, sources };
  return { ...snapshot, snapshotHash: sha256(snapshot) };
}

export async function evaluateCustomer(customerId, { evaluatedAt = new Date().toISOString(), policyId = POLICY_ID, pinnedVersion = null, triggeredBy = { kind: 'MANUAL', ref: null }, stateOverrides = {} } = {}) {
  const count = await repo.recentEvaluationCount(customerId, evaluatedAt);
  if (count >= EVALUATIONS_PER_HOUR) {
    const reason = `Circuit breaker: ${count} evaluations in the last hour`;
    console.error(`[DECISION-LAYER] ${customerId} ${reason}`);
    await repo.haltPipeline(customerId, reason);
    throw new Error(reason);
  }
  const customer = (await ledgerPool().query('SELECT * FROM customer WHERE id=$1', [customerId])).rows[0];
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  const policy = resolveVersionAt(policyId, evaluatedAt, pinnedVersion);
  // I1: every network read happens here in the service. The policy only ever
  // sees the frozen snapshot, so evaluate() stays pure and replayable.
  // Billing is read before pricing because a real best-offer comparison is
  // derived from the customer's own invoice history; providers that do not
  // need it ignore the second argument.
  const stripeBilling = await readStripeBilling(customer.external_customer_id);
  const bestOffer = await pricingProvider().findBestOffer(customer.current_state, { billing: stripeBilling });
  const billing = billingSection(stripeBilling);
  const crmArrears = customer.current_state?.balance ?? null;
  const reconciliation = reconcile(billing.available ? crmArrears : null, billing.openAmount);
  const snapshot = captureSnapshot(customer, evaluatedAt, { ...stateOverrides, bestOffer, billing, reconciliation });
  const decisionKey = decisionKeyFor(customerId);
  const inputHash = sha256(inputFor(snapshot.state, policy.metadata.readFields));
  const last = await repo.latestInput(customerId, decisionKey, policyId, policy.metadata.version);
  if (last?.input_hash === inputHash) {
    const interval = await withTransaction((client) => repo.rollupNoChange(client, { customerId, decisionKey, policyId, policyVersion: policy.metadata.version, inputHash, evaluatedAt }));
    return { outcome: 'NO_CHANGE', skipped: true, interval, decisionKey, policyVersion: policy.metadata.version, inputHash };
  }
  const pure = policy.evaluate(snapshot);
  const previous = (await ledgerPool().query('SELECT outcome,policy_version FROM decision WHERE decision_key=$1 ORDER BY created_at DESC LIMIT 1', [decisionKey])).rows[0];
  let outcome = pure.outcome;
  if (previous && previous.outcome !== pure.outcome) outcome = triggeredBy.kind === 'POLICY_CHANGE' ? 'SUPERSEDED_BY_POLICY_CHANGE' : 'PREVIOUS_DECISION_SUPERSEDED';
  const result = await repo.persistEvaluationBundle({ customerId, decisionKey, policyId, policyVersion: policy.metadata.version, snapshot, snapshotHash: snapshot.snapshotHash, inputHash, outcome, reasons: [...pure.reasons, ...(outcome !== pure.outcome ? [{ rule: 'Evaluated result', status: pure.outcome, citation: `${policyId}@${policy.metadata.version}`, explanation: 'The evaluated result is preserved separately from the lineage outcome.' }] : [])], evaluatedAt, triggeredBy });
  if (result.decision && pure.outcome === 'ACTION_REQUIRED') result.action = await repo.createAction(result.decision.id, 'REQUEST_PLAN_SWITCH', 'APPROVAL_REQUIRED');
  return { ...result, outcome, evaluatedOutcome: pure.outcome, policyVersion: policy.metadata.version, snapshotHash: snapshot.snapshotHash, inputHash, decisionKey };
}

export async function ingestEvent(rawEvent, { evaluate = true } = {}) {
  const now = new Date().toISOString();
  const event = { id: rawEvent.id || randomUUID(), correlationId: rawEvent.correlationId || randomUUID(), causationId: rawEvent.causationId || null, receivedAt: rawEvent.receivedAt || now, occurredAt: rawEvent.occurredAt || now, ...rawEvent };
  const customer = (await ledgerPool().query('SELECT * FROM customer WHERE id=$1', [event.customerId])).rows[0];
  if (!customer) throw new Error(`Unknown customer ${event.customerId}`);
  const merged = mergeNormalized({ state: customer.current_state, sources: customer.current_sources }, normalizeOperationalEvent(event));
  if (stableJson(merged.state) === stableJson(customer.current_state)) return { dropped: true, reason: 'NORMALIZED_STATE_UNCHANGED', eventId: event.id };
  await repo.appendEventAndState(event, merged);
  const evaluation = evaluate ? await evaluateCustomer(event.customerId, { evaluatedAt: event.receivedAt, triggeredBy: { kind: 'EVENT', ref: event.id } }) : null;
  return { dropped: false, eventId: event.id, evaluation };
}
