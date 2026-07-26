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
}

export async function startVoiceCall(caseId: string, onEvent: (e: any) => void) {
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  playhead = 0;
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
      const pcm = floatToPCM16(ev.inputBuffer.getChannelData(0));
      ws.send(JSON.stringify({ type: 'audio', audio: b64FromBytes(new Uint8Array(pcm.buffer)) }));
    };
    onEvent({ type: 'connected' });
  };
  ws.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'audio') play(e.audio);
    else onEvent(e);
  };
  ws.onerror = () => onEvent({ type: 'error', message: 'Voice connection error.' });
  ws.onclose = () => onEvent({ type: 'closed' });
}

export function stopVoiceCall() {
  try { ws?.send(JSON.stringify({ type: 'hangup' })); } catch {}
  try { processor?.disconnect(); } catch {}
  try { micStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { ws?.close(); } catch {}
  try { audioContext?.close(); } catch {}
  ws = null; processor = null; micStream = null; audioContext = null;
  muted = false;
}
