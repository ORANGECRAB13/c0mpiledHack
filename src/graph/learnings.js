// Vocare — the learning layer of the context engine.
//
// Two kinds of thing come out of a call, and conflating them would be the
// single most dangerous mistake in this system:
//
//   GROUND TRUTH — "Illinois has a program called X, and here is who qualifies."
//     Lives in knowledge-gaps.json. An OPEN gap is invisible to the resolver.
//     Only a human ratification makes it resolvable. Unchanged by this file.
//
//   TACTICS AND TRENDS — "customers who lead with a medical hardship disclose
//     income faster if you name the certification before asking", "three IL
//     customers this week mentioned a county fund we have no record of".
//     Lives here. Written autonomously after every call, retrieved before the
//     next one, and injected into the agent's briefing.
//
// Learnings are advisory and carry confidence, not authority. They change how
// the agent *talks*; they can never change what it is *allowed to agree to* —
// the floor, the ceiling, and eligibility all stay deterministic in policy.js
// and resolve.js. A learning that tried to raise an affordability cap would be
// ignored, because nothing in the decision path reads this file.
//
// Reinforcement: an insight the agent keeps rediscovering is real signal, so a
// near-duplicate does not create a second row — it increments `observations`
// and raises confidence. Insights that stop recurring decay out of the briefing
// by rank, not by deletion, so the audit trail stays complete.

import { withGraphSession, WRITE, READ } from './neo4j.js';
import { loadDataset, persistLearnings } from './dataset.js';

export const LEARNING_KINDS = [
  'negotiation_tactic',
  'objection_pattern',
  'trend',
  'process_friction',
  'knowledge_gap_signal'
];

/** Cheap lexical fingerprint — good enough to catch restatements of one idea. */
function fingerprint(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function similarity(a, b) {
  const fa = fingerprint(a);
  const fb = fingerprint(b);
  if (!fa.size || !fb.size) return 0;
  let shared = 0;
  for (const w of fa) if (fb.has(w)) shared += 1;
  return shared / Math.min(fa.size, fb.size);
}

const DUPLICATE_THRESHOLD = 0.6;

export async function listLearnings({ state, kind, minConfidence = 0 } = {}) {
  const dataset = await loadDataset();
  return (dataset.learnings || []).filter(
    (l) =>
      (!state || l.state === state || l.state === 'ALL') &&
      (!kind || l.kind === kind) &&
      (l.confidence ?? 0) >= minConfidence
  );
}

/**
 * The pre-call briefing: what the agent should carry into this conversation.
 * Ranked by observations × confidence so repeatedly-confirmed insight outranks
 * a one-off, and capped — a briefing nobody can act on is not a briefing.
 */
export async function playbookFor(stateCode, { limit = 8 } = {}) {
  const relevant = await listLearnings({ state: stateCode, minConfidence: 0.4 });
  return relevant
    .slice()
    .sort((a, b) => (b.observations ?? 1) * (b.confidence ?? 0) - (a.observations ?? 1) * (a.confidence ?? 0))
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      kind: l.kind,
      insight: l.insight,
      guidance: l.guidance,
      confidence: l.confidence,
      observations: l.observations,
      state: l.state
    }));
}

/**
 * Writes one insight, merging it into an existing row when it restates
 * something already known. Returns the stored record and whether it was new.
 */
export async function recordLearning(entry) {
  const dataset = await loadDataset();
  const existing = dataset.learnings || [];

  const match = existing.find(
    (l) => l.kind === entry.kind && l.state === entry.state && similarity(l.insight, entry.insight) >= DUPLICATE_THRESHOLD
  );

  let stored;
  let next;

  if (match) {
    const observations = (match.observations ?? 1) + 1;
    stored = {
      ...match,
      observations,
      // Repeated observation raises confidence asymptotically toward 0.97 —
      // it never reaches certainty, because these are inferences about people.
      confidence: Math.min(0.97, Math.max(match.confidence ?? 0.5, entry.confidence ?? 0.5) + 0.08),
      guidance: entry.guidance || match.guidance,
      lastSeenAt: new Date().toISOString(),
      sourceCaseIds: [...new Set([...(match.sourceCaseIds || []), entry.caseId].filter(Boolean))]
    };
    next = existing.map((l) => (l.id === match.id ? stored : l));
  } else {
    stored = {
      id: `LRN-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      kind: entry.kind,
      state: entry.state || 'ALL',
      insight: entry.insight,
      guidance: entry.guidance || '',
      confidence: entry.confidence ?? 0.5,
      observations: 1,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      sourceCaseIds: [entry.caseId].filter(Boolean),
      proposedBy: entry.proposedBy || 'reflection-agent',
      synthetic: true
    };
    next = [...existing, stored];
  }

  await persistLearnings(next);
  await mirrorToGraph(stored).catch(() => {
    // JSON stays authoritative; the graph catches up on the next sync.
  });

  return { learning: stored, reinforced: Boolean(match) };
}

/**
 * Mirrors a learning into Neo4j so it is queryable alongside the policy graph
 * and shows up in the visualization. Best-effort: the memory backend is a
 * fully supported mode, and a graph outage must never lose a learning.
 */
async function mirrorToGraph(learning) {
  await withGraphSession(WRITE, (session) =>
    session.run(
      `
      MERGE (l:Learning { id: $id })
      SET l.kind = $kind,
          l.insight = $insight,
          l.guidance = $guidance,
          l.confidence = $confidence,
          l.observations = $observations,
          l.state = $state,
          l.lastSeenAt = $lastSeenAt,
          l.synthetic = true
      WITH l
      FOREACH (_ IN CASE WHEN $state <> 'ALL' THEN [1] ELSE [] END |
        MERGE (s:State { code: $state })
        MERGE (l)-[:APPLIES_IN]->(s)
      )
      `,
      {
        id: learning.id,
        kind: learning.kind,
        insight: learning.insight,
        guidance: learning.guidance,
        confidence: learning.confidence,
        observations: learning.observations,
        state: learning.state,
        lastSeenAt: learning.lastSeenAt
      }
    )
  );
}

/** Aggregate view for the operator UI — what has the system taught itself? */
export async function learningSummary() {
  const all = await listLearnings();
  const byKind = {};
  for (const kind of LEARNING_KINDS) {
    const rows = all.filter((l) => l.kind === kind);
    if (rows.length) byKind[kind] = rows.length;
  }
  return {
    total: all.length,
    byKind,
    totalObservations: all.reduce((sum, l) => sum + (l.observations ?? 1), 0),
    reinforced: all.filter((l) => (l.observations ?? 1) > 1).length,
    states: [...new Set(all.map((l) => l.state))]
  };
}

export async function graphLearnings() {
  return withGraphSession(READ, (session) =>
    session
      .run('MATCH (l:Learning) RETURN l ORDER BY l.observations DESC LIMIT 50')
      .then((r) => r.records.map((rec) => rec.get('l').properties))
  );
}
