import React, { useRef, useState } from 'react';
import { Icon } from '../icons.jsx';

export default function VoiceCapture({ onTranscript, className = 'mic' }) {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const toggle = async () => {
    if (state === 'listening') {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setState('error');
      setMessage('Audio recording is not supported in this browser.');
      return;
    }

    try {
      setState('processing');
      setMessage('Requesting microphone access…');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setState('error');
        setMessage('Recording failed. Try again or type your request.');
      };
      recorder.onstop = async () => {
        window.clearTimeout(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (!audio.size) {
          setState('error');
          setMessage('No audio was recorded. Try again.');
          return;
        }

        setState('processing');
        setMessage('Transcribing with ElevenLabs…');
        try {
          const response = await fetch('/api/assistant/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': audio.type || 'audio/webm' },
            body: audio,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Transcription failed.');
          await onTranscript(payload.text);
          setState('idle');
          setMessage('');
        } catch (error) {
          setState('error');
          setMessage(error.message || 'ElevenLabs could not transcribe that.');
        }
      };

      recorder.start(250);
      setState('listening');
      setMessage('Listening… click again to stop');
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30000);
    } catch (error) {
      setState('error');
      setMessage(error?.name === 'NotAllowedError' ? 'Microphone access was not allowed.' : 'Could not start the microphone.');
    }
  };

  return (
    <span className="voice-control">
      <button
        className={`${className} ${state}`}
        onClick={toggle}
        aria-label={state === 'listening' ? 'Stop listening' : 'Use voice input'}
        title={state === 'listening' ? 'Stop listening' : 'Use voice input'}
        type="button"
      ><Icon name={state === 'listening' ? 'x' : 'mic'} size={18} /></button>
      {message && <span className={`voice-status ${state}`}>{message}</span>}
    </span>
  );
}
