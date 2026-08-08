import React, { useEffect, useRef, useState } from 'react';
import AskOverlay from './AskOverlay.jsx';
import { Icon, Mark } from '../icons.jsx';
import { useProductAssistant } from '../product/AssistantContext.jsx';
import { startLiveVoice, stopLiveVoice, sendToolResult, isLive } from '../voice/liveVoice.js';

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
        <button className={`sb-item ${page === 'home' ? 'on' : ''}`} onClick={() => go('home')}><Icon name="home" size={16} /> Home</button>
        <button className={`sb-item ${['queue','case'].includes(page) ? 'on' : ''}`} onClick={() => go('queue')}><Icon name="zap" size={16} /> Operational reviews</button>
        <button className={`sb-item ${page === 'customers' ? 'on' : ''}`} onClick={() => go('customers')}><Icon name="people" size={16} /> Customers</button>
        <button className={`sb-item ${page === 'monitoring' ? 'on' : ''}`} onClick={() => go('monitoring')}><Icon name="activity" size={16} /> Continuous monitoring</button>
        <button className={`sb-item ${page === 'audit' ? 'on' : ''}`} onClick={() => go('audit')}><Icon name="check" size={16} /> Decision audit</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Knowledge</div>
        <button className={`sb-item ${page === 'mgmt' ? 'on' : ''}`} onClick={() => go('mgmt')}><Icon name="layers" size={16} /> Management system</button>
        <button className={`sb-item ${page === 'assistant' ? 'on' : ''}`} onClick={() => go('assistant')}><Icon name="search" size={16} /> Compliance assistant</button>
        <button className={`sb-item ${page === 'systems' ? 'on' : ''}`} onClick={() => go('systems')}><Icon name="plug" size={16} /> Connected systems</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Reporting</div>
        <button className={`sb-item ${page === 'analytics' ? 'on' : ''}`} onClick={() => go('analytics')}><Icon name="grid" size={16} /> Outcomes</button>
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

/* ── project sidebar (Routines screen) ── */
export function ProjectSidebar({ page, go }) {
  return (
    <div className="sidebar" style={{ width: 230 }}>
      <div className="sb-top">
        <div className="sb-logo">
          <Mark size={24} />
          <span className="word" style={{ fontSize: 15 }}>Compliance</span>
        </div>
        <span className="bell"><Icon name="bell" size={16} /><span className="badge">45</span></span>
        <button className="collapse"><Icon name="chevL" size={14} /></button>
      </div>

      <div className="sb-search">
        <Icon name="search" size={14} />
        Find or ask anything…
        <span className="kbd">⌘K</span>
      </div>

      <button className="sb-item" onClick={() => go('frameworks')} style={{ marginBottom: 10 }}>
        <Icon name="back" size={15} /> All projects
      </button>

      <div className="sb-sec">
        <div className="sb-h">Work <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="file" size={15} /> Files</button>
        <button className={`sb-item ${page === 'routines' ? 'on' : ''}`} style={page === 'routines' ? { borderLeft: '2px solid var(--orange)', borderRadius: '0 8px 8px 0' } : {}}>
          <Icon name="refresh" size={15} /> Routines
        </button>
        <button className="sb-item"><Icon name="mic" size={15} /> Meetings</button>
        <button className="sb-item"><Icon name="phone" size={15} /> Phone</button>
        <button className="sb-item"><Icon name="mail" size={15} /> Emails</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Knowledge <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="brain" size={15} /> Brain</button>
        <button className="sb-item"><Icon name="activity" size={15} /> Activity</button>
        <button className="sb-item"><Icon name="findings" size={15} /> Findings</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">People <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="people" size={15} /> Members</button>
        <button className="sb-item"><Icon name="key" size={15} /> Access</button>
      </div>

      <div className="sb-foot">
        <button className="sb-item"><Icon name="warn" size={15} /> Report a problem</button>
        <button className="sb-item"><Icon name="help" size={15} /> Help</button>
        <div className="sb-account">
          <span className="av"><Icon name="user" size={15} /></span>
          <span>
            <div className="nm">Account</div>
            <div className="rl">Project Manager, Northgate Tower</div>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── collapsed icon rail (Management system screen) ── */
export function IconRail({ go }) {
  return (
    <div className="rail-side">
      <button className="ric" style={{ marginBottom: 6 }}><Mark size={22} /></button>
      <button className="ric"><Icon name="chevR" size={15} /></button>
      <div style={{ height: 26 }} />
      <button className="ric"><Icon name="search" size={16} /></button>
      <div style={{ height: 14 }} />
      <button className="ric"><Icon name="sun" size={16} /></button>
      <button className="ric" onClick={() => go('routines')}><Icon name="grid" size={16} /></button>
      <button className="ric"><Icon name="org" size={16} /></button>
      <button className="ric on" onClick={() => go('frameworks')}><Icon name="shield" size={16} /></button>
      <button className="ric"><Icon name="exchange" size={16} /></button>
      <div style={{ height: 22 }} />
      <button className="ric"><Icon name="plug" size={16} /></button>
      <button className="ric"><Icon name="clock" size={16} /></button>
      <div className="spacer" />
      <button className="ric"><Icon name="warn" size={16} /></button>
      <button className="ric"><Icon name="help" size={16} /></button>
      <button className="ric"><Icon name="user" size={16} /></button>
    </div>
  );
}

export function Crumbs({ items }) {
  return (
    <div className="crumbs">
      <a><Icon name="home" size={14} /> Home</a>
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
  const [open, setOpen] = useState(null);
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const [live, setLive] = useState(() => isLive());
  const [liveLine, setLiveLine] = useState('');
  const { runProductCommand, assistantNotice, dismissNotice, askRequest, clearAskRequest, executeVoiceTool } = useProductAssistant();
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
          // Execute against the running UI and report back so the model can
          // confirm verbally. The ref keeps the newest app state in scope.
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

  // A compound command ("open X and analyze …") navigates first, then leaves
  // the analysis half here: open the agent chat on whatever page we landed on.
  useEffect(() => {
    if (!askRequest) return;
    setOpen(askRequest.query);
    clearAskRequest();
  }, [askRequest]);

  const execute = (text) => {
    const query = String(text ?? q).trim();
    if (!query) return;
    const result = runProductCommand(query);
    if (!result.handled) setOpen(query);
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
          const response = await fetch('/api/assistant/transcribe', {
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
      {open && <AskOverlay query={open} onClose={() => setOpen(null)} />}
    </>
  );
}
