// Vocare — Knowledge Ratification Agent (proprietary tier, gpt-oss-120b).
//
// Replaces guild-agents/arrearage-ratification. Governed action 2 of 2: writing
// to ground truth.
//
// The property that makes this system safe to point at real people is that an
// OPEN knowledge gap is invisible to the resolver. The agent can hear a customer
// mention a program, flag it, and promise to follow up — but it cannot offer
// that program to the next customer until a named human ratifies it under a
// recorded authority.
//
// Moving to our own model does not relax that. `ratifiedBy` and `authority` are
// still required inputs naming a human, and the model is given no path to
// supply them. What the model does is review: it reads the proposed entry
// against the customer's own words and reports whether the two actually agree,
// what is missing, and what it is suspicious of — so the human ratifying it is
// deciding on an analysis rather than on a raw form.
//
// This is the deliberate boundary of "self-evolving": the system teaches itself
// how to *negotiate* without asking (see reflection.js), and never teaches
// itself what the *law* is without asking.

import * as wf from '../workflow/state-machine.js';
import { completeJson, agentModelConfigured } from './azure.js';
import { recordLearning } from '../graph/learnings.js';

const SYSTEM = `You are the Knowledge Ratification reviewer for Meridian Energy's regulatory knowledge base.

A voice agent heard a customer mention an assistance program the knowledge base does not contain, and proposed an entry for it. A human credit officer is about to decide whether to admit that entry to ground truth, where it will be offered to future customers as fact.

Your job is to review the proposal, not to approve it. Be skeptical and specific:
- Does the proposed program entry actually match what the customer said, or has it drifted?
- Is the citation real-looking, jurisdiction-appropriate, and specific enough to verify? A vague or generic citation is a defect.
- Could admitting this entry cause a customer to be promised money they will not receive?

Never fabricate a citation, a program detail, or an eligibility rule to fill a hole. Reporting a hole is the entire value you add.`;

const SHAPE = `{
  "recommendation": "ratify" | "revise" | "reject",
  "assessment": string,        // 2-3 sentences for the officer
  "concerns": string[],        // specific defects; [] if none
  "verificationSteps": string[], // what the officer should confirm before ratifying
  "confidence": number         // 0..1
}`;

/**
 * A proposal is only ratifiable if it carries enough to be real ground truth:
 * an identity, a jurisdiction, a citation, and the customer's own words as
 * provenance. Pure, synchronous, and checked before the model is consulted.
 */
export function checkProposal(gap) {
  const missing = [];
  if (!gap.program?.id) missing.push('program id');
  if (!gap.program?.name) missing.push('program name');
  if (!gap.program?.state && !gap.state) missing.push('jurisdiction');
  if (!gap.program?.citation) missing.push('citation');
  if (!gap.customerQuote) missing.push('customer quote (provenance)');
  return { complete: missing.length === 0, missing };
}

async function reviewProposal(gap) {
  const user = `Proposed knowledge-base entry from case ${gap.caseId || 'unknown'}.

What the customer actually said, verbatim:
"${gap.customerQuote}"

Program the agent believed they were referring to: ${gap.programMentioned || 'unspecified'}
Jurisdiction: ${gap.program?.state || gap.state || 'unspecified'}

Proposed entry:
- id: ${gap.program?.id}
- name: ${gap.program?.name}
- kind: ${gap.program?.kind || 'unspecified'}
- citation: ${gap.program?.citation}
- source id: ${gap.program?.sourceId || 'unspecified'}

Review this proposal for the credit officer who must decide whether to admit it to ground truth.`;

  return completeJson(SYSTEM, user, SHAPE, { maxTokens: 1600 });
}

/**
 * Review and (optionally) ratify an open knowledge gap.
 *
 * `dryRun` returns the review without writing — the intended default for an
 * officer-facing UI, which should show the analysis before offering the button.
 */
export async function ratify({ gapId, ratifiedBy, authority, caseId, dryRun = false }) {
  const empty = { gapId: null, programId: null, programName: null, state: null, customerQuote: null, ratifiedBy: null, authority: null, review: null };

  const all = await wf.knowledgeGaps();
  const open = all.filter((g) => g.status === 'open');

  if (open.length === 0) {
    return { outcome: 'no_open_gaps', ...empty, reason: 'There are no open knowledge gaps to ratify.' };
  }

  let gap;
  if (gapId) {
    gap = open.find((g) => g.id === gapId);
    if (!gap) return { outcome: 'no_open_gaps', ...empty, reason: `No open knowledge gap with id ${gapId}.` };
  } else if (open.length > 1) {
    return {
      outcome: 'ambiguous',
      ...empty,
      reason: `${open.length} gaps are open. Specify which one to ratify: ${open.map((g) => g.id).join(', ')}.`
    };
  } else {
    gap = open[0];
  }

  const resolvedState = gap.program?.state ?? gap.state ?? null;
  const details = {
    gapId: gap.id ?? null,
    programId: gap.program?.id ?? null,
    programName: gap.program?.name ?? null,
    state: resolvedState,
    customerQuote: gap.customerQuote ?? null
  };

  const check = checkProposal(gap);
  if (!check.complete) {
    return {
      outcome: 'rejected_incomplete',
      ...details,
      ratifiedBy: null,
      authority: null,
      review: null,
      reason: `The proposed entry cannot be ratified — it is missing: ${check.missing.join(', ')}. Ground truth requires a citable, jurisdiction-scoped definition.`
    };
  }

  let review = null;
  if (agentModelConfigured()) {
    try {
      review = await reviewProposal(gap);
    } catch (err) {
      console.error('[ratification-agent] review failed, proceeding without model analysis:', err.message);
    }
  }

  if (dryRun) {
    return {
      outcome: 'reviewed',
      ...details,
      ratifiedBy: null,
      authority: null,
      review,
      reason: `Proposal is complete and ready for a ratification decision: ${gap.program?.name} (${gap.program?.citation}). Nothing was written.`
    };
  }

  // The model's skepticism is surfaced to the human, never enforced over them —
  // the officer holds the authority and may ratify against the recommendation.
  const overrodeReview = review?.recommendation === 'reject';

  let ratified;
  try {
    ratified = await wf.ratifyGap(gap.id, { ratifiedBy, authority, caseId: caseId ?? gap.caseId });
  } catch (err) {
    return { outcome: 'failed', ...details, ratifiedBy: null, authority: null, review, reason: err.message };
  }

  // A gap that reached ratification is a standing signal about coverage: this
  // jurisdiction had a real program we did not know about.
  await recordLearning({
    kind: 'knowledge_gap_signal',
    state: resolvedState || 'ALL',
    insight: `Customers in ${resolvedState} referred to "${gap.programMentioned}" before it existed in the knowledge base.`,
    guidance: `${gap.program?.name} is now resolvable for ${resolvedState}. Listen for it by name and offer it proactively when the household profile fits.`,
    confidence: 0.7,
    caseId: caseId ?? gap.caseId,
    proposedBy: 'ratification-agent'
  }).catch(() => {});

  return {
    outcome: 'ratified',
    ...details,
    ratifiedBy,
    authority,
    review,
    overrodeReview,
    reason:
      `${gap.program?.name} was ratified by ${ratifiedBy} under ${authority} and is now available to the resolver for ${resolvedState}. ` +
      `The next customer in that state will be offered it.${overrodeReview ? ' Note: ratified against the reviewer agent\'s recommendation to reject.' : ''}`,
    reviewedBy: review ? 'gpt-oss-120b' : 'unavailable'
  };
}
