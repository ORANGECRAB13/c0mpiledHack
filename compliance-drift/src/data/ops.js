// Operational Decision Layer data — Victorian energy retail operations.
// Queue → Case → Evidence → Decision → Approval → Audit.

export const WORKLOAD = [
  { n: 15, label: 'hardship reviews awaiting assessment', wf: 'Payment Difficulty' },
  { n: 22, label: 'accounts overdue for hardship reassessment', wf: 'Reassessment' },
  { n: 31, label: 'onboarding data issues', wf: 'Onboarding Validation' },
  { n: 8, label: 'possible revenue assurance exceptions', wf: 'Revenue Assurance' },
  { n: 12, label: 'unknown consumer investigations', wf: 'Unknown Consumer' },
  { n: 5, label: 'policy updates affecting live workflows', wf: 'Policy' },
];

export const QUEUE = [
  { id: 'C-10482', state: 'VIC', customer: 'Amelia Hart', workflow: 'Payment Difficulty Review', priority: 'High', status: 'Ready for review', action: 'Assess support eligibility', policy: 'Payment Difficulty Framework v4.2', team: 'Hardship', hot: true },
  { id: 'C-10496', state: 'VIC', customer: 'Daniel Okonkwo', workflow: 'Best Offer Review', priority: 'Medium', status: 'Evidence assembling', action: 'Confirm tariff comparison', policy: 'Best Offer Notice v2.1', team: 'Retention' },
  { id: 'C-10471', state: 'NSW', customer: 'Priya Raman', workflow: 'Payment Difficulty Review', priority: 'High', status: 'Ready for review', action: 'Contact before determination', policy: 'Payment Difficulty Framework v4.2', team: 'Hardship' },
  { id: 'C-10455', state: 'NSW', customer: 'Marcus Webb', workflow: 'Revenue Assurance', priority: 'Medium', status: 'Exception found', action: 'Verify meter read history', policy: 'Billing Accuracy Standard v3.0', team: 'Billing Ops' },
  { id: 'C-10502', state: 'VIC', customer: 'Unknown occupant — 14 Merri Pde', workflow: 'Unknown Consumer', priority: 'Medium', status: 'Investigation open', action: 'Confirm occupancy', policy: 'Move-in Deemed Supply v1.8', team: 'Onboarding' },
  { id: 'C-10444', state: 'VIC', customer: 'Sofia Nguyen', workflow: 'Payment Difficulty Review', priority: 'Low', status: 'Monitoring', action: 'Reassess support level', policy: 'Payment Difficulty Framework v4.2', team: 'Hardship' },
  { id: 'C-10510', state: 'QLD', customer: 'Northbrook Cafe Pty Ltd', workflow: 'Onboarding Validation', priority: 'Medium', status: 'Data issue', action: 'Resolve ABN mismatch', policy: 'SME Onboarding Standard v2.4', team: 'Onboarding' },
  { id: 'C-10437', state: 'VIC', customer: 'Grace Muller', workflow: 'Best Offer Review', priority: 'Low', status: 'Ready for review', action: 'Approve plan switch', policy: 'Best Offer Notice v2.1', team: 'Retention' },
  { id: 'C-10489', state: 'SA', customer: 'Tom Castellano', workflow: 'Revenue Assurance', priority: 'High', status: 'Exception found', action: 'Review unbilled period', policy: 'Billing Accuracy Standard v3.0', team: 'Billing Ops' },
  { id: 'C-10521', state: 'NSW', customer: 'Leila Haddad', workflow: 'Payment Difficulty Review', priority: 'Medium', status: 'Evidence assembling', action: 'Await CRM sync', policy: 'Payment Difficulty Framework v4.2', team: 'Hardship' },
  { id: 'C-10466', state: 'QLD', customer: 'Ravi Patel', workflow: 'Onboarding Validation', priority: 'Low', status: 'Data issue', action: 'Confirm concession card', policy: 'Concession Verification v3.1', team: 'Onboarding' },
  { id: 'C-10515', state: 'VIC', customer: 'Jia Chen', workflow: 'Best Offer Review', priority: 'Medium', status: 'Ready for review', action: 'Confirm consent to switch', policy: 'Best Offer Notice v2.1', team: 'Retention' },
];

export const CASE = {
  id: 'C-10482',
  customer: 'Amelia Hart',
  meta: 'AU-48291 · VIC Residential · 4.2 yr tenure',
  workflow: 'Payment Difficulty Review',
  snapshot: [
    ['Balance', '$312.00 arrears', 'hot'],
    ['Current plan', 'Standard Flexi'],
    ['Payment behaviour', '2 partial payments · 45 days'],
    ['Contact preference', 'SMS · after 5pm'],
    ['Concession', 'None recorded'],
    ['Sensitive marker', 'Detected — handle per FDV policy', 'hot'],
  ],
  events: [
    ['12 Jul', 'Partial payment $40 (of $96 due)'],
    ['28 Jun', 'Direct debit failed — insufficient funds'],
    ['24 Jun', 'CRM note: reduced work hours recorded'],
    ['2 Jun', 'Partial payment $55'],
  ],
  sources: [
    ['Billing', '3 invoices · 2 partial payments · arrears $312', true],
    ['CRM', 'Employment reduction note · sensitive marker', true],
    ['Communications', 'Last outbound SMS 14 Jul — no reply', true],
    ['Pricing Engine', 'Current tariff not cheapest — $18/mo saving found', true],
    ['Policy Library', 'Payment Difficulty Framework v4.2 · cl 76–79', true],
    ['Previous Reviews', 'No prior hardship review', true],
    ['Customer Notes', '2 notes · financial stress indicators', true],
    ['Payment History', '24-month history · deterioration from May', true],
    ['Identity Records', 'Verified · no discrepancies', true],
  ],
  context: [
    'Recent payment behaviour changed significantly.',
    'Two partial payments in 45 days.',
    'Failed direct debit on 28 June.',
    'Employment reduction recorded in CRM.',
    'Current tariff no longer cheapest for usage profile.',
    'No active payment arrangement.',
    'Sensitive customer marker detected.',
  ],
  rules: [
    ['Payment behaviour', 'Satisfied', 'ok', 'Multiple payment failures detected within the assessment window.'],
    ['Financial stress', 'Likely', 'warn', 'CRM notes indicate reduced work hours.'],
    ['Concession status', 'Insufficient', 'warn', 'Concession alone is not evidence of hardship.'],
    ['Human review', 'Required', 'req', 'Customer communication required before final determination.'],
  ],
  readiness: [
    ['Decision readiness', 'High'],
    ['Evidence completeness', '94%'],
    ['Human review', 'Required'],
  ],
  missing: [
    'Unknown employment status',
    'Household composition unavailable',
    'No hardship discussion recorded',
    'Recent contact unsuccessful',
  ],
  actions: [
    ['Review for Payment Difficulty Support', true],
    ['Switch to Best Available Offer — saves $18/month', true],
    ['Prepare payment arrangement — $45/week', true],
    ['Schedule follow-up review — 90 days', true],
    ['Prepare SMS draft', false],
    ['Notify Hardship Team', false],
  ],
  approvalEffects: [
    'Update hardship workflow',
    'Initiate best-offer review',
    'Generate customer communication',
    'Schedule review in 90 days',
    'Record evidence bundle',
    'Record approving officer',
  ],
};

export const MONITORING = [
  { customer: 'Sofia Nguyen', id: 'AU-51120', trend: [8, 7, 7, 6, 5, 4, 3, 2, 1, 0], pay: 'Consistent · 9 months', debt: '$0 — cleared', last: 'Check-in call 22 Jul', status: 'Stable', next: '14 Aug 2026', rec: 'Customer has maintained consistent payments for nine months and debt has reduced to zero. Recommend reviewing whether hardship support remains appropriate. Human review required.' },
  { customer: 'Liam Forsyth', id: 'AU-49673', trend: [5, 5, 6, 6, 5, 6, 7, 7, 8, 8], pay: 'Deteriorating · 2 missed', debt: '$486 — rising', last: 'SMS unanswered 29 Jul', status: 'At risk', next: '8 Aug 2026', rec: 'Payment plan instalments missed twice consecutively. Recommend early re-engagement before default listing window.', hot: true },
  { customer: 'Rosa Silva', id: 'AU-52034', trend: [6, 6, 5, 5, 5, 4, 4, 4, 3, 3], pay: 'On plan · $45/week', debt: '$188 — reducing', last: 'Plan payment 1 Aug', status: 'On track', next: '30 Sep 2026', rec: 'Arrangement performing as agreed. No change recommended.' },
  { customer: 'Ken Watanabe', id: 'AU-50711', trend: [4, 4, 4, 5, 4, 4, 5, 5, 5, 5], pay: 'Stable · concession applied', debt: '$220 — flat', last: 'Bill issued 28 Jul', status: 'Watch', next: '21 Aug 2026', rec: 'Debt flat for three cycles despite concession. Recommend tariff review at next contact.' },
];

export const AUDITS = [
  { id: 'DEC-2026-08841', case: 'C-10390 · Harvey Lin', workflow: 'Payment Difficulty Review', outcome: 'Support approved', officer: 'P. Nair', ts: '2026-08-03 14:22', policy: 'PDF v4.2', evidence: 9, rules: 4 },
  { id: 'DEC-2026-08836', case: 'C-10371 · Mia Torres', workflow: 'Best Offer Review', outcome: 'Plan switch approved', officer: 'D. Whitfield', ts: '2026-08-03 11:05', policy: 'BON v2.1', evidence: 6, rules: 3 },
  { id: 'DEC-2026-08829', case: 'C-10355 · Owen Blake', workflow: 'Revenue Assurance', outcome: 'Re-bill issued', officer: 'P. Nair', ts: '2026-08-02 16:48', policy: 'BAS v3.0', evidence: 7, rules: 5 },
  { id: 'DEC-2026-08815', case: 'C-10344 · Hana Yusuf', workflow: 'Payment Difficulty Review', outcome: 'Support declined — referred to plan', officer: 'T. Marchetti', ts: '2026-08-01 09:31', policy: 'PDF v4.2', evidence: 8, rules: 4 },
  { id: 'DEC-2026-08802', case: 'C-10322 · Northbrook Cafe', workflow: 'Onboarding Validation', outcome: 'Account corrected', officer: 'D. Whitfield', ts: '2026-07-31 15:12', policy: 'SME v2.4', evidence: 5, rules: 3 },
];

export const POLICIES = [
  {
    name: 'Payment Difficulty Framework', ver: 'v4.2', eff: '1 Jul 2026',
    summary: 'Entitlements and retailer obligations for VIC customers anticipating or in payment difficulty — tailored assistance, minimum disconnection amount, contact requirements.',
    workflows: ['Payment Difficulty Review', 'Reassessment', 'Monitoring'],
    change: 'Minimum disconnection amount raised $300 → $500. 14 open cases re-evaluated; 2 recommendations changed.',
    hot: true,
  },
  {
    name: 'Best Offer Notice', ver: 'v2.1', eff: '1 Apr 2026',
    summary: 'Quarterly best-offer check: identify cheapest available plan for the customer\'s usage and disclose on the bill; switch on request with explicit consent.',
    workflows: ['Best Offer Review', 'Monitoring'],
    change: 'Comparison window extended to 12 months of interval data.',
  },
  {
    name: 'Billing Accuracy Standard', ver: 'v3.0', eff: '15 May 2026',
    summary: 'Controls for unbilled energy, estimated reads and re-billing; caps back-billing at 9 months absent customer fault.',
    workflows: ['Revenue Assurance'],
    change: 'Back-billing cap reduced from 12 to 9 months.',
  },
  {
    name: 'Move-in Deemed Supply', ver: 'v1.8', eff: '20 Feb 2026',
    summary: 'Handling unknown occupants consuming energy without an account — contact sequence, deemed contract terms, disconnection safeguards.',
    workflows: ['Unknown Consumer'],
    change: 'No changes this quarter.',
  },
  {
    name: 'Concession Verification', ver: 'v3.1', eff: '1 Jul 2026',
    summary: 'Centrelink card verification flow, retrospective application windows and annual revalidation.',
    workflows: ['Onboarding Validation', 'Payment Difficulty Review'],
    change: 'Annual revalidation moved to rolling anniversary date.',
  },
];

export const ANALYTICS = {
  kpis: [
    ['Average investigation time', '6.4 min', 'was 41 min manual', 'good'],
    ['Manual review workload', '37 open', '12% below 4-week avg', 'good'],
    ['Cases awaiting approval', '9', '2 overdue > 48h', 'warn'],
    ['Hardship detection lead time', '11 days', 'before first missed bill', 'good'],
    ['Cases reassessed this month', '64', '22 currently overdue', 'warn'],
    ['Evidence completeness', '91%', 'median across open cases', 'good'],
    ['Decision turnaround', '1.8 days', 'queue entry → approval', 'good'],
    ['Policy changes this month', '2', '14 cases re-evaluated', null],
  ],
  workload: [42, 38, 45, 40, 37, 33, 37],
  detection: [26, 22, 19, 17, 14, 12, 11],
};
