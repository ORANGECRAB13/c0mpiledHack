const constraints = [
  'CREATE CONSTRAINT arr_customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT arr_state_code IF NOT EXISTS FOR (s:State) REQUIRE s.code IS UNIQUE',
  'CREATE CONSTRAINT arr_puc_rule_id IF NOT EXISTS FOR (r:PucRule) REQUIRE r.sourceId IS UNIQUE',
  'CREATE CONSTRAINT arr_moratorium_id IF NOT EXISTS FOR (m:Moratorium) REQUIRE m.sourceId IS UNIQUE',
  'CREATE CONSTRAINT arr_program_id IF NOT EXISTS FOR (p:BenefitProgram) REQUIRE p.id IS UNIQUE',
  'CREATE CONSTRAINT arr_criterion_id IF NOT EXISTS FOR (e:EligibilityCriterion) REQUIRE e.id IS UNIQUE',
  'CREATE CONSTRAINT arr_agency_id IF NOT EXISTS FOR (a:LocalAgency) REQUIRE a.id IS UNIQUE',
  'CREATE CONSTRAINT arr_authority_id IF NOT EXISTS FOR (a:AuthorityRule) REQUIRE a.sourceId IS UNIQUE',
  'CREATE CONSTRAINT arr_account_id IF NOT EXISTS FOR (a:AccountRecord) REQUIRE a.id IS UNIQUE',
  'CREATE CONSTRAINT arr_fact_key IF NOT EXISTS FOR (f:HouseholdFact) REQUIRE f.key IS UNIQUE',
  'CREATE CONSTRAINT arr_gap_id IF NOT EXISTS FOR (g:KnowledgeGap) REQUIRE g.id IS UNIQUE',
  'CREATE CONSTRAINT arr_learning_id IF NOT EXISTS FOR (l:Learning) REQUIRE l.id IS UNIQUE'
];

const indexes = [
  'CREATE INDEX arr_program_state IF NOT EXISTS FOR (p:BenefitProgram) ON (p.state)',
  'CREATE INDEX arr_program_kind IF NOT EXISTS FOR (p:BenefitProgram) ON (p.kind)',
  'CREATE INDEX arr_gap_status IF NOT EXISTS FOR (g:KnowledgeGap) ON (g.status)',
  'CREATE INDEX arr_account_customer IF NOT EXISTS FOR (a:AccountRecord) ON (a.customerId)',
  'CREATE FULLTEXT INDEX arr_rule_search IF NOT EXISTS FOR (r:PucRule) ON EACH [r.title, r.summary, r.citation]',
  'CREATE FULLTEXT INDEX arr_program_search IF NOT EXISTS FOR (p:BenefitProgram) ON EACH [p.name, p.citation, p.searchText]',
  'CREATE FULLTEXT INDEX arr_criterion_search IF NOT EXISTS FOR (e:EligibilityCriterion) ON EACH [e.text]'
];

export async function ensureGraphSchema(session) {
  for (const statement of constraints) await session.run(statement);
  for (const statement of indexes) await session.run(statement);
  return { constraints: constraints.length, indexes: indexes.length };
}
