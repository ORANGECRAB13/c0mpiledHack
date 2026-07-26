import * as wf from '../workflow/state-machine.js';
import { HOLD_MESSAGE } from '../workflow/policy.js';
import { deliverEscalationToBand } from '../workflow/escalation.js';

/**
 * Provider-agnostic voice tool dispatch.
 *
 * This is the part of the voice pipeline that must be identical no matter which
 * realtime provider runs the conversation (Azure gpt-realtime today, ElevenLabs
 * later). A provider adapter only has to: connect its own socket, translate its
 * own audio/transcript/tool-call events, and call runVoiceTool() for the five
 * business tools. Everything below is shared.
 *
 * `emit(type, payload)` lets the adapter forward UI events to the browser.
 * The return value is `{ output, held }` — `output` goes back to the model as
 * the tool result; `held` tells the adapter to enter its hold state.
 */
export async function runVoiceTool(caseId, name, args, emit = () => {}) {
  switch (name) {
    case 'resolve_benefit_stack': {
      const result = await wf.applyDisclosure(caseId, {
        householdSize: args.householdSize,
        annualIncome: args.annualIncome,
        disclosures: args.disclosures || []
      });
      emit('case_changed');
      return {
        held: false,
        output: {
          benefitsUnlocked: result.after.totals.benefitsUnlocked,
          monthlyPayment: result.after.totals.monthlyPayment,
          affordabilityCeiling: result.after.boundaries.affordabilityCeiling,
          eligible: result.after.eligible.map((e) => ({ name: e.name, kind: e.kind, value: e.estimatedValue ?? null })),
          newlyEligible: result.newlyEligible.map((e) => e.name)
        }
      };
    }

    case 'flag_knowledge_gap': {
      await wf.flagKnowledgeGap(caseId, {
        programMentioned: args.programMentioned,
        customerQuote: args.customerQuote
      });
      emit('gap_flagged');
      return {
        held: false,
        output: { acknowledged: true, note: 'Flagged for human ratification. Do not promise the customer anything about this program.' }
      };
    }

    case 'request_credit_approval': {
      const result = wf.requestApproval(caseId, {
        requestedAmount: args.requestedAmount,
        summary: args.summary
      });
      if (result.held) {
        // The customer's counter fell outside the agent's delegated floor/ceiling
        // (policy.checkAuthority) — whisper a credit officer via Band on the same
        // room used by the scripted/REST path, and resume this same live session
        // the moment they reply. Fire-and-forget from the model's perspective: it
        // gets the hold instruction immediately and speaks the filler line now.
        const { resumeLiveCall, hasLiveCall } = await import('./bridge.js');
        deliverEscalationToBand(caseId, result.approval, (decision) => {
          if (decision.accepted && hasLiveCall(caseId)) {
            resumeLiveCall(caseId, {
              approvedAmount: decision.approval.approvedAmount,
              instruction: decision.approval.instruction
            });
          }
        }).catch((err) => console.error('[band] live-call escalation failed:', err.message));

        return { held: true, output: { status: 'on_hold', message: HOLD_MESSAGE, instruction: 'Tell the customer warmly you are checking the lowest sustainable amount, then wait.' } };
      }
      if (result.check.outcome === 'exceeds_affordability') {
        return { held: false, output: { status: 'refused', reason: result.check.reason, instruction: 'Do not offer this amount. Suggest the sustainable capped amount instead.' } };
      }
      return { held: false, output: { status: 'within_authority', approvedAmount: result.check.requestedAmount, instruction: 'You may agree this amount now.' } };
    }

    case 'transfer_to_human': {
      wf.requestHandoff(caseId, args.reason || 'customer requested');
      emit('handoff', { reason: args.reason });
      return { held: false, output: { status: 'transferring', instruction: 'Tell the customer you are connecting them now, then stop.' } };
    }

    case 'confirm_plan': {
      wf.recordConsent(caseId, {
        amount: args.amount,
        benefitIds: currentBenefitIds(caseId),
        customerConsent: args.customerConsent === true
      });
      wf.beginExecution(caseId);
      const { executePackage } = await import('../sandbox.js');
      const state = wf.getCase(caseId);
      const results = await executePackage({ stack: state.stack, amount: args.amount });
      for (const r of results) wf.recordExecution(caseId, r);
      wf.completeCase(caseId);
      emit('case_changed');
      return { held: false, output: { status: 'complete', submitted: results.length, instruction: 'Confirm to the customer that everything is submitted and they will get written confirmation.' } };
    }

    default:
      return { held: false, output: { error: `Unknown tool: ${name}` } };
  }
}

function currentBenefitIds(caseId) {
  const state = wf.getCase(caseId);
  return state?.stack?.eligible?.map((e) => e.id) || [];
}
