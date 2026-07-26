/**
 * Browser voice client.
 *
 * Captures the mic as PCM16 @ 24kHz, streams it to the server bridge over a
 * WebSocket, and plays back the agent audio the bridge relays from Azure. The
 * browser mic stands in for the customer's phone.
 *
 * Exposes startVoiceCall / stopVoiceCall on window for app.js to call.
 */

const SAMPLE_RATE = 24000;

let ws = null;
let audioContext = null;
let micStream = null;
let processor = null;
let playhead = 0;
let onEvent = () => {};

function floatToPCM16(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function base64FromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesFromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Queue a chunk of agent audio for gapless playback. */
function playChunk(base64) {
  if (!audioContext) return;
  const bytes = bytesFromBase64(base64);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) float[i] = pcm[i] / 0x8000;

  const buffer = audioContext.createBuffer(1, float.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(float);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  const now = audioContext.currentTime;
  if (playhead < now) playhead = now;
  source.start(playhead);
  playhead += buffer.duration;
}

export async function startVoiceCall(caseId, handler) {
  onEvent = handler || (() => {});
  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
  playhead = 0;

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  });

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/voice/stream?caseId=${encodeURIComponent(caseId)}`);

  ws.onopen = () => {
    const sourceNode = audioContext.createMediaStreamSource(micStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    sourceNode.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (event) => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      const pcm = floatToPCM16(event.inputBuffer.getChannelData(0));
      ws.send(JSON.stringify({ type: 'audio', audio: base64FromBytes(new Uint8Array(pcm.buffer)) }));
    };
    onEvent({ type: 'connected' });
  };

  ws.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === 'audio') playChunk(event.audio);
    else onEvent(event);
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
  ws = null;
  processor = null;
  micStream = null;
  audioContext = null;
}
