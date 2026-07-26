import { appendEvent, clearCase, eventsFor } from './events.js';
import { benefitStackFor, jurisdictionFor, listKnowledgeGaps, recordKnowledgeGap, ratifyKnowledgeGap, explainEligibleProgram } from '../graph/index.js';
import {
  HOLD_MESSAGE,
  authorityTrace,
  benefitTrace,
  checkAuthority,
  clampApprovedAmount,
  jurisdictionTrace,
  validateOfficerAuthority
} from './policy.js';
import { approvalDecision, planConfirmation } from './types.js';
import { assessHardship } from '../hardship/index.js';

/**
 * The workflow state machine.
 *
 * It — not the voice model — decides whether the customer is on hold, whether
 * the officer may approve, whether the call may resume, whether actions may
 * execute, and whether the case is complete. The model can only ask.
 */

const TRANSITIONS = {
  ready: ['assembling_context', 'failed'],
  assembling_context: ['calling', 'failed'],
  calling: ['benefits_resolved', 'customer_on_hold', 'customer_accepted', 'failed'],
  benefits_resolved: ['calling', 'customer_on_hold', 'customer_accepted', 'failed'],
  customer_on_hold: ['awaiting_credit_officer', 'resuming_call', 'failed'],
  awaiting_credit_officer: ['resuming_call', 'failed'],
  resuming_call: ['calling', 'benefits_resolved', 'customer_accepted', 'customer_on_hold', 'failed'],
  customer_accepted: ['executing', 'failed'],
  executing: ['complete', 'failed'],
  complete: [],
  failed: ['ready']
};

const cases = new Map();

export function getCase(caseId) {
  return cases.get(caseId) || null;
}

export function requireCase(caseId) {
  const state = cases.get(caseId);
  if (!state) throw new Error(`Unknown case: ${caseId}. Start the workflow first.`);
  return state;
}

export function listCases() {
  return [...cases.values()].map((c) => ({
    caseId: c.caseId,
    customerId: c.customerId,
    customerName: c.stack?.customerName || null,
    state: c.state,
    stage: c.stage,
    updatedAt: c.updatedAt
  }));
}

function transition(state, nextStage, reason = null) {
  const allowed = TRANSITIONS[state.stage] || [];
  if (!allowed.includes(nextStage)) {
    throw new Error(`Illegal transition ${state.stage} → ${nextStage}${reason ? ` (${reason})` : ''}`);
  }
  state.previousStage = state.stage;
  state.stage = nextStage;
  state.updatedAt = new Date().toISOString();
  return state;
}

// ── lifecycle ────────────────────────────────────────────────────────

export async function startCase({ customerId, caseId, asOf, forecast, operator = 'operator' }) {
  const jurisdiction = await jurisdictionFor({ customerId, asOf, forecast });
  const id = caseId || jurisdiction.caseId;

  const state = {
    caseId: id,
    customerId: jurisdiction.customerId,
    stage: 'ready',
    previousStage: null,
    asOf: asOf || null,
    forecast: forecast || null,
    stack: null,
    traces: [],
    transcript: [],
    approval: null,
    execution: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  cases.set(id, state);

  appendEvent(id, 'case.started', {
    actor: { type: 'human', id: operator },
    payload: { customerId: state.customerId, synthetic: true }
  });

  transition(state, 'assembling_context');

  const stack = await benefitStackFor({ customerId, asOf, forecast });
  state.stack = stack;

  for (const source of collectSources(stack)) {
    appendEvent(id, 'context.source_resolved', { payload: source, sourceIds: [source.sourceId] });
  }

  pushTrace(state, jurisdictionTrace(jurisdiction));
  pushTrace(state, benefitTrace(stack));

  appendEvent(id, 'context.assembled', {
    payload: {
      state: jurisdiction.state.code,
      protectedFromDisconnection: jurisdiction.protectedFromDisconnection,
      eligible: stack.eligible.map((e) => e.id),
      benefitsUnlocked: stack.totals.benefitsUnlocked,
      monthlyPayment: stack.totals.monthlyPayment
    },
    sourceIds: collectSources(stack).map((s) => s.sourceId),
    authorityIds: [stack.boundaries.authoritySourceId]
  });

  await flagHardship(state, { asOf, operator });

  await retrieveExplanations(id, stack.eligible);

  return state;
}

/**
 * Hardship flagging pass.
 *
 * Runs after the benefit stack so the operator sees why this household is in the
 * queue alongside what it is owed. The external (Crustdata) half is gated in
 * hardship/index.js and is corroboration only — it changes urgency and gives the
 * agent something honest to open with, never eligibility, which stays entirely
 * deterministic in graph/resolve.js.
 *
 * Every external lookup is written into the event log with the endpoint it came
 * from and the identity-match confidence that justified using it, so an audit can
 * establish exactly what was looked up about a customer and why.
 */
async function flagHardship(state, { asOf, operator }) {
  try {
    const assessment = await assessHardship({
      customerId: state.customerId,
      asOf: asOf || undefined,
      external: true,
      requestedBy: operator
    });
    state.hardship = assessment;

    if (assessment.external.attempted) {
      appendEvent(state.caseId, 'hardship.external_lookup', {
        payload: {
          provider: 'crustdata',
          permitted: assessment.external.permitted,
          identityResolved: Boolean(assessment.external.identity?.resolved),
          matchConfidence: assessment.external.identity?.confidence ?? null,
          matchReasons: assessment.external.identity?.reasons || [],
          lookups: assessment.external.lookups,
          reason: assessment.external.reason
        }
      });
    }

    appendEvent(state.caseId, 'hardship.flagged', {
      payload: {
        tier: assessment.tier,
        score: assessment.score,
        internalScore: assessment.internal.score,
        externalScore: assessment.external.score,
        escalatedByExternal: assessment.escalatedByExternal,
        signals: [...assessment.internal.signals, ...assessment.external.signals].map((s) => ({
          id: s.id,
          family: s.family,
          label: s.label,
          weight: s.weight,
          sourceId: s.sourceId,
          sourceUrl: s.sourceUrl || null
        })),
        rationale: assessment.rationale,
        recommendedAction: assessment.recommendedAction
      },
      sourceIds: [
        ...new Set(
          [...assessment.internal.signals, ...assessment.external.signals]
            .map((s) => s.sourceId)
            .filter(Boolean)
        )
      ]
    });
  } catch (err) {
    // Flagging is prioritisation, not entitlement. A failure here must not stop
    // a customer's case from being worked.
    appendEvent(state.caseId, 'hardship.flag_failed', { payload: { error: err.message } });
  }
}

/**
 * Semantic retrieval pass — fetches explanatory text for programs the deterministic
 * resolver has already ruled eligible (see graph/actian.js). Never influences
 * eligibility; strictly an enrichment step, so a failure here never blocks the case.
 */
async function retrieveExplanations(caseId, eligiblePrograms) {
  for (const program of eligiblePrograms || []) {
    try {
      const explanation = await explainEligibleProgram(program);
      appendEvent(caseId, 'context.semantic_retrieved', {
        payload: {
          programId: program.id,
          programName: program.name,
          source: explanation.source,
          configured: explanation.configured,
          text: explanation.text,
          citation: explanation.citation
        },
        sourceIds: [explanation.citation].filter(Boolean)
      });
    } catch {
      // Retrieval is best-effort enrichment; the resolved stack itself already stands.
    }
  }
}

function collectSources(stack) {
  const sources = [
    { sourceId: stack.jurisdiction.pucRule.sourceId, kind: 'puc_rule', label: stack.jurisdiction.pucRule.citation },
    ...stack.jurisdiction.moratoria.map((m) => ({ sourceId: m.sourceId, kind: 'moratorium', label: m.label })),
    { sourceId: stack.boundaries.authoritySourceId, kind: 'authority_rule', label: 'Delegated authority floor' },
    ...stack.eligible.map((e) => ({ sourceId: e.sourceId, kind: 'benefit_program', label: e.name })),
    ...stack.ineligible.map((e) => ({ sourceId: e.sourceId, kind: 'benefit_program_excluded', label: e.name }))
  ];
  if (stack.account.invoice) sources.push({ sourceId: stack.account.invoice.id, kind: 'invoice', label: 'Invoice summary' });
  if (stack.account.payment) sources.push({ sourceId: stack.account.payment.id, kind: 'payment', label: 'Payment summary' });
  for (const note of stack.account.notes || []) {
    sources.push({ sourceId: note.id, kind: 'contact_note', label: note.text.slice(0, 80) });
  }
  return sources;
}

function pushTrace(state, trace) {
  state.traces.push({ ...trace, at: new Date().toISOString() });
  return trace;
}

export function beginCall(caseId, { sessionId = null, mode = 'live' } = {}) {
  const state = requireCase(caseId);
  // Idempotent: reconnecting a voice session to a case already in-call is fine.
  if (state.stage !== 'calling') transition(state, 'calling');
  state.sessionId = sessionId;
  state.mode = mode;
  appendEvent(caseId, 'call.started', { payload: { sessionId, mode } });
  return state;
}

export function recordTranscript(caseId, { speaker, text }) {
  const state = requireCase(caseId);
  const turn = { speaker, text, at: new Date().toISOString() };
  state.transcript.push(turn);
  appendEvent(caseId, 'call.transcript_received', {
    actor: { type: speaker === 'customer' ? 'customer' : 'agent', id: speaker },
    payload: turn
  });
  return turn;
}

// ── disclosure → re-resolution ───────────────────────────────────────

/**
 * The customer says something that changes the facts. This is the moment the
 * demo turns on: a household disclosure can unlock benefits that the stale CRM
 * record said the customer did not qualify for.
 */
export async function applyDisclosure(caseId, { householdSize, annualIncome, disclosures = [] }) {
  const state = requireCase(caseId);
  const before = state.stack;

  const stack = await benefitStackFor({
    customerId: state.customerId,
    householdSize,
    annualIncome,
    disclosures,
    asOf: state.asOf,
    forecast: state.forecast
  });
  state.stack = stack;

  for (const disclosure of disclosures) {
    appendEvent(caseId, 'context.fact_confirmed', {
      actor: { type: 'customer', id: state.customerId },
      payload: { statement: disclosure }
    });
  }

  const gained = stack.eligible
    .filter((e) => !before.eligible.some((b) => b.id === e.id))
    .map((e) => ({ id: e.id, name: e.name, sourceId: e.sourceId, value: e.estimatedValue ?? null }));

  appendEvent(caseId, 'benefits.resolved', {
    payload: {
      householdSize: stack.household.size,
      annualIncome: stack.household.annualIncome,
      benefitsUnlockedBefore: before.totals.benefitsUnlocked,
      benefitsUnlockedAfter: stack.totals.benefitsUnlocked,
      newlyEligible: gained,
      monthlyPayment: stack.totals.monthlyPayment
    },
    sourceIds: stack.eligible.map((e) => e.sourceId),
    authorityIds: [stack.boundaries.authoritySourceId]
  });

  pushTrace(state, benefitTrace(stack));
  await retrieveExplanations(caseId, gained.length ? stack.eligible.filter((e) => gained.some((g) => g.id === e.id)) : []);
  if (state.stage === 'calling') transition(state, 'benefits_resolved');

  return { state, before, after: stack, newlyEligible: gained };
}

// ── knowledge loop ───────────────────────────────────────────────────

export async function flagKnowledgeGap(caseId, { state: stateCode, programMentioned, customerQuote, program }) {
  const state = requireCase(caseId);
  const gap = await recordKnowledgeGap({
    caseId,
    state: stateCode || state.stack.jurisdiction.state.code,
    programMentioned,
    customerQuote,
    program,
    proposedBy: 'vocare-voice-agent'
  });

  appendEvent(caseId, 'knowledge.gap_flagged', {
    actor: { type: 'agent', id: 'vocare-voice-agent' },
    payload: { gapId: gap.id, programMentioned, customerQuote, status: 'open' }
  });

  pushTrace(state, {
    title: 'Knowledge gap flagged',
    conclusion: `The customer referred to "${programMentioned}", which is not in the knowledge base for ${gap.state}.`,
    evidence: [{ sourceId: `CALL-${caseId}`, statement: customerQuote }],
    nextAction: 'Do not assert eligibility. Tell the customer we will confirm and follow up, and raise the gap for human ratification.',
    confidence: 1
  });

  return gap;
}

export async function ratifyGap(gapId, { ratifiedBy, authority, program, caseId }) {
  const ratified = await ratifyKnowledgeGap(gapId, { ratifiedBy, authority, program });

  appendEvent(caseId || ratified.caseId, 'knowledge.gap_ratified', {
    actor: { type: 'human', id: ratifiedBy },
    payload: {
      gapId,
      programId: ratified.program?.id,
      programName: ratified.program?.name,
      authority,
      ratifiedAt: ratified.ratifiedAt
    },
    authorityIds: [ratified.program?.sourceId].filter(Boolean)
  });

  return ratified;
}

export const knowledgeGaps = listKnowledgeGaps;

// ── authority boundary ───────────────────────────────────────────────

export function evaluateAmount(caseId, requestedAmount) {
  const state = requireCase(caseId);
  const check = checkAuthority(state.stack, requestedAmount);
  pushTrace(state, authorityTrace(check, state.stack));
  return check;
}

/** Places the customer on hold and opens one consolidated approval request. */
export function requestApproval(caseId, { requestedAmount, summary }) {
  const state = requireCase(caseId);
  const check = checkAuthority(state.stack, requestedAmount);

  if (!check.requiresApproval) {
    return { held: false, check, holdMessage: null };
  }

  transition(state, 'customer_on_hold');
  appendEvent(caseId, 'call.held', {
    payload: { reason: check.reason, requestedAmount },
    authorityIds: [check.sourceId]
  });

  state.approval = {
    requestedAmount,
    recommendedAmount: state.stack.totals.monthlyPayment,
    summary,
    floor: check.floor,
    ceiling: state.stack.boundaries.affordabilityCeiling,
    sourceId: check.sourceId,
    status: 'requested',
    requestedAt: new Date().toISOString()
  };

  appendEvent(caseId, 'approval.requested', {
    actor: { type: 'agent', id: 'vocare-voice-agent' },
    payload: state.approval,
    authorityIds: [check.sourceId]
  });

  transition(state, 'awaiting_credit_officer');
  return { held: true, check, holdMessage: HOLD_MESSAGE, approval: state.approval };
}

export function markApprovalDelivered(caseId, { channel, roomId, messageId }) {
  const state = requireCase(caseId);
  if (state.approval) state.approval.delivery = { channel, roomId, messageId };
  appendEvent(caseId, 'approval.delivered', { payload: { channel, roomId, messageId } });
  return state.approval;
}

/** The officer decides. Authority is validated, and the amount is still clamped. */
export function decideApproval(caseId, input) {
  const state = requireCase(caseId);
  if (state.stage !== 'awaiting_credit_officer') {
    throw new Error(`No approval is pending for ${caseId} (stage: ${state.stage}).`);
  }

  const decision = approvalDecision.parse({ ...input, caseId });
  const validation = validateOfficerAuthority(decision.officer, state.stack);

  appendEvent(caseId, 'approval.decided', {
    actor: { type: 'human', id: decision.officer.id },
    payload: { decision: decision.decision, approvedAmount: decision.approvedAmount ?? null, instruction: decision.instruction ?? null, officer: decision.officer }
  });

  if (!validation.valid) {
    appendEvent(caseId, 'approval.validated', {
      payload: { valid: false, ...validation },
      authorityIds: [state.stack.boundaries.authoritySourceId]
    });
    state.approval = { ...state.approval, status: 'rejected_authority', validation };
    return { accepted: false, validation, approval: state.approval };
  }

  const clamp = decision.decision === 'approved' && decision.approvedAmount
    ? clampApprovedAmount(state.stack, decision.approvedAmount)
    : { amount: decision.approvedAmount ?? null, clamped: false, reason: null };

  appendEvent(caseId, 'approval.validated', {
    payload: { valid: true, ...validation, clamped: clamp.clamped, clampReason: clamp.reason },
    authorityIds: [state.stack.boundaries.authoritySourceId]
  });

  state.approval = {
    ...state.approval,
    status: decision.decision,
    approvedAmount: clamp.amount,
    clamped: clamp.clamped,
    instruction: decision.instruction ?? null,
    officer: decision.officer,
    validation,
    decidedAt: new Date().toISOString()
  };

  pushTrace(state, {
    title: decision.decision === 'approved' ? 'Approved counteroffer' : 'Approval declined',
    conclusion:
      decision.decision === 'approved'
        ? `${decision.officer.name} approved $${clamp.amount} per month.${clamp.clamped ? ' Amount was clamped to the affordability cap.' : ''}`
        : `${decision.officer.name} declined the requested amount.`,
    evidence: [{ sourceId: `CALL-${caseId}`, statement: state.approval.summary || '' }],
    authority: { sourceId: state.stack.boundaries.authoritySourceId, rule: validation.reason },
    nextAction: 'Resume the call and present the decision to the customer.',
    confidence: 1
  });

  return { accepted: true, validation, approval: state.approval, clamp };
}

/** Releases the hold. The same voice session continues — no re-dial, no re-greet. */
export function resumeCall(caseId) {
  const state = requireCase(caseId);
  transition(state, 'resuming_call');
  appendEvent(caseId, 'call.resumed', {
    payload: { approvedAmount: state.approval?.approvedAmount ?? null, instruction: state.approval?.instruction ?? null }
  });
  transition(state, 'calling');
  return state;
}

// ── consent and execution ────────────────────────────────────────────

export function recordConsent(caseId, input) {
  const state = requireCase(caseId);
  const confirmation = planConfirmation.parse({ ...input, caseId });

  appendEvent(caseId, 'customer.consented', {
    actor: { type: 'customer', id: state.customerId },
    payload: { amount: confirmation.amount, benefitIds: confirmation.benefitIds }
  });

  transition(state, 'customer_accepted');
  state.agreed = { amount: confirmation.amount, benefitIds: confirmation.benefitIds, at: new Date().toISOString() };
  return state.agreed;
}

export function hasConsent(caseId) {
  return eventsFor(caseId).some((e) => e.type === 'customer.consented');
}

export function beginExecution(caseId) {
  const state = requireCase(caseId);
  if (!hasConsent(caseId)) throw new Error('Refusing to execute: no customer consent recorded for this case.');
  transition(state, 'executing');
  appendEvent(caseId, 'execution.started', { payload: { amount: state.agreed?.amount } });
  return state;
}

export function recordExecution(caseId, result) {
  const state = requireCase(caseId);
  state.execution.push(result);
  appendEvent(caseId, result.status === 'success' ? 'execution.action_succeeded' : 'execution.action_failed', {
    payload: result
  });
  return result;
}

export function completeCase(caseId) {
  const state = requireCase(caseId);
  transition(state, 'complete');
  appendEvent(caseId, 'case.completed', {
    payload: { amount: state.agreed?.amount, benefitsUnlocked: state.stack?.totals.benefitsUnlocked }
  });
  return state;
}

export function requestHandoff(caseId, reason) {
  const state = requireCase(caseId);
  appendEvent(caseId, 'handoff.requested', {
    actor: { type: 'customer', id: state.customerId },
    payload: { reason }
  });
  return { transferring: true, reason };
}

export function failCase(caseId, reason) {
  const state = requireCase(caseId);
  transition(state, 'failed');
  appendEvent(caseId, 'case.failed', { payload: { reason } });
  return state;
}

export function resetCase(caseId) {
  cases.delete(caseId);
  clearCase(caseId);
}

export function resetAll() {
  for (const caseId of cases.keys()) clearCase(caseId);
  cases.clear();
}
