export async function getGraphCounts(session) {
  const result = await session.run(
    `CALL {
       MATCH (n) RETURN count(n) AS nodes
     }
     CALL {
       MATCH ()-[r]->() RETURN count(r) AS relationships
     }
     CALL {
       MATCH (n) UNWIND labels(n) AS label
       RETURN collect(DISTINCT label) AS labels
     }
     RETURN nodes, relationships, labels`
  );

  const record = result.records[0];
  return {
    nodes: convertNeo4jIntegers(record.get('nodes')),
    relationships: convertNeo4jIntegers(record.get('relationships')),
    labels: record.get('labels')
  };
}

export async function getLabelCounts(session) {
  const result = await session.run(
    `MATCH (n) UNWIND labels(n) AS label
     RETURN label, count(*) AS count ORDER BY count DESC`
  );
  return result.records.map((r) => ({ label: r.get('label'), count: convertNeo4jIntegers(r.get('count')) }));
}

/**
 * Feeds the on-stage graph animation. Ported from the Company Brain
 * visualization query with this project's label set.
 */
export async function getGraphVisualization(session, options = {}) {
  const relationshipLimit = Math.max(1, Math.min(10000, Number(options.relationshipLimit || 1000)));
  const stateFilter = options.state || null;

  const result = await session.run(
    `
    MATCH (source)-[relationship]->(target)
    WHERE (source:Customer OR source:State OR source:PucRule OR source:Moratorium
        OR source:BenefitProgram OR source:EligibilityCriterion OR source:LocalAgency
        OR source:AuthorityRule OR source:AccountRecord OR source:KnowledgeGap)
      AND ($stateFilter IS NULL OR source.state = $stateFilter OR source.code = $stateFilter)
    RETURN source, relationship, target
    LIMIT toInteger($relationshipLimit)
    `,
    { relationshipLimit, stateFilter }
  );

  const nodes = new Map();
  const links = [];

  for (const record of result.records) {
    const source = serializeNode(record.get('source'));
    const target = serializeNode(record.get('target'));
    const relationship = record.get('relationship');

    nodes.set(source.id, source);
    nodes.set(target.id, target);
    links.push({
      id: relationship.elementId || relationship.identity?.toString(),
      source: source.id,
      target: target.id,
      type: relationship.type,
      properties: convertNeo4jIntegers(relationship.properties || {})
    });
  }

  return {
    nodes: [...nodes.values()],
    links,
    summary: { nodeCount: nodes.size, relationshipCount: links.length, relationshipLimit }
  };
}

/** Full-text candidate retrieval — explanatory text only, never an eligibility decision. */
export async function searchPolicyText(session, query, { limit = 8 } = {}) {
  const result = await session.run(
    `CALL db.index.fulltext.queryNodes('arr_program_search', $query) YIELD node, score
     RETURN node, score, 'BenefitProgram' AS source
     ORDER BY score DESC LIMIT toInteger($limit)`,
    { query, limit }
  );
  return result.records.map((r) => ({
    score: r.get('score'),
    node: serializeNode(r.get('node'))
  }));
}

function serializeNode(node) {
  const properties = convertNeo4jIntegers(node.properties || {});
  const labels = node.labels || [];
  return {
    id: node.elementId || node.identity?.toString(),
    labels,
    label: displayNodeLabel(properties),
    primaryLabel: labels[0] || 'Node',
    properties
  };
}

function displayNodeLabel(properties) {
  return (
    properties.name ||
    properties.title ||
    properties.label ||
    properties.citation ||
    properties.text ||
    properties.code ||
    properties.id ||
    'Node'
  );
}

function convertNeo4jIntegers(value) {
  if (Array.isArray(value)) return value.map(convertNeo4jIntegers);
  if (value && typeof value === 'object') {
    if (typeof value.toNumber === 'function') return value.toNumber();
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, convertNeo4jIntegers(entry)]));
  }
  return value;
}
