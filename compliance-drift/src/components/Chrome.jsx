import React, { useRef, useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import { useProductAssistant } from '../product/AssistantContext.jsx';
import { startLiveVoice, stopLiveVoice, sendToolResult, isLive } from '../voice/liveVoice.js';
import { apiUrl } from '../data/apiBase.js';

/* ── the paper grain that gives the sidebar its warmth in the source design ── */
function PaperGrain() {
  return (
    <>
      <svg aria-hidden="true" className="sb-grain sb-grain-1">
        <filter id="vocarePaperGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="5" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0.15" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vocarePaperGrain)" />
      </svg>
      <svg aria-hidden="true" className="sb-grain sb-grain-2">
        <filter id="vocarePaperFibre">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.75" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vocarePaperFibre)" />
      </svg>
    </>
  );
}

/**
 * App shell sidebar. `counts` is optional and only decorates the nav — a count
 * that has not loaded yet is simply not rendered rather than shown as a zero,
 * because "0 cases waiting" is a claim we would not yet be entitled to make.
 */
export function Sidebar({ page, go, counts = {} }) {
  const item = (key, label, active, count) => (
    <button
      className={`sb-item ${active ? 'on' : ''}`}
      onClick={() => go(key)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span>{label}</span>
      {typeof count === 'number' && <span className="sb-count">{count}</span>}
    </button>
  );

  return (
    <div className="sidebar">
      <PaperGrain />
      <div className="sb-top">
        <div className="sb-logo">
          <span className="sb-mark"><Mark size={17} /></span>
          <span>
            <span className="word">Vocare</span>
            <span className="sb-product">Operational decision layer</span>
          </span>
        </div>
      </div>

      <div className="sb-nav">
        {item('home', 'Oversight', page === 'home')}
        {item('queue', 'Detection', ['queue', 'case'].includes(page), counts.detection)}
        {item('audit', 'Decision audit', page === 'audit', counts.audit)}
        {item('monitoring', 'Monitoring', ['monitoring', 'customers'].includes(page))}
      </div>

      <div className="sb-foot">
        <div className="sb-account">
          <span className="av">PN</span>
          <span>
            <div className="nm">Priya N.</div>
            <div className="rl">Compliance officer</div>
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
