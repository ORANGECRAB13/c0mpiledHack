// Browser voice client — PCM16 @ 24kHz mic capture, gapless playback, WS to the
// server bridge. Provider-agnostic on the client: the server bridge decides
// whether that's Azure gpt-realtime or (later) ElevenLabs.

const SAMPLE_RATE = 24000;

let ws: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let processor: ScriptProcessorNode | null = null;
let playhead = 0;
let muted = false;

/** Mute/unmute the customer's mic. The WS stays open so unmute is instant. */
export function setMuted(value: boolean) {
  muted = value;
}
export function isMuted() {
  return muted;
}

function floatToPCM16(f: Float32Array) {
  const pcm = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}
function b64FromBytes(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as any);
  return btoa(s);
}
function bytesFromB64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Every source we have scheduled but which has not finished playing. Audio
// arrives faster than real time, so at any moment several seconds of speech are
// already queued in the AudioContext — barge-in has to be able to kill them.
let scheduled: AudioBufferSourceNode[] = [];

// ── echo control ──────────────────────────────────────────────────────
// On a laptop with speakers, the agent's own voice reaches the microphone.
// Server VAD hears it as the customer, barge-in cancels the agent mid-word, and
// Whisper transcribes the agent's words as customer turns — the call talks over
// itself and loops its opener. Browser AEC does not reliably cover audio played
// through WebAudio, so we gate the mic in software instead: while the agent is
// speaking we stop sending frames upstream.
//
// The cost is that true barge-in becomes impossible in this mode, so it is a
// switch. On headphones there is no echo path and `setBargeIn(true)` restores
// interrupting.
let bargeIn = false;
let agentAudioUntil = 0;
// Speakers keep ringing briefly after the last sample; without a tail the final
// syllable echoes back and re-triggers VAD.
const ECHO_TAIL_S = 0.35;

/** Allow the customer to interrupt the agent. Only safe on headphones. */
export function setBargeIn(value: boolean) {
  bargeIn = value;
}
export function isBargeIn() {
  return bargeIn;
}

/** True while the agent's audio is playing (or still echoing) and we must not listen. */
function agentIsSpeaking() {
  if (bargeIn || !audioContext) return false;
  return audioContext.currentTime < agentAudioUntil + ECHO_TAIL_S;
}

function play(b64: string) {
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

/**
 * Stops the agent talking, immediately.
 *
 * Called when the server reports the customer started speaking. Without this the
 * agent audibly finishes its sentence over the top of them even though the model
 * upstream has already been cancelled.
 */
export function flushPlayback() {
  for (const src of scheduled) {
    try {
      src.onended = null;
      src.stop();
    } catch {
      // Already finished — stop() throws on a source that has ended.
    }
  }
  scheduled = [];
  playhead = audioContext ? audioContext.currentTime : 0;
  agentAudioUntil = 0;
}

export async function startVoiceCall(caseId: string, onEvent: (e: any) => void) {
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  playhead = 0;
  agentAudioUntil = 0;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  });
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/voice/stream?caseId=${encodeURIComponent(caseId)}`);

  ws.onopen = () => {
    const node = audioContext!.createMediaStreamSource(micStream!);
    processor = audioContext!.createScriptProcessor(4096, 1, 1);
    node.connect(processor);
    processor.connect(audioContext!.destination);
    processor.onaudioprocess = (ev) => {
      if (ws?.readyState !== WebSocket.OPEN || muted) return;
      // Half-duplex: never send the agent's own voice back to the model.
      if (agentIsSpeaking()) return;
      const pcm = floatToPCM16(ev.inputBuffer.getChannelData(0));
      ws.send(JSON.stringify({ type: 'audio', audio: b64FromBytes(new Uint8Array(pcm.buffer)) }));
    };
    onEvent({ type: 'connected' });
  };
  ws.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'audio') play(e.audio);
    // The customer started talking over the agent — drop whatever is still
    // queued so they are actually heard instead of talked over.
    else if (e.type === 'interrupted') flushPlayback();
    else onEvent(e);
  };
  ws.onerror = () => onEvent({ type: 'error', message: 'Voice connection error.' });
  ws.onclose = () => onEvent({ type: 'closed' });
}

export function stopVoiceCall() {
  flushPlayback();
  try { ws?.send(JSON.stringify({ type: 'hangup' })); } catch {}
  try { processor?.disconnect(); } catch {}
  try { micStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { ws?.close(); } catch {}
  try { audioContext?.close(); } catch {}
  ws = null; processor = null; micStream = null; audioContext = null;
  muted = false; agentAudioUntil = 0;
}
