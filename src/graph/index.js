import { isGraphConfigured, verifyGraphConnectivity, withGraphSession, READ, WRITE } from './neo4j.js';
import { loadDataset, persistKnowledgeGaps } from './dataset.js';
import { ensureGraphSchema } from './schema.js';
import { ingestDataset } from './ingest.js';
import { getGraphCounts, getGraphVisualization, getLabelCounts, searchPolicyText } from './queries.js';
import { resolveBenefitStack, resolveJurisdiction } from './resolve.js';
import { explainProgram, isContextEngineConfigured, indexPolicyChunks } from './contextEngine.js';
import { generateFillerMesh } from './meshFiller.js';
import {
  discoveryStatus,
  discoveryVisualization,
  resetDiscovery,
  runDiscoveryAgent
} from './discovery.js';

/**
 * The context engine facade.
 *
 * Resolution always runs through resolve.js over the same dataset shape, so the
 * Neo4j-backed and in-memory paths return identical answers. Neo4j gives us the
 * graph visualization and full-text candidate retrieval; when it is unavailable
 * the workflow continues unchanged and the UI shows a "context source fallback"
 * badge rather than dead-ending.
 */

let backendState = { backend: 'memory', reason: 'not yet probed', probedAt: null };

export async function probeBackend({ force = false } = {}) {
  if (backendState.probedAt && !force) return backendState;

  if (!isGraphConfigured()) {
    backendState = { backend: 'memory', reason: 'Neo4j env vars not configured', probedAt: new Date().toISOString() };
    return backendState;
  }

  const check = await verifyGraphConnectivity();
  backendState = check.ok
    ? { backend: 'neo4j', reason: null, database: check.database, probedAt: new Date().toISOString() }
    : { backend: 'memory', reason: check.error, probedAt: new Date().toISOString() };

  return backendState;
}

export function currentBackend() {
  return backendState;
}

export async function engineStatus() {
  const backend = await probeBackend();
  const dataset = await loadDataset();

  const base = {
    backend: backend.backend,
    fallbackReason: backend.reason,
    synthetic: true,
    dataset: {
      states: dataset.jurisdictions.length,
      programs: dataset.programs.length,
      customers: dataset.customers.length,
      stackingRules: dataset.stackingRules.length,
      knowledgeGaps: dataset.knowledgeGaps.length,
      loadedAt: dataset.loadedAt
    }
  };

  if (backend.backend !== 'neo4j') return base;

  try {
    const [counts, labels] = await withGraphSession(READ, async (session) => [
      await getGraphCounts(session),
      await getLabelCounts(session)
    ]);
    return { ...base, graph: { ...counts, labelCounts: labels } };
  } catch (error) {
    return { ...base, graphError: error.message };
  }
}

/** Applies the schema and loads every synthetic record into Neo4j. */
export async function syncGraph() {
  const backend = await probeBackend({ force: true });
  const dataset = await loadDataset({ reload: true });

  if (backend.backend !== 'neo4j') {
    return { backend: 'memory', synced: false, reason: backend.reason, dataset: dataset.loadedAt };
  }

  const schema = await withGraphSession(WRITE, (session) => ensureGraphSchema(session));
  const counts = await withGraphSession(WRITE, (session) => ingestDataset(session, dataset));
  const semantic = await withGraphSession(WRITE, (session) => indexPolicyChunks(session, dataset));
  // Learnings recorded while the graph was unreachable live only in JSON.
  // Reconcile them here so an outage heals itself on the next sync.
  const learnings = await mirrorAllLearnings();
  return { backend: 'neo4j', synced: true, schema, counts, semantic, learnings };
}

export async function visualization(options = {}) {
  const base = discoveryVisualization();

  if (!options.dense) return base;
  return mergeFillerMesh(base, options.state || null);
}

export { discoveryStatus, resetDiscovery, runDiscoveryAgent };

/** Merges the visualization-only synthetic density filler in, scoped to a state filter if present. */
function mergeFillerMesh(base, stateFilter) {
  const filler = generateFillerMesh();
  const nodes = stateFilter
    ? filler.nodes.filter((n) => n.properties?.state === stateFilter || n.id === stateFilter)
    : filler.nodes;
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = filler.links.filter((l) => nodeIds.has(l.source) || nodeIds.has(l.target));
  // Filler links may reference a real State node (e.g. "CA") that already exists in base.
  const baseIds = new Set(base.nodes.map((n) => n.id));
  const keptLinks = links.filter((l) => (nodeIds.has(l.source) || baseIds.has(l.source)) && (nodeIds.has(l.target) || baseIds.has(l.target)));

  const mergedNodes = [...base.nodes, ...nodes];
  const mergedLinks = [...base.links, ...keptLinks];
  return {
    nodes: mergedNodes,
    links: mergedLinks,
    summary: { ...base.summary, nodeCount: mergedNodes.length, relationshipCount: mergedLinks.length, dense: true }
  };
}

export async function policyCandidates(query, options = {}) {
  const backend = await probeBackend();
  if (backend.backend !== 'neo4j') return [];
  try {
    return await withGraphSession(READ, (session) => searchPolicyText(session, query, options));
  } catch {
    return [];
  }
}

// ── resolution ───────────────────────────────────────────────────────

export async function jurisdictionFor(input) {
  const dataset = await loadDataset();
  return resolveJurisdiction(dataset, normaliseInput(input));
}

export async function benefitStackFor(input) {
  const dataset = await loadDataset();
  const extraPrograms = ratifiedGapPrograms(dataset);
  return resolveBenefitStack(dataset, { ...normaliseInput(input), extraPrograms });
}

/**
 * Semantic retrieval layer, kept strictly downstream of eligibility. Called once a
 * program is already deterministically eligible, purely to fetch explanatory text —
 * see actian.js. Never used to decide who qualifies.
 */
export async function explainEligibleProgram(program) {
  return explainProgram(program);
}

export function semanticEngineStatus() {
  return { engine: 'neo4j', configured: isContextEngineConfigured() };
}

function normaliseInput(input = {}) {
  return {
    ...input,
    asOf: input.asOf ? new Date(input.asOf) : new Date()
  };
}

/**
 * Ratified knowledge gaps become first-class programs the resolver can return.
 * An open gap is deliberately invisible — the agent cannot use knowledge a human
 * has not signed off on.
 */
function ratifiedGapPrograms(dataset) {
  // Dedupe by program id: the same program may be ratified more than once
  // (repeated calls, or multiple gaps naming it), and it must appear only once
  // in the resolved stack. Keep the most recent ratification.
  const byId = new Map();
  for (const gap of dataset.knowledgeGaps) {
    if (gap.status !== 'ratified' || !gap.program?.id) continue;
    const existing = byId.get(gap.program.id);
    if (!existing || (gap.ratifiedAt || '') >= (existing.ratifiedAt || '')) {
      byId.set(gap.program.id, { ...gap.program, ratified: true, ratifiedBy: gap.ratifiedBy, ratifiedAt: gap.ratifiedAt });
    }
  }
  return [...byId.values()];
}

// ── learnings (advisory, agent-written) ──────────────────────────────
//
// Re-exported through the facade so callers reach the learning layer the same
// way they reach the rest of the context engine. See learnings.js for why these
// are kept strictly separate from ratified ground truth.
export { listLearnings, playbookFor, recordLearning, learningSummary, LEARNING_KINDS } from './learnings.js';
import { mirrorAllLearnings } from './learnings.js';

// ── knowledge gaps ───────────────────────────────────────────────────

export async function listKnowledgeGaps() {
  const dataset = await loadDataset();
  return dataset.knowledgeGaps;
}

export async function recordKnowledgeGap(gap) {
  const dataset = await loadDataset();
  const entry = {
    id: gap.id || `GAP-${Date.now()}`,
    status: 'open',
    createdAt: new Date().toISOString(),
    ...gap
  };
  const next = [...dataset.knowledgeGaps.filter((g) => g.id !== entry.id), entry];
  await persistKnowledgeGaps(next);
  return entry;
}

export async function ratifyKnowledgeGap(gapId, { ratifiedBy, authority, program }) {
  const dataset = await loadDataset();
  const existing = dataset.knowledgeGaps.find((g) => g.id === gapId);
  if (!existing) throw new Error(`Unknown knowledge gap: ${gapId}`);

  const ratified = {
    ...existing,
    status: 'ratified',
    ratifiedBy,
    authority,
    ratifiedAt: new Date().toISOString(),
    program: program || existing.program
  };

  const next = dataset.knowledgeGaps.map((g) => (g.id === gapId ? ratified : g));
  await persistKnowledgeGaps(next);

  // Push the newly ratified program into Neo4j so the graph and the resolver agree.
  const backend = await probeBackend();
  if (backend.backend === 'neo4j' && ratified.program) {
    try {
      await withGraphSession(WRITE, (session) =>
        ingestDataset(session, { ...dataset, programs: [ratified.program], stackingRules: [], customers: [], jurisdictions: [] })
      );
    } catch {
      // The JSON store remains authoritative; the graph catches up on next sync.
    }
  }

  return ratified;
}

// ── in-memory visualization ──────────────────────────────────────────

function memoryVisualization(dataset, { state = null } = {}) {
  const nodes = new Map();
  const links = [];
  const add = (id, primaryLabel, label, properties = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, labels: [primaryLabel], primaryLabel, label, properties });
    return id;
  };
  const link = (source, target, type) => links.push({ id: `${source}->${target}:${type}`, source, target, type });

  const jurisdictions = state
    ? dataset.jurisdictions.filter((j) => j.state.code === state)
    : dataset.jurisdictions;

  for (const j of jurisdictions) {
    const s = add(j.state.code, 'State', j.state.name, j.state);
    const r = add(j.pucRule.sourceId, 'PucRule', j.pucRule.title, j.pucRule);
    link(s, r, 'GOVERNED_BY');

    for (const m of j.moratoria) {
      link(r, add(m.sourceId, 'Moratorium', m.label, m), 'DEFINES');
    }
    link(s, add(j.authorityRule.sourceId, 'AuthorityRule', j.authorityRule.title, j.authorityRule), 'DELEGATES');
  }

  const codes = new Set(jurisdictions.map((j) => j.state.code));

  for (const p of dataset.programs.filter((p) => codes.has(p.state))) {
    const node = add(p.id, 'BenefitProgram', p.name, p);
    link(p.state, node, 'ADMINISTERS');
    if (p.intakeVia) link(node, add(p.intakeVia.agencyId, 'LocalAgency', p.intakeVia.name, p.intakeVia), 'INTAKE_VIA');
    for (const c of p.criteria || []) link(node, add(c.id, 'EligibilityCriterion', c.text, c), 'HAS_CRITERION');
  }

  for (const rule of dataset.stackingRules.filter((r) => codes.has(r.state))) {
    if (nodes.has(rule.from) && nodes.has(rule.to)) link(rule.from, rule.to, rule.relation);
  }

  for (const c of dataset.customers.filter((c) => codes.has(c.state))) {
    const node = add(c.id, 'Customer', c.name, c);
    link(node, c.state, 'SERVED_IN');
  }

  for (const gap of dataset.knowledgeGaps) {
    add(gap.id, 'KnowledgeGap', gap.programMentioned || gap.id, gap);
    if (nodes.has(gap.state)) link(gap.state, gap.id, 'HAS_GAP');
  }

  return {
    nodes: [...nodes.values()],
    links,
    summary: { nodeCount: nodes.size, relationshipCount: links.length, backend: 'memory' }
  };
}
