export const AU_POLICY_SCHEMA = Object.freeze({
  constraints: [
    'CREATE CONSTRAINT au_instrument_id IF NOT EXISTS FOR (n:AUInstrument) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT au_policy_version_key IF NOT EXISTS FOR (n:AUPolicyVersion) REQUIRE n.key IS UNIQUE',
    'CREATE CONSTRAINT au_obligation_id IF NOT EXISTS FOR (n:AUObligation) REQUIRE n.id IS UNIQUE'
  ],
  labels: ['AUInstrument', 'AUClause', 'AUObligation', 'AUPolicyVersion', 'AUInternalArtifact'],
  relationships: ['CONTAINS', 'IMPOSES', 'IMPLEMENTED_BY', 'SUPERSEDES', 'AFFECTS']
});

export async function ensureAuPolicySchema(session) {
  for (const query of AU_POLICY_SCHEMA.constraints) await session.run(query);
  return { constraints: AU_POLICY_SCHEMA.constraints.length };
}

export async function ingestAuPolicyGraph(session, policyVersions) {
  await session.run(`MERGE (i:AUInstrument {id:'vic.ercop.v7'}) SET i.name='Energy Retail Code of Practice v7',i.jurisdiction='VIC'
    MERGE (c:AUClause {id:'vic.ercop.v7.cl76-79'}) SET c.clauses='76-79'
    MERGE (o:AUObligation {id:'vic.hardship.best-offer'}) SET o.name='Hardship and best-offer protection'
    MERGE (i)-[:CONTAINS]->(c) MERGE (c)-[:IMPOSES]->(o)`);
  for (const policy of policyVersions) {
    await session.run(`MATCH (o:AUObligation {id:$id}) MERGE (v:AUPolicyVersion {key:$key})
      SET v.policyId=$id,v.version=$version,v.effectiveFrom=$effectiveFrom,v.effectiveTo=$effectiveTo,v.readFields=$readFields
      MERGE (o)-[:IMPLEMENTED_BY]->(v)`, { id: policy.id, key: `${policy.id}@${policy.version}`, version: policy.version, effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo, readFields: [...policy.readFields] });
  }
  await session.run(`MATCH (old:AUPolicyVersion {key:'vic.hardship.best-offer@1.2.0'}),(new:AUPolicyVersion {key:'vic.hardship.best-offer@1.3.0'}) MERGE (new)-[:SUPERSEDES]->(old)`);
  return { policyVersions: policyVersions.length, joinKeys: policyVersions.map((policy) => `${policy.id}@${policy.version}`) };
}
