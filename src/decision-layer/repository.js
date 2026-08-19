import { randomUUID } from 'node:crypto';
import { withTransaction, ledgerPool } from './db.js';

export const id = () => randomUUID();
const json = (value) => JSON.stringify(value);

export async function upsertCustomer(customer, client = ledgerPool()) {
  const result = await client.query(`
    INSERT INTO customer (id, external_customer_id, name, jurisdiction, current_state, current_sources)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, jurisdiction=EXCLUDED.jurisdiction,
      current_state=EXCLUDED.current_state, current_sources=EXCLUDED.current_sources, updated_at=now()
    RETURNING *`, [customer.id, customer.externalCustomerId || customer.id, customer.name, customer.jurisdiction, json(customer.state || {}), json(customer.sources || [])]);
  return result.rows[0];
}

export async function customerForUpdate(client, customerId) {
  return (await client.query('SELECT * FROM customer WHERE id=$1 FOR UPDATE', [customerId])).rows[0] || null;
}

export async function appendEventAndState(event, normalized) {
  return withTransaction(async (client) => {
    const customer = await customerForUpdate(client, event.customerId);
    if (!customer) throw new Error(`Unknown customer ${event.customerId}`);
    if (customer.pipeline_halted) throw new Error(`Pipeline halted for ${event.customerId}`);
    await client.query(`INSERT INTO event (id,customer_id,type,origin,correlation_id,causation_id,payload,received_at,occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [event.id, event.customerId, event.type, event.origin, event.correlationId, event.causationId, json(event.payload), event.receivedAt, event.occurredAt]);
    await client.query('UPDATE customer SET current_state=$2,current_sources=$3,updated_at=now() WHERE id=$1', [event.customerId, json(normalized.state), json(normalized.sources)]);
    return customer;
  });
}

export async function recentEvaluationCount(customerId, at) {
  const since = new Date(new Date(at).getTime() - 3600_000).toISOString();
  const { rows } = await ledgerPool().query(`SELECT
    (SELECT count(*) FROM evaluation WHERE customer_id=$1 AND evaluated_at >= $2) +
    (SELECT coalesce(sum(count),0) FROM no_change_interval WHERE customer_id=$1 AND last_at >= $2) AS count`, [customerId, since]);
  return Number(rows[0].count);
}

export async function haltPipeline(customerId, reason) {
  await ledgerPool().query(`UPDATE customer SET pipeline_halted=true, current_state=current_state || jsonb_build_object('pipelineHaltReason',$2::text), updated_at=now() WHERE id=$1`, [customerId, reason]);
}

export async function latestInput(customerId, decisionKey, policyId, version, client = ledgerPool()) {
  const { rows } = await client.query(`
    SELECT input_hash, evaluated_at FROM evaluation WHERE customer_id=$1 AND decision_key=$2 AND policy_id=$3 AND policy_version=$4
    UNION ALL SELECT input_hash, last_at FROM no_change_interval WHERE customer_id=$1 AND decision_key=$2 AND policy_id=$3 AND policy_version=$4
    ORDER BY evaluated_at DESC LIMIT 1`, [customerId, decisionKey, policyId, version]);
  return rows[0] || null;
}

export async function rollupNoChange(client, row) {
  const result = await client.query(`INSERT INTO no_change_interval
    (id,customer_id,decision_key,policy_id,policy_version,input_hash,first_at,last_at,count)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$7,1)
    ON CONFLICT (customer_id,decision_key,policy_id,policy_version,input_hash)
    DO UPDATE SET last_at=EXCLUDED.last_at,count=no_change_interval.count+1 RETURNING *`,
  [id(), row.customerId, row.decisionKey, row.policyId, row.policyVersion, row.inputHash, row.evaluatedAt]);
  return result.rows[0];
}

export async function persistEvaluationBundle(bundle) {
  return withTransaction(async (client) => {
    const snapshotId = id();
    await client.query(`INSERT INTO customer_state_snapshot (id,customer_id,captured_at,as_of,state,sources,snapshot_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [snapshotId, bundle.customerId, bundle.evaluatedAt, bundle.snapshot.asOf, json(bundle.snapshot.state), json(bundle.snapshot.sources), bundle.snapshotHash]);
    const evaluationId = id();
    await client.query(`INSERT INTO evaluation (id,customer_id,decision_key,policy_id,policy_version,snapshot_id,snapshot_hash,input_hash,outcome,reasons,evaluated_at,triggered_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [evaluationId, bundle.customerId, bundle.decisionKey, bundle.policyId, bundle.policyVersion, snapshotId, bundle.snapshotHash, bundle.inputHash, bundle.outcome, json(bundle.reasons), bundle.evaluatedAt, json(bundle.triggeredBy)]);
    let decision = null;
    if (bundle.outcome !== 'NO_CHANGE') {
      const previous = (await client.query('SELECT * FROM decision WHERE decision_key=$1 ORDER BY created_at DESC LIMIT 1', [bundle.decisionKey])).rows[0] || null;
      const decisionId = id();
      decision = (await client.query(`INSERT INTO decision (id,decision_key,customer_id,policy_id,policy_version,snapshot_id,snapshot_hash,outcome,evidence,supersedes_decision_id,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [decisionId, bundle.decisionKey, bundle.customerId, bundle.policyId, bundle.policyVersion, snapshotId, bundle.snapshotHash, bundle.outcome, json(bundle.reasons), previous?.id || null, bundle.evaluatedAt])).rows[0];
      if (previous) await client.query('UPDATE decision SET superseded_by_decision_id=$2 WHERE id=$1 AND superseded_by_decision_id IS NULL', [previous.id, decisionId]);
    }
    return { evaluationId, snapshotId, decision };
  });
}

export async function createAction(decisionId, type, executionMode, status = null) {
  const finalStatus = status || (executionMode === 'APPROVAL_REQUIRED' ? 'AWAITING_APPROVAL' : 'PENDING');
  return (await ledgerPool().query('INSERT INTO action (id,decision_id,type,execution_mode,status) VALUES ($1,$2,$3,$4,$5) RETURNING *', [id(), decisionId, type, executionMode, finalStatus])).rows[0];
}

export async function recordApproval(actionId, approval) {
  if (approval.verdict !== 'AGREED' && !String(approval.overrideReason || '').trim()) throw new Error('overrideReason is required when verdict is not AGREED');
  return withTransaction(async (client) => {
    const row = (await client.query('INSERT INTO approval (id,action_id,actor_id,decided_at,verdict,override_reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [id(), actionId, approval.actorId, approval.decidedAt, approval.verdict, approval.overrideReason || null])).rows[0];
    await client.query("UPDATE action SET status=CASE WHEN $2='AGREED' THEN 'PENDING'::action_status ELSE 'DONE'::action_status END WHERE id=$1", [actionId, approval.verdict]);
    return row;
  });
}

export async function scheduleEvaluation(item) {
  return (await ledgerPool().query(`INSERT INTO scheduled_evaluation (id,customer_id,evaluate_at,reason,policy_id,status)
    VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING *`, [id(), item.customerId, item.evaluateAt, item.reason, item.policyId || null])).rows[0];
}

export async function dueSchedules(at) {
  return (await ledgerPool().query("SELECT * FROM scheduled_evaluation WHERE status='PENDING' AND evaluate_at <= $1 ORDER BY evaluate_at", [at])).rows;
}

export async function markScheduleFired(scheduleId) {
  await ledgerPool().query("UPDATE scheduled_evaluation SET status='FIRED' WHERE id=$1 AND status='PENDING'", [scheduleId]);
}
