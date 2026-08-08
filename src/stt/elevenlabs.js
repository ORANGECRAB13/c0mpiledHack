const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
const apiKey = () => process.env.ELEVENLABS_API_KEY || process.env.NEW_ELEVENLABS_API_KEY || '';
const usableKey = () => Boolean(apiKey() && !apiKey().startsWith('replace-with-'));

export function elevenLabsSttStatus() {
  return {
    configured: usableKey(),
    model: process.env.ELEVENLABS_STT_MODEL || 'scribe_v2'
  };
}

export async function transcribeOfficerCommand(audio, contentType = 'audio/webm') {
  const key = apiKey();
  if (!usableKey()) {
    const error = new Error('ElevenLabs STT is not configured. Set ELEVENLABS_API_KEY in .env.local.');
    error.code = 'not_configured';
    throw error;
  }
  if (!audio?.length) throw new Error('No audio was received.');

  const extension = contentType.includes('mp4') ? 'mp4' : contentType.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType }), `officer-command.${extension}`);
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v2');
  form.append('language_code', 'eng');
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail?.message || payload?.detail || payload?.message || `ElevenLabs returned ${response.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  const text = String(payload.text || '').trim();
  if (!text) throw new Error('ElevenLabs did not return a transcript.');
  return { text, languageCode: payload.language_code || 'en' };
}
