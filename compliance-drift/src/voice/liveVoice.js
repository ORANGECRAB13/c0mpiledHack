// Live officer voice client — PCM16 @ 24kHz mic capture, gapless playback, WS
// to the officer bridge (/api/voice/officer). Ported from frontend/src/voice.ts;
// the difference is the endpoint and that `tool` events are executed against
// the running UI by the caller, which replies via sendToolResult().

const SAMPLE_RATE = 24000;

let ws = null;
let audioContext = null;
let micStream = null;
let processor = null;
let playhead = 0;
let scheduled = [];

// Half-duplex echo gate: on speakers the agent's own voice would re-trigger
// VAD, so the mic stays closed while agent audio is playing (plus a ring tail).
let agentAudioUntil = 0;
const ECHO_TAIL_S = 0.35;

function floatToPCM16(f) {
  const pcm = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}
function b64FromBytes(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function bytesFromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function agentIsSpeaking() {
  if (!audioContext) return false;
  return audioContext.currentTime < agentAudioUntil + ECHO_TAIL_S;
}

function play(b64) {
  if (!audioContext) return;
  const bytes = bytesFromB64(b64);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const f = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 0x8000;
  const buf = audioContext.createBuffer(1, f.length, SAMPLE_RATE);
  buf.getChannelData(0).set(f);
  const src = audioContext.createBufferSource();
  src.buffer = buf;
  src.connect(audioContext.destination);
  const now = audioContext.currentTime;
  if (playhead < now) playhead = now;
  src.start(playhead);
  playhead += buf.duration;
  agentAudioUntil = playhead;
  scheduled.push(src);
  src.onended = () => {
    const i = scheduled.indexOf(src);
    if (i >= 0) scheduled.splice(i, 1);
  };
}

function flushPlayback() {
  for (const src of scheduled) {
    try {
      src.onended = null;
      src.stop();
    } catch {
      // already finished
    }
  }
  scheduled = [];
  playhead = audioContext ? audioContext.currentTime : 0;
  agentAudioUntil = 0;
}

export function isLive() {
  return Boolean(ws);
}

/** Reply to a `tool` event once the UI has executed it. */
export function sendToolResult(callId, output) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'tool_result', call_id: callId, output }));
  }
}

export async function startLiveVoice(onEvent) {
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  playhead = 0;
  agentAudioUntil = 0;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  });
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/voice/officer`);

  ws.onopen = () => {
    const node = audioContext.createMediaStreamSource(micStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    node.connect(processor);
    processor.connect(audioContext.destination);
    processor.onaudioprocess = (ev) => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      if (agentIsSpeaking()) return;
      const pcm = floatToPCM16(ev.inputBuffer.getChannelData(0));
      ws.send(JSON.stringify({ type: 'audio', audio: b64FromBytes(new Uint8Array(pcm.buffer)) }));
    };
    onEvent({ type: 'connected' });
  };
  ws.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'audio') play(e.audio);
    else if (e.type === 'interrupted') flushPlayback();
    else onEvent(e);
  };
  ws.onerror = () => onEvent({ type: 'error', message: 'Voice connection error.' });
  ws.onclose = () => onEvent({ type: 'closed' });
}

export function stopLiveVoice() {
  flushPlayback();
  try { ws?.send(JSON.stringify({ type: 'hangup' })); } catch { /* closing */ }
  try { processor?.disconnect(); } catch { /* closing */ }
  try { micStream?.getTracks().forEach((t) => t.stop()); } catch { /* closing */ }
  try { ws?.close(); } catch { /* closing */ }
  try { audioContext?.close(); } catch { /* closing */ }
  ws = null; processor = null; micStream = null; audioContext = null;
  agentAudioUntil = 0;
}
