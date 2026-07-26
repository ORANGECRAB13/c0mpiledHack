import { loadDataset } from '../src/graph/dataset.js';
import { resolveBenefitStack, resolveJurisdiction } from '../src/graph/resolve.js';

const dataset = await loadDataset();
const asOf = new Date('2026-07-24T16:00:00Z');
const summer = { highF: 96, lowF: 74, heatIndexF: 101 };

const money = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString()}`);

function report(label, stack) {
  console.log(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}`);
  const j = stack.jurisdiction;
  console.log(`State            ${j.state.name} (${j.state.regulatorAbbr})`);
  console.log(`Rule             ${j.pucRule.sourceId} — ${j.pucRule.citation}`);
  console.log(`Protected        ${j.protectedFromDisconnection ? 'YES' : 'no'}`);
  for (const m of j.moratoria) console.log(`  [${m.active ? 'x' : ' '}] ${m.label} — ${m.reason}`);

  console.log(`\nHousehold        size ${stack.household.size}, income ${money(stack.household.annualIncome)}` +
    (stack.household.changedOnCall ? '  (revised on call)' : ''));
  console.log(`Arrears          ${money(stack.account.arrears)}`);

  console.log('\nEligible:');
  if (!stack.eligible.length) console.log('  (none)');
  for (const e of stack.eligible) {
    const extra = e.kind === 'PIPP' ? `capped at ${money(e.cappedMonthlyPayment)}/mo` : money(e.estimatedValue);
    console.log(`  ✓ ${e.kind.padEnd(6)} ${e.name} — ${extra}   [${e.sourceId}]`);
    if (e.tierReason) console.log(`           ${e.tierReason}`);
    if (e.intakeVia) console.log(`           intake: ${e.intakeVia.name}`);
  }

  console.log('\nNot eligible:');
  if (!stack.ineligible.length) console.log('  (none)');
  for (const e of stack.ineligible) console.log(`  ✗ ${e.kind.padEnd(6)} ${e.name} — failed ${e.failedOn.join(', ')}`);

  const t = stack.totals;
  console.log('\nPackage:');
  console.log(`  grant applied now      ${money(t.grantApplied)}`);
  console.log(`  forgiveness available  ${money(t.forgivenessAvailable)}`);
  console.log(`  benefits unlocked      ${money(t.benefitsUnlocked)}`);
  console.log(`  residual arrears       ${money(t.residualArrears)}`);
  console.log(`  monthly payment        ${money(t.monthlyPayment)}  (${t.monthlyBasis})`);
  console.log(`  authority floor        ${money(stack.boundaries.authorityFloor)}  [${stack.boundaries.authoritySourceId}]`);
  console.log(`  affordability ceiling  ${money(stack.boundaries.affordabilityCeiling)}`);
}

// 1. Von, Illinois — what the CRM believed before the call.
report(
  'CALL 1 — Von Viray (IL) — pre-call, CRM-declared household',
  resolveBenefitStack(dataset, { customerId: 'CUS-77241', asOf, forecast: summer })
);

// 2. Same customer after she discloses the real household on the call.
report(
  'CALL 1 — Von Viray (IL) — after disclosure: household of 5, income $34k',
  resolveBenefitStack(dataset, {
    customerId: 'CUS-77241',
    householdSize: 5,
    annualIncome: 34000,
    disclosures: ['daughter and two grandchildren moved in', 'hours cut at the clinic'],
    asOf,
    forecast: summer
  })
);

// 3. Texas contrast — same situation, materially thinner package.
report(
  'CONTRAST — Dana Whitfield (TX) — no AMP, no PIPP in this state',
  resolveBenefitStack(dataset, { customerId: 'CUS-64118', asOf, forecast: { highF: 104, lowF: 81, heatIndexF: 106 } })
);

// 4. Winter check — the same Illinois customer is protected in January but not July.
const winter = resolveJurisdiction(dataset, {
  customerId: 'CUS-77241',
  asOf: new Date('2026-01-15T16:00:00Z'),
  forecast: { highF: 21, lowF: 8 }
});
console.log(`\n${'='.repeat(70)}\nDATE SENSITIVITY — same customer, 15 January 2026\n${'='.repeat(70)}`);
console.log(`Protected        ${winter.protectedFromDisconnection ? 'YES' : 'no'}`);
for (const m of winter.moratoria) console.log(`  [${m.active ? 'x' : ' '}] ${m.label} — ${m.reason}`);
console.log();
