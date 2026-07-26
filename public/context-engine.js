// Live "context engine" visual: sources -> resolver -> governed output.
// Driven entirely by the real event bus over SSE (/api/stream) — no synthetic
// animation loop standing in for actual activity, only real workflow events.

const el = (id) => document.getElementById(id);
const feed = el('ce-feed');
const caseChip = el('case-chip');
const brain = el('brain');
const brainHint = el('brain-hint');
const actianNode = el('node-actian');
const actianStatus = el('actian-status');
const stackSummary = el('stack-summary');
const traceSummary = el('trace-summary');

const PULSE_MS = 1100;
let feedStarted = false;
let activeCaseId = null;

function fmtMoney(n) {
  if (n === null || n === undefined) return '$0';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function firePulse(key) {
  const pulse = el(`pulse-${key}`);
  const path = document.getElementById(`path-${key}`);
  if (!pulse || !path) return;
  const length = path.getTotalLength();
  const start = path.getPointAtLength(0);
  pulse.setAttribute('cx', start.x);
  pulse.setAttribute('cy', start.y);
  pulse.classList.remove('ce-pulse-fire');
  // Force reflow so the animation restarts on repeated events.
  void pulse.getBoundingClientRect();

  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / PULSE_MS);
    const point = path.getPointAtLength(t * length);
    pulse.setAttribute('cx', point.x);
    pulse.setAttribute('cy', point.y);
    if (t < 1) requestAnimationFrame(step);
  }
  pulse.classList.add('ce-pulse-fire');
  requestAnimationFrame(step);
}

function pulseBrain() {
  brain.classList.add('ce-brain-firing');
  setTimeout(() => brain.classList.remove('ce-brain-firing'), 500);
}

function setActive(caseActive) {
  brain.classList.toggle('ce-brain-active', caseActive);
  brainHint.textContent = caseActive ? 'Resolving' : 'Idle';
}

function markSourceActive(node) {
  node.classList.add('ce-node-active');
}

function addFeedItem({ kind, title, detail, timestamp }) {
  if (!feedStarted) {
    feed.innerHTML = '';
    feedStarted = true;
  }
  const item = document.createElement('div');
  item.className = `ce-feed-item ce-kind-${kind}`;
  item.innerHTML = `
    <div class="ce-feed-title">${title}<span class="ce-feed-time">${fmtTime(timestamp)}</span></div>
    <div class="ce-feed-detail">${detail || ''}</div>
  `;
  feed.prepend(item);
  while (feed.children.length > 40) feed.removeChild(feed.lastChild);
}

async function loadActianStatus() {
  try {
    const res = await fetch('/api/health');
    const body = await res.json();
    const configured = Boolean(body?.providers?.actian?.configured);
    actianNode.classList.toggle('ce-node-pending', !configured);
    actianStatus.textContent = configured
      ? 'Connected · localhost:6573'
      : 'Awaiting credentials · using local citation fallback';
  } catch {
    actianStatus.textContent = 'Status unavailable';
  }
}

function handleEvent(event) {
  const { type, payload = {}, timestamp, caseId } = event;

  if (type === 'case.started') {
    activeCaseId = caseId;
    caseChip.textContent = caseId;
    setActive(true);
  }
  if (type === 'case.completed' || type === 'case.failed') {
    setActive(false);
  }
  if (caseId && activeCaseId && caseId !== activeCaseId) return;

  switch (type) {
    case 'context.source_resolved':
    case 'context.assembled': {
      firePulse('graph');
      pulseBrain();
      markSourceActive(document.querySelector('.ce-source-two'));
      addFeedItem({
        kind: 'source',
        title: 'Context graph resolved',
        detail: payload.label || payload.eligible?.join(', ') || 'jurisdiction + benefit stack',
        timestamp
      });
      break;
    }
    case 'context.fact_confirmed':
    case 'call.transcript_received': {
      firePulse('live');
      pulseBrain();
      markSourceActive(document.querySelector('.ce-source-three'));
      addFeedItem({
        kind: 'source',
        title: type === 'context.fact_confirmed' ? 'Disclosure confirmed' : 'Transcript received',
        detail: payload.statement || payload.text || '',
        timestamp
      });
      break;
    }
    case 'context.semantic_retrieved': {
      firePulse('actian');
      pulseBrain();
      markSourceActive(actianNode);
      const badge = payload.source === 'actian' ? 'Actian match' : 'local fallback';
      addFeedItem({
        kind: 'source',
        title: `Retrieved explanation · ${payload.programName || payload.programId}`,
        detail: `${badge}${payload.score ? ` · score ${payload.score.toFixed(2)}` : ''} — ${(payload.text || '').slice(0, 90)}`,
        timestamp
      });
      break;
    }
    case 'benefits.resolved': {
      firePulse('stack');
      pulseBrain();
      stackSummary.textContent = `${fmtMoney(payload.benefitsUnlockedAfter)} unlocked · ${(payload.newlyEligible || []).length} new`;
      addFeedItem({
        kind: 'output',
        title: 'Benefit stack resolved',
        detail: `${fmtMoney(payload.benefitsUnlockedBefore)} → ${fmtMoney(payload.benefitsUnlockedAfter)}`,
        timestamp
      });
      break;
    }
    case 'knowledge.gap_flagged':
    case 'knowledge.gap_ratified':
    case 'approval.requested':
    case 'approval.decided':
    case 'approval.validated':
    case 'audit.generated': {
      firePulse('trace');
      pulseBrain();
      traceSummary.textContent = type.replace(/[._]/g, ' ');
      addFeedItem({
        kind: 'output',
        title: type.replace(/[._]/g, ' '),
        detail: payload.summary || payload.instruction || payload.programMentioned || '',
        timestamp
      });
      break;
    }
    default:
      break;
  }
}

function connectStream() {
  const source = new EventSource('/api/stream');
  source.onmessage = (msg) => {
    if (!msg.data) return;
    try {
      handleEvent(JSON.parse(msg.data));
    } catch {
      // heartbeat / comment lines have no JSON payload
    }
  };
  source.onerror = () => {
    // EventSource retries automatically; nothing else to do here.
  };
}

loadActianStatus();
connectStream();
