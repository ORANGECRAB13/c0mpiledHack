import React, { useRef, useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import { useProductAssistant } from '../product/AssistantContext.jsx';
import { startLiveVoice, stopLiveVoice, sendToolResult, isLive } from '../voice/liveVoice.js';
import { apiUrl } from '../data/apiBase.js';

/* ── expanded workspace sidebar (Frameworks / Requires attention / etc.) ── */
export function Sidebar({ page, go }) {
  return (
    <div className="sidebar">
      <div className="sb-top">
        <div className="sb-logo">
          <Mark size={26} />
          <span>
            <span className="word">Vocare</span>
            <span className="sb-product">Operational decision layer</span>
          </span>
        </div>
      </div>

      <button className="sb-search" onClick={() => document.querySelector('[aria-label="Ask or command the product"]')?.focus()}>
        <Icon name="search" size={15} />
        Find or ask anything…
        <span className="kbd">⌘K</span>
      </button>

      <div className="sb-sec">
        <div className="sb-h">Work</div>
        <button className={`sb-item ${page === 'home' ? 'on' : ''}`} onClick={() => go('home')}><Icon name="home" size={16} /> Dashboard</button>
        <button className={`sb-item ${['queue','case'].includes(page) ? 'on' : ''}`} onClick={() => go('queue')}><Icon name="zap" size={16} /> Detection</button>
        <button className={`sb-item ${['monitoring','customers'].includes(page) ? 'on' : ''}`} onClick={() => go('monitoring')}><Icon name="activity" size={16} /> Monitoring</button>
      </div>

      <div className="sb-foot">
        <div className="sb-account">
          <span className="av"><Icon name="user" size={16} /></span>
          <span>
            <div className="nm">Priya N.</div>
            <div className="rl">Senior hardship officer</div>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Crumbs({ items }) {
  return (
    <div className="crumbs">
      <a><Icon name="home" size={14} /> Dashboard</a>
      {items.map((it, i) => (
        <React.Fragment key={it}>
          <span className="sep"><Icon name="chevR" size={11} /></span>
          <span className={i === items.length - 1 ? 'here' : ''}>{it}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function AskBar() {
  const [q, setQ] = useState('');
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const [live, setLive] = useState(() => isLive());
  const [liveLine, setLiveLine] = useState('');
  const { runProductCommand, assistantNotice, dismissNotice, announceAction, executeVoiceTool } = useProductAssistant();
  const executeVoiceToolRef = useRef(executeVoiceTool);
  executeVoiceToolRef.current = executeVoiceTool;

  const toggleLive = async () => {
    if (isLive()) {
      stopLiveVoice();
      setLive(false);
      setLiveLine('');
      return;
    }
    try {
      await startLiveVoice((event) => {
        if (event.type === 'connected') { setLive(true); setLiveLine('Live — just talk.'); }
        else if (event.type === 'transcript') setLiveLine(`${event.speaker === 'agent' ? 'Vocare' : 'You'}: ${event.text}`);
        else if (event.type === 'tool') {
          let output;
          try { output = executeVoiceToolRef.current(event.name, event.args); }
          catch (error) { output = `Tool failed: ${error.message}`; }
          sendToolResult(event.call_id, output);
        }
        else if (event.type === 'error') { setLiveLine(event.message); }
        else if (event.type === 'closed') { setLive(false); }
      });
    } catch (error) {
      setLive(false);
      setLiveLine(error?.name === 'NotAllowedError' ? 'Microphone access was not allowed.' : 'Could not start live voice.');
    }
  };

  const execute = (text) => {
    const query = String(text ?? q).trim();
    if (!query) return;
    const result = runProductCommand(query);
    // Be honest about the limit rather than silently dropping the request.
    if (!result.handled) announceAction(`I can't do that yet: "${query}". Try opening a customer, filtering the queue, or naming a page.`, 'unhandled');
    setQ('');
  };

  const toggleListening = async () => {
    if (voiceState === 'listening') {
      recorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceState('error');
      setVoiceMessage('Audio recording is not supported in this browser.');
      return;
    }

    try {
      setVoiceState('processing');
      setVoiceMessage('Requesting microphone access…');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceState('error');
        setVoiceMessage('Recording failed. Try again or type your request.');
      };
      recorder.onstop = async () => {
        window.clearTimeout(recordingTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const audio = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordingChunksRef.current = [];
        if (!audio.size) {
          setVoiceState('error');
          setVoiceMessage('No audio was recorded. Try again.');
          return;
        }

        setVoiceState('processing');
        setVoiceMessage('Transcribing with ElevenLabs…');
        try {
          const response = await fetch(apiUrl('/api/assistant/transcribe'), {
            method: 'POST',
            headers: { 'Content-Type': audio.type || 'audio/webm' },
            body: audio
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Transcription failed.');
          setQ(payload.text);
          execute(payload.text);
          setVoiceState('idle');
          setVoiceMessage('');
        } catch (error) {
          setVoiceState('error');
          setVoiceMessage(error.message || 'ElevenLabs could not transcribe that.');
        }
      };

      recorder.start(250);
      setVoiceState('listening');
      setVoiceMessage('Listening… click again to stop');
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30000);
    } catch (error) {
      setVoiceState('error');
      setVoiceMessage(error?.name === 'NotAllowedError' ? 'Microphone access was not allowed.' : 'Could not start the microphone.');
    }
  };

  return (
    <>
      {assistantNotice && (
        <div className="assistant-notice" role="status">
          <span className="notice-icon"><Icon name="check" size={13} /></span>
          <span className="notice-copy">{assistantNotice.message}</span>
          <button onClick={dismissNotice} aria-label="Dismiss"><Icon name="x" size={13} /></button>
        </div>
      )}
      <div className={`askbar ${voiceState === 'listening' ? 'listening' : ''}`}>
        <span className="alogo"><Mark size={22} /></span>
        <input
          aria-label="Ask or command the product"
          placeholder="Ask a question or say “open Amelia Hart”…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && execute()}
        />
        {q.trim() && <button className="ask-send" onClick={() => execute()} aria-label="Send"><Icon name="upload" size={16} /></button>}
        <button
          className={`mic ${voiceState}`}
          onClick={toggleListening}
          aria-label={voiceState === 'listening' ? 'Stop listening' : 'Use voice command'}
          title={voiceState === 'listening' ? 'Stop listening' : 'Use voice command'}
        ><Icon name={voiceState === 'listening' ? 'x' : 'mic'} size={18} /></button>
        <button
          className={`live-toggle ${live ? 'on' : ''}`}
          onClick={toggleLive}
          aria-label={live ? 'End live voice session' : 'Start live voice session'}
          title={live ? 'End live voice session' : 'Talk to the workspace copilot live'}
        >{live ? <><span className="live-dot" />Live</> : 'Go live'}</button>
        {voiceMessage && <span className={`voice-status ${voiceState}`}>{voiceMessage}</span>}
        {live && liveLine && <span className="voice-status live-line">{liveLine}</span>}
      </div>
      <div className="askhandle" />
    </>
  );
}
