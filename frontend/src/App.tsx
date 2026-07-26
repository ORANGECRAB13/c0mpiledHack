import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowRight, BadgeCheck, BookOpen, BrainCircuit, Check, CheckCircle2, Clock3,
  Database, FileCheck2, FileText, Headphones, Landmark, Link2, Mail, Mic2, Network, Pause,
  PhoneCall, Play, Radio, ReceiptText, RotateCcw, SearchCheck, ShieldCheck, Sparkles, UserRound,
  WalletCards, Waves, X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, CaseView, Customer, DiscoveryStatus } from './api';
import ContextMesh3D from './ContextMesh3D';
import { runPhase1, runPhase2 } from './scripted';
import { startVoiceCall, stopVoiceCall } from './voice';
import { startVoiceCallWebRTC, stopVoiceCallWebRTC, sendResumeContext } from './voice-webrtc';

type Stage = 'onboarding' | 'ready' | 'detecting' | 'calling' | 'hold' | 'complete';
const money = (n: any) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 })}`);

const BrandMark = ({ violet }: { violet?: boolean }) => (
  <div className={`brand-mark ${violet ? 'violet' : ''}`} aria-hidden><span /><span /><span /></div>
);

function Waveform({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className={`waveform ${quiet ? 'quiet' : ''}`} aria-hidden>
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.i key={i}
          animate={quiet ? { height: 4 + (i % 3) } : { height: [5, 10 + ((i * 7) % 20), 5] }}
          transition={{ repeat: quiet ? 0 : Infinity, duration: 0.65 + (i % 5) * 0.12, delay: i * 0.025 }} />
      ))}
    </div>
  );
}

// The 7 context sources we light up during detection (maps to real graph nodes).
const detectNodes = [
  { label: 'Customer', icon: UserRound, key: 'crm' },
  { label: 'Invoices', icon: ReceiptText, key: 'inv' },
  { label: 'Payments', icon: WalletCards, key: 'pay' },
  { label: 'Contact notes', icon: Headphones, key: 'note' },
  { label: 'PUC rule', icon: Landmark, key: 'puc' },
  { label: 'Delegated authority', icon: BookOpen, key: 'sop' },
  { label: 'Benefit programs', icon: SearchCheck, key: 'prog' }
];

export default function App() {
  const [stage, setStage] = useState<Stage>('onboarding');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [backend, setBackend] = useState('…');
  const [voiceProvider, setVoiceProvider] = useState('azure');
  const [kase, setKase] = useState<CaseView | null>(null);
  const [sourcesLoaded, setSourcesLoaded] = useState(0);
  const [gap, setGap] = useState<any>(null);
  const [ratifier, setRatifier] = useState('Alex Morgan');
  const [offer, setOffer] = useState('130');
  const [officer, setOfficer] = useState('alex-morgan|Alex Morgan|L2');
  const [approvalErr, setApprovalErr] = useState('');
  const [activeSource, setActiveSource] = useState<any>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [audit, setAudit] = useState<any>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  // Which live-call implementation is running: WebRTC (ElevenLabs) has no
  // server-side session to auto-resume, so a few call sites need to know.
  const liveRtcRef = useRef(false);
  const resumedApprovalRef = useRef<string | null>(null);
  // Slide-style manual navigation: the presenter advances the big steps.
  const [detectReady, setDetectReady] = useState(false);
  const [callComplete, setCallComplete] = useState(false);
  const caseIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const completedRef = useRef(false);
  const erpFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Hold modal is reactive — it appears whenever the case is genuinely awaiting
  // a credit officer, independent of which slide the presenter is on.
  const onHold = kase?.stage === 'awaiting_credit_officer';

  useEffect(() => {
    api.health().then((h) => { setBackend(h.engine.backend); setVoiceProvider(h.providers?.voice?.provider || 'azure'); }).catch(() => setBackend('offline'));
    api.customers().then((c) => setCustomers(c.customers)).catch(() => {});
    api.resetDiscovery().then((d) => {
      setDiscovery(d.discovery);
      notifyErp(null, 0, 'empty');
    }).catch(() => {});
  }, []);

  const joanne = customers.find((c) => c.id === 'CUS-77241');
  const stack = kase?.stack;
  const activeDiscoveryAgent = discovery?.agents.find((agent) => agent.id === discovery.currentAgent);

  async function refresh() {
    const id = caseIdRef.current;
    if (!id) return;
    const { case: c } = await api.getCase(id);
    setKase(c);
    // No auto stage changes — the presenter advances slides. The hold modal is
    // derived from c.stage (onHold) so it still appears reactively on escalation.
    // But a mobile-driven call can complete on its own; when it does, load the
    // audit and unlock the outcome slide.
    if (c.stage === 'complete' && !completedRef.current) {
      completedRef.current = true;
      try {
        const a = await api.audit(id);
        setAudit(a.audit);
        setCallComplete(true);
      } catch { /* audit will be retried on next tick */ }
    }
    const g = await api.gaps();
    setGap(g.gaps.find((x: any) => x.status === 'open') || null);

    // WebRTC calls have no server-side session to auto-resume (the browser IS
    // the live session), so the poll is what notices a Band decision landed.
    // decideApproval leaves the case in `awaiting_credit_officer` until
    // something calls resume — for the scripted/Azure paths that's
    // resumeLiveCall or the officer's own Next click; here, we do it.
    if (
      liveRtcRef.current &&
      c.stage === 'awaiting_credit_officer' &&
      c.approval?.status &&
      c.approval.status !== 'requested' &&
      c.approval.decidedAt &&
      c.approval.decidedAt !== resumedApprovalRef.current
    ) {
      resumedApprovalRef.current = c.approval.decidedAt;
      const text = c.approval.status === 'approved'
        ? `A credit officer approved $${c.approval.approvedAmount} per month. ${c.approval.instruction || ''} Thank the customer for holding, tell them the approved amount and that the full benefit package still applies, and ask them to confirm.`
        : `A credit officer declined that amount. ${c.approval.instruction || ''} Thank the customer for holding and offer the standard sustainable amount instead.`;
      sendResumeContext(text);
      await api.resume(id);
      await refresh();
    }
  }

  const say = async (speaker: 'agent' | 'customer', text: string, pauseMs = 900) => {
    const id = caseIdRef.current!;
    await api.transcript(id, speaker, text);
    await refresh();
    await new Promise((r) => setTimeout(r, pauseMs));
  };

  function notifyErp(agentId: string | null, progress = 0, status = 'running') {
    erpFrameRef.current?.contentWindow?.postMessage({
      type: 'vocare:discovery',
      agentId,
      progress,
      status
    }, window.location.origin);
  }

  async function runDiscovery() {
    if (busyRef.current || !discovery) return;
    busyRef.current = true;
    setDiscoveryRunning(true);
    setError('');
    try {
      let current = discovery;
      if (current.status === 'complete') {
        const resetResult = await api.resetDiscovery();
        current = resetResult.discovery;
        setDiscovery(current);
        notifyErp(null, 0, 'empty');
      }
      const batchSizes: Record<string, number> = {
        regulatory: 9,
        customer: 400,
        benefits: 16,
        relationships: 3
      };
      for (const queuedAgent of current.agents) {
        let activeAgent = current.agents.find((item) => item.id === queuedAgent.id)!;
        while (activeAgent.status !== 'complete') {
          notifyErp(activeAgent.id, activeAgent.progress || 0, 'running');
          setDiscovery((value) => value ? {
            ...value,
            status: 'running',
            currentAgent: activeAgent.id,
            agents: value.agents.map((item) =>
              item.id === activeAgent.id ? { ...item, status: 'running' } : item
            )
          } : value);
          const [result] = await Promise.all([
            api.runDiscoveryAgent(activeAgent.id, batchSizes[activeAgent.id] || 20),
            new Promise((resolve) => setTimeout(resolve, 950))
          ]);
          current = result.discovery;
          activeAgent = current.agents.find((item) => item.id === queuedAgent.id)!;
          setDiscovery(current);
          notifyErp(activeAgent.id, activeAgent.progress, activeAgent.status);
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      notifyErp(null, 100, 'complete');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDiscoveryRunning(false);
      busyRef.current = false;
    }
  }

  async function start() {
    if (busyRef.current || !joanne) return;
    busyRef.current = true;
    setError('');
    setDetectReady(false);
    try {
      await api.reset();
      const { case: c } = await api.startCase(joanne.id);
      caseIdRef.current = c.caseId;
      setKase(c);
      setStage('detecting');
      // Animate the source nodes lighting up, then STOP and wait for the presenter
      // to advance to the call (no auto-transition).
      for (let i = 1; i <= detectNodes.length; i++) {
        await new Promise((r) => setTimeout(r, 360));
        setSourcesLoaded(i);
      }
      setDetectReady(true);
    } catch (e: any) { setError(e.message); } finally { busyRef.current = false; }
  }

  async function runScript() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    try {
      await runPhase1(caseIdRef.current!, say, refresh);
      // requestApproval moved us to hold; refresh will flip the stage.
      await refresh();
    } catch (e: any) { setError(e.message); } finally { busyRef.current = false; }
  }

  async function approve() {
    if (busyRef.current) return;
    busyRef.current = true;
    setApprovalErr('');
    try {
      const [id, name, authority] = officer.split('|');
      const res = await api.decideApproval(caseIdRef.current!, {
        decision: 'approved', approvedAmount: Number(offer),
        officer: { id, name, role: 'credit_officer', authority }
      });
      if (!res.accepted) { setApprovalErr(res.validation.reason); busyRef.current = false; return; }
      const approved = res.approval.approvedAmount;
      if (res.approval.clamped) setApprovalErr(res.clamp.reason);

      // Live mobile call: the backend already resumed the ElevenLabs session, and
      // the agent will finish the call with the customer. We just keep observing —
      // the polling loop will pick up completion and load the audit.
      if (res.resumedLiveCall) { busyRef.current = false; return; }

      // Scripted (laptop-driven) call: continue the scripted conversation here.
      await api.resume(caseIdRef.current!);
      await refresh();
      const s = kase!.stack;
      await runPhase2(
        caseIdRef.current!, approved,
        s.eligible.map((e) => e.name), s.eligible.map((e) => e.id),
        s.totals.benefitsUnlocked, say, refresh
      );
      const a = await api.audit(caseIdRef.current!);
      setAudit(a.audit);
      setCallComplete(true);
    } catch (e: any) { setError(e.message); } finally { busyRef.current = false; }
  }

  async function ratify() {
    if (!gap) return;
    try {
      await api.ratify(gap.id, { ratifiedBy: ratifier, authority: 'L2 credit officer', caseId: caseIdRef.current });
      setGap(null);
    } catch (e: any) { setError(e.message); }
  }

  // ElevenLabs always goes over WebRTC now — direct browser↔ElevenLabs, no
  // server-side μ-law relay. Azure still goes through the old WS relay (it
  // was never on μ-law; that pipeline is unaffected). One button, one `live`
  // flag; `liveRtcRef` just remembers which implementation is running so
  // stop/reset and the Band-resume poll (see refresh()) call the right one.
  async function toggleLive() {
    if (live) {
      if (liveRtcRef.current) await stopVoiceCallWebRTC(); else stopVoiceCall();
      liveRtcRef.current = false; setLive(false);
      return;
    }
    setError('');
    try {
      if (!caseIdRef.current) {
        await api.reset();
        const { case: c } = await api.startCase('CUS-77241');
        caseIdRef.current = c.caseId; setKase(c); setStage('calling');
      }
      const onEvent = async (e: any) => {
        if (['transcript', 'case_changed', 'held', 'resumed', 'gap_flagged'].includes(e.type)) await refresh();
        if (e.type === 'error') setError(e.message);
        if (e.type === 'closed') { liveRtcRef.current = false; setLive(false); }
      };
      if (voiceProvider === 'elevenlabs') {
        resumedApprovalRef.current = null;
        liveRtcRef.current = true;
        await startVoiceCallWebRTC(caseIdRef.current!, onEvent);
      } else {
        liveRtcRef.current = false;
        await startVoiceCall(caseIdRef.current!, onEvent);
      }
      setLive(true);
    } catch (e: any) { setError(e.message); }
  }

  function reset() {
    if (liveRtcRef.current) stopVoiceCallWebRTC().catch(() => {}); else stopVoiceCall();
    liveRtcRef.current = false; resumedApprovalRef.current = null;
    caseIdRef.current = null;
    setKase(null); setStage('onboarding'); setSourcesLoaded(0); setGap(null); setAudit(null);
    setDocOpen(false); setActiveSource(null); setLive(false); setApprovalErr(''); setError('');
    setDetectReady(false); setCallComplete(false); completedRef.current = false;
    setDiscoveryRunning(false);
    Promise.all([api.reset(), api.resetDiscovery()])
      .then(([, result]) => {
        setDiscovery(result.discovery);
        notifyErp(null, 0, 'empty');
      })
      .catch(() => {});
  }

  // ── slide-style navigation ──────────────────────────────────────────
  // The presenter advances the big steps with the Next button, → or Space.
  // A step only lets you advance once its content is ready.
  // The call is advanceable once it has produced its outcome. `complete` is the
  // full happy path; but a call can also come to rest at benefits_resolved (or
  // customer_accepted/executing) without every downstream step firing — the
  // presenter must never be trapped on the call slide. The audit builds from the
  // event log at any stage, so we can always show the outcome.
  const callProgressed =
    callComplete ||
    ['benefits_resolved', 'customer_accepted', 'executing', 'complete'].includes(kase?.stage || '');

  const canAdvance =
    (stage === 'onboarding' && discovery?.status === 'complete') ||
    (stage === 'ready' && !!joanne) ||
    (stage === 'detecting' && detectReady) ||
    (stage === 'calling' && callProgressed);
  const advanceHint =
    stage === 'onboarding' ? (discovery?.status === 'complete' ? 'Continue to detect' : 'Build the graph first')
    : stage === 'ready' ? 'Start the workflow'
    : stage === 'detecting' ? (detectReady ? 'Begin the call' : 'Resolving context…')
    : stage === 'calling' ? (callProgressed ? 'See the outcome' : onHold ? 'Approve to continue' : 'Run the call, then advance')
    : '';

  async function goNext() {
    if (busyRef.current) return;
    if (stage === 'onboarding' && discovery?.status === 'complete') { setStage('ready'); return; }
    if (stage === 'ready') { await start(); return; }
    if (stage === 'detecting' && detectReady) {
      setStage('calling'); // switch the slide immediately; wire the call behind it
      api.beginCall(caseIdRef.current!, 'scripted').then(refresh).catch((e) => setError(e.message));
      return;
    }
    if (stage === 'calling' && callProgressed) {
      // Ensure the audit is loaded (it may not be if we advance before `complete`).
      try {
        const a = await api.audit(caseIdRef.current!);
        setAudit(a.audit);
      } catch (e: any) { setError(e.message); return; }
      setStage('complete');
      return;
    }
  }

  function goBack() {
    const order: Stage[] = ['onboarding', 'ready', 'detecting', 'calling', 'complete'];
    const i = order.indexOf(stage === 'hold' ? 'calling' : stage);
    if (i > 0) setStage(order[i - 1]);
  }

  // Observe the shared case: while on the call slide, poll so a mobile-driven
  // call updates the transcript, benefits, escalation and audit here live.
  useEffect(() => {
    if (stage !== 'calling' || !caseIdRef.current) return;
    const t = setInterval(() => { if (!busyRef.current) refresh().catch(() => {}); }, 1500);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const flowActive = { onboarding: 0, ready: 1, detecting: 2, calling: 3, hold: 3, complete: 4 }[stage];

  return (
    <main className="vocare-app">
      <div className="ambient-grid" aria-hidden />

      <header className="topbar">
        <div className="brand"><BrandMark /><span>vocare</span></div>
        <div className="flow-nav">
          {['Onboard', 'Detect', 'Assemble', 'Engage', 'Execute'].map((s, i) => (
            <div className={i <= flowActive ? 'active' : ''} key={s}>
              <span>{i < flowActive ? <Check size={10} /> : i + 1}</span><em>{s}</em>
              {i < 4 && <i />}
            </div>
          ))}
        </div>
        <div className="top-actions">
          <span className={`engine-online ${backend !== 'neo4j' ? 'fallback' : ''}`}>
            <Radio size={10} /> Context engine {backend === 'offline' ? 'offline' : 'online'}
          </span>
          <button className="reset-button" onClick={reset} aria-label="Restart"><RotateCcw size={14} /></button>
          <div className="operator-avatar">AM</div>
        </div>
      </header>

      {/* Stages render without an outer AnimatePresence: each fades in on mount and
          unmounts instantly, so a re-render during a transition can never deadlock. */}
      <>
        {stage === 'onboarding' && (
          <motion.section key="onboarding" className="screen onboarding-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
            <div className="erp-stage">
              <div className="erp-frame-head">
                <div><Database size={13} /><span>CALIFORNIA GRID ERP</span></div>
                <em>SYNTHETIC DEMO</em>
              </div>
              <iframe
                ref={erpFrameRef}
                className="erp-frame"
                src="/erp/"
                title="California Grid ERP synthetic demo"
                loading="eager"
                onLoad={() => notifyErp(discovery?.currentAgent || null, discovery?.currentAgent
                  ? discovery.agents.find((agent) => agent.id === discovery.currentAgent)?.progress || 0
                  : 0, discovery?.status || 'empty')}
              />
            </div>

            <div className="onboarding-graph">
              <div className="graph-stage-head">
                <div>
                  <span>LIVE CONTEXT GRAPH</span>
                  <strong>
                    {discovery?.status === 'complete'
                      ? 'Population complete'
                      : activeDiscoveryAgent
                        ? `${activeDiscoveryAgent.name} · ${activeDiscoveryAgent.progress}%`
                        : 'Waiting for discovery'}
                  </strong>
                </div>
                <div className="graph-head-actions">
                  <em className={discovery?.status || 'empty'}><i /> {discovery?.status || 'empty'}</em>
                  <button className="graph-discovery-button" onClick={runDiscovery} disabled={!discovery || discoveryRunning}>
                    {discoveryRunning ? <i className="discovery-spinner" /> : <Network size={12} />}
                    {discoveryRunning ? 'Discovering' : discovery?.status === 'complete' ? 'Rebuild' : 'Run discovery'}
                  </button>
                </div>
              </div>
              <ContextMesh3D dense={false} refreshKey={discovery?.version ?? 0} />
              <div className="graph-provenance"><FileCheck2 size={12} /> Every node retains its source file and discovery-agent lineage.</div>
            </div>
          </motion.section>
        )}

        {stage === 'ready' && (
          <motion.section key="ready" className="screen ready-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
            <div className="ready-main">
              <div className="eyebrow"><Activity size={12} /> US multi-state utility · autonomous hardship intake</div>
              <h1>From missed hardship signal<br /><span>to a governed, statute-cited outcome.</span></h1>
              <p>
                Vocare calls a customer in arrears, resolves their state's shutoff rules and benefit
                eligibility deterministically, and turns a collections call into a benefits-enrolment
                call — escalating to a human only when the rules require it.
              </p>
              <button className="start-button" onClick={start} disabled={!joanne}>
                <span className="start-icon"><Play size={15} fill="currentColor" /></span>
                <span><strong>Start hardship workflow</strong><small>{joanne ? `${joanne.name} · ${joanne.city}, ${joanne.state}` : 'loading…'}</small></span>
                <ArrowRight size={17} />
              </button>
              <div className="one-click-note"><Sparkles size={12} /> One click runs detection, context assembly and the outbound call.</div>
            </div>
            {joanne && (
              <div className="case-preview">
                <div className="preview-head"><span>CUSTOMER IN FOCUS</span><em>Ready to analyse</em></div>
                <div className="preview-customer">
                  <div className="customer-avatar">JN</div>
                  <div><h2>{joanne.name}</h2><p>{joanne.city}, {joanne.state} · Electricity</p></div>
                  <strong>{money(joanne.arrears)}<small>outstanding</small></strong>
                </div>
                <div className="preview-signals">
                  <div><span><ReceiptText size={14} /></span><p>Stale 2019 record<strong>Household of 2 · ${joanne.declaredAnnualIncome.toLocaleString()}</strong></p></div>
                  <div><span><WalletCards size={14} /></span><p>Disconnection notice<strong>{joanne.hasDisconnectionNotice ? 'On file' : 'None'}</strong></p></div>
                  <div><span><Headphones size={14} /></span><p>Eligible today, on record<strong>$0 in benefits</strong></p></div>
                </div>
                <div className="preview-foot"><ShieldCheck size={13} /> Synthetic customer · governed demonstration</div>
              </div>
            )}
          </motion.section>
        )}

        {stage === 'detecting' && (
          <motion.section key="detecting" className="screen detect-screen-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <div className="context-map-full">
              <ContextMesh3D refreshKey={discovery?.version ?? 0} />
            </div>
          </motion.section>
        )}

        {stage === 'calling' && stack && (
          <motion.section key="call" className="screen call-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <div className="call-head">
              <div>
                <span className={`call-status ${onHold ? 'holding' : ''}`}>
                  <i /> {onHold ? 'CUSTOMER ON HOLD' : live ? `LIVE MIC · ${voiceProvider === 'elevenlabs' ? 'ELEVENLABS WEBRTC' : 'AZURE REALTIME'}` : 'LIVE OUTBOUND CALL'}
                </span>
                <h1>{stack.customerName}</h1>
                <p>{stack.jurisdiction.state.name} · {stack.jurisdiction.state.regulatorAbbr} · Identity verified · Meridian Energy</p>
              </div>
              <div className="call-controls">
                <Waves size={18} />
                <button className={`mic-btn ${live ? 'live' : ''}`} onClick={toggleLive}>
                  <Mic2 size={14} /> {live ? 'End live call' : 'Live mic call'}
                </button>
                {!live && stage === 'calling' && kase!.transcript.length === 0 && (
                  <button className="mic-btn" onClick={runScript}><Play size={13} /> Run scripted customer</button>
                )}
              </div>
            </div>

            <div className="call-columns">
              {/* left: focal benefit moment + transcript */}
              <div>
                <UnlockFocal stack={stack} />
                <div className="panel transcript-panel" style={{ marginTop: 14 }}>
                  <div className={`voice-strip ${onHold ? 'on-hold' : ''}`}>
                    <div className="voice-orb">{onHold ? <Pause size={17} /> : <Mic2 size={18} />}</div>
                    <Waveform quiet={onHold} />
                    <span>{onHold ? 'Secure hold · credit officer connected' : 'Vocare is speaking with the customer'}</span>
                  </div>
                  <div className="transcript-list">
                    <AnimatePresence initial={false}>
                      {kase!.transcript.map((line, i) => (
                        <motion.div className={`transcript-row ${line.speaker === 'customer' ? 'customer' : 'agent'}`}
                          key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                          <div className="speaker">
                            <span>{line.speaker === 'customer' ? 'JN' : <BrandMark />}</span>
                            <p><strong>{line.speaker === 'customer' ? stack.customerName.split(' ')[0] : 'Vocare'}</strong></p>
                          </div>
                          <p className="utterance">{line.text}</p>
                        </motion.div>
                      ))}
                      {kase!.transcript.length === 0 && (
                        <p style={{ color: 'var(--muted)', fontSize: 12, padding: '16px 0' }}>Start the scripted customer or a live mic call.</p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* right: decision trace + knowledge gap */}
              <div>
                <div className="panel reasoning-panel">
                  <div className="panel-title">
                    <div><BrainCircuit size={15} /><p><strong>Decision trace</strong><small>Governed reasoning with statute lineage</small></p></div>
                    <span className="live-badge">LIVE</span>
                  </div>
                  <div className="trace-list">
                    <AnimatePresence initial={false}>
                      {[...kase!.traces].reverse().map((t, i) => (
                        <motion.div className={`trace-card ${/authority/i.test(t.title) ? 'escalation' : ''}`} key={i}
                          initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                          <div className="trace-line"><span>{/authority/i.test(t.title) ? <ShieldCheck size={14} /> : <Sparkles size={14} />}</span>{i < kase!.traces.length - 1 && <i />}</div>
                          <div>
                            <div className="trace-head"><strong>{t.title}</strong><em>{/authority/i.test(t.title) ? 'CONTROL' : 'REASONING'}</em></div>
                            <p>{t.conclusion}</p>
                            <div className="trace-sources">
                              {(t.evidence || []).slice(0, 4).map((e: any, k: number) => (
                                <button className="source-chip" key={k} onClick={() => setActiveSource({ id: e.sourceId, statement: e.statement, citation: t.authority?.rule })}>
                                  <Link2 size={10} /> {e.sourceId}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
                {gap && (
                  <div className="gap-card">
                    <div className="hd"><span>KNOWLEDGE GAP · NEEDS RATIFICATION</span><ShieldCheck size={13} color="var(--amber)" /></div>
                    <h4>{gap.programMentioned}</h4>
                    <blockquote>"{gap.customerQuote}"</blockquote>
                    <p className="note">The agent did not assert eligibility. It cannot use this until a human ratifies it.</p>
                    <div className="gap-actions">
                      <input value={ratifier} onChange={(e) => setRatifier(e.target.value)} aria-label="Ratified by" />
                      <button onClick={ratify}>Ratify</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence>
              {onHold && kase!.approval && (
                <motion.div className="credit-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.div className="credit-modal" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
                    <div className="credit-top">
                      <div className="credit-icon"><ShieldCheck size={20} /></div>
                      <div>
                        <span>HUMAN AUTHORITY REQUEST</span>
                        <h2>What's the lowest sustainable amount?</h2>
                        <p>The customer is on hold. Vocare consolidated the full request so this is the only interruption.</p>
                      </div>
                      <span className="hold-clock"><Clock3 size={12} /> 00:14</span>
                    </div>
                    <div className="credit-grid">
                      <div>
                        <span>CUSTOMER ASK</span>
                        <strong>{money(kase!.approval.requestedAmount)}<small>/mo</small></strong>
                        <p>Below the delegated floor.</p>
                      </div>
                      <div className="boundary-card">
                        <span>DELEGATED FLOOR</span>
                        <strong>{money(kase!.approval.floor)}<small>/mo</small></strong>
                        <p>{stack.boundaries.authoritySourceId}</p>
                      </div>
                      <div>
                        <span>AFFORDABILITY CAP</span>
                        <strong>{money(kase!.approval.ceiling)}<small>/mo</small></strong>
                        <p>6% of income — the agent may not exceed this.</p>
                      </div>
                    </div>
                    {approvalErr && <div className="credit-err">{approvalErr}</div>}
                    <div className="officer-input">
                      <label>
                        <span>Approved amount</span>
                        <div className="amt"><b>$</b><input value={offer} onChange={(e) => setOffer(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Approved amount" /><em>/mo</em></div>
                      </label>
                      <label>
                        <span>Officer</span>
                        <select value={officer} onChange={(e) => setOfficer(e.target.value)}>
                          <option value="alex-morgan|Alex Morgan|L2">Alex Morgan · L2</option>
                          <option value="jamie-fox|Jamie Fox|L1">Jamie Fox · L1 (under authority)</option>
                        </select>
                      </label>
                    </div>
                    <div className="credit-actions">
                      <div className="who"><div className="operator-avatar">AM</div><div><strong>{officer.split('|')[1]}</strong><small>Credit officer · Authority {officer.split('|')[2]}</small></div></div>
                      <button className="approve-btn" onClick={approve}>Approve {money(Number(offer))} & resume <ArrowRight size={14} /></button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {stage === 'complete' && audit && (
          <motion.section key="complete" className="screen complete-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <div className="success-head">
              <motion.div className="success-icon" initial={{ scale: 0.5 }} animate={{ scale: 1 }}><Check size={27} /></motion.div>
              <div>
                <div className="eyebrow"><BadgeCheck size={12} /> Workflow complete</div>
                <h1>Plan confirmed. Every action mapped to a statute.</h1>
                <p>{audit.header.customer} is protected, benefits are submitted, and the decision record is sealed.</p>
              </div>
              <button className="replay-button" onClick={reset}><Play size={13} /> Replay demo</button>
            </div>

            <div className="execution-row">
              {audit.execution.map((e: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <span>{iconFor(e.system)}<i><Check size={8} /></i></span>
                  <p><strong>{titleFor(e.system)}</strong><small>{e.action.replace(/_/g, ' ')}</small></p>
                </motion.div>
              ))}
            </div>

            <div className="complete-grid">
              <div className="panel">
                <div className="panel-title"><div><ShieldCheck size={15} /><p><strong>Compliance determinations</strong><small>Each outcome bound to its statute</small></p></div><span className="live-badge">SEALED</span></div>
                <div className="determination-list">
                  {audit.complianceDeterminations.map((d: any, i: number) => (
                    <div className="determination" key={i}>
                      <span><Check size={12} /></span>
                      <div><strong>{d.determination}</strong><p>{d.outcome}</p><span className="st">{d.statute}</span></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel document-card">
                <div className="eyebrow"><FileText size={11} /> Auditable document</div>
                <h2>Decision record ready for review.</h2>
                <p>Call summary, statute-cited determinations, human approval, benefit stack, consent, and every context source — assembled from the deterministic event log alone.</p>
                <div className="doc-includes">
                  <span><Check size={10} /> Call transcript</span>
                  <span><Check size={10} /> Compliance determinations</span>
                  <span><Check size={10} /> Credit-officer approval</span>
                  <span><Check size={10} /> Source manifest · checksum</span>
                </div>
                <button className="open-doc" onClick={() => setDocOpen(true)}>Open audit document <ArrowRight size={14} /></button>
              </div>
            </div>
          </motion.section>
        )}
      </>

      {/* source drawer */}
      <AnimatePresence>
        {activeSource && (
          <>
            <motion.button className="drawer-scrim" aria-label="Close" onClick={() => setActiveSource(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside className="source-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
              <div className="drawer-head"><span>SOURCE EVIDENCE</span><button onClick={() => setActiveSource(null)} aria-label="Close"><X size={15} /></button></div>
              <div className="drawer-icon"><FileCheck2 size={20} /></div>
              <span className="drawer-system">Context source</span>
              <h2>{activeSource.id}</h2>
              <p className="drawer-detail">{activeSource.statement}</p>
              {activeSource.citation && <p className="drawer-detail" style={{ color: 'var(--muted)' }}>{activeSource.citation}</p>}
              <div className="source-metadata">
                <div><span>Source ID</span><strong>{activeSource.id}</strong></div>
                <div><span>Integrity</span><strong><ShieldCheck size={11} /> Checksum verified</strong></div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* audit document */}
      <AnimatePresence>
        {docOpen && audit && (
          <motion.div className="document-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDocOpen(false)}>
            <motion.article className="audit-document" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
              <button className="close-document" onClick={() => setDocOpen(false)} aria-label="Close"><X size={16} /></button>
              <div className="audit-doc-head"><div className="brand"><BrandMark /><span>vocare</span></div><span>{audit.header.auditId}</span></div>
              <div className="audit-title"><span>US HARDSHIP DECISION RECORD</span><h1>{audit.header.customer}</h1><p>{audit.header.caseId} · {audit.header.state} · Meridian Energy</p></div>
              <section>
                <h3>1. Compliance determinations</h3>
                <div className="det-table">
                  {audit.complianceDeterminations.map((d: any, i: number) => (
                    <div className="row" key={i}><strong>{d.determination}</strong><span>{d.outcome}</span><span className="st">{d.statute}</span></div>
                  ))}
                </div>
              </section>
              <section>
                <h3>2. Jurisdiction</h3>
                <p>{audit.jurisdiction.pucRule.sourceId} — {audit.jurisdiction.pucRule.citation}. Disconnection protection: {audit.jurisdiction.protectedFromDisconnection ? 'ACTIVE today.' : 'not active.'}</p>
              </section>
              <section>
                <h3>3. Context sources used</h3>
                <div className="manifest">
                  {audit.integrity.sourceIds.slice(0, 10).map((id: string) => (
                    <div key={id}><Link2 size={10} /><span>{id}</span><CheckCircle2 size={11} className="ok" /></div>
                  ))}
                </div>
              </section>
              <div className="audit-signatures">
                <div><span>HUMAN APPROVAL</span><strong>{audit.approval?.officer?.name || '—'}</strong><p>Authority {audit.approval?.officer?.authority || '—'}</p></div>
                <div><span>INTEGRITY</span><strong><ShieldCheck size={13} /> SHA-256 sealed</strong><p>{audit.integrity.checksum}</p></div>
              </div>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <div className="err-bar">{error}</div>}

      {/* slide-style navigation — Next / Back, or → / Space / ← */}
      {stage !== 'complete' && (
        <div className="slide-nav">
          <button className="nav-back" onClick={goBack} disabled={stage === 'onboarding'} aria-label="Back">‹</button>
          <span className="nav-hint">{advanceHint}</span>
          <button className="nav-next" onClick={goNext} disabled={!canAdvance}>
            Next <ArrowRight size={15} />
          </button>
        </div>
      )}

      {stage !== 'detecting' && (
        <footer><span>VOCARE · DETERMINISTIC COMPLIANCE ENGINE</span><span>Synthetic demonstration · No real customer data</span></footer>
      )}
    </main>
  );
}

function UnlockFocal({ stack }: { stack: any }) {
  const t = stack.totals;
  const zero = !t.benefitsUnlocked;
  return (
    <div className={`panel unlock-focal ${zero ? 'zero' : ''}`}>
      <div className="lab">Benefits unlocked</div>
      <div className="big">{money(t.benefitsUnlocked)}</div>
      <div className="sub">{zero ? `Against ${money(t.arrears)} in arrears · nothing resolves on the current record` : `${money(t.grantApplied)} applied now · ${money(t.forgivenessAvailable)} forgiven over time · ${money(t.monthlyPayment)}/mo going forward`}</div>
      {stack.eligible.length > 0 && (
        <div className="benefit-rows">
          {stack.eligible.map((e: any) => (
            <div className={`benefit-chip ${stack.household.changedOnCall ? 'gain' : ''}`} key={e.id}>
              <span className="nm">{e.name}</span>
              <span className="val">{e.kind === 'PIPP' ? `${money(e.cappedMonthlyPayment)}/mo` : money(e.estimatedValue)}</span>
              <span className="src">{e.sourceId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function iconFor(system: string) {
  if (system.includes('crm')) return <Database size={16} />;
  if (system.includes('disconnection')) return <ShieldCheck size={16} />;
  if (system.includes('payment')) return <WalletCards size={16} />;
  if (system.includes('benefit')) return <BadgeCheck size={16} />;
  return <Mail size={16} />;
}
function titleFor(system: string) {
  if (system.includes('crm')) return 'CRM updated';
  if (system.includes('disconnection')) return 'Shutoff hold placed';
  if (system.includes('payment')) return 'Plan activated';
  if (system.includes('benefit')) return 'Benefit submitted';
  return 'Confirmation sent';
}
