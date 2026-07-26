/**
 * Audio format bridging between our browser pipeline (PCM16 @ 24kHz) and
 * ElevenLabs ConvAI (μ-law / G.711 @ 8kHz).
 *
 * Keeping this here means the browser client (voice.ts) stays provider-agnostic
 * — it always speaks PCM16 24kHz, and each server adapter converts as needed.
 */

const BIAS = 0x84;
const CLIP = 32635;

export function pcm16ToMulaw(sample) {
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mulawToPcm16(u) {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign ? -sample : sample;
}

/** Nearest-neighbour resample of an Int16 buffer between sample rates. */
function resampleInt16(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const out = new Int16Array(Math.floor(input.length * ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i / ratio)] || 0;
  return out;
}

/** Browser PCM16 @ 24kHz (base64) → ElevenLabs μ-law @ 8kHz (base64). */
export function pcm24kToMulaw8k(base64Pcm) {
  const bytes = Buffer.from(base64Pcm, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const down = resampleInt16(pcm, 24000, 8000);
  const mulaw = Buffer.alloc(down.length);
  for (let i = 0; i < down.length; i++) mulaw[i] = pcm16ToMulaw(down[i]);
  return mulaw.toString('base64');
}

/** ElevenLabs μ-law @ 8kHz (base64) → browser PCM16 @ 24kHz (base64). */
export function mulaw8kToPcm24k(base64Mulaw) {
  const mulaw = Buffer.from(base64Mulaw, 'base64');
  const pcm8k = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) pcm8k[i] = mulawToPcm16(mulaw[i]);
  const up = resampleInt16(pcm8k, 8000, 24000);
  return Buffer.from(up.buffer, up.byteOffset, up.byteLength).toString('base64');
}
