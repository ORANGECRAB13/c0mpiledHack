import express from 'express';
import { ledgerPool } from './db.js';
import { ingestEvent, evaluateCustomer } from './service.js';
import {
  recordApproval, scheduleEvaluation, recordApprovalBatch, listActionsAwaitingApproval,
  resumePipeline, listHaltedCustomers, assertApprovalRule,
} from './repository.js';
import { runSchedulerTick, scheduleTemporalCrossings } from './scheduler.js';
import { runPolicyImpact } from './impact.js';
import { listPolicies } from '../policies/index.js';
import { seedDecisionLayer } from './seed.js';
import { queueSalesforceProjection, runSalesforceProjectionWorker } from './salesforce.js';
import { readSalesforceCustomer } from './salesforce-read.js';
import { buildCustomerProfile } from './profile.js';
import { syncFromSalesforce } from './sync.js';
import { readStripeBilling, stripeConfigured } from './stripe-read.js';
import { salesforceAuth } from './salesforce-auth.js';

const router = express.Router();
const asyncRoute = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
const send = (res, data) => res.json({ ok: true, ...data });

router.get('/health', asyncRoute(async (_req, res) => {
  const now = await ledgerPool().query('SELECT now() AS now');
  send(res, { ledger: { connected: true, now: now.rows[0].now }, synthetic: true });
}));

router.post('/seed', asyncRoute(async (_req, res) => send(res, { customers: await seedDecisionLayer() })));

router.get('/customers', asyncRoute(async (_req, res) => {
  // The queue is the live Salesforce book. Status comes from the latest
  // *evaluation* (every customer has one) rather than the latest decision —
  // a NO_CHANGE evaluation writes no decision row, and reading only decisions
  // made settled customers look as though they had never been assessed.
  const { rows } = await ledgerPool().query(`SELECT c.id,c.external_customer_id,c.name,c.jurisdiction,c.current_state,c.pipeline_halted,
    e.outcome AS evaluation_outcome, e.policy_id, e.policy_version, e.evaluated_at,
    d.outcome,a.id AS action_id,a.status AS action_status,a.type AS action_type
    FROM customer c
    LEFT JOIN LATERAL (SELECT * FROM evaluation WHERE customer_id=c.id ORDER BY evaluated_at DESC LIMIT 1) e ON true
    LEFT JOIN LATERAL (SELECT * FROM decision WHERE customer_id=c.id ORDER BY created_at DESC LIMIT 1) d ON true
    LEFT JOIN LATERAL (SELECT * FROM action WHERE decision_id=d.id ORDER BY created_at DESC LIMIT 1) a ON true
    ORDER BY c.name`);
  send(res, { customers: rows.map((row) => ({
    id: row.id,
    externalCustomerId: row.external_customer_id,
    customer: row.name,
    state: row.jurisdiction,
    team: teamFor(row.current_state),
    workflow: 'Hardship & Best Offer',
    priority: priorityFor(row.current_state),
    status: queueStatus(row),
    action: row.action_type === 'REQUEST_PLAN_SWITCH' ? 'Approve switch to the best available offer' : (row.action_type || 'No action required'),
    actionId: row.action_id || null,
    outcome: row.evaluation_outcome || null,
    policy: row.policy_version ? `${row.policy_id}@${row.policy_version}` : 'Not yet evaluated',
    evaluatedAt: row.evaluated_at || null,
    balance: Number(row.current_state.balance || 0),
    oldestDebtDays: Number(row.current_state.oldestDebtDays || 0),
    hardshipStatus: row.current_state.hardshipStatus || 'NONE',
    sensitiveCustomer: Boolean(row.current_state.sensitiveCustomer),
    pipelineHalted: row.pipeline_halted,
  })) });
}));

// `buildCase` costs 4 queries per customer, so this is now paginated. Callers
// that pass no paging get the historical full-book behaviour (`page.limit` is
// null) — nothing already built against it breaks — but the UI should page.
router.get('/cases', asyncRoute(async (req, res) => {
  const paged = req.query.limit !== undefined || req.query.offset !== undefined;
  const { limit, offset } = pageParams(req.query, { limit: 25, max: 200 });
  const total = Number((await ledgerPool().query('SELECT count(*)::int AS n FROM customer')).rows[0].n);
  const sql = paged
    ? 'SELECT id FROM customer ORDER BY name LIMIT $1 OFFSET $2'
    : 'SELECT id FROM customer ORDER BY name';
  const result = await ledgerPool().query(sql, paged ? [limit, offset] : []);
  const cases = await Promise.all(result.rows.map((row) => buildCase(row.id)));
  send(res, { cases, page: { limit: paged ? limit : null, offset: paged ? offset : 0, total, returned: cases.length } });
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

// ---------------------------------------------------------------------------
// Bulk review + bulk approval
// ---------------------------------------------------------------------------

/**
 * Category taxonomy for the "review all" results screen.
 *
 * Every category is derived from a REAL evaluated outcome plus the customer's
 * REAL Salesforce state. Nothing here is inferred to make a tab look populated.
 *
 * I4: NO_CHANGE is `actionable: false`. It is returned as its own explicitly
 * laboured category so the UI can show the count, and it must never be merged
 * into the work queue.
 */
export const CATEGORIES = Object.freeze({
  ACTION_REQUIRED: { key: 'ACTION_REQUIRED', label: 'Action required', actionable: true },
  INSUFFICIENT_EVIDENCE: { key: 'INSUFFICIENT_EVIDENCE', label: 'Insufficient evidence', actionable: true },
  SENSITIVE_CUSTOMER: { key: 'SENSITIVE_CUSTOMER', label: 'Sensitive customer', actionable: false },
  OPTED_OUT: { key: 'OPTED_OUT', label: 'Opted out', actionable: false },
  ON_TAILORED_ASSISTANCE: { key: 'ON_TAILORED_ASSISTANCE', label: 'On tailored assistance', actionable: false },
  NO_CHANGE: { key: 'NO_CHANGE', label: 'No change', actionable: false },
  NOT_EVALUATED: { key: 'NOT_EVALUATED', label: 'Not evaluated', actionable: false },
});

/**
 * @param state    the customer's current Salesforce-derived state
 * @param outcome  the evaluated outcome (pure policy result, NOT the lineage
 *                 outcome — SUPERSEDED_* says how history moved, not what the
 *                 policy concluded)
 * @param opts.hasOpenAction true when an action is awaiting approval / pending
 */
export function categorize(state = {}, outcome = null, { hasOpenAction = false } = {}) {
  const sensitive = Boolean(state.sensitiveCustomer);
  const optedOut = Boolean(state.bestOfferOptOut);
  const tailored = ['TAILORED_ASSISTANCE', 'PAYMENT_DIFFICULTY'].includes(state.hardshipStatus);
  const flags = [sensitive && 'SENSITIVE', optedOut && 'OPTED_OUT', tailored && 'TAILORED_ASSISTANCE'].filter(Boolean);

  let key;
  if (outcome === 'ACTION_REQUIRED' || hasOpenAction) key = 'ACTION_REQUIRED';
  else if (!outcome) key = 'NOT_EVALUATED';
  else if (outcome === 'INSUFFICIENT_EVIDENCE') key = 'INSUFFICIENT_EVIDENCE';
  else if (sensitive) key = 'SENSITIVE_CUSTOMER';
  else if (optedOut) key = 'OPTED_OUT';
  else if (tailored) key = 'ON_TAILORED_ASSISTANCE';
  else if (outcome === 'NO_CHANGE') key = 'NO_CHANGE';
  else key = 'NOT_EVALUATED';

  return { ...CATEGORIES[key], flags };
}

const emptyCategoryCounts = () => Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, 0]));

function pageParams(query = {}, { limit: fallback = 50, max = 500 } = {}) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? fallback, 10) || fallback, 1), max);
  const offset = Math.max(Number.parseInt(query.offset ?? 0, 10) || 0, 0);
  return { limit, offset };
}

/** Bounded worker pool. Never fires the whole book at once. */
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let stop = false;
  const runner = async () => {
    while (!stop) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index, () => { stop = true; });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, runner));
  return { results: results.filter((value) => value !== undefined), aborted: stop };
}

/**
 * POST /review-all — evaluate the book.
 *
 * Circuit-breaker safety. `evaluateCustomer` halts a customer's pipeline
 * permanently when the breaker trips, and nothing else in the system clears
 * that flag. A 151-customer run is exactly what trips it, so:
 *   - customers already halted are SKIPPED (not re-run into a deeper hole)
 *     unless `resume: true`, which clears the halt first;
 *   - a trip during the run is auto-resumed (`keepHalts: true` opts out) and
 *     reported under `circuitBreaker`;
 *   - `maxBreakerTrips` consecutive-book trips abort the run instead of
 *     silently bricking every remaining customer.
 */
router.post('/review-all', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const { limit, offset } = pageParams(body, { limit: 200, max: 1000 });
  const concurrency = Math.min(Math.max(Number.parseInt(body.concurrency ?? 4, 10) || 4, 1), 8);
  const resume = Boolean(body.resume);
  const keepHalts = Boolean(body.keepHalts);
  const maxBreakerTrips = Math.max(Number.parseInt(body.maxBreakerTrips ?? 5, 10) || 5, 1);
  const actorId = String(body.actorId || '').trim() || null;
  const startedAt = new Date().toISOString();

  const total = Number((await ledgerPool().query('SELECT count(*)::int AS n FROM customer')).rows[0].n);
  const selection = Array.isArray(body.customerIds) && body.customerIds.length
    ? await ledgerPool().query('SELECT id,name,current_state,pipeline_halted FROM customer WHERE id = ANY($1) ORDER BY name', [body.customerIds])
    : await ledgerPool().query('SELECT id,name,current_state,pipeline_halted FROM customer ORDER BY name LIMIT $1 OFFSET $2', [limit, offset]);

  const resumedBefore = [];
  for (const row of selection.rows) {
    if (row.pipeline_halted && resume) {
      await resumePipeline(row.id, { actorId, reason: 'Cleared by review-all (resume: true)' });
      row.pipeline_halted = false;
      resumedBefore.push({ customerId: row.id, name: row.name });
    }
  }

  const results = [];
  const failures = [];
  const skipped = [];
  const tripped = [];
  const autoResumed = [];
  const stillHalted = [];

  const { aborted } = await mapWithConcurrency(selection.rows, concurrency, async (row, _index, abort) => {
    if (row.pipeline_halted) {
      skipped.push({ customerId: row.id, name: row.name, reason: 'PIPELINE_HALTED', hint: 'POST /customers/:id/resume, or re-run with { "resume": true }' });
      return null;
    }
    try {
      const result = await evaluateCustomer(row.id, { triggeredBy: { kind: 'BULK_REVIEW', ref: actorId || 'review-all' } });
      const outcome = result.evaluatedOutcome || result.outcome;
      const category = categorize(row.current_state, outcome, { hasOpenAction: Boolean(result.action) });
      results.push({
        customerId: row.id,
        name: row.name,
        outcome,
        lineageOutcome: result.outcome,
        skipped: Boolean(result.skipped),
        decisionId: result.decision?.id || null,
        actionId: result.action?.id || null,
        actionStatus: result.action?.status || null,
        snapshotHash: result.snapshotHash || null,
        policyVersion: result.policyVersion || null,
        category: category.key,
        categoryLabel: category.label,
        actionable: category.actionable,
        flags: category.flags,
      });
      return null;
    } catch (error) {
      const breaker = /Circuit breaker/i.test(error.message);
      let recovered = false;
      if (breaker) {
        tripped.push({ customerId: row.id, name: row.name, error: error.message });
        if (!keepHalts) {
          await resumePipeline(row.id, { actorId, reason: 'Auto-resume after circuit-breaker trip during review-all' });
          autoResumed.push(row.id);
          recovered = true;
        } else {
          stillHalted.push(row.id);
        }
        if (tripped.length >= maxBreakerTrips) abort();
      }
      failures.push({ customerId: row.id, name: row.name, error: error.message, circuitBreaker: breaker, autoResumed: recovered });
      return null;
    }
  });

  const categories = emptyCategoryCounts();
  for (const item of results) categories[item.category] += 1;
  const finishedAt = new Date().toISOString();

  send(res, {
    run: {
      startedAt, finishedAt, durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      requested: selection.rows.length, evaluated: results.length, failed: failures.length, skipped: skipped.length,
      concurrency, aborted, abortReason: aborted ? `Circuit breaker tripped ${tripped.length} times (maxBreakerTrips=${maxBreakerTrips})` : null,
      actorId,
      page: { limit, offset, total },
    },
    categories,
    // I4: actionable work never includes NO_CHANGE.
    actionableCount: results.filter((item) => item.actionable).length,
    results,
    failures,
    skipped,
    circuitBreaker: { tripped, autoResumed, stillHalted, resumedBeforeRun: resumedBefore },
  });
}));

/**
 * GET /review-summary — the tab counts, read straight from the ledger without
 * re-evaluating anything. Cheap: one query for the whole book.
 */
router.get('/review-summary', asyncRoute(async (req, res) => {
  const { limit, offset } = pageParams(req.query, { limit: 200, max: 1000 });
  const includeCustomers = req.query.includeCustomers !== 'false';
  const { rows } = await ledgerPool().query(`
    SELECT c.id, c.name, c.external_customer_id, c.jurisdiction, c.current_state, c.pipeline_halted,
           e.outcome AS evaluation_outcome, e.evaluated_at, e.policy_id, e.policy_version,
           d.id AS decision_id, d.outcome AS decision_outcome,
           a.id AS action_id, a.type AS action_type, a.status AS action_status,
           count(*) OVER () AS total
      FROM customer c
      LEFT JOIN LATERAL (SELECT * FROM evaluation WHERE customer_id=c.id ORDER BY evaluated_at DESC LIMIT 1) e ON true
      LEFT JOIN LATERAL (SELECT * FROM decision WHERE customer_id=c.id ORDER BY created_at DESC LIMIT 1) d ON true
      LEFT JOIN LATERAL (SELECT * FROM action WHERE decision_id=d.id ORDER BY created_at DESC LIMIT 1) a ON true
     ORDER BY c.name LIMIT $1 OFFSET $2`, [limit, offset]);

  const categories = emptyCategoryCounts();
  const customers = [];
  for (const row of rows) {
    const hasOpenAction = ['AWAITING_APPROVAL', 'PENDING', 'EXECUTING'].includes(row.action_status);
    // Lineage outcomes describe how history moved, not what the policy found;
    // fall back to the decision outcome only when it is a real policy verdict.
    const lineage = ['PREVIOUS_DECISION_SUPERSEDED', 'SUPERSEDED_BY_POLICY_CHANGE'].includes(row.evaluation_outcome);
    const outcome = lineage ? (hasOpenAction ? 'ACTION_REQUIRED' : null) : row.evaluation_outcome;
    const category = categorize(row.current_state, outcome, { hasOpenAction });
    categories[category.key] += 1;
    if (includeCustomers) {
      customers.push({
        customerId: row.id, externalCustomerId: row.external_customer_id, name: row.name, jurisdiction: row.jurisdiction,
        category: category.key, categoryLabel: category.label, actionable: category.actionable, flags: category.flags,
        outcome: row.evaluation_outcome || null, evaluatedAt: row.evaluated_at || null,
        policy: row.policy_version ? `${row.policy_id}@${row.policy_version}` : null,
        decisionId: row.decision_id || null, actionId: row.action_id || null, actionType: row.action_type || null,
        actionStatus: row.action_status || null, pipelineHalted: row.pipeline_halted,
        balance: row.current_state?.balance ?? null, hardshipStatus: row.current_state?.hardshipStatus ?? null,
      });
    }
  }

  send(res, {
    summary: {
      categories,
      tabs: Object.values(CATEGORIES).map((cat) => ({ ...cat, count: categories[cat.key] })),
      actionableCount: Object.values(CATEGORIES).filter((c) => c.actionable).reduce((sum, c) => sum + categories[c.key], 0),
      page: { limit, offset, total: rows[0] ? Number(rows[0].total) : 0, returned: rows.length },
    },
    customers,
  });
}));

/** GET /actions/awaiting-approval — the bulk-approval worklist, paginated. */
router.get('/actions/awaiting-approval', asyncRoute(async (req, res) => {
  const { limit, offset } = pageParams(req.query, { limit: 50, max: 200 });
  const { total, rows } = await listActionsAwaitingApproval({ limit, offset });
  send(res, {
    actions: rows.map((row) => ({
      actionId: row.action_id, actionType: row.action_type, actionStatus: row.action_status, executionMode: row.execution_mode, createdAt: row.created_at,
      decisionId: row.decision_id, decisionKey: row.decision_key, outcome: row.outcome, snapshotHash: row.snapshot_hash,
      policy: `${row.policy_id}@${row.policy_version}`,
      customerId: row.customer_id, externalCustomerId: row.external_customer_id, customer: row.name, jurisdiction: row.jurisdiction,
      balance: row.balance === null ? null : Number(row.balance), hardshipStatus: row.hardship_status,
      sensitiveCustomer: Boolean(row.sensitive_customer), pipelineHalted: row.pipeline_halted,
    })),
    page: { limit, offset, total, returned: rows.length },
  });
}));

/**
 * POST /actions/approvals — bulk approval.
 *
 * The approval rule is enforced here, PER ITEM, before anything is written:
 * `overrideReason` is required whenever `verdict != AGREED`. There is no
 * blanket verdict; `defaultVerdict` only fills items that omit one, and an
 * item that ends up non-AGREED without a reason rejects the WHOLE request
 * (422) rather than being dropped. The DB check constraint
 * `override_reason_required` remains the backstop and is untouched.
 *
 * I5: this appends one approval row per item inside a single transaction. No
 * decision is ever rewritten.
 */
router.post('/actions/approvals', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const actorId = String(body.actorId || '').trim();
  if (!actorId) return res.status(422).json({ ok: false, error: 'actorId is required — every approval row records the accountable officer' });
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || !items.length) return res.status(422).json({ ok: false, error: 'items[] is required and must contain at least one { actionId, verdict } entry' });
  if (items.length > 500) return res.status(422).json({ ok: false, error: 'items[] is capped at 500 per request' });

  const decidedAt = body.decidedAt || new Date().toISOString();
  const normalized = items.map((item, index) => ({
    index,
    actionId: item?.actionId,
    verdict: item?.verdict || body.defaultVerdict || null,
    overrideReason: item?.overrideReason ?? null,
  }));

  const violations = [];
  const seen = new Set();
  for (const item of normalized) {
    if (!item.actionId) { violations.push({ index: item.index, actionId: null, error: 'actionId is required' }); continue; }
    if (seen.has(item.actionId)) { violations.push({ index: item.index, actionId: item.actionId, error: 'duplicate actionId in the same batch' }); continue; }
    seen.add(item.actionId);
    try { assertApprovalRule({ ...item, actorId }); } catch (error) { violations.push({ index: item.index, actionId: item.actionId, error: error.message }); }
  }
  if (violations.length) {
    return res.status(422).json({ ok: false, error: 'Approval rule violated; nothing was written', violations, approved: 0 });
  }

  try {
    const approvals = await recordApprovalBatch(normalized.map(({ actionId, verdict, overrideReason }) => ({ actionId, verdict, overrideReason })), { actorId, decidedAt });
    send(res, {
      batch: {
        actorId, decidedAt, requested: normalized.length, approved: approvals.length, failed: 0,
        byVerdict: approvals.reduce((acc, a) => ({ ...acc, [a.verdict]: (acc[a.verdict] || 0) + 1 }), {}),
      },
      approvals,
      failures: [],
    });
  } catch (error) {
    // Single transaction: a partial failure wrote nothing.
    res.status(409).json({ ok: false, error: error.message, approved: 0, rolledBack: true, failures: [{ error: error.message }] });
  }
}));

/** POST /customers/:customerId/resume — clear a circuit-breaker halt. */
router.post('/customers/:customerId/resume', asyncRoute(async (req, res) => {
  const actorId = String(req.body?.actorId || '').trim();
  if (!actorId) return res.status(422).json({ ok: false, error: 'actorId is required' });
  const row = await resumePipeline(req.params.customerId, { actorId, reason: req.body?.reason || 'Manual resume' });
  if (!row) return res.status(404).json({ ok: false, error: 'Customer not found' });
  send(res, { customer: { customerId: row.id, pipelineHalted: row.pipeline_halted } });
}));

/** GET /customers/halted — who the breaker has bricked. */
router.get('/customers/halted', asyncRoute(async (_req, res) => send(res, { customers: (await listHaltedCustomers()).map((row) => ({ customerId: row.id, name: row.name, reason: row.reason })) })));

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
// Reload the ledger from the live Salesforce book. This is what makes the
// queue real: every customer shown is an Account that exists in the org.
router.post('/salesforce/sync', asyncRoute(async (req, res) => send(res, { sync: await syncFromSalesforce(req.body || {}) })));

// Salesforce (CRM) and Stripe (billing) for one customer, plus whether the two
// systems agree about the debt. Accepts a ledger id or External_Customer_Id__c.
router.get('/customers/:reference/profile', asyncRoute(async (req, res) => send(res, { profile: await buildCustomerProfile(req.params.reference) })));
router.get('/customers/:reference/billing', asyncRoute(async (req, res) => send(res, { billing: await readStripeBilling(req.params.reference) })));

// Which upstream systems this deployment can actually read, so the UI can say
// "billing unavailable" instead of rendering a fabricated zero.
router.get('/integrations', asyncRoute(async (_req, res) => {
  let salesforce = { configured: false, error: null, via: null, instance: null };
  try {
    const auth = await salesforceAuth();
    salesforce = { configured: true, error: null, via: auth.via, instance: new URL(auth.instanceUrl).host };
  } catch (error) {
    salesforce = { configured: false, error: error.message, via: null, instance: null };
  }
  const { rows } = await ledgerPool().query('SELECT count(*)::int AS customers FROM customer');
  send(res, {
    integrations: {
      salesforce,
      stripe: { configured: stripeConfigured(), mode: (process.env.STRIPE_API_KEY || '').startsWith('sk_test') ? 'test' : 'unknown' },
      ledger: { customers: rows[0].customers },
      // No real pricing/tariff source exists in this repo yet — the best-offer
      // figures come from MockBestOfferProvider and are NOT real market offers.
      pricing: { configured: false, provider: (process.env.PRICING_PROVIDER || 'mock').toLowerCase(), note: 'No tariff/pricing API is wired; best-offer savings are placeholder values.' },
    },
  });
}));

router.get('/salesforce/customers/:externalCustomerId', asyncRoute(async (req, res) => send(res, { customer: await readSalesforceCustomer(req.params.externalCustomerId) })));

async function buildCase(customerId) {
  const customer = (await ledgerPool().query('SELECT * FROM customer WHERE id=$1', [customerId])).rows[0];
  if (!customer) return null;
  const decision = (await ledgerPool().query(`SELECT d.*,a.id action_id,a.type action_type,a.status action_status FROM decision d LEFT JOIN action a ON a.decision_id=d.id WHERE d.customer_id=$1 ORDER BY d.created_at DESC LIMIT 1`, [customerId])).rows[0];
  const events = (await ledgerPool().query('SELECT * FROM event WHERE customer_id=$1 ORDER BY occurred_at DESC LIMIT 20', [customerId])).rows;
  const snapshot = Object.entries(customer.current_state).filter(([key]) => key !== 'asOf').map(([field, value]) => [field, formatValue(field, value), ['balance','hardshipStatus','sensitiveCustomer'].includes(field) ? 'hot' : null]);
  const sources = customer.current_sources.map((item) => [item.source, `${item.field}: ${formatValue(item.field, item.value)}`, true]);
  const rules = (decision?.evidence || []).map((item) => {
    const severity = severityFor(item.status);
    return [item.rule, item.status, severity === 'PASS' || severity === 'INFO' ? 'ok' : 'req', `${item.explanation} · ${item.citation}`, severity];
  });
  // The full reason objects, unflattened: penaltyProvision (Schedule 1 civil
  // penalty exposure) and the high-debt threshold provenance would otherwise be
  // dropped by the four-tuple shape above.
  const evidence = (decision?.evidence || []).map((item) => ({
    rule: item.rule, status: item.status, severity: severityFor(item.status), citation: item.citation,
    explanation: item.explanation, penaltyProvision: item.penaltyProvision ?? null,
    thresholdValue: item.thresholdValue ?? null, thresholdSource: item.thresholdSource ?? null,
    thresholdSupersededByGuideline: item.thresholdSupersededByGuideline ?? null,
    assessmentBasis: item.assessmentBasis ?? null, ageUnit: item.ageUnit ?? null, delta: item.delta ?? null,
  }));
  return {
    id: customer.id, externalCustomerId: customer.external_customer_id, customer: customer.name, team: teamFor(customer.current_state), meta: `${customer.external_customer_id} · ${customer.jurisdiction} · Salesforce`, workflow: 'Hardship & Best Offer', stateLabel: `${customer.jurisdiction} Residential`,
    recommendation: decision?.action_type === 'REQUEST_PLAN_SWITCH' ? 'Switch to the best available offer' : 'Review current hardship position', recommendationSummary: decision ? `Latest deterministic outcome: ${decision.outcome}.` : 'Run the first evaluation to create a regulator-grade evidence snapshot.', confidence: 'Evidence-backed', policyVersion: decision ? `${decision.policy_id}@${decision.policy_version}` : 'Not evaluated',
    snapshot, events: events.map((event) => [new Date(event.occurred_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), `${event.type} · ${event.origin}`]), sources,
    rules, evidence, penaltyExposure: [...new Set(evidence.map((item) => item.penaltyProvision).filter(Boolean))],
    blockingEvidence: evidence.filter((item) => item.severity === 'BLOCKING').map((item) => item.rule),
    context: decision?.evidence?.map((item) => item.explanation) || [], readiness: [['Decision readiness', decision ? 'High' : 'Not evaluated'], ['Evidence completeness', `${sources.length} sources`], ['Human review', 'Required']],
    missing: decision ? [] : ['Initial deterministic evaluation has not run'], actions: [[decision?.action_type || 'Run evaluation', true]], approvalEffects: ['Record the accountable officer', 'Freeze evidence and policy version', 'Queue the approved operational action'],
    action: decision?.action_type || 'Evaluate customer', actionId: decision?.action_id || null, actionStatus: decision?.action_status || null, decisionId: decision?.id || null, snapshotHash: decision?.snapshot_hash || null,
    outcome: decision?.outcome || 'Evaluation pending', evidenceCompletion: `${sources.length} sources`, sourceQuery: rules[0]?.[3] || 'Energy Retail Code of Practice — Division 2A (cl 132A–132G) and cl 187(2)',
    synthetic: true, pipelineHalted: customer.pipeline_halted
  };
}

/**
 * Reason status → display severity.
 *
 * The old mapping listed three "attention" statuses and let everything else
 * fall through to a passing tone. The policy now emits conflict, unverified
 * and insufficient-evidence statuses, and rendering those as a green tick is
 * actively misleading. So the default is ATTENTION, never PASS: an unmapped
 * status shows up as something to look at rather than something that passed.
 *
 *   BLOCKING  — the finding prevents a conclusion being drawn
 *   ATTENTION — a rule fires, or an input could not be verified
 *   INFO      — a rule genuinely does not apply / nothing in force
 *   PASS      — checked and clean
 */
export const REASON_SEVERITY = Object.freeze({
  CONFLICT_MATERIAL: 'BLOCKING', INSUFFICIENT_EVIDENCE: 'BLOCKING', MISSING: 'BLOCKING', FUEL_SPLIT_UNKNOWN: 'BLOCKING',
  APPLIES: 'ATTENTION', AVAILABLE: 'ATTENTION', REQUIRED: 'ATTENTION', THRESHOLD_MET: 'ATTENTION',
  CONFLICT: 'ATTENTION', UNVERIFIED: 'ATTENTION', OPTED_OUT: 'ATTENTION', GST_EXCLUSIVE: 'ATTENTION',
  BLOCKED: 'ATTENTION', NOT_AVAILABLE: 'ATTENTION',
  NO_MONETARY_FLOOR: 'INFO', NO_LOWER_OFFER: 'INFO', NOT_TRIGGERED: 'INFO',
  CLEAR: 'PASS', MATCHED: 'PASS', GST_INCLUSIVE: 'PASS',
});
export const severityFor = (status) => REASON_SEVERITY[status] || 'ATTENTION';

// Routing team, derived from the CRM's own hardship status — a label over real
// data, not an invented attribute. There is no Team field in the org.
function priorityFor(state = {}) {
  // The Victorian thresholds the policy itself reasons about: $1,000 is the
  // disconnection floor, 90 days is "3 months behind".
  const balance = Number(state.balance || 0);
  if (state.sensitiveCustomer) return 'High';
  if (balance >= 1000 || Number(state.oldestDebtDays || 0) >= 90) return 'High';
  if (balance > 300) return 'Medium';
  return 'Low';
}

// Queue status in the officer's vocabulary, never a raw enum.
function queueStatus(row) {
  if (row.pipeline_halted) return 'Data issue';
  if (row.action_status === 'AWAITING_APPROVAL') return 'Ready for review';
  if (row.action_status === 'PENDING') return 'Investigation open';
  if (row.action_status === 'DONE') return 'Monitoring';
  if (!row.evaluation_outcome) return 'Evidence assembling';
  if (row.evaluation_outcome === 'NO_CHANGE') return 'Monitoring';
  return 'Exception found';
}

function teamFor(state = {}) {
  const status = state.hardshipStatus;
  if (status === 'TAILORED_ASSISTANCE') return 'Hardship support';
  if (status === 'PAYMENT_DIFFICULTY') return 'Early assistance';
  if (Number(state.balance || 0) >= 1000) return 'Arrears review';
  return 'Retail operations';
}

function formatValue(field, value) {
  if (field === 'balance') return `$${Number(value || 0).toFixed(2)} arrears`;
  if (field === 'oldestDebtDays') return `${value} days`;
  if (Array.isArray(value)) return value.join(', ') || 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value ?? 'Not recorded';
}

export default router;
