/**
 * Neo4j context engine — the semantic retrieval layer, replacing the Actian
 * VectorAI vector DB with the same Neo4j-native approach ai-brain uses.
 *
 * This NEVER decides eligibility. resolve.js already knows, deterministically,
 * which programs a customer qualifies for; this module's only job is to fetch a
 * plain-language explanation/citation for a program the resolver has already
 * ruled eligible.
 *
 * Retrieval mirrors ai-brain's context engine:
 *   1. embed the query on-device (bge-small) and rank PolicyChunk nodes through
 *      a Neo4j vector index (db.index.vector.queryNodes),
 *   2. run a full-text keyword search over the same chunks,
 *   3. fuse the two rankings (reciprocal-rank fusion) and return the top chunk.
 * Any layer that is unavailable is skipped; if Neo4j itself is down we fall back
 * to the program's own citation/summary so the UI never blocks the call.
 */

import { isGraphConfigured, withGraphSession, READ, WRITE } from './neo4j.js';
import { normalizeKey, hashText } from './normalize.js';
import { embedQuery, embedDocuments } from './embeddings.js';

const VECTOR_INDEX = 'policy_chunk_embedding';
const FULLTEXT_INDEX = 'policy_chunk_search';
const RRF_K = 60;

export function isContextEngineConfigured() {
  return isGraphConfigured();
}

// ── ingest: policy text → PolicyChunk nodes with embeddings ───────────

/**
 * Turns the loaded dataset's policy prose into embedded, searchable chunks.
 * Called from syncGraph so the graph and the resolver stay in lock-step.
 */
export async function indexPolicyChunks(session, dataset) {
  const chunks = collectChunks(dataset);
  const vectors = await embedDocuments(chunks.map((c) => c.text));

  await session.run(
    `CREATE VECTOR INDEX ${VECTOR_INDEX} IF NOT EXISTS
     FOR (c:PolicyChunk) ON (c.embedding)
     OPTIONS { indexConfig: { \`vector.dimensions\`: 384, \`vector.similarity_function\`: 'cosine' } }`
  );
  await session.run(
    `CREATE FULLTEXT INDEX ${FULLTEXT_INDEX} IF NOT EXISTS FOR (c:PolicyChunk) ON EACH [c.text, c.title]`
  );

  let embedded = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const vector = vectors[i];
    await session.run(
      `MERGE (c:PolicyChunk {key: $key})
         SET c.text = $text, c.title = $title, c.programId = $programId,
             c.sourceId = $sourceId, c.state = $state, c.kind = $kind, c.updatedAt = $now
       WITH c
       CALL { WITH c
         MATCH (p:BenefitProgram {id: c.programId})
         MERGE (p)-[:EXPLAINED_BY]->(c)
       }`,
      { ...c, now: new Date().toISOString() }
    ).catch(() => {}); // program node may not exist for rule-only chunks
    if (vector) {
      await session.run(`MATCH (c:PolicyChunk {key: $key}) CALL db.create.setNodeVectorProperty(c, 'embedding', $vector)`, {
        key: c.key,
        vector
      });
      embedded += 1;
    }
  }
  return { chunks: chunks.length, embedded };
}

function collectChunks(dataset) {
  const chunks = [];
  const push = (parts, meta) => {
    const text = parts.filter(Boolean).join(' — ');
    if (!text) return;
    chunks.push({ key: hashText(`${meta.sourceId}:${normalizeKey(text).slice(0, 40)}`), text, ...meta });
  };

  for (const p of dataset.programs || []) {
    push([p.name, p.citation, p.administeredBy], {
      title: p.name, programId: p.id, sourceId: p.sourceId, state: p.state, kind: p.kind
    });
    for (const t of p.tiers || []) push([`${p.name} — ${t.name}`, t.text], {
      title: `${p.name} · ${t.name}`, programId: p.id, sourceId: p.sourceId, state: p.state, kind: p.kind
    });
    if (p.forgiveness?.text) push([`${p.name} forgiveness`, p.forgiveness.text], {
      title: `${p.name} forgiveness`, programId: p.id, sourceId: p.sourceId, state: p.state, kind: p.kind
    });
    if (p.incomeCap?.text) push([`${p.name} income cap`, p.incomeCap.text], {
      title: `${p.name} income cap`, programId: p.id, sourceId: p.sourceId, state: p.state, kind: p.kind
    });
  }
  for (const j of dataset.jurisdictions || []) {
    push([j.pucRule.title, j.pucRule.summary, j.pucRule.citation], {
      title: j.pucRule.title, programId: '', sourceId: j.pucRule.sourceId, state: j.state.code, kind: 'puc_rule'
    });
  }
  return chunks;
}

// ── retrieval: explain an already-eligible program ────────────────────

/**
 * Best-effort semantic lookup for a program the resolver already ruled eligible.
 * Returns { source, text, citation, configured } — same shape the Actian client
 * exposed, so callers (state-machine retrieveExplanations) are unchanged.
 */
export async function explainProgram(program) {
  const query = [program.name, program.citation, program.kind].filter(Boolean).join(' ');
  const fallback = {
    source: 'local_fallback',
    text: program.summary || program.description || program.citation || program.name,
    citation: program.sourceId || program.id
  };

  if (!isContextEngineConfigured()) {
    return { ...fallback, configured: false };
  }

  try {
    const hit = await withGraphSession(READ, (session) => hybridSearch(session, query, program.id));
    if (hit) {
      return { source: 'neo4j_context_engine', text: hit.text, citation: hit.sourceId || fallback.citation, configured: true };
    }
  } catch {
    // fall through to fallback
  }
  return { ...fallback, configured: true };
}

/** Vector + full-text over PolicyChunk, fused by reciprocal-rank. Mirrors ai-brain. */
async function hybridSearch(session, query, preferProgramId) {
  const rankings = [];

  const vector = await embedQuery(query);
  if (vector) {
    try {
      const res = await session.run(
        `CALL db.index.vector.queryNodes($index, 8, $vector) YIELD node, score
         RETURN node.key AS key, node.text AS text, node.sourceId AS sourceId, node.programId AS programId
         ORDER BY score DESC`,
        { index: VECTOR_INDEX, vector }
      );
      rankings.push(res.records.map((r) => r.toObject()));
    } catch { /* vector index not present */ }
  }

  try {
    const res = await session.run(
      `CALL db.index.fulltext.queryNodes($index, $q) YIELD node, score
       RETURN node.key AS key, node.text AS text, node.sourceId AS sourceId, node.programId AS programId
       ORDER BY score DESC LIMIT 8`,
      { index: FULLTEXT_INDEX, q: query }
    );
    rankings.push(res.records.map((r) => r.toObject()));
  } catch { /* full-text index not present */ }

  if (!rankings.length) return null;

  // Reciprocal-rank fusion, then prefer a chunk that belongs to this program.
  const scores = new Map();
  const items = new Map();
  for (const ranking of rankings) {
    ranking.forEach((item, rank) => {
      items.set(item.key, item);
      scores.set(item.key, (scores.get(item.key) || 0) + 1 / (RRF_K + rank));
    });
  }
  for (const [key, item] of items) {
    if (item.programId === preferProgramId) scores.set(key, scores.get(key) + 0.5);
  }
  const best = [...items.values()].sort((a, b) => scores.get(b.key) - scores.get(a.key))[0];
  return best || null;
}
