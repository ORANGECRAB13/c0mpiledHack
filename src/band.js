import { WebSocket } from 'ws';

/**
 * Band adapter — agent↔human realtime coordination.
 *
 * Used for exactly one thing in this app: when a live negotiation goes outside
 * the agent's delegated min/max (the authority floor / affordability ceiling
 * already computed by policy.js), the agent needs a credit officer's decision
 * *without hanging up or re-dialling*. This module posts the request into a
 * Band chat room and listens on Band's realtime channel for the officer's
 * reply, in whatever shape the officer happens to type it.
 *
 * REST base + auth header and the WebSocket (Phoenix-channels) subscription
 * shape come from https://docs.band.ai. Exact message-payload field names for
 * `message_created` were not fully verified against the raw OpenAPI spec, so
 * `extractText`/`extractSender` below try several common shapes rather than
 * assuming one — a live demo must degrade gracefully, not throw, if a field
 * is named slightly differently than expected. Any Band failure here falls
 * back to the local officer UI; it never blocks the workflow.
 */

const REST_BASE = process.env.BAND_REST_URL || 'https://app.band.ai';
const WS_URL = process.env.BAND_WS_URL || 'wss://app.band.ai/api/v1/socket/websocket';
// The human credit officer to @mention on every escalation. Band requires every
// message to mention someone, and a mention only resolves if that person is
// already a participant in the room — so the officer is added as a participant
// the first time a case's room is created (see ensureCaseRoom).
const OFFICER_HANDLE = process.env.BAND_OFFICER_HANDLE || null;

export function bandConfigured() {
  return Boolean(process.env.BAND_API_KEY);
}

const roomByCase = new Map(); // caseId -> chatRoomId
const socketByRoom = new Map(); // roomId -> { ws, ref, listeners:Set }
let officerId = null; // resolved once and cached

async function bandFetch(path, options = {}) {
  const res = await fetch(`${REST_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.BAND_API_KEY,
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Band ${options.method || 'GET'} ${path} → ${res.status}: ${text}`);
  return body;
}

/** Resolves BAND_OFFICER_HANDLE to a user id via the agent's peer list. Cached. */
async function resolveOfficerId() {
  if (!OFFICER_HANDLE) return null;
  if (officerId) return officerId;
  const peers = await bandFetch('/api/v1/agent/peers');
  const match = (peers?.data || []).find(
    (p) => p.handle?.toLowerCase() === OFFICER_HANDLE.replace(/^@/, '').toLowerCase()
  );
  officerId = match?.id || null;
  return officerId;
}

/** Finds (or creates) the Band chat room tracking this case, caching the mapping. */
async function ensureCaseRoom(caseId) {
  if (roomByCase.has(caseId)) return roomByCase.get(caseId);

  const created = await bandFetch('/api/v1/agent/chats', {
    method: 'POST',
    body: JSON.stringify({ chat: { title: `Vocare case ${caseId}` } })
  });
  const roomId = created?.data?.id || created?.id;
  if (!roomId) throw new Error('Band did not return a chat room id');

  // The mentioned officer must already be a room participant for the mention
  // to resolve, so add them once, up front. Best-effort: if this fails (e.g.
  // they're already in the room, or no handle configured) the room still works.
  try {
    const uid = await resolveOfficerId();
    if (uid) {
      await bandFetch(`/api/v1/agent/chats/${roomId}/participants`, {
        method: 'POST',
        body: JSON.stringify({ participant: { participant_id: uid } })
      });
    }
  } catch {
    // Already a participant, or handle unresolved — the mention below will surface any real problem.
  }

  roomByCase.set(caseId, roomId);
  return roomId;
}

/** Posts the escalation into the case's Band room. Returns { roomId, messageId }. */
export async function notifyOfficer(caseId, text) {
  if (!bandConfigured()) throw new Error('Band is not configured');
  if (!OFFICER_HANDLE) throw new Error('BAND_OFFICER_HANDLE is not set — Band requires every message to @mention someone');

  const roomId = await ensureCaseRoom(caseId);
  const message = await bandFetch(`/api/v1/agent/chats/${roomId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        content: text,
        mentions: [{ handle: OFFICER_HANDLE.replace(/^@/, ''), name: 'Credit officer' }]
      }
    })
  });
  return { roomId, messageId: message?.data?.id || message?.id || `band_${Date.now()}` };
}

/**
 * Subscribes to the case's Band room and calls `onReply({ text, senderId, senderName })`
 * for the first human message that arrives (our own agent's own messages are ignored).
 * Returns an unsubscribe function. Safe to call more than once per case; the
 * underlying socket per room is reused.
 */
export async function listenForReply(caseId, onReply) {
  const roomId = await ensureCaseRoom(caseId);
  const entry = socketByRoom.get(roomId) || openRoomSocket(roomId);
  socketByRoom.set(roomId, entry);
  entry.listeners.add(onReply);
  return () => entry.listeners.delete(onReply);
}

function openRoomSocket(roomId) {
  const entry = { ws: null, ref: 1, listeners: new Set(), heartbeat: null };
  const url = `${WS_URL}?api_key=${encodeURIComponent(process.env.BAND_API_KEY)}&vsn=2.0.0`;
  const ws = new WebSocket(url);
  entry.ws = ws;

  ws.on('open', () => {
    send(ws, entry, `chat_room:${roomId}`, 'phx_join', {});
    entry.heartbeat = setInterval(() => send(ws, entry, 'phoenix', 'heartbeat', {}), 30000);
  });

  ws.on('message', (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const [, , topic, event, payload] = frame;
    if (topic !== `chat_room:${roomId}` || event !== 'message_created') return;
    // Band only delivers message_created to an agent socket when the agent is
    // @mentioned and is not the sender (see docs.band.ai/websocket/agent/chat-room),
    // so anything that reaches here is already someone else's reply. Still guard
    // on sender_type in case a sibling agent is in the room too.
    if (payload?.sender_type === 'Agent') return;

    const text = stripMentionMarkup(payload);
    if (!text) return;

    for (const listener of entry.listeners) {
      try {
        listener({ text, senderId: payload?.sender_id, senderName: payload?.sender_name || 'Credit officer (Band)' });
      } catch (err) {
        console.error('[band] listener error', err.message);
      }
    }
  });

  ws.on('error', (err) => console.error('[band] socket error', err.message));
  ws.on('close', () => {
    clearInterval(entry.heartbeat);
    socketByRoom.delete(roomId);
  });

  return entry;
}

/**
 * Band's raw message content contains literal `@[[uuid]]` mention placeholders
 * (not the human-readable "@Vocare"), and a UUID is full of digits — left in,
 * it corrupts any attempt to pull a dollar amount out of the reply (e.g. the
 * "2" in "2f92ad8e..." getting read as the approved amount instead of "130").
 * Replace each placeholder with its display name from `metadata.mentions`.
 */
function stripMentionMarkup(payload) {
  let text = payload?.content || '';
  for (const mention of payload?.metadata?.mentions || []) {
    if (!mention?.id) continue;
    text = text.split(`@[[${mention.id}]]`).join(mention.name ? `@${mention.name}` : '');
  }
  return text.trim();
}

function send(ws, entry, topic, event, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const ref = String(entry.ref++);
  ws.send(JSON.stringify([ref, ref, topic, event, payload]));
}

/**
 * Turns whatever free text the officer typed into a decision. Accepts a
 * number anywhere in the message as the approved monthly amount; recognises
 * a handful of refusal words when no number is present; anything else is
 * carried through untouched as guidance ("instruction") so the agent's tone
 * adapts even when the officer didn't give a hard number.
 */
export function parseOfficerReply(text) {
  const raw = (text || '').trim();
  const amountMatch = raw.match(/-?\d+(?:\.\d+)?/);
  const refusal = /\b(no|deny|denied|decline|declined|reject|rejected|can'?t|cannot|not approved)\b/i.test(raw);

  if (refusal && !amountMatch) {
    return { decision: 'declined', approvedAmount: null, instruction: raw || null };
  }
  return {
    decision: 'approved',
    approvedAmount: amountMatch ? Number(amountMatch[0]) : null,
    instruction: raw || null
  };
}
