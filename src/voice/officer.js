import { WebSocketServer, WebSocket } from 'ws';
import { realtimeConfig } from './config.js';

/**
 * Officer voice copilot — hands-free control of the compliance workspace.
 *
 * Browser  <--ws /api/voice/officer-->  this server  <--ws-->  Azure gpt-realtime
 *
 * Unlike the customer-call bridge (bridge.js), the tools here do not touch the
 * workflow state machine — every tool is executed IN THE BROWSER against the
 * running UI (navigation, opening cases, asking the compliance agent) and the
 * result is sent back up. The model therefore drives exactly what the officer
 * could do with a mouse, and nothing more: approving decisions has no tool on
 * purpose — the agent can only take the officer to the Approve button.
 */

const OFFICER_TOOLS = [
  {
    type: 'function',
    name: 'navigate',
    description:
      'Open a page of the workspace. Valid targets: home, customers, operational reviews (the decision queue), continuous monitoring, decision audit, management system, compliance assistant, connected systems, outcomes.',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string', description: 'The page to open, by name.' } },
      required: ['target']
    }
  },
  {
    type: 'function',
    name: 'open_case',
    description: 'Open a specific customer case by customer name or case ID (e.g. "Amelia Hart" or "C-10482").',
    parameters: {
      type: 'object',
      properties: { customer: { type: 'string', description: 'Customer name or case ID.' } },
      required: ['customer']
    }
  },
  {
    type: 'function',
    name: 'filter_queue',
    description: 'Filter the operational review queue by priority and/or workflow, then show it.',
    parameters: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['High', 'Medium', 'Low', 'All'] },
        workflow: {
          type: 'string',
          enum: ['Hardship & Best Offer', 'Data Quality & Reconciliation', 'All']
        }
      }
    }
  },
  {
    type: 'function',
    name: 'ask_compliance',
    description:
      'Put a question to the document compliance agent (it answers with citations into the real regulation PDFs on screen). Optionally open a customer case first so the analysis lands on it.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The compliance question, in full.' },
        customer: { type: 'string', description: 'Optional customer name or case ID to open first.' }
      },
      required: ['question']
    }
  },
  {
    type: 'function',
    name: 'start_reassessment',
    description:
      'On the continuous monitoring page: record a human reassessment decision for a monitored account and open the customer profile. Use only when the officer explicitly asks to start a reassessment.',
    parameters: {
      type: 'object',
      properties: { customer: { type: 'string', description: 'The monitored customer, by name.' } },
      required: ['customer']
    }
  }
];

const OFFICER_PROMPT = `You are Vocare's workspace copilot, speaking with Priya, a senior hardship
officer, over her headset. She controls the compliance platform entirely by voice through you.

Your tools execute live in her browser — navigation, opening cases, filtering the queue, asking
the document compliance agent. When she asks for anything the platform can show or do, CALL THE
TOOL, then confirm in a few words what is now on screen.

HOW YOU TALK:
- HARD CAP 20 words per turn. She is looking at the screen; describe deltas, not the whole page.
- Never narrate what you are about to do. Do it, then one short line.
- If a tool reports something useful (a balance, a rule, a count), say the substance, not "done".
- One clarifying question maximum, and only when a name or page is genuinely ambiguous.

HARD RULES:
- You cannot approve, execute or record decisions — there is deliberately no tool for it. If asked,
  open the case and say the Approve button needs her click.
- Regulatory questions go through ask_compliance so the answer is cited on screen — do not
  answer regulation questions from memory.
- If a tool returns an error or "not found", say so plainly and ask for the right name.`;

export function attachOfficerVoice(server) {
  // noServer + manual upgrade routing: a second WebSocketServer({server, path})
  // would 400 every upgrade that misses ITS path, killing the customer-call
  // bridge (and vice versa). Each bridge only claims its own path this way.
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (client) => new OfficerSession(client).start());
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/api/voice/officer') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}

class OfficerSession {
  constructor(client) {
    this.client = client;
    this.upstream = null;
    this.closed = false;
    this.responseActive = false;
    this.pendingTools = new Map(); // call_id -> azure call id (browser executes, we await)
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

    this.upstream = new WebSocket(cfg.url, { headers: { 'api-key': cfg.apiKey } });
    this.upstream.on('open', () => this.configureSession());
    this.upstream.on('message', (data) => this.onAzureEvent(data));
    this.upstream.on('close', () => this.shutdown('azure closed'));
    this.upstream.on('error', (err) => {
      this.toClient({ type: 'error', message: `Realtime error: ${err.message}` });
      this.shutdown('azure error');
    });

    this.client.on('message', (data) => this.onClientMessage(data));
    this.client.on('close', () => this.shutdown('client closed'));
  }

  configureSession() {
    this.toAzure({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: OFFICER_PROMPT,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 600 },
        tools: OFFICER_TOOLS,
        tool_choice: 'auto',
        // Audio tokens, not words — ~400 is roughly eight seconds of speech.
        max_response_output_tokens: 400
      }
    });
    this.toClient({ type: 'ready' });
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
      this.toAzure({ type: 'input_audio_buffer.append', audio: message.audio });
    } else if (message.type === 'tool_result') {
      // The browser has executed the tool against the live UI.
      if (!this.pendingTools.has(message.call_id)) return;
      this.pendingTools.delete(message.call_id);
      this.toAzure({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: message.call_id,
          output: JSON.stringify({ result: String(message.output ?? 'done') })
        }
      });
      this.toAzure({ type: 'response.create' });
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

    switch (event.type) {
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
        if (event.transcript) this.toClient({ type: 'transcript', speaker: 'agent', text: event.transcript });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) this.toClient({ type: 'transcript', speaker: 'officer', text: event.transcript });
        break;

      case 'response.function_call_arguments.done': {
        // Hand the tool to the browser; the reply comes back as tool_result.
        let args;
        try {
          args = JSON.parse(event.arguments);
        } catch {
          args = {};
        }
        this.pendingTools.set(event.call_id, event.name);
        this.toClient({ type: 'tool', call_id: event.call_id, name: event.name, args });
        break;
      }

      case 'error': {
        const message = event.error?.message || 'Realtime error';
        if (/no active response/i.test(message)) break; // barge-in race, harmless
        this.toClient({ type: 'error', message });
        break;
      }

      default:
        break;
    }
  }

  shutdown(reason) {
    if (this.closed) return;
    this.closed = true;
    try { this.upstream?.close(); } catch { /* already closed */ }
    try { this.client?.close(); } catch { /* already closed */ }
    void reason;
  }
}
