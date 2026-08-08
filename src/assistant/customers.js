// Synthetic CRM records for every customer in the compliance-drift operational
// queue, so the assistant can answer questions about them. Details are kept
// consistent with the queue rows in compliance-drift/src/data/ops.js and the
// facts used across the demo (Amelia's $312 arrears and sensitive marker,
// Daniel's $14/month best-offer saving, and so on). All synthetic — no real
// person or account is represented.

export const CUSTOMERS = [
  {
    id: 'C-10482', account: 'AU-48291', name: 'Amelia Hart', state: 'VIC', segment: 'VIC Residential · 4.2 yr tenure',
    workflow: 'Hardship & Best Offer', priority: 'High', status: 'Ready for review', action: 'Confirm hardship eligibility and best offer',
    facts: [
      'Arrears $312.00; current plan Standard Flexi; no active payment arrangement.',
      'Two partial payments in 45 days ($55 on 2 Jun, $40 of $96 due on 12 Jul); direct debit failed 28 Jun (insufficient funds).',
      'CRM note 24 Jun records reduced work hours; financial stress indicators on 2 notes.',
      'Sensitive customer marker detected — handle per the Family and Domestic Violence Policy; contact preference SMS after 5pm.',
      'No concession recorded; current tariff is not the cheapest — an $18/month saving is available; no prior hardship review.'
    ]
  },
  {
    id: 'C-10496', account: 'AU-50144', name: 'Daniel Okonkwo', state: 'VIC', segment: 'VIC Residential · 2.8 yr tenure',
    workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Evidence assembling', action: 'Reconcile CRM, billing and pricing records',
    facts: [
      'Requested the best offer; tariff comparison complete using his most recent 12 months of interval data.',
      'Comparison identifies a $14/month saving on the cheapest generally available plan.',
      'Explicit informed consent not yet recorded — the only outstanding item before the switch.',
      'Account in good standing; no arrears, no hardship indicators.'
    ]
  },
  {
    id: 'C-10471', account: 'AU-47820', name: 'Priya Raman', state: 'NSW', segment: 'NSW Residential · 6.1 yr tenure',
    workflow: 'Hardship & Best Offer', priority: 'High', status: 'Ready for review', action: 'Review silent hardship signals and contact',
    facts: [
      'Arrears $547; one missed and one partial payment this quarter.',
      'An unresolved complaint about a disputed estimated read is open with the retailer — case flag: disconnection referral is BLOCKED while a complaint directly related to the arrears remains unresolved.',
      'Two contact attempts made on her preferred channel (phone) — both unanswered; determination is held pending contact.',
      'No sensitive marker; concession card on file, verified.'
    ]
  },
  {
    id: 'C-10455', account: 'AU-49327', name: 'Marcus Webb', state: 'NSW', segment: 'NSW Residential · 1.4 yr tenure',
    workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Exception found', action: 'Reconcile meter, billing and account history',
    facts: [
      'Meter read history shows a substitution gap: four consecutive estimated reads Nov–Feb.',
      'Estimates did not use his historical consumption and were not clearly identified on two bills.',
      'Potential undercharge of ~$210 across the estimated period; error identified 22 Jul 2026.',
      'Account otherwise current; pays on time by direct debit.'
    ]
  },
  {
    id: 'C-10502', account: 'AU-51988', name: 'Unknown occupant — 14 Merri Pde', state: 'VIC', segment: 'VIC · Deemed supply',
    workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Investigation open', action: 'Resolve identity and service-address mismatch',
    facts: [
      'Premises consuming energy since 3 Jun 2026 with no account holder on record — move-in deemed supply arrangement applies.',
      'Two occupancy letters issued (17 Jun, 15 Jul); no response.',
      'Consumption pattern is residential; no life support flag on the premises.',
      'No disconnection action may proceed until the occupant investigation and deemed-supply notice obligations are complete.'
    ]
  },
  {
    id: 'C-10444', account: 'AU-51120', name: 'Sofia Nguyen', state: 'VIC', segment: 'VIC Residential · 3.5 yr tenure',
    workflow: 'Hardship & Best Offer', priority: 'Low', status: 'Monitoring', action: 'Reassess hardship status and current plan',
    facts: [
      'In the hardship program 9 months; consistent payments for all nine; debt reduced from $640 to $0 — cleared.',
      'Last contact: check-in call 22 Jul; next review 14 Aug 2026.',
      'Recommendation on file: review whether hardship support remains appropriate; human review required before exit.',
      'Concession applied; on the cheapest suitable tariff since March.'
    ]
  },
  {
    id: 'C-10510', account: 'AU-52470', name: 'Northbrook Cafe Pty Ltd', state: 'QLD', segment: 'QLD SME · new connection',
    workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Data issue', action: 'Resolve legal-name and ABN mismatch',
    facts: [
      'New SME connection; ABN supplied at signup does not match the ASIC record for the trading name.',
      'A prior case (C-10322) for the same site was corrected on 31 Jul 2026 — account details amended.',
      'Small business customer: NERL small-customer protections apply; no arrears yet, first bill pending.',
      'Onboarding is held until identity and ABN are reconciled.'
    ]
  },
  {
    id: 'C-10437', account: 'AU-49954', name: 'Grace Muller', state: 'VIC', segment: 'VIC Residential · 8.2 yr tenure',
    workflow: 'Hardship & Best Offer', priority: 'Low', status: 'Ready for review', action: 'Confirm eligibility and required plan switch',
    facts: [
      'Best offer comparison complete on 12 months of interval data; $11/month saving identified.',
      'Verbal consent has not yet been captured; the switch remains subject to human approval and a valid consent record.',
      'Long-tenure customer on a legacy tariff; no arrears; no hardship indicators.'
    ]
  },
  {
    id: 'C-10489', account: 'AU-50633', name: 'Tom Castellano', state: 'SA', segment: 'SA Residential · 2.1 yr tenure',
    workflow: 'Data Quality & Reconciliation', priority: 'High', status: 'Exception found', action: 'Reconcile unbilled usage before customer action',
    facts: [
      'Unbilled period of 11 months discovered after a meter data feed fault; error identified 29 Jul 2026.',
      'Undercharge not the customer\'s fault — recovery is limited to the 9 months preceding identification, and the excess must be written off.',
      'Recovered amount must be offered as an interest-free instalment plan matching the undercharge period.',
      'Customer not yet notified; communication draft pending review.'
    ]
  },
  {
    id: 'C-10521', account: 'AU-52101', name: 'Leila Haddad', state: 'NSW', segment: 'NSW Residential · 0.9 yr tenure',
    workflow: 'Hardship & Best Offer', priority: 'Medium', status: 'Evidence assembling', action: 'Resolve fragmented eligibility inputs',
    facts: [
      'Arrears $268; first missed payment 8 Jul, second partial 24 Jul.',
      'Self-identified payment difficulty by phone 26 Jul — assessment for tailored assistance in progress.',
      'CRM sync incomplete: employment and household details not yet on the case; evidence bundle at 62%.',
      'While being assessed and in contact, she must not be disconnected.'
    ]
  },
  {
    id: 'C-10466', account: 'AU-50288', name: 'Ravi Patel', state: 'QLD', segment: 'QLD Residential · new connection',
    workflow: 'Data Quality & Reconciliation', priority: 'Low', status: 'Data issue', action: 'Reconcile concession and identity records',
    facts: [
      'New connection 14 Jul 2026; pensioner concession card number supplied fails checksum validation.',
      'Concession cannot be applied to bills until the card is verified with Services Australia.',
      'Customer advised 21 Jul; awaiting corrected card details; no arrears.'
    ]
  },
  {
    id: 'C-10515', account: 'AU-52310', name: 'Jia Chen', state: 'VIC', segment: 'VIC Residential · 5.6 yr tenure',
    workflow: 'Hardship & Best Offer', priority: 'Medium', status: 'Ready for review', action: 'Verify opt-out status and execute switch',
    facts: [
      'Best offer comparison complete; $9/month saving identified using 12 months of interval data.',
      'Consent requested by email 28 Jul — not yet returned; switch cannot proceed without explicit informed consent.',
      'No arrears; solar feed-in customer, comparison included feed-in tariff value.'
    ]
  }
];

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function customersForQuery(query) {
  const text = normalise(query);
  if (!text) return [];
  return CUSTOMERS.filter((customer) => {
    const identifiers = [customer.id, customer.account, customer.name];
    if (identifiers.some((value) => text.includes(normalise(value)))) return true;
    const nameTokens = normalise(customer.name).split(' ').filter((token) => token.length >= 4);
    return nameTokens.some((token) => text.includes(token));
  });
}

/** Render only customer records explicitly identified in the officer's query. */
export function customersPrompt(query) {
  const selected = customersForQuery(query);
  if (!selected.length) return 'No customer record was requested for this policy question.';
  return selected.map((c) =>
    `### ${c.name} (case ${c.id} · account ${c.account})\n` +
    `Location: ${c.state} · ${c.segment} · ${c.workflow} · ${c.priority} priority · ${c.status} · next action: ${c.action}\n` +
    c.facts.map((f) => `- ${f}`).join('\n')
  ).join('\n\n');
}
