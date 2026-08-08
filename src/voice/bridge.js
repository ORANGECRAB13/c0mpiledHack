import { WebSocketServer, WebSocket } from 'ws';
import { realtimeConfig, systemPrompt, TOOLS } from './config.js';
import * as wf from '../workflow/state-machine.js';
import { runVoiceTool } from './actions.js';

/**
 * Voice bridge — Azure gpt-realtime-2.1 provider.
 *
 * Browser  <--ws-->  this server  <--ws-->  Azure gpt-realtime-2.1
 *
 * This file is the Azure-specific adapter: it owns Azure's session config,
 * event names, and audio format. The business logic (tool dispatch, hold/resume
 * decisioning) lives in the provider-agnostic actions.js, so a second provider
 * (e.g. ElevenLabs) is a sibling adapter that reuses runVoiceTool() unchanged.
 * Select the provider with VOICE_PROVIDER (default: azure).
 *
 * The browser never sees the Azure key. Audio is relayed both ways as base64
 * PCM16. Tool calls the model makes are executed here against the SAME workflow
 * the scripted path uses, so live and scripted calls are the same code beneath.
 *
 * Hold/resume lives here: on an escalation the bridge cancels the response,
 * plays a hold line, and stops accepting audio into the model until the officer
 * decides — then it injects the decision and asks for a new response, on the
 * same session. No re-dial.
 */
// Registry so the HTTP approval route can reach the live session to resume it.
// Shared by every provider adapter.
const sessions = new Map();

export function attachVoiceBridge(server) {
  const provider = (process.env.VOICE_PROVIDER || 'azure').toLowerCase();
  // noServer + manual routing so this bridge and the officer copilot
  // (officer.js) can share one HTTP server without 400ing each other's paths.
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/api/voice/stream') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', async (client, req) => {
    const caseId = new URL(req.url, 'http://localhost').searchParams.get('caseId');

    let session;
    if (provider === 'elevenlabs') {
      const { ElevenLabsSession } = await import('./elevenlabs.js');
      session = new ElevenLabsSession(client, caseId);
    } else {
      session = new VoiceSession(client, caseId);
    }

    sessions.set(caseId, session);
    session.onShutdown = () => sessions.delete(caseId);
    session.start();
  });
}

class VoiceSession {
  constructor(client, caseId) {
    this.client = client;
    this.caseId = caseId;
    this.upstream = null;
    this.held = false;
    this.closed = false;
    // Whether Azure currently has a response in flight. `response.cancel` errors
    // if there is nothing to cancel, so barge-in checks this first.
    this.responseActive = false;
  }

  toClient(message) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(message));
  }

  toAzure(message) {
    if (this.upstream?.readyState === WebSocket.OPEN) this.upstream.send(JSON.stringify(message));
  }

  start() {
    const cfg = realtimeConfig();
    if (!cfg.configured) {
      this.toClient({ type: 'error', message: 'Realtime voice is not configured on the server.' });
      this.client.close();
      return;
    }

    const state = wf.getCase(this.caseId);
    if (!state) {
      this.toClient({ type: 'error', message: `Unknown case: ${this.caseId}` });
      this.client.close();
      return;
    }
    // The hardship assessment is what triggered this call in the first place, so
    // the agent needs it to open honestly — an unprompted outbound call has to
    // say what prompted it before it starts asking about someone's income.
    this.context = { stack: state.stack, hardship: state.hardship };

    this.upstream = new WebSocket(cfg.url, { headers: { 'api-key': cfg.apiKey } });
    this.upstream.on('open', () => this.guardedConfigure());
    this.upstream.on('message', (data) => this.onAzureEvent(data));
    this.upstream.on('close', () => this.shutdown('azure closed'));
    this.upstream.on('error', (err) => {
      this.toClient({ type: 'error', message: `Realtime error: ${err.message}` });
      this.shutdown('azure error');
    });

    this.client.on('message', (data) => this.onClientMessage(data));
    this.client.on('close', () => this.shutdown('client closed'));
  }

  guardedConfigure() {
    try {
      this.configureSession();
    } catch (err) {
      this.toClient({ type: 'error', message: `Could not start call: ${err.message}` });
      this.shutdown('configure failed');
    }
  }

  configureSession() {
    wf.beginCall(this.caseId, { mode: 'live', sessionId: `azure_${Date.now()}` });

    this.toAzure({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: systemPrompt(this.context),
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 600 },
        tools: TOOLS,
        tool_choice: 'auto',
        // Backstop against the model drifting into paragraphs. NOTE: on the
        // realtime API this counts AUDIO output tokens, not text — roughly
        // 50/second of speech — so it is nothing like a word count. 120 cut the
        // agent off mid-word ("this is Voc"). ~400 allows about eight seconds,
        // which is a long two sentences, and hard-stops a monologue.
        max_response_output_tokens: 400
      }
    });

    this.toClient({ type: 'ready' });
    // The agent speaks first.
    this.toAzure({ type: 'response.create' });
  }

  // ── browser → server ────────────────────────────────────────────────

  onClientMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === 'audio') {
      // Suppress the customer's audio while on hold — the model must not "hear"
      // anything until the officer's decision has been injected.
      if (this.held) return;
      this.toAzure({ type: 'input_audio_buffer.append', audio: message.audio });
    } else if (message.type === 'hangup') {
      this.shutdown('client hangup');
    }
  }

  // ── Azure → server ──────────────────────────────────────────────────

  onAzureEvent(data) {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    try {
      this.dispatchAzureEvent(event);
    } catch (err) {
      this.toClient({ type: 'error', message: `Voice handler error: ${err.message}` });
    }
  }

  dispatchAzureEvent(event) {
    switch (event.type) {
      // ── barge-in ────────────────────────────────────────────────────
      // Server VAD fires this the moment the customer starts talking. If the
      // agent is mid-sentence we cancel the response upstream AND tell the
      // browser to drop the audio it has already buffered — cancelling only the
      // former still leaves several seconds of speech queued in the client,
      // which is what makes an interruption feel ignored.
      case 'input_audio_buffer.speech_started':
        if (this.responseActive) {
          this.toAzure({ type: 'response.cancel' });
          this.responseActive = false;
        }
        this.toClient({ type: 'interrupted' });
        break;

      case 'response.created':
        this.responseActive = true;
        break;

      case 'response.done':
      case 'response.cancelled':
        this.responseActive = false;
        break;

      case 'response.audio.delta':
        this.toClient({ type: 'audio', audio: event.delta });
        break;

      case 'response.audio_transcript.done':
        if (event.transcript) {
          wf.recordTranscript(this.caseId, { speaker: 'agent', text: event.transcript });
          this.toClient({ type: 'transcript', speaker: 'agent', text: event.transcript });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          wf.recordTranscript(this.caseId, { speaker: 'customer', text: event.transcript });
          this.toClient({ type: 'transcript', speaker: 'customer', text: event.transcript });
        }
        break;

      case 'response.function_call_arguments.done':
        this.handleToolCall(event).catch((err) =>
          this.toClient({ type: 'error', message: err.message })
        );
        break;

      case 'error': {
        const message = event.error?.message || 'Realtime error';
        // Barge-in races the end of a turn: we see speech_started and cancel,
        // but the response had already finished upstream. Harmless, and not
        // something to put in front of an operator mid-call.
        if (/no active response/i.test(message)) break;
        this.toClient({ type: 'error', message });
        break;
      }

      default:
        break;
    }
  }

  // ── tool dispatch — delegated to the provider-agnostic shared module ─

  async handleToolCall(event) {
    const args = safeParse(event.arguments);
    const { output, held } = await runVoiceTool(this.caseId, event.name, args, (type, payload) =>
      this.toClient({ type, ...(payload || {}) })
    );
    if (held) this.enterHold();

    // Return the tool result to the model. It always gets one response here —
    // on hold, this is the ONLY response it gets: the filler line ("let me try
    // to figure something out for you"), driven by the `instruction` field in
    // the tool output. After that, customer audio stays suppressed (see
    // onClientMessage) and no further response.create fires until the officer's
    // Band decision calls resumeWithDecision — so the model falls silent right
    // after saying it, with no risk of it wandering into a second turn.
    this.toAzure({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: event.call_id,
        output: JSON.stringify(output)
      }
    });
    this.toAzure({ type: 'response.create' });
  }

  // ── hold / resume ───────────────────────────────────────────────────

  enterHold() {
    this.held = true;
    this.toAzure({ type: 'response.cancel' });
    this.toClient({ type: 'held' });
  }

  /** Called by the HTTP approval route once the officer decides. */
  resumeWithDecision({ approvedAmount, instruction }) {
    if (!this.held) return;
    this.held = false;
    wf.resumeCall(this.caseId);

    this.toAzure({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `A credit officer has approved $${approvedAmount} per month. ${instruction || ''} Thank the customer for holding, tell them the approved amount and that the full benefit package still applies, and ask them to confirm.`
          }
        ]
      }
    });
    this.toAzure({ type: 'response.create' });
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

export function resumeLiveCall(caseId, decision) {
  const session = sessions.get(caseId);
  if (!session) return false;
  session.resumeWithDecision(decision);
  return true;
}

export function hasLiveCall(caseId) {
  return sessions.has(caseId);
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
