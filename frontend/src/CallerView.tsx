import { motion } from 'framer-motion';
import { Mic, MicOff, PhoneCall, PhoneOff, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, DEMO_CASE } from './api';
import { setMuted, startVoiceCall, stopVoiceCall } from './voice';

/**
 * Mobile caller view. The person holding the phone IS the customer — they tap
 * "Call agent" and talk to Roberta (ElevenLabs). Everything else — transcript,
 * benefits, escalation, audit — shows on the operator laptop, which observes the
 * same shared case.
 */
type CallState = 'idle' | 'connecting' | 'in_call' | 'on_hold' | 'ended';

export default function CallerView() {
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMutedState] = useState(false);
  const [lastAgent, setLastAgent] = useState('');
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  async function startCall() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setState('connecting');
    try {
      await api.ensureCase();
      await startVoiceCall(DEMO_CASE, (e: any) => {
        if (e.type === 'connected' || e.type === 'ready') setState('in_call');
        if (e.type === 'held') setState('on_hold');
        if (e.type === 'resumed') setState('in_call');
        if (e.type === 'transcript' && e.speaker === 'agent') setLastAgent(e.text);
        if (e.type === 'error') setError(e.message);
        if (e.type === 'closed') setState('ended');
      });
    } catch (e: any) {
      setError(e.message || 'Could not start the call.');
      setState('idle');
    } finally {
      busyRef.current = false;
    }
  }

  function endCall() {
    stopVoiceCall();
    setState('ended');
  }

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

  const active = state === 'in_call' || state === 'on_hold' || state === 'connecting';
  const statusText = {
    idle: 'Tap to speak with a Meridian Energy support agent',
    connecting: 'Connecting…',
    in_call: 'Connected · the agent can hear you',
    on_hold: "You're on hold while an officer reviews",
    ended: 'Call ended'
  }[state];

  return (
    <main className="caller">
      <div className="caller-top">
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span> vocare</div>
        <span className="caller-tag"><ShieldCheck size={12} /> Synthetic demo</span>
      </div>

      <div className="caller-center">
        <motion.div
          className={`caller-orb ${state}`}
          animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ repeat: active ? Infinity : 0, duration: 2.4 }}
        >
          {state === 'on_hold' ? <PhoneCall size={44} /> : active ? <Mic size={44} /> : <PhoneCall size={44} />}
        </motion.div>

        <h1 className="caller-title">Meridian Energy</h1>
        <p className="caller-status">{statusText}</p>
        {lastAgent && active && <p className="caller-line">“{lastAgent}”</p>}
        {error && <p className="caller-error">{error}</p>}
      </div>

      <div className="caller-controls">
        {!active && state !== 'connecting' && (
          <button className="call-btn start" onClick={startCall}>
            <PhoneCall size={22} /> {state === 'ended' ? 'Call again' : 'Call agent'}
          </button>
        )}
        {active && (
          <>
            <button className={`round-btn ${muted ? 'on' : ''}`} onClick={toggleMute} aria-label="Mute">
              {muted ? <MicOff size={24} /> : <Mic size={24} />}
              <span>{muted ? 'Muted' : 'Mute'}</span>
            </button>
            <button className="round-btn end" onClick={endCall} aria-label="Hang up">
              <PhoneOff size={24} />
              <span>End</span>
            </button>
          </>
        )}
      </div>
    </main>
  );
}
