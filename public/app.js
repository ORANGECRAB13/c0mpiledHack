/**
 * Vocare operator console.
 *
 * Every control here drives the same server endpoints the voice agent uses.
 * The scripted customer replaces audio input only — it does not shortcut the
 * context engine, the authority check, Guild, or execution.
 */

import { startVoiceCall, stopVoiceCall } from './voice.js';

const $ = (id) => document.getElementById(id);
const money = (n) => {
  if (n === null || n === undefined) return '—';
  const value = Number(n);
  const fraction = Number.isInteger(value) ? 0 : 2;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  })}`;
};

const state = {
  customers: [],
  selectedId: null,
  caseId: null,
  case: null,
  gap: null,
  previousEligible: new Set(),
  scriptPhase: 0,
  busy: false
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Malformed response' }));
  if (!data.ok && data.error) throw new Error(data.error);
  return data;
}

// ── boot ────────────────────────────────────────────────────────────

async function boot() {
  try {
    const [health, customers] = await Promise.all([api('/api/health'), api('/api/customers')]);
    state.customers = customers.customers;
    renderCustomers();

    const chip = $('backend-chip');
    chip.textContent = `engine: ${health.engine.backend}`;
    chip.classList.toggle('chip-warn', health.engine.backend !== 'neo4j');
    chip.title =
      health.engine.fallbackReason || `Context graph backed by ${health.engine.backend}`;
  } catch (error) {
    $('backend-chip').textContent = 'engine unavailable';
    $('backend-chip').classList.add('chip-warn');
    console.error(error);
  }

  startPolling();
}

/**
 * Deliberately polling rather than holding the /api/stream SSE connection
 * open: a live EventSource keeps the document permanently non-idle, which
 * stalls automated browsers (and Replay) waiting for the page to settle.
 * Every action already refreshes explicitly — this only catches changes made
 * from another tab or by an agent calling the API directly.
 */
function startPolling() {
  setInterval(async () => {
    if (!state.caseId || state.busy) return;
    try {
      await refreshCase();
      await refreshGaps();
    } catch {
      /* transient — the next tick retries */
    }
  }, 4000);
}

// ── rendering ───────────────────────────────────────────────────────

function renderCustomers() {
  const list = $('customer-list');
  list.replaceChildren();

  for (const customer of state.customers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'customer';
    button.setAttribute('aria-pressed', String(state.selectedId === customer.id));
    button.addEventListener('click', () => {
      state.selectedId = customer.id;
      renderCustomers();
      $('start-btn').disabled = false;
    });

    const name = document.createElement('span');
    name.className = 'customer-name';
    name.textContent = customer.name;

    const meta = document.createElement('span');
    meta.className = 'customer-meta';
    meta.textContent = `${customer.city}, ${customer.state} · ${money(customer.arrears)} in arrears${
      customer.hasDisconnectionNotice ? ' · disconnection notice' : ''
    }`;

    button.append(name, meta);
    list.append(button);
  }
}

function renderCase(kase) {
  state.case = kase;
  const stack = kase.stack;

  $('stage-pill').textContent = kase.stage.replace(/_/g, ' ');
  $('stage-pill').dataset.stage = kase.stage;

  renderJurisdiction(stack);
  renderBenefits(stack);
  renderTranscript(kase.transcript);
  renderTraces(kase.traces);
  renderApproval(kase);
  renderOutcome(kase);
}

function renderJurisdiction(stack) {
  const j = stack.jurisdiction;
  $('jurisdiction-panel').hidden = false;
  $('jurisdiction-state').textContent = `${j.state.name} · ${j.state.regulatorAbbr}`;
  $('rule-citation').textContent = j.pucRule.citation;

  const protection = $('protection-status');
  protection.dataset.active = String(j.protectedFromDisconnection);
  protection.textContent = j.protectedFromDisconnection
    ? 'Protected from disconnection today'
    : 'No disconnection protection active today';

  const list = $('moratoria-list');
  list.replaceChildren();
  for (const m of j.moratoria) {
    const item = document.createElement('li');
    item.className = 'moratorium';
    item.dataset.active = String(m.active);

    const mark = document.createElement('span');
    mark.className = 'moratorium-mark';
    mark.textContent = m.active ? '✓' : '·';

    const body = document.createElement('span');
    const label = document.createElement('span');
    label.className = 'moratorium-label';
    label.textContent = `${m.label} — `;
    const reason = document.createElement('span');
    reason.className = 'moratorium-reason';
    reason.textContent = m.reason;
    body.append(label, reason);

    item.append(mark, body);
    list.append(item);
  }
}

function benefitCard(entry, isNew) {
  const card = document.createElement('li');
  card.className = 'benefit';
  if (isNew) card.dataset.new = 'true';

  const top = document.createElement('div');
  top.className = 'benefit-top';

  const name = document.createElement('span');
  name.className = 'benefit-name';
  name.textContent = entry.name;

  const value = document.createElement('span');
  value.className = 'benefit-value';
  value.textContent =
    entry.kind === 'PIPP' ? `${money(entry.cappedMonthlyPayment)}/mo cap` : money(entry.estimatedValue);

  top.append(name, value);
  card.append(top);

  const detail = document.createElement('span');
  detail.className = 'benefit-detail';
  detail.textContent = entry.tierReason || entry.capDetail || entry.intakeVia?.name || '';
  if (detail.textContent) card.append(detail);

  const source = document.createElement('span');
  source.className = 'benefit-source';
  source.textContent = entry.sourceId;
  card.append(source);

  return card;
}

function renderBenefits(stack) {
  $('benefits-panel').hidden = false;
  const totals = stack.totals;

  $('unlocked-value').textContent = money(totals.benefitsUnlocked);
  $('unlocked').dataset.zero = String(!totals.benefitsUnlocked);
  $('unlocked-sub').textContent = totals.benefitsUnlocked
    ? `${money(totals.grantApplied)} applied now · ${money(totals.forgivenessAvailable)} forgiven over time`
    : `Against ${money(totals.arrears)} in arrears`;

  $('benefits-count').textContent = `${stack.eligible.length} eligible`;

  const list = $('benefit-list');
  list.replaceChildren();
  for (const entry of stack.eligible) {
    list.append(benefitCard(entry, !state.previousEligible.has(entry.id) && state.previousEligible.size > 0));
  }
  if (!stack.eligible.length) {
    const empty = document.createElement('li');
    empty.className = 'benefit-detail';
    empty.textContent = 'No program resolves for this household on the current record.';
    list.append(empty);
  }
  state.previousEligible = new Set(stack.eligible.map((e) => e.id));

  $('ineligible-wrap').hidden = !stack.ineligible.length;
  $('ineligible-count').textContent = `(${stack.ineligible.length})`;
  const ineligible = $('ineligible-list');
  ineligible.replaceChildren();
  for (const entry of stack.ineligible) {
    const item = document.createElement('li');
    item.className = 'benefit';
    const top = document.createElement('div');
    top.className = 'benefit-top';
    const name = document.createElement('span');
    name.className = 'benefit-name';
    name.textContent = entry.name;
    top.append(name);
    const why = document.createElement('span');
    why.className = 'benefit-detail';
    why.textContent = `Failed ${entry.failedOn.join(', ')}`;
    item.append(top, why);
    ineligible.append(item);
  }

  const boundaries = $('boundaries');
  boundaries.replaceChildren();
  const rows = [
    ['Monthly payment', money(totals.monthlyPayment)],
    ['Delegated floor', money(stack.boundaries.authorityFloor)],
    ['Affordability cap', money(stack.boundaries.affordabilityCeiling)],
    ['Residual arrears', money(totals.residualArrears)]
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    boundaries.append(dt, dd);
  }
}

function renderTranscript(turns) {
  const list = $('transcript');
  list.replaceChildren();

  if (!turns.length) {
    const empty = document.createElement('li');
    empty.className = 'transcript-empty';
    empty.textContent = 'No call in progress.';
    list.append(empty);
    return;
  }

  for (const turn of turns) {
    const item = document.createElement('li');
    item.className = 'turn';
    item.dataset.speaker = turn.speaker;
    if (turn.speaker === 'system') item.dataset.system = 'true';

    const who = document.createElement('span');
    who.className = 'turn-who';
    who.textContent = turn.speaker === 'agent' ? 'Vocare' : turn.speaker;

    const text = document.createElement('span');
    text.className = 'turn-text';
    text.textContent = turn.text;

    item.append(who, text);
    list.append(item);
  }
  list.parentElement.scrollTop = list.parentElement.scrollHeight;
}

function renderTraces(traces) {
  $('trace-count').textContent = String(traces.length);
  const list = $('traces');
  list.replaceChildren();

  if (!traces.length) {
    const empty = document.createElement('li');
    empty.className = 'traces-empty';
    empty.textContent = 'Decisions appear here with their evidence and authority.';
    list.append(empty);
    return;
  }

  for (const trace of [...traces].reverse()) {
    const item = document.createElement('li');
    item.className = 'trace';

    const title = document.createElement('span');
    title.className = 'trace-title';
    title.textContent = trace.title;

    const conclusion = document.createElement('p');
    conclusion.className = 'trace-conclusion';
    conclusion.textContent = trace.conclusion;

    item.append(title, conclusion);

    if (trace.evidence?.length) {
      const evidence = document.createElement('ul');
      evidence.className = 'trace-evidence';
      for (const e of trace.evidence.slice(0, 4)) {
        const li = document.createElement('li');
        const src = document.createElement('span');
        src.className = 'trace-source';
        src.textContent = `${e.sourceId} `;
        li.append(src, document.createTextNode(e.statement));
        evidence.append(li);
      }
      item.append(evidence);
    }

    if (trace.authority) {
      const authority = document.createElement('p');
      authority.className = 'trace-authority';
      authority.textContent = `${trace.authority.sourceId} — ${trace.authority.rule}`;
      item.append(authority);
    }

    list.append(item);
  }
}

function renderApproval(kase) {
  const pending = kase.stage === 'awaiting_credit_officer' && kase.approval;
  $('approval-panel').hidden = !pending;
  if (!pending) return;

  const a = kase.approval;
  $('ask-value').textContent = `${money(a.requestedAmount)}/mo`;
  $('floor-value').textContent = `${money(a.floor)}/mo`;
  $('ceiling-value').textContent = a.ceiling ? `${money(a.ceiling)}/mo` : '—';
  $('approval-citation').textContent = a.sourceId;
  $('approval-summary').textContent = a.summary || '';
  if (!$('approved-amount').value) $('approved-amount').value = String(a.recommendedAmount ?? a.floor);
}

function renderOutcome(kase) {
  const done = kase.execution?.length > 0;
  $('outcome-panel').hidden = !done;
  if (!done) return;

  const list = $('execution');
  list.replaceChildren();
  for (const result of kase.execution) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'execution-system';
    label.textContent = `${result.label} · ${result.action.replace(/_/g, ' ')}`;
    const status = document.createElement('span');
    status.className = 'execution-status';
    status.textContent = result.status;
    item.append(label, status);
    list.append(item);
  }
}

// ── knowledge gaps ──────────────────────────────────────────────────

async function refreshGaps() {
  const { gaps } = await api('/api/knowledge/gaps');
  const open = gaps.find((g) => g.status === 'open');
  state.gap = open || null;

  $('gap-panel').hidden = !open;
  if (!open) return;

  $('gap-program').textContent = open.programMentioned;
  $('gap-quote').textContent = `"${open.customerQuote}"`;
}

async function refreshCase() {
  if (!state.caseId) return;
  const { case: kase } = await api(`/api/case/${state.caseId}`);
  renderCase(kase);
}

// ── the scripted customer ───────────────────────────────────────────

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function say(speaker, text, pause = 900) {
  await api(`/api/case/${state.caseId}/transcript`, { method: 'POST', body: { speaker, text } });
  await refreshCase();
  await wait(pause);
}

/** Phase 1 runs up to the authority boundary and stops with the customer on hold. */
async function runScriptPhase1() {
  const kase = state.case;
  const name = kase.stack.customerName.split(' ')[0];

  await say(
    'agent',
    `Hi ${name}, this is Vocare calling on behalf of Meridian Energy. I'm not calling to chase payment — I'm calling because you may be eligible for support you haven't been offered. Is now an alright time?`
  );
  await say('customer', "I suppose so. I've been dreading this call, to be honest.");
  await say(
    'agent',
    'I understand. Before anything else — you are protected from disconnection today under Illinois rules, so nothing is happening to your service while we talk. Can I ask what changed?'
  );
  await say('customer', 'My hours at the clinic were cut back in April.');
  await say('customer', 'And my daughter moved back in with me, with her two kids.');

  const disclosure = await api(`/api/case/${state.caseId}/disclosure`, {
    method: 'POST',
    body: {
      householdSize: 5,
      annualIncome: 34000,
      disclosures: ['hours cut at the clinic in April', 'daughter and two grandchildren moved in']
    }
  });
  await refreshCase();
  await wait(1200);

  const unlocked = money(disclosure.after.benefitsUnlocked);
  await say(
    'agent',
    `That changes things considerably. Our records still had you as a household of two. With five people and your current income, you qualify for ${unlocked} in support — a crisis grant that clears most of the balance now, and a credit that covers the rest over time.`
  );
  await say('customer', "I had no idea any of that existed. My neighbour got something from the township office, not the state — is that the same thing?");

  await api(`/api/case/${state.caseId}/knowledge/gap`, {
    method: 'POST',
    body: {
      programMentioned: 'Township General Assistance energy supplement',
      customerQuote: 'My neighbour got something from the township office, not the state.',
      program: {
        id: 'TOWNSHIP-GA-IL',
        kind: 'GRANT',
        state: 'IL',
        name: 'Illinois Township General Assistance energy supplement',
        sourceId: 'TOWNSHIP-GA-IL-2026',
        citation: 'Illinois Township Code — General Assistance emergency energy aid',
        administeredBy: 'Township supervisor',
        intakeVia: {
          agencyId: 'AGENCY-IL-TOWNSHIP',
          name: 'Township supervisor office',
          channel: 'township_general_assistance'
        },
        effectiveFrom: '2025-10-01',
        criteria: [
          {
            id: 'IL-TGA-INCOME',
            kind: 'income_percent_fpl',
            comparator: 'lte',
            value: 200,
            text: 'Household income at or below 200% FPL.'
          }
        ],
        tiers: [
          {
            id: 'TGA-REGULAR',
            kind: 'regular',
            name: 'Emergency energy supplement',
            maxBenefit: 400,
            text: 'One-time township emergency aid toward the energy bill.'
          }
        ]
      }
    }
  });
  await refreshGaps();
  await refreshCase();

  await say(
    'agent',
    "That's a different program, and I don't have it in front of me — I'm not going to guess at what you'd get. I've flagged it for one of our specialists to confirm, and we'll follow up. Let's get the ones I'm certain about moving."
  );

  const monthly = money(state.case.stack.totals.monthlyPayment);
  await say(
    'agent',
    `Going forward, your monthly payment would be capped at ${monthly} — that's six percent of your income. Does that work?`
  );
  await say('customer', "That's still more than I've got. I could manage a hundred and twenty. I don't want to agree to something I'll miss again.");

  const result = await api(`/api/case/${state.caseId}/approval/request`, {
    method: 'POST',
    body: {
      requestedAmount: 120,
      summary:
        'Household of five on reduced income. Benefits cover the full arrears. Customer states $120/month is sustainable and is explicit about not wanting to over-commit.'
    }
  });

  if (result.held) {
    await say('agent', result.holdMessage, 400);
    await refreshCase();
    state.scriptPhase = 1;
    $('script-btn').disabled = true;
    $('script-hint').textContent =
      'Customer is on hold. Approve an amount to resume the same call — no redial, no re-greet.';
  }
}

/** Phase 2 resumes after the officer decides, and closes the call. */
async function runScriptPhase2(approvedAmount) {
  const stack = state.case.stack;
  const benefitNames = stack.eligible.map((e) => e.name);

  await say(
    'agent',
    `Thanks for holding. I've had that approved — we can do ${money(approvedAmount)} a month. And the ${money(
      stack.totals.benefitsUnlocked
    )} in support still applies: collections paused, late fees waived, and I'll submit the applications for you rather than sending you to do it.`
  );
  await say('customer', `${money(approvedAmount)} I can actually manage. Yes, let's do that.`);

  await api(`/api/case/${state.caseId}/consent`, {
    method: 'POST',
    body: { amount: approvedAmount, benefitIds: stack.eligible.map((e) => e.id), customerConsent: true }
  });
  await refreshCase();

  await api(`/api/case/${state.caseId}/execute`, { method: 'POST' });
  await refreshCase();

  await say(
    'agent',
    `All set. ${benefitNames.join(', ')} are submitted, and you'll get written confirmation today. Nothing more for you to do.`
  );

  state.scriptPhase = 2;
  $('script-hint').textContent = 'Call complete. Open the audit document to see every step accounted for.';
}

// ── controls ────────────────────────────────────────────────────────

function showError(message) {
  const bar = $('error-bar');
  bar.textContent = message;
  bar.hidden = false;
}

function clearError() {
  $('error-bar').hidden = true;
}

async function guard(button, work) {
  clearError();
  if (state.busy) return;
  state.busy = true;
  const label = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Working…';
  }
  try {
    await work();
  } catch (error) {
    // Never use a modal dialog here — it blocks the page for automated QA.
    console.error(error);
    showError(error.message);
  } finally {
    state.busy = false;
    if (button) {
      button.textContent = label;
      button.disabled = false;
    }
  }
}

$('start-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    const { case: kase } = await api('/api/case/start', {
      method: 'POST',
      body: { customerId: state.selectedId }
    });
    state.caseId = kase.caseId;
    state.previousEligible = new Set();
    renderCase(kase);
    await refreshGaps();
    $('call-btn').disabled = false;
    $('live-btn').disabled = false;
  })
);

$('call-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    await api(`/api/case/${state.caseId}/call/start`, {
      method: 'POST',
      body: { mode: 'scripted', sessionId: `sess_${Date.now()}` }
    });
    $('call-mode').textContent = 'scripted customer';
    $('call-mode').classList.add('chip-ok');
    $('script-btn').disabled = false;
    await refreshCase();
  })
);

// Live microphone call through Azure gpt-realtime-2.1.
$('live-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    if (state.live) {
      stopVoiceCall();
      $('call-mode').textContent = 'call ended';
      $('call-mode').classList.remove('chip-ok');
      $('live-btn').textContent = '🎙 Live mic call';
      state.live = false;
      return;
    }
    $('call-mode').textContent = 'connecting…';
    await startVoiceCall(state.caseId, onVoiceEvent);
    $('call-mode').textContent = 'live · Azure realtime';
    $('call-mode').classList.add('chip-ok');
    $('script-hint').textContent =
      'Live call in progress — speak as the customer. The approval panel works exactly as in the scripted run.';
    $('call-btn').disabled = true;
    $('script-btn').disabled = true;
    $('live-btn').textContent = 'End call';
    state.live = true;
  })
);

async function onVoiceEvent(event) {
  switch (event.type) {
    case 'transcript':
    case 'case_changed':
    case 'held':
    case 'resumed':
    case 'gap_flagged':
      await refreshCase();
      await refreshGaps();
      break;
    case 'error':
      showError(event.message);
      break;
    case 'closed':
      $('call-mode').textContent = 'call ended';
      $('call-mode').classList.remove('chip-ok');
      $('live-btn').textContent = '🎙 Live mic call';
      $('quick-call-btn').textContent = '🎙 Test live call';
      state.live = false;
      break;
    default:
      break;
  }
}

$('script-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    if (state.scriptPhase === 0) await runScriptPhase1();
  })
);

$('approve-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    $('approval-error').hidden = true;
    const [id, name, authority] = $('officer-select').value.split('|');
    const amount = Number($('approved-amount').value);

    const result = await api(`/api/case/${state.caseId}/approval/decide`, {
      method: 'POST',
      body: {
        decision: 'approved',
        approvedAmount: amount,
        officer: { id, name, role: 'credit_officer', authority }
      }
    });

    if (!result.accepted) {
      const error = $('approval-error');
      error.hidden = false;
      error.textContent = result.validation.reason;
      await refreshCase();
      return;
    }

    const approved = result.approval.approvedAmount;
    if (result.approval.clamped) {
      const error = $('approval-error');
      error.hidden = false;
      error.textContent = result.clamp.reason;
    }

    await api(`/api/case/${state.caseId}/resume`, { method: 'POST' });
    await refreshCase();
    await runScriptPhase2(approved);
  })
);

$('ratify-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    await api(`/api/knowledge/gaps/${state.gap.id}/ratify`, {
      method: 'POST',
      body: {
        ratifiedBy: $('ratifier').value || 'Alex Morgan',
        authority: 'L2 credit officer',
        caseId: state.caseId
      }
    });
    await refreshGaps();
    $('script-hint').textContent =
      'Ratified. Start outreach for the next Illinois customer — the agent can now offer it.';
  })
);

// One-click test: start a case and connect the mic to the negotiation agent.
$('quick-call-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    if (state.live) {
      stopVoiceCall();
      $('quick-call-btn').textContent = '🎙 Test live call';
      state.live = false;
      return;
    }

    // Start Von's case if none is running.
    if (!state.caseId) {
      const { case: kase } = await api('/api/case/start', {
        method: 'POST',
        body: { customerId: 'CUS-77241' }
      });
      state.caseId = kase.caseId;
      state.previousEligible = new Set();
      renderCase(kase);
      await refreshGaps();
      $('call-btn').disabled = false;
      $('live-btn').disabled = false;
    }

    $('quick-call-btn').textContent = 'Connecting…';
    await startVoiceCall(state.caseId, onVoiceEvent);
    $('call-mode').textContent = 'live · Azure realtime';
    $('call-mode').classList.add('chip-ok');
    $('quick-call-btn').textContent = '⏹ End call';
    state.live = true;
  })
);

$('reset-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    await api('/api/demo/reset', { method: 'POST' });
    location.reload();
  })
);

// ── audit ───────────────────────────────────────────────────────────

function auditSection(title, rows) {
  const section = document.createElement('section');
  section.className = 'audit-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const grid = document.createElement('dl');
  grid.className = 'audit-grid';
  for (const [label, value, mono] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (mono) dd.className = 'audit-mono';
    grid.append(dt, dd);
  }
  section.append(heading, grid);
  return section;
}

$('audit-btn').addEventListener('click', (event) =>
  guard(event.currentTarget, async () => {
    const { audit } = await api(`/api/case/${state.caseId}/audit`);
    const body = $('audit-body');
    body.replaceChildren();

    body.append(
      auditSection('Header', [
        ['Audit ID', audit.header.auditId, true],
        ['Case', audit.header.caseId],
        ['Customer', audit.header.customer],
        ['Jurisdiction', audit.header.state],
        ['Generated', new Date(audit.header.generatedAt).toLocaleString()],
        ['Notice', audit.header.syntheticNotice]
      ]),
      auditSection(
        'Compliance determinations',
        audit.complianceDeterminations.length
          ? audit.complianceDeterminations.map((d) => [
              d.determination,
              `${d.outcome} — ${d.statute}`,
              true
            ])
          : [['—', 'No determinations recorded']]
      ),
      auditSection('Jurisdiction', [
        ['Rule', `${audit.jurisdiction.pucRule.sourceId} — ${audit.jurisdiction.pucRule.citation}`],
        ['Protected today', audit.jurisdiction.protectedFromDisconnection ? 'Yes' : 'No'],
        ...audit.jurisdiction.moratoriaEvaluated.map((m) => [m.label, `${m.active ? 'ACTIVE' : 'inactive'} — ${m.reason}`])
      ]),
      auditSection('Household', [
        ['On record', `${audit.customerContext.declaredHousehold.size} people, ${money(audit.customerContext.declaredHousehold.annualIncome)}`],
        ['Confirmed on call', `${audit.customerContext.confirmedHousehold.size} people, ${money(audit.customerContext.confirmedHousehold.annualIncome)}`],
        ['Changed on call', audit.customerContext.confirmedHousehold.changedOnCall ? 'Yes' : 'No'],
        ...audit.customerContext.disclosures.map((d, i) => [`Disclosure ${i + 1}`, d])
      ]),
      auditSection('Benefit package', [
        ...audit.benefitPackage.eligible.map((e) => [e.name, `${e.sourceId} — ${e.citation}`]),
        ['Arrears', money(audit.benefitPackage.totals.arrears)],
        ['Benefits unlocked', money(audit.benefitPackage.totals.benefitsUnlocked)],
        ['Residual arrears', money(audit.benefitPackage.totals.residualArrears)]
      ]),
      auditSection('Authority', [
        ['Delegated floor', money(audit.authorityBoundary.floorAmount)],
        ['Authority source', audit.authorityBoundary.sourceId, true],
        ['Affordability cap', money(audit.authorityBoundary.affordabilityCeiling)],
        ['Requires', `${audit.authorityBoundary.requiresRole} at ${audit.authorityBoundary.requiresLevel}`]
      ])
    );

    if (audit.approval) {
      body.append(
        auditSection('Approval', [
          ['Customer requested', money(audit.approval.requestedAmount)],
          ['Approved', money(audit.approval.approvedAmount)],
          ['Clamped to cap', audit.approval.clamped ? 'Yes' : 'No'],
          ['Officer', `${audit.approval.officer?.name} (${audit.approval.officer?.authority})`],
          ['Authority validated', audit.approval.authorityValidation?.reason || '—'],
          ['Delivered via', audit.approval.delivery?.channel || '—'],
          ['Room', audit.approval.delivery?.roomId || '—', true],
          ['Message', audit.approval.delivery?.messageId || '—', true]
        ])
      );
    }

    if (audit.knowledgeActions.length) {
      body.append(
        auditSection(
          'Knowledge actions',
          audit.knowledgeActions.map((k) => [
            k.type.replace('knowledge.', ''),
            `${k.programName || k.programMentioned || ''} — ${k.actor.id}${k.authority ? ` (${k.authority})` : ''}`
          ])
        )
      );
    }

    body.append(
      auditSection('Consent', [
        ['Captured', audit.consent.captured ? 'Yes' : 'No'],
        ['Agreed amount', money(audit.consent.agreedAmount)],
        ['At', audit.consent.at ? new Date(audit.consent.at).toLocaleString() : '—']
      ]),
      auditSection(
        'Execution',
        audit.execution.map((e) => [e.system, `${e.action} — ${e.status} (simulated)`])
      ),
      auditSection('Integrity', [
        ['Events', String(audit.integrity.eventCount)],
        ['Source IDs', audit.integrity.sourceIds.join(', '), true],
        ['Authority IDs', audit.integrity.authorityIds.join(', '), true],
        ['Checksum', audit.integrity.checksum, true]
      ])
    );

    $('audit-dialog').showModal();
  })
);

$('audit-close').addEventListener('click', () => $('audit-dialog').close());

boot();
