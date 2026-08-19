import express from 'express';
import { ledgerPool } from './db.js';
import { ingestEvent, evaluateCustomer } from './service.js';
import { recordApproval, scheduleEvaluation } from './repository.js';
import { runSchedulerTick, scheduleTemporalCrossings } from './scheduler.js';
import { runPolicyImpact } from './impact.js';
import { listPolicies } from '../policies/index.js';
import { seedDecisionLayer } from './seed.js';
import { queueSalesforceProjection, runSalesforceProjectionWorker } from './salesforce.js';
import { readSalesforceCustomer } from './salesforce-read.js';

const router = express.Router();
const asyncRoute = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
const send = (res, data) => res.json({ ok: true, ...data });

router.get('/health', asyncRoute(async (_req, res) => {
  const now = await ledgerPool().query('SELECT now() AS now');
  send(res, { ledger: { connected: true, now: now.rows[0].now }, synthetic: true });
}));

router.post('/seed', asyncRoute(async (_req, res) => send(res, { customers: await seedDecisionLayer() })));

router.get('/customers', asyncRoute(async (_req, res) => {
  const { rows } = await ledgerPool().query(`SELECT c.id,c.external_customer_id,c.name,c.jurisdiction,c.current_state,c.pipeline_halted,
    d.outcome,d.policy_version,d.created_at,a.id AS action_id,a.status AS action_status,a.type AS action_type
    FROM customer c LEFT JOIN LATERAL (SELECT * FROM decision WHERE customer_id=c.id ORDER BY created_at DESC LIMIT 1) d ON true
    LEFT JOIN LATERAL (SELECT * FROM action WHERE decision_id=d.id ORDER BY created_at DESC LIMIT 1) a ON true ORDER BY c.name`);
  send(res, { customers: rows.map((row) => ({ id: row.id, externalCustomerId: row.external_customer_id, customer: row.name, state: row.jurisdiction, workflow: 'Hardship & Best Offer', priority: Number(row.current_state.balance || 0) >= 1000 ? 'High' : Number(row.current_state.balance || 0) > 300 ? 'Medium' : 'Low', status: row.action_status || (row.outcome === 'NO_CHANGE' ? 'Monitoring' : 'Ready for review'), action: row.action_type || 'Evaluate current state', policy: row.policy_version ? `vic.hardship.best-offer@${row.policy_version}` : 'Not yet evaluated', pipelineHalted: row.pipeline_halted })) });
}));

router.get('/cases', asyncRoute(async (_req, res) => {
  const result = await ledgerPool().query('SELECT id FROM customer ORDER BY name');
  const cases = await Promise.all(result.rows.map((row) => buildCase(row.id)));
  send(res, { cases });
}));

router.get('/cases/:customerId', asyncRoute(async (req, res) => {
  const value = await buildCase(req.params.customerId);
  if (!value) return res.status(404).json({ ok: false, error: 'Customer not found' });
  send(res, { case: value });
}));

router.post('/events', asyncRoute(async (req, res) => send(res, { result: await ingestEvent(req.body) })));
router.post('/customers/:customerId/evaluate', asyncRoute(async (req, res) => send(res, { result: await evaluateCustomer(req.params.customerId, req.body || {}) })));
router.post('/customers/:customerId/schedule-crossings', asyncRoute(async (req, res) => send(res, { schedules: await scheduleTemporalCrossings(req.params.customerId, req.body?.asOf) })));
router.post('/schedules', asyncRoute(async (req, res) => send(res, { schedule: await scheduleEvaluation(req.body) })));
router.post('/scheduler/tick', asyncRoute(async (req, res) => send(res, { fired: await runSchedulerTick(req.body?.at) })));

router.post('/actions/:actionId/approval', asyncRoute(async (req, res) => {
  if (req.body?.verdict !== 'AGREED' && !String(req.body?.overrideReason || '').trim()) return res.status(422).json({ ok: false, error: 'overrideReason is required when verdict is not AGREED' });
  send(res, { approval: await recordApproval(req.params.actionId, { ...req.body, decidedAt: req.body.decidedAt || new Date().toISOString() }) });
}));

router.get('/audit', asyncRoute(async (_req, res) => {
  const { rows } = await ledgerPool().query(`SELECT d.id,d.decision_key,d.customer_id,c.name,d.policy_id,d.policy_version,d.outcome,d.evidence,d.snapshot_hash,d.created_at,
    a.id action_id,a.type action_type,a.status action_status,ap.actor_id,ap.verdict,ap.override_reason,ap.decided_at
    FROM decision d JOIN customer c ON c.id=d.customer_id LEFT JOIN action a ON a.decision_id=d.id LEFT JOIN approval ap ON ap.action_id=a.id ORDER BY d.created_at DESC`);
  send(res, { records: rows });
}));

router.get('/policies', (_req, res) => send(res, { policies: listPolicies() }));
router.post('/policy-impact', asyncRoute(async (req, res) => send(res, { report: await runPolicyImpact(req.body) })));
router.get('/policy-impact', asyncRoute(async (_req, res) => send(res, { rows: (await ledgerPool().query('SELECT * FROM policy_impact_run ORDER BY run_at DESC')).rows })));
router.post('/salesforce/projections', asyncRoute(async (req, res) => send(res, { jobs: await queueSalesforceProjection(req.body.records || []) })));
router.post('/salesforce/worker', asyncRoute(async (req, res) => send(res, { result: await runSalesforceProjectionWorker(req.body || {}) })));
router.get('/salesforce/customers/:externalCustomerId', asyncRoute(async (req, res) => send(res, { customer: await readSalesforceCustomer(req.params.externalCustomerId) })));

async function buildCase(customerId) {
  const customer = (await ledgerPool().query('SELECT * FROM customer WHERE id=$1', [customerId])).rows[0];
  if (!customer) return null;
  const decision = (await ledgerPool().query(`SELECT d.*,a.id action_id,a.type action_type,a.status action_status FROM decision d LEFT JOIN action a ON a.decision_id=d.id WHERE d.customer_id=$1 ORDER BY d.created_at DESC LIMIT 1`, [customerId])).rows[0];
  const events = (await ledgerPool().query('SELECT * FROM event WHERE customer_id=$1 ORDER BY occurred_at DESC LIMIT 20', [customerId])).rows;
  const snapshot = Object.entries(customer.current_state).filter(([key]) => key !== 'asOf').map(([field, value]) => [field, formatValue(field, value), ['balance','hardshipStatus','sensitiveCustomer'].includes(field) ? 'hot' : null]);
  const sources = customer.current_sources.map((item) => [item.source, `${item.field}: ${formatValue(item.field, item.value)}`, true]);
  const rules = (decision?.evidence || []).map((item) => [item.rule, item.status, ['APPLIES','AVAILABLE','REQUIRED'].includes(item.status) ? 'req' : 'ok', `${item.explanation} · ${item.citation}`]);
  return {
    id: customer.id, customer: customer.name, meta: `${customer.external_customer_id} · ${customer.jurisdiction} · Synthetic`, workflow: 'Hardship & Best Offer', stateLabel: `${customer.jurisdiction} Residential`,
    recommendation: decision?.action_type === 'REQUEST_PLAN_SWITCH' ? 'Switch to the best available offer' : 'Review current hardship position', recommendationSummary: decision ? `Latest deterministic outcome: ${decision.outcome}.` : 'Run the first evaluation to create a regulator-grade evidence snapshot.', confidence: 'Evidence-backed', policyVersion: decision ? `${decision.policy_id}@${decision.policy_version}` : 'Not evaluated',
    snapshot, events: events.map((event) => [new Date(event.occurred_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), `${event.type} · ${event.origin}`]), sources,
    rules, context: decision?.evidence?.map((item) => item.explanation) || [], readiness: [['Decision readiness', decision ? 'High' : 'Not evaluated'], ['Evidence completeness', `${sources.length} sources`], ['Human review', 'Required']],
    missing: decision ? [] : ['Initial deterministic evaluation has not run'], actions: [[decision?.action_type || 'Run evaluation', true]], approvalEffects: ['Record the accountable officer', 'Freeze evidence and policy version', 'Queue the approved operational action'],
    action: decision?.action_type || 'Evaluate customer', actionId: decision?.action_id || null, actionStatus: decision?.action_status || null, decisionId: decision?.id || null, snapshotHash: decision?.snapshot_hash || null,
    outcome: decision?.outcome || 'Evaluation pending', evidenceCompletion: `${sources.length} sources`, sourceQuery: rules[0]?.[3] || 'Energy Retail Code of Practice v7 clauses 76–79',
    synthetic: true, pipelineHalted: customer.pipeline_halted
  };
}

function formatValue(field, value) {
  if (field === 'balance') return `$${Number(value || 0).toFixed(2)} arrears`;
  if (field === 'oldestDebtDays') return `${value} days`;
  if (Array.isArray(value)) return value.join(', ') || 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value ?? 'Not recorded';
}

export default router;
