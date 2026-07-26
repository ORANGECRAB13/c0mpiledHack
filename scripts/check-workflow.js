import { config } from 'dotenv';
config({ path: '.env.local' });

const wf = await import('../src/workflow/state-machine.js');
const { eventsFor, citedIds } = await import('../src/workflow/events.js');
const { buildAudit } = await import('../src/audit.js');
const sandbox = await import('../src/sandbox.js');
const { persistKnowledgeGaps } = await import('../src/graph/dataset.js');

await persistKnowledgeGaps([]);

const forecast = { highF: 96, lowF: 74, heatIndexF: 101 };
const asOf = '2026-07-24T16:00:00Z';
const step = (n, s) => console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 62 - n.length))}\n${s}`);
const money = (n) => `$${Number(n ?? 0).toLocaleString()}`;

// ═══ CALL 1 — Von ═══════════════════════════════════════════════
let c = await wf.startCase({ customerId: 'CUS-77241', asOf, forecast });
step('CALL 1 — context assembled', [
  `stage: ${c.stage}`,
  `state: ${c.stack.jurisdiction.state.name}, protected: ${c.stack.jurisdiction.protectedFromDisconnection}`,
  `benefits unlocked on the stale record: ${money(c.stack.totals.benefitsUnlocked)}`,
  `offer would be: ${money(c.stack.totals.monthlyPayment)}/month (${c.stack.totals.monthlyBasis})`
].join('\n'));

wf.beginCall(c.caseId, { sessionId: 'sess_demo_1', mode: 'scripted' });
wf.recordTranscript(c.caseId, { speaker: 'agent', text: 'Hello Von, this is Meridian Energy calling about your account.' });
wf.recordTranscript(c.caseId, { speaker: 'customer', text: "My hours at the clinic were cut back in April." });
wf.recordTranscript(c.caseId, { speaker: 'customer', text: "And my daughter moved back in with her two kids." });

const disc = await wf.applyDisclosure(c.caseId, {
  householdSize: 5,
  annualIncome: 34000,
  disclosures: ['hours cut at the clinic in April', 'daughter and two grandchildren moved in']
});
step('CALL 1 — after disclosure', [
  `before: ${money(disc.before.totals.benefitsUnlocked)}   after: ${money(disc.after.totals.benefitsUnlocked)}`,
  `newly eligible: ${disc.newlyEligible.map((n) => n.name).join(', ')}`,
  `monthly now: ${money(disc.after.totals.monthlyPayment)} (${disc.after.totals.monthlyBasis})`,
  `authority floor: ${money(disc.after.boundaries.authorityFloor)}  affordability ceiling: ${money(disc.after.boundaries.affordabilityCeiling)}`
].join('\n'));

// Knowledge gap.
const gap = await wf.flagKnowledgeGap(c.caseId, {
  programMentioned: 'Township General Assistance energy supplement',
  customerQuote: 'My neighbour got something from the township office, not the state.',
  program: {
    id: 'TOWNSHIP-GA-IL', kind: 'GRANT', state: 'IL',
    name: 'Illinois Township General Assistance energy supplement',
    sourceId: 'TOWNSHIP-GA-IL-2026',
    citation: 'Illinois Township Code — General Assistance emergency energy aid',
    administeredBy: 'Township supervisor',
    intakeVia: { agencyId: 'AGENCY-IL-TOWNSHIP', name: 'Township supervisor office', channel: 'township_general_assistance' },
    effectiveFrom: '2025-10-01',
    criteria: [{ id: 'IL-TGA-INCOME', kind: 'income_percent_fpl', comparator: 'lte', value: 200, text: 'Household income at or below 200% FPL.' }],
    tiers: [{ id: 'TGA-REGULAR', kind: 'regular', name: 'Emergency energy supplement', maxBenefit: 400, text: 'One-time township aid.' }]
  }
});
step('CALL 1 — knowledge gap flagged', `${gap.id} status=${gap.status} — agent did not bluff`);

// Affordability clamp.
const tooHigh = wf.evaluateAmount(c.caseId, 260);
step('GUARDRAIL — agent tries an unaffordable amount', `${tooHigh.outcome}: ${tooHigh.reason}`);

// The escalation.
const req = wf.requestApproval(c.caseId, {
  requestedAmount: 120,
  summary: 'Household of five on reduced income. Benefits cover the full arrears. Customer can sustain $120/month.'
});
step('ESCALATION', [
  `held: ${req.held}  stage: ${wf.getCase(c.caseId).stage}`,
  `reason: ${req.check.reason}`,
  `hold message: "${req.holdMessage}"`
].join('\n'));

// Wrong-authority officer is rejected.
const badOfficer = wf.decideApproval(c.caseId, {
  decision: 'approved', approvedAmount: 130,
  officer: { id: 'jamie-l1', name: 'Jamie Fox', role: 'credit_officer', authority: 'L1' }
});
step('AUTHORITY CHECK — L1 officer attempts approval', `accepted: ${badOfficer.accepted} — ${badOfficer.validation.reason}`);

// Correct officer, and an amount above the ceiling gets clamped.
const decision = wf.decideApproval(c.caseId, {
  decision: 'approved', approvedAmount: 200,
  instruction: 'Offer $200 with the full benefit package.',
  officer: { id: 'alex-morgan', name: 'Alex Morgan', role: 'credit_officer', authority: 'L2' }
});
step('APPROVAL — L2 officer approves $200 (above the $170 cap)', [
  `accepted: ${decision.accepted} — ${decision.validation.reason}`,
  `approved amount: ${money(decision.approval.approvedAmount)}  clamped: ${decision.approval.clamped}`,
  `clamp reason: ${decision.clamp.reason}`
].join('\n'));

wf.resumeCall(c.caseId);
wf.recordTranscript(c.caseId, { speaker: 'agent', text: `Thanks for holding. We can do $${decision.approval.approvedAmount} a month, and I've found $1,842.60 in support.` });
wf.recordTranscript(c.caseId, { speaker: 'customer', text: 'Yes, I can make that work.' });
step('RESUME', `stage: ${wf.getCase(c.caseId).stage} — same session, no re-dial`);

// Consent gate.
try {
  wf.beginExecution(c.caseId);
  console.log('FAIL: executed without consent');
} catch (error) {
  step('CONSENT GATE — execution attempted without consent', `blocked: ${error.message}`);
}

wf.recordConsent(c.caseId, {
  amount: decision.approval.approvedAmount,
  benefitIds: wf.getCase(c.caseId).stack.eligible.map((e) => e.id),
  customerConsent: true
});
wf.beginExecution(c.caseId);
const results = await sandbox.executePackage({ stack: wf.getCase(c.caseId).stack, amount: decision.approval.approvedAmount });
for (const r of results) wf.recordExecution(c.caseId, r);
wf.completeCase(c.caseId);
step('EXECUTION', results.map((r) => `  ${r.label.padEnd(30)} ${r.action} — ${r.status}`).join('\n'));

const audit = await buildAudit(wf.getCase(c.caseId), eventsFor(c.caseId), citedIds(c.caseId));
step('AUDIT', [
  `audit id:        ${audit.header.auditId}`,
  `events:          ${audit.integrity.eventCount}`,
  `source ids:      ${audit.integrity.sourceIds.length}`,
  `authority ids:   ${audit.integrity.authorityIds.length}`,
  `decisions:       ${audit.decisions.length}`,
  `consent:         ${audit.consent.captured} at ${money(audit.consent.agreedAmount)}`,
  `execution:       ${audit.execution.length} sandbox actions`,
  `checksum:        ${audit.integrity.checksum}`
].join('\n'));

// ═══ RATIFY, then CALL 2 ═══════════════════════════════════════════
const before2 = await wf.startCase({ customerId: 'CUS-77302', asOf, forecast });
step('CALL 2 — before ratification', `eligible: ${before2.stack.eligible.map((e) => e.id).join(', ')}`);
wf.resetCase(before2.caseId);

await wf.ratifyGap(gap.id, { ratifiedBy: 'Alex Morgan', authority: 'L2 credit officer', caseId: c.caseId });
const after2 = await wf.startCase({ customerId: 'CUS-77302', asOf, forecast });
step('CALL 2 — after live ratification', [
  `eligible: ${after2.stack.eligible.map((e) => e.id).join(', ')}`,
  `the township program is now offered unprompted — no restart, no reload`
].join('\n'));

await persistKnowledgeGaps([]);
console.log('\nDemo state reset.\n');
