import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowRight, BadgeCheck, BookOpen, BrainCircuit, Check, CheckCircle2, Clock3,
  Database, FileCheck2, FileText, Headphones, Landmark, Link2, Mail, Mic2, Network, Pause,
  PhoneCall, Play, Radio, ReceiptText, RotateCcw, SearchCheck, ShieldCheck, Sparkles, UserRound,
  WalletCards, Waves, X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, CaseView, Customer, DiscoveryStatus } from './api';
import ContextMesh3D, { MeshCinema } from './ContextMesh3D';
import { runPhase1, runPhase2 } from './scripted';
import { startVoiceCall, stopVoiceCall, setBargeIn } from './voice';
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

// ── AER credit-officer workflow (NERR v51) ────────────────────────────
// The operational steps a credit officer follows when processing a hardship
// payment, per the AER Customer Hardship Policy Guideline and NERR Part 3.
// Rendered at the human-authority gate so the approval happens inside the
// regulated sequence, not beside it.
const AER_WORKFLOW = [
  { rule: 'NERR r71', label: 'Hardship identified — policy notice given', detail: 'Customer informed of the hardship policy as soon as practicable; free copy on request.' },
  { rule: 'NERR r33(3)', label: 'Rebates & concessions disclosed', detail: 'Government energy rebate, concession and relief schemes explained.' },
  { rule: 'NERR r72', label: 'Capacity-to-pay plan built', detail: 'Instalments set from capacity to pay, arrears, and expected 12-month usage.' },
  { rule: 'NERR r74', label: 'Centrepay offered', detail: 'Centrepay allowed on request; contract reviewed at no charge if unsupported.' },
  { rule: 'NERR r76 / r40', label: 'No late fees or deposits', detail: 'Late-payment fees waived; no security deposit taken from a hardship customer.' },
  { rule: 'NERR r111(2) / r116', label: 'Disconnection safeguards held', detail: 'No disconnection while adhering to a plan; two-plan rule and protected periods apply.' }
] as const;

// ── Detect sequence ───────────────────────────────────────────────────
// Four hops, deliberately. Each hop is one question the engine has to answer,
// not one node it happens to touch — so a hop may sweep several nodes while the
// narration card stays open on the single finding that hop produced.
//
// Node ids are read off the live case rather than hard-coded, so the camera is
// genuinely flying to the records the compliance engine resolved.

type Beat = {
  key: string;
  title: string;
  detail: string;
  facts: string[];
  icon: any;
  kind: 'alert' | 'trace' | 'resolved' | 'external';
  /** Nodes this hop visits, in order. The first is where the camera lands. */
  stops: string[];
  inject?: { id: string; title: string; meta: string; group: string; anchor: string };
  radius?: number;
  hold: number;
};

function buildDetectScript(stack: any, hardship: any): Beat[] {
  const beats: Beat[] = [];
  const customerId = stack.customerId;
  const invoice = stack.account?.invoice;
  const payment = stack.account?.payment;
  const notes = stack.account?.notes || [];
  const failedId = `INV-FAILED-${stack.caseId}`;

  // ── Hop 1 — the trigger ──
  beats.push({
    key: 'arrive',
    title: 'Failed payment posted',
    detail: 'A returned direct debit lands in the graph and attaches to the account it belongs to.',
    facts: [
      `${money(payment?.lastSuccessfulAmount ?? 0)} returned unpaid`,
      `Account ${customerId} · ${stack.customerName}`,
      `${money(stack.account?.arrears)} now outstanding`
    ],
    icon: ReceiptText,
    inject: {
      id: failedId,
      title: `Failed payment · ${stack.customerName}`,
      meta: 'AccountRecord · returned unpaid · just now',
      group: 'AccountRecord',
      anchor: customerId
    },
    stops: [failedId],
    kind: 'alert',
    radius: 96,
    hold: 4200
  });

  // ── Hop 2 — who is this, really ──
  // The Crustdata pass. Whatever it actually returned goes on the card, including
  // the case where identity could not be resolved — a blank result is a finding.
  const external = hardship?.external;
  const identity = external?.identity;
  const externalFacts: string[] = [];
  if (identity?.resolved) {
    externalFacts.push(`Public profile matched · confidence ${identity.confidence}`);
    for (const signal of (external.signals || []).slice(0, 2)) externalFacts.push(signal.label);
    externalFacts.push(`${external.score}/${external.cap} corroboration · capped by policy`);
  } else if (external?.attempted) {
    externalFacts.push('No public profile could be matched to this customer');
    externalFacts.push(external.reason || 'Identity unresolved');
    externalFacts.push('Assessment continues on internal records alone');
  } else {
    externalFacts.push('External lookup not enabled for this deployment');
    externalFacts.push(external?.reason || 'Internal records only');
  }

  beats.push({
    key: 'crustdata',
    title: identity?.resolved ? 'Public record corroborated' : 'Public record checked',
    detail: `Crustdata lookup against ${stack.customerName} — employment, employer health and local labour-market reporting.`,
    facts: externalFacts,
    icon: Link2,
    stops: [customerId],
    kind: 'external',
    radius: 112,
    hold: 5000
  });

  // ── Hop 3 — what the ledger already knew ──
  const historyStops = [invoice?.id, payment?.id, ...notes.slice(0, 2).map((n: any) => n.id)].filter(Boolean);
  const disclosure = notes.find((n: any) => (n.signals || []).includes('reduced_income_disclosure'));
  beats.push({
    key: 'history',
    title: 'Account history traced',
    detail: 'Billing, payment behaviour and every contact-centre note on this account.',
    facts: [
      invoice?.text || `${invoice?.unpaidInvoices ?? 0} unpaid invoices`,
      payment?.text || 'Payment summary retrieved',
      disclosure ? disclosure.text : `${notes.length} contact notes reviewed`
    ].filter(Boolean),
    icon: Headphones,
    stops: historyStops,
    kind: 'trace',
    radius: 106,
    hold: 5600
  });

  // ── Hop 4 — what the law says about it ──
  const activeMoratorium = stack.jurisdiction.moratoria?.find((m: any) => m.active);
  const programs = [...(stack.eligible || []), ...(stack.ineligible || [])].slice(0, 2);
  const ruleStops = [
    stack.jurisdiction.state.code,
    stack.jurisdiction.pucRule.sourceId,
    activeMoratorium?.sourceId,
    stack.boundaries.authoritySourceId,
    ...programs.map((p: any) => p.id)
  ].filter(Boolean);

  beats.push({
    key: 'rules',
    title: 'Jurisdiction and entitlements resolved',
    detail: `${stack.jurisdiction.state.name} rules govern this account (${stack.jurisdiction.state.regulatorAbbr}).`,
    facts: [
      stack.jurisdiction.pucRule.citation,
      activeMoratorium
        ? `Disconnection protection ACTIVE — ${activeMoratorium.reason}`
        : 'No disconnection moratorium active today',
      'Plan basis: capacity to pay · arrears · 12-month usage (NERR r72)',
      `Agent may settle at or above ${money(stack.boundaries.authorityFloor)} without a human`,
      stack.totals.benefitsUnlocked
        ? `${money(stack.totals.benefitsUnlocked)} in benefits resolves on the current record`
        : 'Nothing resolves on the current record — income data is stale'
    ],
    icon: Landmark,
    stops: ruleStops,
    kind: 'resolved',
    radius: 130,
    hold: 6000
  });

  return beats;
}

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
  // Barge-in is off by default: on laptop speakers the agent's own voice reaches
  // the mic, trips server VAD and makes the call interrupt itself. Safe on
  // headphones, where there is no acoustic path back.
  const [barge, setBarge] = useState(false);
  // Which live-call implementation is running: WebRTC (ElevenLabs) has no
  // server-side session to auto-resume, so a few call sites need to know.
  const liveRtcRef = useRef(false);
  const resumedApprovalRef = useRef<string | null>(null);
  // Slide-style manual navigation: the presenter advances the big steps.
  const [detectReady, setDetectReady] = useState(false);
  // Detect sequence: the camera controller, the narration beats played so far,
  // and whether the closing report has assembled.
  const cinemaRef = useRef<MeshCinema | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [beatIndex, setBeatIndex] = useState(-1);
  const [reportOpen, setReportOpen] = useState(false);
  const detectRunRef = useRef(0);
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
      // Fly the graph. Stops on the report and waits for the presenter — no
      // auto-transition into the call.
      await runDetectCinema(c);
    } catch (e: any) { setError(e.message); } finally { busyRef.current = false; }
  }

  /**
   * Plays the Detect sequence: the failed payment arrives as a node, the camera
   * dives to it, then walks the customer's history through the graph before the
   * findings assemble into a report.
   *
   * Every beat targets a node id taken from the resolved case, so this is a tour
   * of the real context graph rather than a canned animation over a picture of one.
   */
  async function runDetectCinema(c: CaseView) {
    const stack: any = c.stack;
    if (!stack) return;
    const run = ++detectRunRef.current;
    const alive = () => detectRunRef.current === run;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const script = buildDetectScript(stack, c.hardship);
    setBeats(script);
    setBeatIndex(-1);
    setReportOpen(false);
    setSourcesLoaded(0);

    // The mesh mounts with the slide and has to load three.js over the network
    // before it can accept commands; give it a moment rather than dropping beats.
    for (let i = 0; i < 60 && !cinemaRef.current; i += 1) await wait(100);
    if (!alive()) return;
    const cinema = cinemaRef.current;
    cinema?.reset();
    await wait(500);

    const visited: string[] = [];
    for (let i = 0; i < script.length; i += 1) {
      if (!alive()) return;
      const beat = script[i];
      if (beat.inject) cinemaRef.current?.inject(beat.inject);
      // Let an injected node reach its resting orbit before the camera commits,
      // otherwise the pivot chases it and the move reads as a drift.
      if (beat.inject) await wait(420);
      if (!alive()) return;

      // The card pops open for the whole hop; the camera meanwhile sweeps every
      // node this hop touches, dividing the hop's time between them.
      setBeatIndex(i);
      setSourcesLoaded(Math.min(detectNodes.length, i + 1));

      const stops = beat.stops.length ? beat.stops : [];
      const perStop = stops.length ? beat.hold / stops.length : beat.hold;
      for (const stop of stops) {
        if (!alive()) return;
        cinemaRef.current?.mark(stop, beat.kind);
        cinemaRef.current?.focus(stop, beat.radius);
        visited.push(stop);
        cinemaRef.current?.trail(visited);
        await wait(perStop);
      }
      if (!stops.length) await wait(beat.hold);
    }

    if (!alive()) return;
    // Pull back so the whole traversal is visible behind the report.
    cinemaRef.current?.focus(null);
    await wait(700);
    if (!alive()) return;
    setReportOpen(true);
    setDetectReady(true);
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

  /**
   * Jump straight to Engage.
   *
   * Skips the graph build and the Detect flythrough and lands on a live,
   * fully-resolved case. The call itself never depended on discovery — that
   * graph is for visualisation; the benefit stack resolves from the dataset —
   * so nothing downstream is missing, the presenter just doesn't watch it happen.
   */
  async function skipToEngage() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    try {
      // Abandon any Detect sequence still playing, or its beats keep firing
      // against a mesh that is no longer on screen.
      detectRunRef.current += 1;
      cinemaRef.current?.reset();
      setReportOpen(false);
      setBeats([]);
      setBeatIndex(-1);
      setAudit(null);
      setCallComplete(false);
      completedRef.current = false;

      await api.reset();
      const { case: c } = await api.startCase(joanne?.id || 'CUS-77241');
      caseIdRef.current = c.caseId;
      setKase(c);
      setDetectReady(true);
      setStage('calling');
      await api.beginCall(c.caseId, 'scripted');
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      busyRef.current = false;
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
          <motion.section
            key="onboarding"
            className={`screen onboarding-screen ${discovery?.status === 'complete' ? 'graph-maximized' : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22 }}
          >
            <div className="erp-stage" aria-hidden={discovery?.status === 'complete'}>
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
                tabIndex={discovery?.status === 'complete' ? -1 : 0}
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
                Vocare calls a customer in arrears, resolves their shutoff rules and benefit
                eligibility deterministically, and turns a collections call into a benefits-enrolment
                call — escalating to a credit officer only when the rules require it. The officer's
                approval runs inside the regulated hardship sequence: policy notice, capacity-to-pay
                plan, Centrepay, fee waivers, and disconnection safeguards.
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
              <ContextMesh3D refreshKey={discovery?.version ?? 0} cinemaRef={cinemaRef} />
            </div>

            {/* Narration rail — one line per camera move, newest at the bottom. */}
            <div className="detect-rail">
              <div className="detect-rail-head">
                <span>CONTEXT ENGINE</span>
                <strong>Tracing the record through the graph</strong>
              </div>
              <ol className="detect-beats">
                <AnimatePresence initial={false}>
                  {beats.slice(0, beatIndex + 1).map((beat, i) => {
                    const Icon = beat.icon;
                    const active = i === beatIndex && !reportOpen;
                    return (
                      // The active hop's card pops out to full size with its
                      // findings; once the hop is done it collapses back to a
                      // one-line entry so the rail stays readable.
                      <motion.li key={beat.key}
                        className={`detect-beat ${beat.kind} ${active ? 'active' : 'done'}`}
                        initial={{ opacity: 0, x: -14, scale: 0.96 }}
                        animate={{ opacity: active ? 1 : 0.62, x: 0, scale: active ? 1 : 0.955 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>
                        <i><Icon size={active ? 15 : 12} /></i>
                        <div>
                          <strong>{beat.title}</strong>
                          <AnimatePresence initial={false}>
                            {active && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                style={{ overflow: 'hidden' }}>
                                <p>{beat.detail}</p>
                                <ul className="beat-facts">
                                  {beat.facts.map((fact, f) => (
                                    <motion.li key={f}
                                      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: 0.14 + f * 0.16, duration: 0.3 }}>
                                      {fact}
                                    </motion.li>
                                  ))}
                                </ul>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <code>{beat.stops.length} node{beat.stops.length === 1 ? '' : 's'} · {beat.stops[0]}</code>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </div>

            {/* Closing report — what the traversal established, and the handoff. */}
            <AnimatePresence>
              {reportOpen && kase && (
                <motion.div className="detect-report"
                  initial={{ opacity: 0, y: 24, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
                  <DetectReport kase={kase} beats={beats} onEngage={goNext} />
                </motion.div>
              )}
            </AnimatePresence>
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
                <button
                  className={`mic-btn ${barge ? 'live' : ''}`}
                  title={barge
                    ? 'Barge-in ON — you can interrupt the agent. Use headphones, or it will interrupt itself.'
                    : 'Barge-in OFF — mic is muted while the agent speaks. Safe on laptop speakers.'}
                  onClick={() => { const v = !barge; setBarge(v); setBargeIn(v); }}>
                  <Headphones size={13} /> {barge ? 'Barge-in on' : 'Barge-in off'}
                </button>
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
                    <div className="aer-workflow">
                      <span className="aer-workflow-title"><BookOpen size={11} /> Credit-officer hardship workflow · AER guideline</span>
                      <ol>
                        {AER_WORKFLOW.map((s) => (
                          <li key={s.rule} title={s.detail}>
                            <i><Check size={9} /></i>
                            <p>{s.label}</p>
                            <code>{s.rule}</code>
                          </li>
                        ))}
                      </ol>
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
          {/* Presenter escape hatch: land on a live call without sitting through
              the graph build and the flythrough. */}
          {stage !== 'calling' && stage !== 'hold' && (
            <button className="nav-skip" onClick={skipToEngage} title="Skip the build and the flythrough — go straight to a live call">
              Skip to Engage
            </button>
          )}
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

/**
 * What the traversal established. Deliberately assembled from the case rather
 * than written into the animation — the risk tier, the signals and the source ids
 * are the same ones that land in the audit document.
 */
function DetectReport({ kase, beats, onEngage }: { kase: CaseView; beats: Beat[]; onEngage: () => void }) {
  const stack: any = kase.stack;
  const hardship = kase.hardship;
  const signals = [
    ...(hardship?.internal.signals || []),
    ...(hardship?.external.signals || [])
  ].sort((a, b) => b.weight - a.weight).slice(0, 4);
  const protectedToday = stack.jurisdiction.protectedFromDisconnection;

  return (
    <div className="panel report-card">
      <div className="report-head">
        <div>
          <span className="report-kicker"><FileCheck2 size={12} /> DETECTION REPORT</span>
          <h2>{stack.customerName}</h2>
          <p>
            {beats.length} hops · {beats.reduce((n, b) => n + b.stops.length, 0)} nodes traversed ·{' '}
            {stack.jurisdiction.state.name} · case {kase.caseId}
          </p>
        </div>
        {hardship && (
          <div className={`risk-dial ${hardship.tier}`}>
            <b>{hardship.score}</b>
            <span>{hardship.tier}</span>
          </div>
        )}
      </div>

      <div className="report-grid">
        <div className="report-stat">
          <span>Arrears</span>
          <strong>{money(stack.account?.arrears)}</strong>
        </div>
        <div className="report-stat">
          <span>Disconnection</span>
          <strong className={protectedToday ? 'ok' : 'warn'}>
            {protectedToday ? 'Protected today' : 'Not protected'}
          </strong>
        </div>
        <div className="report-stat">
          <span>Benefits on record</span>
          <strong className={stack.totals.benefitsUnlocked ? 'ok' : 'warn'}>
            {money(stack.totals.benefitsUnlocked)}
          </strong>
        </div>
      </div>

      {signals.length > 0 && (
        <ul className="report-signals">
          {signals.map((s) => (
            <li key={s.id} className={s.family}>
              <i>{s.family === 'external' ? <Link2 size={11} /> : <Database size={11} />}</i>
              <p>{s.label}</p>
              <code>{s.sourceId}</code>
            </li>
          ))}
        </ul>
      )}

      <div className="report-foot">
        <p><ShieldCheck size={12} /> {hardship?.recommendedAction || 'Proceed to contact.'}</p>
        <button className="report-cta" onClick={onEngage}>
          Engage <ArrowRight size={14} />
        </button>
      </div>
    </div>
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
