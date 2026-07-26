// Vocare — Post-Call Reflection Agent (proprietary tier, gpt-oss-120b).
//
// This is the agent that makes the system evolve. It has no counterpart in the
// Guild tier — there, knowledge only ever entered through a human ratifying a
// program. That covers "what benefits exist" and covers nothing about "how to
// have this conversation well", which is where almost all of the actual skill
// in arrearage negotiation lives.
//
// After every call that reaches a terminal stage, this agent reads the whole
// case — transcript, resolved benefits, what the customer pushed back on, what
// the officer did, whether it ended in an arrangement or a handoff — and writes
// back what it learned. Those learnings are retrieved before the next call in
// the same jurisdiction and injected into the agent's briefing.
//
// What it is allowed to conclude is deliberately bounded. It may write tactics,
// objection patterns, trends, and process friction. It may NOT write eligibility
// rules, dollar thresholds, or program definitions — if it believes it found
// one, the correct output is a knowledge_gap_signal for a human to chase, not a
// fact. The prompt says so and recordLearning's consumers ignore anything else:
// nothing in the decision path (policy.js, resolve.js) reads learnings at all.
//
// Reflection runs detached from the request that triggered it. A customer
// hanging up must not wait on a 4-second inference, and a failed reflection
// must never fail a completed case.

import * as wf from '../workflow/state-machine.js';
import { eventsFor } from '../workflow/events.js';
import { completeJson, agentModelConfigured } from './azure.js';
import { recordLearning, LEARNING_KINDS } from '../graph/learnings.js';

const SYSTEM = `You are the post-call reflection analyst for Meridian Energy's autonomous arrearage team.

You have just reviewed one completed hardship negotiation. Your job is to extract what should change about how the next call is handled.

Write learnings that are ACTIONABLE and SPECIFIC to what happened. Reject your own generic observations — "be empathetic" teaches nothing. "When a customer names a medical condition before disclosing income, confirming the medical certification first got the income disclosed without a second ask" teaches something.

You may only write these kinds:
- negotiation_tactic: a framing or sequence that moved the conversation forward
- objection_pattern: a recurring customer objection and what answered it
- trend: something about this population or jurisdiction worth watching
- process_friction: a place the workflow, escalation, or handoff cost time or trust
- knowledge_gap_signal: the customer referred to something the knowledge base lacks

You must NOT state eligibility rules, income thresholds, payment caps, statutory requirements, or program definitions as learnings. Those are ground truth and require human ratification. If you believe you found one, write it as a knowledge_gap_signal describing what to go verify — never as an assertion of fact.

Set confidence honestly. One call is weak evidence; say so with a low number. The system raises confidence itself when a learning recurs.

If this call taught nothing worth carrying forward, return an empty array. That is a valid and useful answer.`;

const SHAPE = `{
  "learnings": [
    {
      "kind": "negotiation_tactic" | "objection_pattern" | "trend" | "process_friction" | "knowledge_gap_signal",
      "insight": string,     // what was observed, specific to this call
      "guidance": string,    // what the agent should do differently next time
      "confidence": number   // 0..1
    }
  ],
  "callSummary": string,     // 1-2 sentences
  "outcomeQuality": "good" | "acceptable" | "poor",
  "whatWentWrong": string    // "" if nothing did
}`;

function renderTranscript(state, limit = 60) {
  const turns = state.transcript || [];
  const recent = turns.slice(-limit);
  if (!recent.length) return '(no transcript captured — this call ran through the scripted REST path)';
  return recent.map((t) => `${t.speaker}: ${t.text}`).join('\n');
}

function renderCase(state) {
  const stack = state.stack || {};
  const programs = (stack.eligiblePrograms || []).map((p) => `${p.name} (${p.sourceId || p.id})`);
  const events = eventsFor(state.caseId) || [];

  return `Case ${state.caseId} — ${stack.customerName || 'customer'} in ${stack.jurisdiction?.state?.name || 'unknown'}.
Final stage: ${state.stage}
Arrears: $${stack.account?.arrears ?? 'unknown'}
Benefits resolved: ${programs.length ? programs.join(', ') : 'none'}
Monthly payment resolved: $${stack.totals?.monthlyPayment ?? 'n/a'}
Delegated floor: $${stack.boundaries?.authorityFloor ?? 'n/a'} | Affordability ceiling: $${stack.boundaries?.affordabilityCeiling ?? 'n/a'}
Escalated to a credit officer: ${state.approval ? `yes — requested $${state.approval.requestedAmount}, status ${state.approval.status}${state.approval.clamped ? ', clamped to the cap' : ''}` : 'no'}
Customer consented: ${state.agreed ? `yes, at $${state.agreed.amount}` : 'no'}
Knowledge gaps raised on this call: ${(state.knowledgeGaps || []).length}
Workflow events: ${events.map((e) => e.type).join(' → ') || 'none recorded'}

Transcript:
${renderTranscript(state)}`;
}

/**
 * Reads one terminal case and writes back what it taught.
 * Returns the stored learnings; never throws to its caller.
 */
export async function reflectOnCase(caseId) {
  const state = wf.getCase(caseId);
  if (!state) return { ok: false, error: `Unknown case: ${caseId}`, learnings: [] };
  if (!agentModelConfigured()) {
    return { ok: false, error: 'Proprietary agent tier is not configured; reflection skipped.', learnings: [] };
  }

  let result;
  try {
    result = await completeJson(SYSTEM, renderCase(state), SHAPE, { maxTokens: 2400, temperature: 0.3 });
  } catch (err) {
    console.error(`[reflection-agent] case ${caseId}:`, err.message);
    return { ok: false, error: err.message, learnings: [] };
  }

  const stateCode = state.stack?.jurisdiction?.state?.code || 'ALL';
  const proposed = Array.isArray(result?.learnings) ? result.learnings : [];

  const stored = [];
  for (const entry of proposed) {
    // Drop anything outside the permitted vocabulary rather than coercing it —
    // a learning we cannot classify is one we cannot reason about later.
    if (!LEARNING_KINDS.includes(entry?.kind) || !entry?.insight) continue;
    try {
      const { learning, reinforced } = await recordLearning({
        kind: entry.kind,
        state: stateCode,
        insight: entry.insight,
        guidance: entry.guidance || '',
        confidence: typeof entry.confidence === 'number' ? Math.max(0, Math.min(1, entry.confidence)) : 0.5,
        caseId,
        proposedBy: 'reflection-agent'
      });
      stored.push({ ...learning, reinforced });
    } catch (err) {
      console.error(`[reflection-agent] could not store learning for ${caseId}:`, err.message);
    }
  }

  console.log(
    `[reflection-agent] case ${caseId}: ${stored.length} learning(s) written ` +
      `(${stored.filter((l) => l.reinforced).length} reinforced existing), outcome ${result?.outcomeQuality || 'unrated'}.`
  );

  return {
    ok: true,
    caseId,
    callSummary: result?.callSummary || '',
    outcomeQuality: result?.outcomeQuality || null,
    whatWentWrong: result?.whatWentWrong || '',
    learnings: stored,
    reflectedBy: 'gpt-oss-120b'
  };
}

/**
 * Fire-and-forget entry point for the state machine.
 *
 * Detached deliberately: completeCase() and requestHandoff() are on the call's
 * critical path, and a 4-second inference (or an Azure outage) must not delay
 * or fail them. Failures are logged and dropped.
 */
export function reflectInBackground(caseId) {
  setImmediate(() => {
    reflectOnCase(caseId).catch((err) => console.error(`[reflection-agent] detached failure on ${caseId}:`, err.message));
  });
}
