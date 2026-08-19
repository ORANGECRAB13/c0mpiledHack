import { randomUUID } from 'node:crypto';
import { sha256, inputFor, stableJson } from './hash.js';
import { normalizeOperationalEvent, mergeNormalized } from './normalizer.js';
import { pricingProvider } from './pricing.js';
import { resolveVersionAt } from '../policies/index.js';
import { decisionKeyFor } from '../policies/vic.hardship.best-offer/meta.js';
import { ledgerPool, withTransaction } from './db.js';
import * as repo from './repository.js';

const POLICY_ID = 'vic.hardship.best-offer';
const EVALUATIONS_PER_HOUR = Number(process.env.EVALUATIONS_PER_CUSTOMER_HOUR || 25);

export function captureSnapshot(customer, evaluatedAt, extraState = {}) {
  const state = { ...customer.current_state, ...extraState, asOf: evaluatedAt };
  const sources = [...(customer.current_sources || []), { field: 'asOf', value: evaluatedAt, source: 'VOCARE', lastUpdated: evaluatedAt, confidence: 1, extractionMethod: 'INJECTED_CLOCK' }];
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
  const bestOffer = await pricingProvider().findBestOffer(customer.current_state);
  const snapshot = captureSnapshot(customer, evaluatedAt, { ...stateOverrides, bestOffer });
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
