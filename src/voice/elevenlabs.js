import { WebSocket } from 'ws';
import * as wf from '../workflow/state-machine.js';
import { runVoiceTool } from './actions.js';
import { mulaw8kToPcm24k, pcm24kToMulaw8k } from './audio.js';

/**
 * ElevenLabs ConvAI voice adapter.
 *
 * Browser (PCM16 24k)  <--ws-->  this server  <--ws-->  ElevenLabs ConvAI (μ-law 8k)
 *
 * Sibling of the Azure adapter in bridge.js: it owns ElevenLabs' protocol and
 * audio format, and reuses the provider-agnostic runVoiceTool() for the five
 * business tools. Select it with VOICE_PROVIDER=elevenlabs.
 *
 * NOTE: the agent must have the five client tools configured in the ElevenLabs
 * dashboard (resolve_benefit_stack, flag_knowledge_gap, request_credit_approval,
 * transfer_to_human, confirm_plan) for the deterministic workflow to drive.
 * Without them the agent will converse but not unlock benefits or escalate.
 */
// Maps a shared demo case id to the customer to auto-start it with.
const CASE_CUSTOMER = { 'C-20481': 'CUS-77241' };

export function elevenLabsConfig() {
  const apiKey = process.env.NEW_ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';
  const agentId = process.env.NEW_ELEVENLABS_AGENT || '';
  return { configured: Boolean(apiKey && agentId), apiKey, agentId };
}

export class ElevenLabsSession {
  constructor(client, caseId) {
    this.client = client;
    this.caseId = caseId;
    this.upstream = null;
    this.held = false;
    this.closed = false;
  }

  toClient(m) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(m));
  }
  toEleven(m) {
    if (this.upstream?.readyState === WebSocket.OPEN) this.upstream.send(JSON.stringify(m));
  }

  async start() {
    const cfg = elevenLabsConfig();
    if (!cfg.configured) {
      this.toClient({ type: 'error', message: 'ElevenLabs is not configured on the server.' });
      this.client.close();
      return;
    }
    // Auto-create (or restart) the shared demo case so the phone can call
    // independently — including a fresh call after a previous one completed.
    const existing = wf.getCase(this.caseId);
    if (!existing || existing.stage === 'complete' || existing.stage === 'failed') {
      try {
        await wf.startCase({ customerId: CASE_CUSTOMER[this.caseId] || 'CUS-77241', caseId: this.caseId });
      } catch (err) {
        this.toClient({ type: 'error', message: `Could not start case: ${err.message}` });
        this.client.close();
        return;
      }
    }

    let signedUrl;
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(cfg.agentId)}`,
        { headers: { 'xi-api-key': cfg.apiKey } }
      );
      const data = await res.json();
      signedUrl = data.signed_url;
      if (!signedUrl) throw new Error(data?.detail?.message || 'no signed_url');
    } catch (err) {
      this.toClient({ type: 'error', message: `ElevenLabs signed-url failed: ${err.message}` });
      this.client.close();
      return;
    }

    this.upstream = new WebSocket(signedUrl);
    this.upstream.on('open', () => {
      wf.beginCall(this.caseId, { mode: 'live', sessionId: `eleven_${Date.now()}` });
      // ElevenLabs waits for this before the agent speaks its first message.
      this.toEleven({ type: 'conversation_initiation_client_data' });
      this.toClient({ type: 'ready' });
    });
    this.upstream.on('message', (d) => this.onElevenEvent(d));
    this.upstream.on('close', () => this.shutdown('eleven closed'));
    this.upstream.on('error', (e) => {
      this.toClient({ type: 'error', message: `ElevenLabs error: ${e.message}` });
      this.shutdown('eleven error');
    });

    this.client.on('message', (d) => this.onClientMessage(d));
    this.client.on('close', () => this.shutdown('client closed'));
  }

  onClientMessage(data) {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.type === 'audio') {
      if (this.held) return;
      // Browser PCM16 24k → ElevenLabs μ-law 8k.
      this.toEleven({ user_audio_chunk: pcm24kToMulaw8k(m.audio) });
    } else if (m.type === 'user_text') {
      // Text-injected customer turn (drives the agent without live audio).
      if (this.held) return;
      this.toEleven({ type: 'user_message', text: m.text });
    } else if (m.type === 'hangup') {
      this.shutdown('client hangup');
    }
  }

  onElevenEvent(data) {
    let e;
    try { e = JSON.parse(data); } catch { return; }
    try { this.dispatch(e); } catch (err) {
      this.toClient({ type: 'error', message: `Voice handler error: ${err.message}` });
    }
  }

  dispatch(e) {
    switch (e.type) {
      case 'audio': {
        const chunk = e.audio_event?.audio_base_64 || e.audio_event?.audio_base64;
        if (chunk) this.toClient({ type: 'audio', audio: mulaw8kToPcm24k(chunk) });
        break;
      }
      case 'agent_response': {
        const text = e.agent_response_event?.agent_response;
        if (text) {
          wf.recordTranscript(this.caseId, { speaker: 'agent', text });
          this.toClient({ type: 'transcript', speaker: 'agent', text });
        }
        break;
      }
      case 'user_transcript': {
        const text = e.user_transcription_event?.user_transcript;
        if (text) {
          wf.recordTranscript(this.caseId, { speaker: 'customer', text });
          this.toClient({ type: 'transcript', speaker: 'customer', text });
        }
        break;
      }
      case 'client_tool_call': {
        this.handleToolCall(e.client_tool_call).catch((err) =>
          this.toClient({ type: 'error', message: err.message })
        );
        break;
      }
      case 'ping':
        this.toEleven({ type: 'pong', event_id: e.ping_event?.event_id });
        break;
      default:
        break;
    }
  }

  async handleToolCall(call) {
    const name = call?.tool_name;
    const args = call?.parameters || {};
    const { output, held } = await runVoiceTool(this.caseId, name, args, (type, payload) =>
      this.toClient({ type, ...(payload || {}) })
    );
    if (held) this.held = true;
    this.toEleven({
      type: 'client_tool_result',
      tool_call_id: call?.tool_call_id,
      result: JSON.stringify(output),
      is_error: false
    });
  }

  /** Officer decided — inject it as context and let the agent resume. */
  resumeWithDecision({ approvedAmount, instruction }) {
    if (!this.held) return;
    this.held = false;
    wf.resumeCall(this.caseId);
    this.toEleven({
      type: 'contextual_update',
      text: `A credit officer approved $${approvedAmount} per month. ${instruction || ''} Thank the customer for holding, tell them the approved amount and that the full benefit package still applies, and ask them to confirm.`
    });
    this.toClient({ type: 'resumed', approvedAmount });
  }

  shutdown(reason) {
    if (this.closed) return;
    this.closed = true;
    try { this.upstream?.close(); } catch {}
    try { this.client?.close(); } catch {}
    this.onShutdown?.(reason);
  }
}
