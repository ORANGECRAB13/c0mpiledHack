import { accountFor, findCustomer, loadDataset } from '../graph/dataset.js';
import { crustdataConfigured, endpointPermissions } from './crustdata.js';
import { resolveIdentity } from './identity.js';
import { externalSignals, internalSignals } from './signals.js';

/**
 * Hardship flagging.
 *
 * Answers one question — "does this household look like it is in payment
 * hardship, and how urgently should someone talk to them?" — and answers it the
 * same way every time for the same facts.
 *
 * Structure of the answer:
 *
 *   internalScore   0–100, from the utility's own ledger. This alone sets the
 *                   tier. Nothing external can create a flag.
 *   externalScore   0–EXTERNAL_CAP, corroboration from public records.
 *   tier            none | watch | elevated | priority
 *
 * External evidence can escalate an already-flagged household by at most one
 * tier (see applyExternal). That ceiling is the whole safety argument: a bad
 * identity match, a stale profile or an unrelated news story can change how
 * quickly someone is called, but it cannot by itself put a household that is
 * paying its bills into a hardship queue.
 *
 * Nothing here feeds benefit eligibility. Eligibility stays entirely
 * deterministic in graph/resolve.js against income, household size and statute;
 * a hardship flag changes prioritisation and what the agent opens with, never
 * what a household qualifies for.
 */

const EXTERNAL_CAP = Number(process.env.HARDSHIP_EXTERNAL_CAP || 25);

const TIERS = [
  { tier: 'priority', min: 70, action: 'Call today. Lead with protections and the benefit package.' },
  { tier: 'elevated', min: 45, action: 'Queue for outbound contact this week.' },
  { tier: 'watch', min: 20, action: 'Monitor. Re-assess after the next billing cycle.' },
  { tier: 'none', min: 0, action: 'No hardship intervention indicated.' }
];

const tierFor = (score) => TIERS.find((t) => score >= t.min);
const tierRank = (tier) => TIERS.length - 1 - TIERS.findIndex((t) => t.tier === tier);

const sum = (signals) => signals.reduce((total, s) => total + s.weight, 0);

/**
 * Whether external enrichment is permitted for this assessment.
 *
 * Three gates, all of which must pass. A utility looking up a customer's
 * employment is a real privacy exposure, so it is opt-in per deployment, opt-in
 * per customer record, and impossible without a configured key.
 */
export function externalLookupPermitted(customer) {
  if (!crustdataConfigured()) {
    return { permitted: false, reason: 'No Crustdata API key configured.' };
  }
  if (String(process.env.HARDSHIP_EXTERNAL_ENRICHMENT || 'off').toLowerCase() !== 'on') {
    return { permitted: false, reason: 'External enrichment is disabled (HARDSHIP_EXTERNAL_ENRICHMENT is not "on").' };
  }
  if (customer && customer.externalDataConsent === false) {
    return { permitted: false, reason: 'Customer has not consented to external data lookup.' };
  }
  return { permitted: true, reason: null };
}

/**
 * Applies external corroboration on top of the internal tier.
 *
 * Two rules:
 *   - A household the ledger says is fine (`none`) stays `none`. Public records
 *     are never grounds to open a hardship case on their own.
 *   - Otherwise the tier may rise by one step, and only if external evidence is
 *     substantial (at least half the cap).
 */
function applyExternal(internalTier, externalScore) {
  if (internalTier.tier === 'none') {
    return { tier: internalTier, escalated: false, reason: 'Internal records show no hardship; external evidence not applied.' };
  }
  if (externalScore < EXTERNAL_CAP / 2) {
    return { tier: internalTier, escalated: false, reason: 'External evidence below the escalation threshold.' };
  }

  const rank = tierRank(internalTier.tier);
  const higher = TIERS.find((t) => tierRank(t.tier) === rank + 1);
  if (!higher) {
    return { tier: internalTier, escalated: false, reason: 'Already at the highest tier.' };
  }
  return {
    tier: higher,
    escalated: true,
    reason: `External corroboration (${externalScore} pts) escalated ${internalTier.tier} → ${higher.tier}.`
  };
}

/**
 * Assesses one customer.
 *
 * `external: false` (the default for list views) skips every network call and
 * returns internal-ledger scoring only — same shape, `external.attempted: false`.
 */
export async function assessHardship({
  customerId,
  asOf = new Date(),
  external = true,
  employerHint = null,
  requestedBy = 'system'
} = {}) {
  const dataset = await loadDataset();
  const customer = findCustomer(dataset, customerId);
  if (!customer) throw new Error(`Unknown customer: ${customerId}`);

  const account = accountFor(dataset, customer.id);
  const at = asOf instanceof Date ? asOf : new Date(asOf);

  const internal = internalSignals(customer, account, { asOf: at });
  const internalScore = Math.min(100, sum(internal));
  const internalTier = tierFor(internalScore);

  const result = {
    customerId: customer.id,
    caseId: customer.caseId,
    customerName: customer.name,
    assessedAt: new Date().toISOString(),
    asOf: at.toISOString(),
    requestedBy,
    internal: {
      score: internalScore,
      tier: internalTier.tier,
      signals: internal.filter((s) => s.weight > 0),
      context: internal.filter((s) => s.weight === 0)
    },
    external: {
      attempted: false,
      permitted: false,
      reason: null,
      identity: null,
      score: 0,
      cap: EXTERNAL_CAP,
      signals: [],
      lookups: []
    },
    score: internalScore,
    tier: internalTier.tier,
    escalatedByExternal: false,
    recommendedAction: internalTier.action,
    rationale: []
  };

  const gate = externalLookupPermitted(customer);
  result.external.permitted = gate.permitted;
  result.external.reason = gate.reason;

  if (external && gate.permitted) {
    result.external.attempted = true;
    try {
      const identity = await resolveIdentity({
        name: customer.name,
        state: customer.state,
        city: customer.city,
        employerHint: employerHint || customer.employerName || null
      });
      result.external.identity = identity;

      if (identity.resolved) {
        const { signals, lookups } = await externalSignals({
          customer,
          identity,
          asOf: at,
          employerHint
        });
        result.external.signals = signals;
        result.external.lookups = lookups;
        result.external.score = Math.min(EXTERNAL_CAP, sum(signals));
      } else {
        result.external.reason = identity.reasons[0] || 'Identity not resolved.';
      }
    } catch (err) {
      // A Crustdata outage must leave a usable internal assessment behind.
      result.external.reason = `External lookup failed: ${err.message}`;
    }
  }

  const applied = applyExternal(internalTier, result.external.score);
  result.tier = applied.tier.tier;
  result.escalatedByExternal = applied.escalated;
  result.recommendedAction = applied.tier.action;
  result.score = Math.min(100, internalScore + result.external.score);

  result.rationale = [
    `Internal ledger score ${internalScore} → ${internalTier.tier} (${result.internal.signals.length} signals).`,
    result.external.attempted
      ? `External corroboration ${result.external.score}/${EXTERNAL_CAP} (${result.external.signals.length} signals).`
      : `External corroboration not run: ${result.external.reason}.`,
    applied.reason
  ].filter(Boolean);

  return result;
}

/** Internal-only assessment for every customer — safe to call on a list view. */
export async function assessAll({ asOf = new Date() } = {}) {
  const dataset = await loadDataset();
  const assessments = await Promise.all(
    dataset.customers.map((c) => assessHardship({ customerId: c.id, asOf, external: false }))
  );
  return assessments.sort((a, b) => b.score - a.score);
}

/** Compact summary for list views and case headers. */
export function hardshipSummary(assessment) {
  return {
    customerId: assessment.customerId,
    tier: assessment.tier,
    score: assessment.score,
    internalScore: assessment.internal.score,
    externalScore: assessment.external.score,
    escalatedByExternal: assessment.escalatedByExternal,
    topSignals: [...assessment.internal.signals, ...assessment.external.signals]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((s) => ({ id: s.id, family: s.family, label: s.label, sourceId: s.sourceId })),
    recommendedAction: assessment.recommendedAction
  };
}

/** Crustdata reachability, for /api/health. */
export async function hardshipEngineStatus() {
  const configured = crustdataConfigured();
  const enabled = String(process.env.HARDSHIP_EXTERNAL_ENRICHMENT || 'off').toLowerCase() === 'on';
  if (!configured) return { provider: 'crustdata', configured: false, enrichmentEnabled: enabled, reachable: false };

  try {
    const { apiVersion, enabled: endpoints } = await endpointPermissions();
    return {
      provider: 'crustdata',
      configured: true,
      enrichmentEnabled: enabled,
      reachable: true,
      apiVersion,
      endpoints: endpoints.map((e) => e.path)
    };
  } catch (err) {
    return { provider: 'crustdata', configured: true, enrichmentEnabled: enabled, reachable: false, error: err.message };
  }
}

export { EXTERNAL_CAP };
