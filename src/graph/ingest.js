import { accountFor } from './dataset.js';

/**
 * Loads the synthetic US arrearage dataset into Neo4j.
 *
 * The graph mirrors the dataset exactly — resolution logic lives in resolve.js
 * and runs over whichever backend supplied the nodes, so Neo4j and the
 * in-memory fallback can never produce different answers.
 */
export async function ingestDataset(session, dataset) {
  const now = new Date().toISOString();
  const counts = { states: 0, rules: 0, moratoria: 0, programs: 0, criteria: 0, agencies: 0, customers: 0, accounts: 0, stacking: 0 };

  for (const j of dataset.jurisdictions) {
    await session.run(
      `MERGE (s:State {code: $code})
         SET s.name = $name, s.regulator = $regulator, s.regulatorAbbr = $abbr, s.updatedAt = $now`,
      { code: j.state.code, name: j.state.name, regulator: j.state.regulator, abbr: j.state.regulatorAbbr, now }
    );
    counts.states += 1;

    await session.run(
      `MATCH (s:State {code: $code})
       MERGE (r:PucRule {sourceId: $sourceId})
         SET r += $props, r.updatedAt = $now
       MERGE (s)-[:GOVERNED_BY]->(r)`,
      {
        code: j.state.code,
        sourceId: j.pucRule.sourceId,
        now,
        props: {
          citation: j.pucRule.citation,
          title: j.pucRule.title,
          summary: j.pucRule.summary,
          effectiveFrom: j.pucRule.effectiveFrom,
          noticeDays: j.pucRule.noticeDays,
          reconnectionMaxFee: j.pucRule.reconnectionMaxFee,
          dpaMaxTermMonths: j.pucRule.deferredPaymentArrangement?.maxTermMonths ?? null,
          dpaMaxDownPaymentPercent: j.pucRule.deferredPaymentArrangement?.maxDownPaymentPercent ?? null,
          dpaNote: j.pucRule.deferredPaymentArrangement?.note ?? null
        }
      }
    );
    counts.rules += 1;

    for (const m of j.moratoria) {
      await session.run(
        `MATCH (r:PucRule {sourceId: $ruleId})
         MERGE (m:Moratorium {sourceId: $sourceId})
           SET m += $props, m.updatedAt = $now
         MERGE (r)-[:DEFINES]->(m)`,
        {
          ruleId: j.pucRule.sourceId,
          sourceId: m.sourceId,
          now,
          props: {
            kind: m.kind,
            label: m.label,
            trigger: m.trigger,
            thresholdF: m.thresholdF ?? null,
            comparator: m.comparator ?? null,
            windowStart: m.windowStart ?? null,
            windowEnd: m.windowEnd ?? null,
            flags: m.flags ?? null,
            appliesTo: m.appliesTo,
            citation: m.citation
          }
        }
      );
      counts.moratoria += 1;
    }

    await session.run(
      `MATCH (s:State {code: $code})
       MERGE (a:AuthorityRule {sourceId: $sourceId})
         SET a += $props, a.updatedAt = $now
       MERGE (s)-[:DELEGATES]->(a)`,
      {
        code: j.state.code,
        sourceId: j.authorityRule.sourceId,
        now,
        props: {
          title: j.authorityRule.title,
          floorAmount: j.authorityRule.floorAmount,
          frequency: j.authorityRule.frequency,
          requiresRole: j.authorityRule.requiresRole,
          requiresLevel: j.authorityRule.requiresLevel,
          effectiveFrom: j.authorityRule.effectiveFrom,
          text: j.authorityRule.text
        }
      }
    );
  }

  for (const p of dataset.programs) {
    await session.run(
      `MATCH (s:State {code: $state})
       MERGE (p:BenefitProgram {id: $id})
         SET p += $props, p.updatedAt = $now
       MERGE (s)-[:ADMINISTERS]->(p)`,
      {
        state: p.state,
        id: p.id,
        now,
        props: {
          kind: p.kind,
          name: p.name,
          state: p.state,
          sourceId: p.sourceId,
          citation: p.citation,
          administeredBy: p.administeredBy,
          effectiveFrom: p.effectiveFrom ?? null,
          effectiveTo: p.effectiveTo ?? null,
          searchText: [p.name, p.citation, p.administeredBy].filter(Boolean).join(' · '),
          ratified: p.ratified ?? true
        }
      }
    );
    counts.programs += 1;

    if (p.intakeVia) {
      await session.run(
        `MATCH (p:BenefitProgram {id: $id})
         MERGE (a:LocalAgency {id: $agencyId})
           SET a.name = $name, a.channel = $channel, a.note = $note, a.updatedAt = $now
         MERGE (p)-[:INTAKE_VIA]->(a)`,
        {
          id: p.id,
          agencyId: p.intakeVia.agencyId,
          name: p.intakeVia.name,
          channel: p.intakeVia.channel,
          note: p.intakeVia.note ?? null,
          now
        }
      );
      counts.agencies += 1;
    }

    for (const c of p.criteria || []) {
      await session.run(
        `MATCH (p:BenefitProgram {id: $id})
         MERGE (e:EligibilityCriterion {id: $criterionId})
           SET e.kind = $kind, e.comparator = $comparator, e.value = $value, e.text = $text, e.updatedAt = $now
         MERGE (p)-[:HAS_CRITERION]->(e)`,
        {
          id: p.id,
          criterionId: c.id,
          kind: c.kind,
          comparator: c.comparator,
          value: typeof c.value === 'boolean' ? String(c.value) : c.value,
          text: c.text,
          now
        }
      );
      counts.criteria += 1;
    }
  }

  for (const rule of dataset.stackingRules) {
    const relation = rule.relation === 'REQUIRES' ? 'REQUIRES' : rule.relation === 'EXCLUDES' ? 'EXCLUDES' : 'STACKS_WITH';
    await session.run(
      `MATCH (a:BenefitProgram {id: $from})
       OPTIONAL MATCH (b:BenefitProgram {id: $to})
       WITH a, b WHERE b IS NOT NULL
       MERGE (a)-[r:${relation}]->(b)
         SET r.sourceId = $sourceId, r.text = $text, r.updatedAt = $now`,
      { from: rule.from, to: rule.to, sourceId: rule.sourceId, text: rule.text, now }
    );
    counts.stacking += 1;
  }

  for (const customer of dataset.customers) {
    await session.run(
      `MATCH (s:State {code: $state})
       MERGE (c:Customer {id: $id})
         SET c += $props, c.updatedAt = $now
       MERGE (c)-[:SERVED_IN]->(s)`,
      {
        state: customer.state,
        id: customer.id,
        now,
        props: {
          caseId: customer.caseId,
          name: customer.name,
          state: customer.state,
          city: customer.city,
          county: customer.county,
          service: customer.service,
          declaredHouseholdSize: customer.declaredHouseholdSize,
          declaredAnnualIncome: customer.declaredAnnualIncome,
          arrears: customer.arrears,
          hasDisconnectionNotice: Boolean(customer.hasDisconnectionNotice),
          synthetic: true
        }
      }
    );
    counts.customers += 1;

    const account = accountFor(dataset, customer.id);
    const records = [account.invoice, account.payment, ...account.notes].filter(Boolean);
    for (const record of records) {
      await session.run(
        `MATCH (c:Customer {id: $customerId})
         MERGE (a:AccountRecord {id: $id})
           SET a += $props, a.updatedAt = $now
         MERGE (c)-[:HAS_RECORD]->(a)`,
        {
          customerId: customer.id,
          id: record.id,
          now,
          props: {
            customerId: customer.id,
            type: record.type,
            text: record.text,
            signals: record.signals ?? null,
            outstandingBalance: record.outstandingBalance ?? null,
            unpaidInvoices: record.unpaidInvoices ?? null,
            failedAutoPayments: record.failedAutoPayments ?? null,
            extensionRequests: record.extensionRequests ?? null,
            date: record.date ?? null
          }
        }
      );
      counts.accounts += 1;
    }
  }

  return counts;
}
