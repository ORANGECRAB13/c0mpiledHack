import { id } from './repository.js';
import { ledgerPool } from './db.js';
import { getPolicy } from '../policies/index.js';
import { captureSnapshot } from './service.js';
import { pricingProvider } from './pricing.js';

function comparable(result) { return { outcome: result.outcome, reasons: result.reasons }; }

export async function runPolicyImpact({ policyId, oldVersion, newVersion, runAt = new Date().toISOString() }) {
  const oldPolicy = getPolicy(policyId, oldVersion);
  const newPolicy = getPolicy(policyId, newVersion);
  const fields = [...new Set([...oldPolicy.metadata.readFields, ...newPolicy.metadata.readFields])];
  const { rows: candidates } = await ledgerPool().query(`SELECT DISTINCT ON (d.customer_id,d.decision_key)
    d.customer_id,d.decision_key,s.state AS old_state,s.sources AS old_sources,c.current_state,c.current_sources,c.id,c.name,c.jurisdiction
    FROM decision d JOIN customer_state_snapshot s ON s.id=d.snapshot_id JOIN customer c ON c.id=d.customer_id
    WHERE d.policy_id=$1 ORDER BY d.customer_id,d.decision_key,d.created_at DESC`, [policyId]);
  const records = [];
  for (const row of candidates) {
    const oldSnapshot = { state: row.old_state, sources: row.old_sources, asOf: row.old_state.asOf };
    const oldUnderOld = oldPolicy.evaluate(oldSnapshot);
    const oldUnderNew = newPolicy.evaluate(oldSnapshot);
    const bestOffer = await pricingProvider().findBestOffer(row.current_state);
    const currentSnapshot = captureSnapshot({ id: row.id, current_state: row.current_state, current_sources: row.current_sources }, runAt, { bestOffer });
    const operational = newPolicy.evaluate(currentSnapshot);
    const policyDelta = { changed: JSON.stringify(comparable(oldUnderOld)) !== JSON.stringify(comparable(oldUnderNew)), before: oldUnderOld.outcome, after: oldUnderNew.outcome };
    const operationalDelta = { changed: oldUnderNew.outcome !== operational.outcome, policyOnly: oldUnderNew.outcome, current: operational.outcome };
    await ledgerPool().query(`INSERT INTO policy_impact_run (id,policy_id,old_version,new_version,run_at,customer_id,decision_key,policy_delta,operational_delta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id(), policyId, oldVersion, newVersion, runAt, row.customer_id, row.decision_key, JSON.stringify(policyDelta), JSON.stringify(operationalDelta)]);
    records.push({ customerId: row.customer_id, decisionKey: row.decision_key, policyDelta, operationalDelta });
  }
  return { policyId, oldVersion, newVersion, readFields: fields, total: records.length, policyChanged: records.filter((r) => r.policyDelta.changed).length, operationalChanged: records.filter((r) => r.operationalDelta.changed).length, records };
}
