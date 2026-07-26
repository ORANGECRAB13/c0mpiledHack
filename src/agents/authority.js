// Vocare — Arrearage Authority Agent (proprietary tier, gpt-oss-120b).
//
// Replaces guild-agents/arrearage-authority. Governed action 1 of 2: approving
// a hardship payment amount.
//
// The load-bearing design decision, carried over from the Guild version and
// worth restating because the model is now ours to misuse: THE MODEL DOES NOT
// DECIDE. The floor, the ceiling, the officer's authority level, and the clamp
// are all evaluated in deterministic code (policy.js / state-machine.js) before
// the model is ever consulted, and the model's output cannot move any of them.
//
// What the model adds is the part that was previously a template string: the
// negotiation instruction handed back to the voice agent on resume, and the
// rationale recorded in the audit trail — both informed by what the system has
// learned from prior calls in this jurisdiction. A better-worded offer is worth
// real money in this domain. A model-invented affordability cap is a compliance
// incident. So the model writes prose, and code writes numbers.

import * as wf from '../workflow/state-machine.js';
import { completeJson, agentModelConfigured } from './azure.js';
import { playbookFor, recordLearning } from '../graph/learnings.js';

const SYSTEM = `You are the Arrearage Authority agent for Meridian Energy, a multi-state regulated utility.

A voice agent is negotiating a payment arrangement with a customer in arrears. You advise the credit officer and craft the instruction the voice agent will follow when the call resumes.

How to read the numbers you are given — this is the part that is easy to get wrong:
- The DELEGATED FLOOR is the lowest amount the voice agent may agree to on its own. It is a limit on the AGENT's autonomy, not on the customer. A credit officer is explicitly permitted to approve BELOW the floor; that is the entire purpose of escalating to them.
- The AFFORDABILITY CEILING is the most this household can sustainably pay. It binds everyone, including the officer.
- The amount the officer intends to approve has ALREADY been validated against both by a deterministic resolver before it reached you. It is approved. Your job is to word it, not to re-adjudicate it.

So: write the instruction as a GRANTED offer of that exact amount. Never refuse it, never propose a different figure, never tell the customer the amount is unavailable or that no plan can be set up. If the numbers look contradictory to you, say so in riskFlags — do not resolve it in the instruction.

Also:
- Never invent a benefit program, a statute, a citation, or a dollar figure that is not supplied to you.
- Never suggest the floor or ceiling can be waived, appealed, or rounded.
- The customer is a person in financial distress. The instruction you write is spoken to them. It must be plain, warm, and free of jargon and of any implication that they failed.

You are advising, not deciding. Your output is prose and rationale only.`;

const SHAPE = `{
  "instruction": string,   // one or two sentences the voice agent will say when the call resumes
  "rationale": string,     // why this framing, for the audit record
  "riskFlags": string[],   // compliance or customer-harm risks the officer should see; [] if none
  "confidence": number     // 0..1, your confidence in this framing
}`;

function boundariesOf(state) {
  const b = state.stack?.boundaries || {};
  return {
    floor: b.authorityFloor ?? null,
    ceiling: b.affordabilityCeiling ?? null,
    citations: [b.authoritySourceId, b.affordabilitySourceId].filter(Boolean)
  };
}

/**
 * Deterministic pre-check, identical in outcome to the Guild agent it replaces.
 * Runs before any model call so an out-of-bounds request is refused on policy,
 * not on a model's opinion of the policy.
 */
export function checkAuthorityBoundaries(state, requestedAmount, intendedAmount) {
  const { floor, ceiling, citations } = boundariesOf(state);

  if (floor !== null && requestedAmount >= floor) {
    return {
      outcome: 'within_authority',
      allowed: true,
      needsOfficer: false,
      floor,
      ceiling,
      citations,
      reason: `$${requestedAmount} is at or above the $${floor} delegated floor. No credit-officer decision is required.`
    };
  }

  if (ceiling !== null && intendedAmount > ceiling) {
    return {
      outcome: 'exceeds_affordability',
      allowed: false,
      needsOfficer: false,
      floor,
      ceiling,
      citations,
      reason: `$${intendedAmount} is above this household's computed affordability cap of $${ceiling}. It cannot be approved by anyone, at any authority level.`
    };
  }

  return { outcome: 'requires_officer', allowed: true, needsOfficer: true, floor, ceiling, citations, reason: null };
}

async function draftInstruction({ state, requestedAmount, intendedAmount, boundaries, playbook }) {
  const stack = state.stack || {};
  const programs = (stack.eligiblePrograms || []).map((p) => `${p.name} (${p.sourceId || p.id})`);

  const user = `Case ${state.caseId} — ${stack.customerName || 'customer'} in ${stack.jurisdiction?.state?.name || 'unknown state'}.

Customer requested: $${requestedAmount}/month.
APPROVED AMOUNT — already validated, this is what you are announcing: $${intendedAmount}/month.
Delegated authority floor (limits the agent, not the officer): ${boundaries.floor === null ? 'n/a' : `$${boundaries.floor}`}.
Household affordability ceiling (binds everyone): ${boundaries.ceiling === null ? 'n/a' : `$${boundaries.ceiling}`}.
Benefits already resolved for this household: ${programs.length ? programs.join(', ') : 'none'}.
Governing citations: ${boundaries.citations.join(', ') || 'none supplied'}.

What this system has learned from prior calls in this jurisdiction:
${playbook.length ? playbook.map((p) => `- [${p.kind}, seen ${p.observations}x] ${p.insight}${p.guidance ? ` → ${p.guidance}` : ''}`).join('\n') : '- (nothing learned yet)'}

Write the instruction the voice agent will follow when the call resumes with the approved amount.`;

  return completeJson(SYSTEM, user, SHAPE, { maxTokens: 1400 });
}

/**
 * The governed approval path.
 *
 * `officer` is the human accountable for the decision; the model never occupies
 * that field. Returns the same outcome vocabulary the Guild agent used, so the
 * frontend and OpenAPI surface did not have to change.
 */
export async function decide({ caseId, requestedAmount, officer, approvedAmount, instruction }) {
  const state = wf.getCase(caseId);
  if (!state) {
    return { outcome: 'not_pending', approvedAmount: null, clamped: false, reason: `No case found for ${caseId}.`, citations: [] };
  }

  const intended = approvedAmount ?? requestedAmount;
  const check = checkAuthorityBoundaries(state, requestedAmount, intended);

  if (check.outcome === 'within_authority' || check.outcome === 'exceeds_affordability') {
    return {
      outcome: check.outcome,
      approvedAmount: check.outcome === 'within_authority' ? requestedAmount : null,
      clamped: false,
      authorityFloor: check.floor,
      affordabilityCeiling: check.ceiling,
      reason: check.reason,
      citations: check.citations
    };
  }

  // Model advice is optional enrichment. If it fails, the approval still lands —
  // an LLM outage must not strand a customer on hold.
  let advice = null;
  if (agentModelConfigured() && !instruction) {
    try {
      const playbook = await playbookFor(state.stack?.jurisdiction?.state?.code);
      advice = await draftInstruction({ state, requestedAmount, intendedAmount: intended, boundaries: check, playbook });
    } catch (err) {
      console.error('[authority-agent] advisory draft failed, using deterministic fallback:', err.message);
    }
  }

  const finalInstruction =
    instruction || advice?.instruction || `Offer $${intended} with the full benefit package.`;

  const result = wf.decideApproval(caseId, {
    decision: 'approved',
    approvedAmount: intended,
    instruction: finalInstruction,
    officer
  });

  if (result?.accepted === false) {
    return {
      outcome: 'rejected_officer_authority',
      approvedAmount: null,
      clamped: false,
      authorityFloor: check.floor,
      affordabilityCeiling: check.ceiling,
      reason: result.validation?.reason || `${officer.name} does not hold the authority required to decide this case.`,
      citations: check.citations
    };
  }

  const finalAmount = result?.approval?.approvedAmount ?? null;
  const clamped = result?.approval?.clamped ?? false;

  // A clamp means the officer's instinct and the household's real capacity
  // disagreed. That is exactly the kind of pattern worth carrying forward.
  if (clamped) {
    await recordLearning({
      kind: 'process_friction',
      state: state.stack?.jurisdiction?.state?.code || 'ALL',
      insight: `Officer approval of $${intended} was clamped to the $${check.ceiling} affordability cap on a ${state.stack?.jurisdiction?.state?.code} case.`,
      guidance: 'Surface the computed affordability ceiling in the escalation message so officers anchor to it before replying.',
      confidence: 0.6,
      caseId,
      proposedBy: 'authority-agent'
    }).catch(() => {});
  }

  return {
    outcome: 'approved',
    approvedAmount: finalAmount,
    clamped,
    authorityFloor: check.floor,
    affordabilityCeiling: check.ceiling,
    instruction: finalInstruction,
    rationale: advice?.rationale || null,
    riskFlags: advice?.riskFlags || [],
    confidence: advice?.confidence ?? null,
    reason: `${officer.name} (${officer.authority}) approved $${finalAmount}/month for case ${caseId}${clamped ? ', clamped to the household affordability cap' : ''}.`,
    citations: check.citations,
    advisedBy: advice ? 'gpt-oss-120b' : 'deterministic-fallback'
  };
}
