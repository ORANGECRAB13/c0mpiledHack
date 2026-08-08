import 'dotenv/config';
import { config } from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: '.env.local', override: true });

const here = path.dirname(fileURLToPath(import.meta.url));

const {
  engineStatus,
  syncGraph,
  visualization,
  benefitStackFor,
  jurisdictionFor,
  discoveryStatus,
  resetDiscovery,
  runDiscoveryAgent
} = await import('./graph/index.js');
const { loadDataset } = await import('./graph/dataset.js');
const wf = await import('./workflow/state-machine.js');
const { bus, eventsFor, citedIds } = await import('./workflow/events.js');
const sandbox = await import('./sandbox.js');
const { buildAudit } = await import('./audit.js');
const { attachVoiceBridge, resumeLiveCall, hasLiveCall } = await import('./voice/bridge.js');
const { realtimeConfig } = await import('./voice/config.js');
const { deliverEscalationToBand } = await import('./workflow/escalation.js');
const { assessAll, assessHardship, hardshipEngineStatus, hardshipSummary } = await import('./hardship/index.js');
const { listLearnings, learningSummary, playbookFor } = await import('./graph/learnings.js');
const authorityAgent = await import('./agents/authority.js');
const ratificationAgent = await import('./agents/ratification.js');
const reflectionAgent = await import('./agents/reflection.js');
const { agentModelStatus } = await import('./agents/azure.js');
const { askAssistant, assistantStatus } = await import('./assistant/index.js');
const { elevenLabsSttStatus, transcribeOfficerCommand } = await import('./stt/elevenlabs.js');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Serve the built React frontend (frontend-dist) as the primary UI when present;
// the legacy vanilla console in public/ remains a fallback for API-less checks.
import { existsSync } from 'node:fs';
const reactDist = path.resolve(here, '../frontend-dist');
const erpDist = path.resolve(here, '../energy-erp-dist');
if (existsSync(erpDist)) {
  app.use('/erp', express.static(erpDist));
  app.get('/erp/*', (_req, res) => res.sendFile(path.join(erpDist, 'index.html')));
}
if (existsSync(reactDist)) app.use(express.static(reactDist));
app.use(express.static(path.resolve(here, '../public')));

const PORT = Number(process.env.PORT || 5182);

const ok = (res, body) => res.json({ ok: true, ...body });
const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

// ── health and engine ────────────────────────────────────────────────

app.get('/api/health', wrap(async (_req, res) => {
  const engine = await engineStatus();
  ok(res, {
    app: 'vocare-arrearage-agent',
    synthetic: true,
    providers: {
      contextEngine: { configured: true, backend: engine.backend, fallbackReason: engine.fallbackReason },
      voice: { provider: (process.env.VOICE_PROVIDER || 'azure').toLowerCase() },
      transcription: { provider: 'elevenlabs', ...elevenLabsSttStatus() },
      azureRealtime: { configured: realtimeConfig().configured },
      azureOpenAI: { configured: Boolean(process.env['AZURE-OPENAI-API-KEY']) },
      semantic: { engine: 'neo4j', configured: Boolean(process.env.NEO4J_URI) },
      guild: { configured: Boolean(process.env.GUILD_API_KEY) },
      band: { configured: Boolean(process.env.BAND_API_KEY) },
      pioneer: { configured: Boolean(process.env.PIONEER_API_KEY) },
      crustdata: await hardshipEngineStatus()
    },
    engine
  });
}));

app.get('/api/engine/status', wrap(async (_req, res) =>
  ok(res, { engine: await engineStatus(), agentTier: agentModelStatus(), learning: await learningSummary() })
));
app.post('/api/graph/sync', wrap(async (_req, res) => ok(res, { result: await syncGraph() })));
app.get('/api/graph/visualization', wrap(async (req, res) =>
  ok(res, { graph: await visualization({ state: req.query.state || null, dense: req.query.dense === '1' }) })
));

app.get('/api/discovery/status', wrap(async (_req, res) =>
  ok(res, { discovery: discoveryStatus() })
));

app.post('/api/discovery/reset', wrap(async (_req, res) =>
  ok(res, { discovery: resetDiscovery() })
));

app.post('/api/discovery/agents/:agentId/run', wrap(async (req, res) =>
  ok(res, {
    discovery: await runDiscoveryAgent(req.params.agentId, {
      batchSize: req.body?.batchSize
    })
  })
));

app.get('/api/context/resolve', wrap(async (req, res) => {
  const { customerId, householdSize, annualIncome, asOf } = req.query;
  const stack = await benefitStackFor({
    customerId,
    householdSize: householdSize ? Number(householdSize) : null,
    annualIncome: annualIncome ? Number(annualIncome) : null,
    asOf: asOf || undefined,
    forecast: demoForecast()
  });
  ok(res, { stack });
}));

app.get('/api/context/jurisdiction', wrap(async (req, res) =>
  ok(res, { jurisdiction: await jurisdictionFor({ customerId: req.query.customerId, forecast: demoForecast() }) })
));

// ── case lifecycle ───────────────────────────────────────────────────

app.get('/api/customers', wrap(async (_req, res) => {
  const dataset = await loadDataset();
  // Internal-ledger scoring only — the list view must not fan out to Crustdata
  // for every customer on every page load. External corroboration is pulled per
  // customer, on demand, from /api/hardship/:customerId.
  const flags = new Map((await assessAll()).map((a) => [a.customerId, hardshipSummary(a)]));
  ok(res, {
    utility: dataset.utility,
    customers: dataset.customers.map((c) => ({
      hardship: flags.get(c.id) || null,
      id: c.id,
      caseId: c.caseId,
      name: c.name,
      state: c.state,
      city: c.city,
      arrears: c.arrears,
      hasDisconnectionNotice: Boolean(c.hasDisconnectionNotice),
      declaredHouseholdSize: c.declaredHouseholdSize,
      declaredAnnualIncome: c.declaredAnnualIncome,
      declaredIncomeNote: c.declaredIncomeNote || null,
      demoRole: c.demoRole || null
    }))
  });
}));

// ── hardship flagging ────────────────────────────────────────────────

/** Full assessment for one customer, including Crustdata corroboration when permitted. */
app.get('/api/hardship/:customerId', wrap(async (req, res) =>
  ok(res, {
    assessment: await assessHardship({
      customerId: req.params.customerId,
      external: req.query.external !== 'false',
      employerHint: req.query.employer || null,
      requestedBy: req.query.operator || 'operator'
    })
  })
));

/** Ranked worklist. Internal-only by default; `?external=true` enriches the top N. */
app.get('/api/hardship', wrap(async (req, res) => {
  const assessments = await assessAll();
  if (req.query.external !== 'true') return ok(res, { assessments });

  const depth = Math.min(Number(req.query.depth || 3), assessments.length);
  const enriched = await Promise.all(
    assessments.map((a, i) =>
      i < depth && a.tier !== 'none'
        ? assessHardship({ customerId: a.customerId, external: true, requestedBy: 'worklist' })
        : a
    )
  );
  ok(res, { assessments: enriched.sort((a, b) => b.score - a.score) });
}));

app.get('/api/cases', wrap(async (_req, res) => ok(res, { cases: wf.listCases() })));

app.post('/api/case/start', wrap(async (req, res) => {
  const state = await wf.startCase({
    customerId: req.body.customerId,
    caseId: req.body.caseId,
    asOf: req.body.asOf,
    forecast: req.body.forecast || demoForecast(),
    operator: req.body.operator || 'operator'
  });
  ok(res, { case: publicCase(state) });
}));

app.get('/api/case/:caseId', wrap(async (req, res) => {
  const state = wf.getCase(req.params.caseId);
  if (!state) return res.status(404).json({ ok: false, error: 'Unknown case' });
  ok(res, { case: publicCase(state), events: eventsFor(req.params.caseId) });
}));

app.post('/api/case/:caseId/call/start', wrap(async (req, res) =>
  ok(res, { case: publicCase(wf.beginCall(req.params.caseId, req.body)) })
));

app.post('/api/case/:caseId/transcript', wrap(async (req, res) =>
  ok(res, { turn: wf.recordTranscript(req.params.caseId, req.body) })
));

app.post('/api/case/:caseId/disclosure', wrap(async (req, res) => {
  const result = await wf.applyDisclosure(req.params.caseId, req.body);
  ok(res, {
    case: publicCase(result.state),
    newlyEligible: result.newlyEligible,
    before: result.before.totals,
    after: result.after.totals
  });
}));

app.post('/api/case/:caseId/amount/evaluate', wrap(async (req, res) =>
  ok(res, { check: wf.evaluateAmount(req.params.caseId, Number(req.body.amount)) })
));

// ── approval ─────────────────────────────────────────────────────────

app.post('/api/case/:caseId/approval/request', wrap(async (req, res) => {
  const caseId = req.params.caseId;
  const result = wf.requestApproval(caseId, {
    requestedAmount: Number(req.body.requestedAmount),
    summary: req.body.summary
  });
  if (result.held) {
    await deliverEscalationToBand(caseId, result.approval, (decision) => {
      if (decision.accepted && hasLiveCall(caseId)) {
        resumeLiveCall(caseId, {
          approvedAmount: decision.approval.approvedAmount,
          instruction: decision.approval.instruction
        });
      }
    });
  }
  ok(res, result);
}));

app.post('/api/case/:caseId/approval/decide', wrap(async (req, res) => {
  const result = wf.decideApproval(req.params.caseId, req.body);
  // If a live voice call is holding on this case, resume it on the same session.
  if (result.accepted && hasLiveCall(req.params.caseId)) {
    resumeLiveCall(req.params.caseId, {
      approvedAmount: result.approval.approvedAmount,
      instruction: result.approval.instruction
    });
    result.resumedLiveCall = true;
  }
  ok(res, result);
}));

app.post('/api/case/:caseId/resume', wrap(async (req, res) =>
  ok(res, { case: publicCase(wf.resumeCall(req.params.caseId)) })
));

// ── consent and execution ────────────────────────────────────────────

app.post('/api/case/:caseId/consent', wrap(async (req, res) =>
  ok(res, { agreed: wf.recordConsent(req.params.caseId, req.body) })
));

app.post('/api/case/:caseId/execute', wrap(async (req, res) => {
  const state = wf.beginExecution(req.params.caseId);
  const results = await sandbox.executePackage({ stack: state.stack, amount: state.agreed.amount });
  for (const result of results) wf.recordExecution(req.params.caseId, result);
  wf.completeCase(req.params.caseId);
  ok(res, { execution: results, case: publicCase(wf.getCase(req.params.caseId)) });
}));

app.get('/api/case/:caseId/audit', wrap(async (req, res) => {
  const state = wf.getCase(req.params.caseId);
  if (!state) return res.status(404).json({ ok: false, error: 'Unknown case' });
  ok(res, { audit: await buildAudit(state, eventsFor(req.params.caseId), citedIds(req.params.caseId)) });
}));

app.post('/api/case/:caseId/handoff', wrap(async (req, res) =>
  ok(res, wf.requestHandoff(req.params.caseId, req.body.reason))
));

// ── ElevenLabs WebRTC — phone-free browser path ──────────────────────
//
// This mints a short-lived conversation token for the phone-free agent
// (NEW_ELEVENLABS_WEBRTC_AGENT — no Twilio number attached, so it isn't
// locked to ulaw_8000 the way src/voice/elevenlabs.js's agent is). The
// browser connects to ElevenLabs directly over WebRTC with this token —
// audio never touches our server, only the five business tools do, via
// the same REST routes the scripted UI already uses. The xi-api-key never
// leaves the server.
app.post('/api/voice/eleven/webrtc-token', wrap(async (req, res) => {
  const agentId = process.env.NEW_ELEVENLABS_WEBRTC_AGENT;
  const apiKey = process.env.NEW_ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) {
    return res.status(400).json({ ok: false, error: 'NEW_ELEVENLABS_WEBRTC_AGENT / API key not configured' });
  }

  const caseId = req.body.caseId;
  if (!wf.getCase(caseId)) return res.status(404).json({ ok: false, error: `Unknown case: ${caseId}` });

  const tokenRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': apiKey } }
  );
  const tokenBody = await tokenRes.json();
  if (!tokenRes.ok || !tokenBody.token) {
    return res.status(502).json({ ok: false, error: tokenBody?.detail?.message || 'ElevenLabs token request failed' });
  }

  ok(res, { token: tokenBody.token, conversationId: tokenBody.conversation_id });
}));

// ── knowledge loop ───────────────────────────────────────────────────

app.get('/api/knowledge/gaps', wrap(async (_req, res) => ok(res, { gaps: await wf.knowledgeGaps() })));

app.post('/api/case/:caseId/knowledge/gap', wrap(async (req, res) =>
  ok(res, { gap: await wf.flagKnowledgeGap(req.params.caseId, req.body) })
));

app.post('/api/knowledge/gaps/:gapId/ratify', wrap(async (req, res) =>
  ok(res, {
    gap: await wf.ratifyGap(req.params.gapId, {
      ratifiedBy: req.body.ratifiedBy,
      authority: req.body.authority,
      program: req.body.program,
      caseId: req.body.caseId
    })
  })
));

// ── Proprietary agent tier ───────────────────────────────────────────
//
// The two governed agents that used to run on Guild's hosted runtime now run
// in-process on gpt-oss-120b (Azure AI Foundry), alongside a third agent —
// reflection — that has no Guild counterpart and is what makes the system
// self-improving. See src/agents/ for the guardrail reasoning; the short
// version is that the models write prose and code writes numbers.
//
// These routes are same-origin and carry no Guild shared secret, because no
// hosted third-party runtime calls them any more. The legacy /api/guild/*
// surface below is retained as a thin alias so the published OpenAPI contract
// and any in-flight integration keep working.

// ── Compliance assistant (ask-your-documents) ──────────────────────────
// Grounded chat over the internal policy corpus. Foundry tier when the keys
// are present; the status route lets the UI degrade honestly when they're not.
app.get('/api/assistant/status', wrap(async (_req, res) => ok(res, assistantStatus())));

app.get('/api/assistant/transcription-status', wrap(async (_req, res) => ok(res, elevenLabsSttStatus())));

app.post(
  '/api/assistant/transcribe',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }),
  wrap(async (req, res) => {
    try {
      ok(res, await transcribeOfficerCommand(req.body, req.headers['content-type'] || 'audio/webm'));
    } catch (error) {
      if (error.code === 'not_configured') return res.status(503).json({ ok: false, error: error.message, code: error.code });
      throw error;
    }
  })
);

app.post('/api/assistant/ask', wrap(async (req, res) => {
  try {
    ok(res, await askAssistant(req.body?.question, req.body?.history || []));
  } catch (e) {
    if (e.code === 'not_configured') return res.status(503).json({ error: e.message, code: e.code });
    throw e;
  }
}));

app.get('/api/agents/status', wrap(async (_req, res) =>
  ok(res, {
    model: agentModelStatus(),
    agents: ['authority', 'ratification', 'reflection'],
    learning: await learningSummary()
  })
));

app.post('/api/agents/authority/decide', wrap(async (req, res) =>
  ok(res, { decision: await authorityAgent.decide(req.body) })
));

app.post('/api/agents/ratification/review', wrap(async (req, res) =>
  ok(res, { result: await ratificationAgent.ratify({ ...req.body, dryRun: true }) })
));

app.post('/api/agents/ratification/ratify', wrap(async (req, res) =>
  ok(res, { result: await ratificationAgent.ratify({ ...req.body, dryRun: false }) })
));

// Reflection normally fires itself when a case reaches a terminal stage. This
// route is the manual trigger, and unlike the automatic path it awaits the
// result so an operator can see what the call taught.
app.post('/api/agents/reflect', wrap(async (req, res) =>
  ok(res, await reflectionAgent.reflectOnCase(req.body.caseId))
));

// ── learning loop ────────────────────────────────────────────────────

app.get('/api/learnings', wrap(async (req, res) =>
  ok(res, {
    learnings: await listLearnings({ state: req.query.state, kind: req.query.kind }),
    summary: await learningSummary()
  })
));

app.get('/api/learnings/playbook', wrap(async (req, res) =>
  ok(res, { playbook: await playbookFor(req.query.state) })
));

// ── legacy Guild-compatible surface ──────────────────────────────────
//
// Body-only POST aliases: Guild's integration generator dropped path and query
// parameters, so these mirror the routes above over the same handlers.
app.use('/api/guild', (req, res, next) => {
  const expected = process.env.VOCARE_API_KEY;
  if (!expected) return next(); // no key configured yet — demo/dev fallback, matches other providers' pattern
  if (req.get('X-Vocare-Key') !== expected) {
    return res.status(401).json({ ok: false, error: 'Missing or invalid X-Vocare-Key' });
  }
  next();
});

app.post('/api/guild/case/get', wrap(async (req, res) => {
  const state = wf.getCase(req.body.caseId);
  if (!state) return res.json({ ok: false, error: `Unknown case: ${req.body.caseId}` });
  ok(res, { case: publicCase(state) });
}));

app.post('/api/guild/approval/decide', wrap(async (req, res) => {
  const { caseId, ...decision } = req.body;
  ok(res, wf.decideApproval(caseId, decision));
}));

app.post('/api/guild/hardship/assess', wrap(async (req, res) =>
  ok(res, {
    assessment: await assessHardship({
      customerId: req.body.customerId,
      external: req.body.external !== false,
      employerHint: req.body.employerHint || null,
      requestedBy: req.body.requestedBy || 'guild-agent'
    })
  })
));

app.post('/api/guild/knowledge/gaps', wrap(async (req, res) => {
  const gaps = await wf.knowledgeGaps();
  const filtered = req.body?.status ? gaps.filter((g) => g.status === req.body.status) : gaps;
  ok(res, { gaps: filtered });
}));

app.post('/api/guild/knowledge/ratify', wrap(async (req, res) =>
  ok(res, {
    gap: await wf.ratifyGap(req.body.gapId, {
      ratifiedBy: req.body.ratifiedBy,
      authority: req.body.authority,
      program: req.body.program,
      caseId: req.body.caseId
    })
  })
));

app.post('/api/guild/context/resolve', wrap(async (req, res) => {
  const stack = await benefitStackFor({
    customerId: req.body.customerId,
    householdSize: req.body.householdSize ?? null,
    annualIncome: req.body.annualIncome ?? null,
    asOf: req.body.asOf || undefined,
    forecast: demoForecast()
  });
  ok(res, { stack });
}));

// ── realtime event stream ────────────────────────────────────────────

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.write(': connected\n\n');

  const onEvent = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  bus.on('event', onEvent);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('event', onEvent);
  });
});

// ── demo controls ────────────────────────────────────────────────────

app.post('/api/demo/reset', wrap(async (_req, res) => {
  wf.resetAll();
  ok(res, { reset: true });
}));

/** Forecast used by the demo so the weather-triggered rules resolve on stage. */
function demoForecast() {
  return {
    highF: Number(process.env.DEMO_FORECAST_HIGH_F || 96),
    lowF: Number(process.env.DEMO_FORECAST_LOW_F || 74),
    heatIndexF: Number(process.env.DEMO_FORECAST_HEAT_INDEX_F || 101)
  };
}

function publicCase(state) {
  if (!state) return null;
  return {
    caseId: state.caseId,
    customerId: state.customerId,
    stage: state.stage,
    previousStage: state.previousStage,
    mode: state.mode || null,
    sessionId: state.sessionId || null,
    stack: state.stack,
    hardship: state.hardship || null,
    traces: state.traces,
    transcript: state.transcript,
    approval: state.approval,
    agreed: state.agreed || null,
    execution: state.execution,
    updatedAt: state.updatedAt
  };
}

app.use((error, _req, res, _next) => {
  res.status(500).json({ ok: false, error: error.message });
});

// A live demo must never die from a stray async error in a socket callback.
process.on('uncaughtException', (err) => console.error('[uncaught]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandled]', err?.message || err));

const server = app.listen(PORT, () => {
  console.log(`Vocare arrearage agent on http://localhost:${PORT}`);
  console.log(`Realtime voice: ${realtimeConfig().configured ? 'configured' : 'NOT configured'}`);
  console.log('Synthetic data only — no real customer or account is represented.');
});

attachVoiceBridge(server);
