// Browser voice client — ElevenLabs WebRTC, phone-free agent.
//
// Unlike voice.ts (which relays PCM16 through our server to Azure, or through
// src/voice/elevenlabs.js's μ-law/mulaw bridge to the phone-attached ElevenLabs
// agent), this talks to ElevenLabs directly over WebRTC: our server only mints
// a short-lived conversation token, then gets out of the way. The five business
// tools still run through the same REST API the scripted UI uses, so the
// workflow state machine, Band escalation, and audit trail are unchanged —
// only the audio transport and tool-call plumbing move to the browser.
import { Conversation } from '@elevenlabs/client';
import type { Conversation as ConversationInstance } from '@elevenlabs/client';
import { api } from './api';

let conversation: ConversationInstance | null = null;

export function isWebrtcLive() {
  return !!conversation;
}

export async function startVoiceCallWebRTC(caseId: string, onEvent: (e: any) => void) {
  const res = await fetch('/api/voice/eleven/webrtc-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseId })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Could not get a WebRTC token');

  conversation = await Conversation.startSession({
    conversationToken: data.token,
    connectionType: 'webrtc',
    clientTools: {
      resolve_benefit_stack: async (params: any) => {
        const r = await api.disclosure(caseId, {
          householdSize: params.householdSize,
          annualIncome: params.annualIncome,
          disclosures: params.disclosures ? [params.disclosures] : []
        });
        onEvent({ type: 'case_changed' });
        return JSON.stringify({
          benefitsUnlocked: r.after.benefitsUnlocked,
          monthlyPayment: r.after.monthlyPayment,
          newlyEligible: r.newlyEligible.map((e: any) => e.name)
        });
      },
      flag_knowledge_gap: async (params: any) => {
        await api.flagGap(caseId, { programMentioned: params.programMentioned, customerQuote: params.customerQuote });
        onEvent({ type: 'gap_flagged' });
        return JSON.stringify({ acknowledged: true, note: 'Flagged for human ratification.' });
      },
      request_credit_approval: async (params: any) => {
        const r = await api.requestApproval(caseId, { requestedAmount: params.requestedAmount, summary: params.summary });
        if (r.held) {
          onEvent({ type: 'held' });
          return JSON.stringify({
            status: 'on_hold',
            message: r.holdMessage,
            instruction: 'Tell the customer warmly you are checking the lowest sustainable amount, then wait.'
          });
        }
        if (r.check.outcome === 'exceeds_affordability') {
          return JSON.stringify({ status: 'refused', reason: r.check.reason, instruction: 'Do not offer this amount.' });
        }
        return JSON.stringify({ status: 'within_authority', approvedAmount: r.check.requestedAmount, instruction: 'You may agree this amount now.' });
      },
      transfer_to_human: async (params: any) => {
        await api.handoff(caseId, params.reason || 'customer requested');
        onEvent({ type: 'handoff', reason: params.reason });
        return JSON.stringify({ status: 'transferring' });
      },
      confirm_plan: async (params: any) => {
        await api.consent(caseId, { amount: params.amount, customerConsent: params.customerConsent === true });
        await api.execute(caseId);
        onEvent({ type: 'case_changed' });
        return JSON.stringify({ status: 'complete', instruction: 'Confirm to the customer that everything is submitted.' });
      }
    },
    onConnect: () => onEvent({ type: 'ready' }),
    onDisconnect: () => { conversation = null; onEvent({ type: 'closed' }); },
    onError: (message: string) => onEvent({ type: 'error', message }),
    onMessage: ({ message, role }: { message: string; role: string }) => {
      const speaker = role === 'agent' ? 'agent' : 'customer';
      api.transcript(caseId, speaker, message).catch(() => {});
      onEvent({ type: 'transcript', speaker, text: message });
    }
  });

  await api.beginCall(caseId, 'live-webrtc');
  onEvent({ type: 'connected' });
}

/**
 * Called from the polling loop when a Band-decided approval resumes a case
 * that's running on this WebRTC path (our server has no live session object
 * to inject into here — the browser IS the live session). Injects the
 * decision as conversational context and lets the agent continue speaking.
 */
export function sendResumeContext(text: string) {
  conversation?.sendContextualUpdate(text);
}

export async function stopVoiceCallWebRTC() {
  await conversation?.endSession();
  conversation = null;
}
