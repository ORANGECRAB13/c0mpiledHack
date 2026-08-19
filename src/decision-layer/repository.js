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
      if (previous) {
        await client.query('UPDATE decision SET superseded_by_decision_id=$2 WHERE id=$1 AND superseded_by_decision_id IS NULL', [previous.id, decisionId]);
        // Withdraw the superseded decision's un-actioned request. Without this
        // it stays in the approval queue, and a bulk approve would execute a
        // plan switch justified by evidence this evaluation has just replaced.
        // Only untouched requests are retired — anything already approved,
        // rejected or executing is left exactly as it is.
        await client.query(
          "UPDATE action SET status='SUPERSEDED' WHERE decision_id=$1 AND status IN ('AWAITING_APPROVAL','PENDING')",
          [previous.id],
        );
      }
    }
    return { evaluationId, snapshotId, decision };
  });
}

export async function createAction(decisionId, type, executionMode, status = null) {
  const finalStatus = status || (executionMode === 'APPROVAL_REQUIRED' ? 'AWAITING_APPROVAL' : 'PENDING');
  return (await ledgerPool().query('INSERT INTO action (id,decision_id,type,execution_mode,status) VALUES ($1,$2,$3,$4,$5) RETURNING *', [id(), decisionId, type, executionMode, finalStatus])).rows[0];
}

/**
 * Verdict → resulting action status.
 *
 * Migration 002 fixed the pre-existing oddity where every non-AGREED verdict
 * marked the action DONE, so a REJECTED regulatory decision looked completed.
 *   AGREED     → PENDING  (approved; queued for execution)
 *   OVERRIDDEN → DONE     (officer closed it out without executing — unchanged)
 *   REJECTED   → REJECTED (new terminal state)
 */
export const STATUS_FOR_VERDICT = Object.freeze({ AGREED: 'PENDING', OVERRIDDEN: 'DONE', REJECTED: 'REJECTED' });
export const statusForVerdict = (verdict) => STATUS_FOR_VERDICT[verdict] || 'DONE';

export function assertApprovalRule(approval) {
  if (!STATUS_FOR_VERDICT[approval?.verdict]) throw new Error(`Unknown verdict ${approval?.verdict}`);
  if (!String(approval.actorId || '').trim()) throw new Error('actorId is required on every approval');
  if (approval.verdict !== 'AGREED' && !String(approval.overrideReason || '').trim()) throw new Error('overrideReason is required when verdict is not AGREED');
}

/**
 * I5: append-only. This INSERTs an approval row; it never rewrites the
 * decision or any prior approval. The only UPDATE is the action's own
 * workflow status, which is operational state, not history.
 */
async function insertApproval(client, actionId, approval) {
  assertApprovalRule(approval);
  const row = (await client.query('INSERT INTO approval (id,action_id,actor_id,decided_at,verdict,override_reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id(), actionId, approval.actorId, approval.decidedAt, approval.verdict, approval.overrideReason || null])).rows[0];
  await client.query('UPDATE action SET status=$2::action_status WHERE id=$1', [actionId, statusForVerdict(approval.verdict)]);
  return row;
}

export async function recordApproval(actionId, approval) {
  return withTransaction((client) => insertApproval(client, actionId, approval));
}

/**
 * Bulk approval. One transaction for the whole batch (I5-safe: N appended
 * approval rows, zero history rewrites). Any failure rolls the batch back so
 * the ledger never holds a half-approved state.
 *
 * @param {Array<{actionId:string, verdict:string, overrideReason?:string}>} items
 * @param {{actorId:string, decidedAt:string}} common
 */
export async function recordApprovalBatch(items, common) {
  return withTransaction(async (client) => {
    const approvals = [];
    for (const item of items) {
      const approval = { actorId: common.actorId, decidedAt: common.decidedAt, verdict: item.verdict, overrideReason: item.overrideReason };
      const locked = (await client.query('SELECT id,status FROM action WHERE id=$1 FOR UPDATE', [item.actionId])).rows[0];
      if (!locked) throw new Error(`Unknown action ${item.actionId}`);
      if (locked.status !== 'AWAITING_APPROVAL') throw new Error(`Action ${item.actionId} is ${locked.status}, not AWAITING_APPROVAL`);
      const row = await insertApproval(client, item.actionId, approval);
      approvals.push({ actionId: item.actionId, approvalId: row.id, verdict: row.verdict, status: statusForVerdict(row.verdict) });
    }
    return approvals;
  });
}

/** The approval worklist. Paginated — there is no unbounded variant on purpose. */
export async function listActionsAwaitingApproval({ limit = 50, offset = 0, status = 'AWAITING_APPROVAL' } = {}) {
  const { rows } = await ledgerPool().query(`
    SELECT a.id AS action_id, a.type AS action_type, a.status AS action_status, a.execution_mode, a.created_at,
           d.id AS decision_id, d.decision_key, d.outcome, d.policy_id, d.policy_version, d.snapshot_hash,
           c.id AS customer_id, c.external_customer_id, c.name, c.jurisdiction, c.pipeline_halted,
           c.current_state->>'balance' AS balance, c.current_state->>'hardshipStatus' AS hardship_status,
           (c.current_state->>'sensitiveCustomer')::boolean AS sensitive_customer,
           count(*) OVER () AS total
    FROM action a
    JOIN decision d ON d.id = a.decision_id
    JOIN customer c ON c.id = d.customer_id
    WHERE a.status = $1::action_status
      -- Belt and braces: even if an action were somehow left open against a
      -- superseded decision, it must never be offered for approval.
      AND d.superseded_by_decision_id IS NULL
    ORDER BY a.created_at, a.id
    LIMIT $2 OFFSET $3`, [status, limit, offset]);
  return { total: rows[0] ? Number(rows[0].total) : 0, rows };
}

/**
 * Clear a circuit-breaker halt. `haltPipeline` sets pipeline_halted permanently
 * and nothing else in the codebase clears it, so a bulk run could otherwise
 * brick the whole book. This is the recovery path.
 */
export async function resumePipeline(customerId, { actorId = null, reason = null } = {}) {
  const { rows } = await ledgerPool().query(`
    UPDATE customer
       SET pipeline_halted = false,
           current_state = (current_state - 'pipelineHaltReason')
             || jsonb_build_object('pipelineResumedAt', now()::text, 'pipelineResumedBy', $2::text, 'pipelineResumeReason', $3::text),
           updated_at = now()
     WHERE id = $1
     RETURNING id, pipeline_halted`, [customerId, actorId, reason]);
  return rows[0] || null;
}

export async function listHaltedCustomers() {
  const { rows } = await ledgerPool().query(
    "SELECT id, name, current_state->>'pipelineHaltReason' AS reason FROM customer WHERE pipeline_halted ORDER BY name");
  return rows;
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
