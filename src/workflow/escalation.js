import * as wf from './state-machine.js';
import * as band from '../band.js';

/**
 * Shared Band escalation path — used by BOTH the REST approval route (scripted
 * / operator-UI path) and the live voice bridge (actions.js), so a customer
 * counter that falls outside the agent's delegated floor/ceiling triggers the
 * exact same whisper-to-a-human flow no matter which channel is driving the call.
 *
 * The agent already negotiates freely within its delegated floor/ceiling
 * (policy.checkAuthority) with no human involved. This only fires when the
 * customer's counter falls outside that band. Band delivers the request into
 * a chat room a credit officer is watching; whatever they type back — a bare
 * number, "approve 130", a decline, or just free-text guidance — is applied
 * to the live call on the same session. If Band is not configured, or the
 * call fails, the case still holds in `awaiting_credit_officer` and the
 * local officer UI (public/ or the React frontend) remains the way to decide it.
 */
export async function deliverEscalationToBand(caseId, approval, onResume) {
  if (!band.bandConfigured()) {
    wf.markApprovalDelivered(caseId, { channel: 'local-officer-ui', roomId: null, messageId: null });
    return;
  }

  try {
    const message =
      `Credit officer needed on case ${caseId}. Customer requested $${approval.requestedAmount}/mo; ` +
      `recommended $${approval.recommendedAmount}/mo. Delegated floor $${approval.floor}, ` +
      `affordability ceiling $${approval.ceiling}. Reply here **and @mention Vocare** with an amount ` +
      `to approve it (e.g. "@Vocare approve 130, mention the LIHEAP grant"), or "@Vocare no" to decline — ` +
      `Band only delivers your reply to the agent if it's mentioned.\n\n${approval.summary || ''}`.trim();

    const { roomId, messageId } = await band.notifyOfficer(caseId, message);
    wf.markApprovalDelivered(caseId, { channel: 'band', roomId, messageId });
    await band.listenForReply(caseId, (reply) => handleBandReply(caseId, reply, onResume));
  } catch (err) {
    console.error('[band] escalation delivery failed, falling back to local officer UI:', err.message);
    wf.markApprovalDelivered(caseId, { channel: 'local-officer-ui', roomId: null, messageId: null });
  }
}

function handleBandReply(caseId, { text, senderId, senderName }, onResume) {
  const state = wf.getCase(caseId);
  // Ignore replies that arrive after the hold has already been resolved (a
  // second message in the same room, a stale event, etc.) — the room can
  // outlive any one approval request across a case's several holds.
  if (!state || state.stage !== 'awaiting_credit_officer') return;

  const parsed = band.parseOfficerReply(text);
  try {
    const result = wf.decideApproval(caseId, {
      decision: parsed.decision,
      approvedAmount: parsed.decision === 'approved'
        ? (parsed.approvedAmount ?? state.approval?.recommendedAmount)
        : undefined,
      instruction: parsed.instruction || undefined,
      officer: {
        id: senderId || 'band-officer',
        name: senderName || 'Credit officer (Band)',
        role: state.stack?.boundaries?.requiresRole || 'credit_officer',
        authority: state.stack?.boundaries?.requiresLevel || 'L2'
      }
    });
    onResume?.(result);
  } catch (err) {
    console.error('[band] could not apply officer reply:', err.message);
  }
}
