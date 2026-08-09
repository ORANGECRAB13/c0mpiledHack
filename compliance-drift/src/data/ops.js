// Operational Decision Layer data — Victorian energy retail operations.
// Queue → Case → Evidence → Decision → Approval → Audit.

export const WORKLOAD = [
  { n: 31, label: 'records requiring reconciliation', wf: 'Data Quality & Reconciliation' },
  { n: 15, label: 'hardship and best-offer reviews', wf: 'Hardship & Best Offer' },
  { n: 22, label: 'accounts due for hardship reassessment', wf: 'Continuous Monitoring' },
];

export const QUEUE = [
  { id: 'C-10482', state: 'VIC', customer: 'Amelia Hart', workflow: 'Hardship & Best Offer', priority: 'High', status: 'Ready for review', action: 'Confirm hardship eligibility and best offer', policy: 'Payment Difficulty & Best Offer Standard v4.2', team: 'Customer Support', hot: true },
  { id: 'C-10496', state: 'VIC', customer: 'Daniel Okonkwo', workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Evidence assembling', action: 'Reconcile CRM, billing and pricing records', policy: 'Customer Data Reconciliation Standard v3.0', team: 'Data Operations' },
  { id: 'C-10471', state: 'NSW', customer: 'Priya Raman', workflow: 'Hardship & Best Offer', priority: 'High', status: 'Ready for review', action: 'Review silent hardship signals and contact', policy: 'Payment Difficulty & Best Offer Standard v4.2', team: 'Customer Support' },
  { id: 'C-10455', state: 'NSW', customer: 'Marcus Webb', workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Exception found', action: 'Reconcile meter, billing and account history', policy: 'Customer Data Reconciliation Standard v3.0', team: 'Data Operations' },
  { id: 'C-10502', state: 'VIC', customer: 'Unknown occupant — 14 Merri Pde', workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Investigation open', action: 'Resolve identity and service-address mismatch', policy: 'Customer Data Reconciliation Standard v3.0', team: 'Data Operations' },
  { id: 'C-10444', state: 'VIC', customer: 'Sofia Nguyen', workflow: 'Hardship & Best Offer', priority: 'Low', status: 'Monitoring', action: 'Reassess hardship status and current plan', policy: 'Payment Difficulty & Best Offer Standard v4.2', team: 'Customer Support' },
  { id: 'C-10510', state: 'QLD', customer: 'Northbrook Cafe Pty Ltd', workflow: 'Data Quality & Reconciliation', priority: 'Medium', status: 'Data issue', action: 'Resolve legal-name and ABN mismatch', policy: 'Customer Data Reconciliation Standard v3.0', team: 'Data Operations' },
  { id: 'C-10437', state: 'VIC', customer: 'Grace Muller', workflow: 'Hardship & Best Offer', priority: 'Low', status: 'Ready for review', action: 'Confirm eligibility and required plan switch', policy: 'Payment Difficulty & Best Offer Standard v4.2', team: 'Customer Support' },
  { id: 'C-10489', state: 'SA', customer: 'Tom Castellano', workflow: 'Data Quality & Reconciliation', priority: 'High', status: 'Exception found', action: 'Reconcile unbilled usage before customer action', policy: 'Customer Data Reconciliation Standard v3.0', team: 'Data Operations' },
  { id: 'C-10521', state: 'NSW', customer: 'Leila Haddad', workflow: 'Hardship & Best Offer', priority: 'Medium', status: 'Evidence assembling', action: 'Resolve fragmented eligibility inputs', policy: 'Payment Difficulty & Best Offer Standard v4.2', team: 'Customer Support' },
  { id: 'C-10466', state: 'QLD', customer: 'Ravi Patel', workflow: 'Data Quality & Reconciliation', priority: 'Low', status: 'Data issue', action: 'Reconcile concession and identity records', policy: 'Customer Data Reconciliation Standard v3.0', team: 'Data Operations' },
  { id: 'C-10515', state: 'VIC', customer: 'Jia Chen', workflow: 'Hardship & Best Offer', priority: 'Medium', status: 'Ready for review', action: 'Verify opt-out status and execute switch', policy: 'Payment Difficulty & Best Offer Standard v4.2', team: 'Customer Support' },
];

const AMELIA_CASE = {
  id: 'C-10482',
  customer: 'Amelia Hart',
  meta: 'AU-48291 · VIC Residential · 4.2 yr tenure',
  workflow: 'Hardship & Best Offer',
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
    ['Policy Library', 'Energy Retail Code of Practice v7 (1 Oct 2026) · Payment Difficulty Framework v4.2 · cl 76–79', true],
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
    'Arrears of $312 are under the VIC $1,000 disconnection floor — disconnection cannot be initiated.',
    'If arrears reach $1,000 with 3 months behind, the best-offer switch becomes mandatory regardless of assistance status.',
    'No active payment arrangement.',
    'Sensitive customer marker detected.',
  ],
  rules: [
    ['Minimum disconnection amount', 'Blocked', 'ok', '$312 arrears sit well below the $1,000 disconnection floor in the VIC Energy Retail Code of Practice v7 (effective 1 Oct 2026, up from $300).'],
    ['Automatic best-offer switch', 'Applies', 'req', 'From 1 Oct 2026 a customer on tailored assistance must be moved to the retailer’s best offer automatically — the $1,000 / 3-month arrears trigger is not yet met, but starting assistance engages the duty.'],
    ['Payment-difficulty protection', 'Engaged', 'ok', 'Failed and partial payments plus reduced work hours trigger an assistance assessment.'],
    ['Sensitive-customer protection', 'Engaged', 'ok', 'The account marker prevents disconnection being used as a debt-recovery step.'],
    ['Human determination', 'Required', 'req', 'Customer contact and an accountable officer are required before final action.'],
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
    'Block any disconnection referral',
    'Open the payment-difficulty support workflow',
    'Initiate the best-offer review',
    'Prepare a $45/week arrangement for discussion',
    'Schedule the 90-day review',
    'Freeze evidence, rules, uncertainty and officer in the audit record',
  ],
  profile: {
    trendAnalysis: [
      ['Debt began in July', 'Twelve months of on-time payments until 4 July, when the direct debit was cancelled. Arrears have accrued in every cycle since.'],
      ['$312 over 45 days, still rising', 'Balance grew $104 in the last cycle. At the current rate it passes the $1,000 VIC disconnection floor in early March.'],
      ['Affordability, not avoidance', 'Average payment held at $123.83 across the year. The $124 hardship offer sits inside what this customer has consistently paid.'],
    ],
    trend: {
      months: ['O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S'],
      values: [4, 4, 4, 4, 4, 4, 4, 4, 4, 64, 208, 312],
      threshold: 1000,
      thresholdLabel: '$1,000 threshold',
      caption: 'Arrears balance, 12 months',
    },
    decision: {
      effective: 'Effective 1 October',
      current: {
        label: 'Current plan', name: 'Standard Flexi', price: '$142', per: '/mo',
        rows: [['Usage rate', '28.4c/kWh'], ['Daily supply', '$1.12'], ['Discount', 'None'], ['Exit fee', '$0']],
      },
      best: {
        label: 'Best available', name: 'Hardship Saver', price: '$124', per: '/mo', delta: '−$18/mo', recommended: true,
        rows: [['Usage rate', '24.1c/kWh'], ['Daily supply', '$0.98'], ['Discount', 'Hardship 12%'], ['Exit fee', '$0']],
      },
      savings: ['Switching saves ', '$216 a year', ' and clears the $312 arrears over 14 months at the existing payment rate.'],
    },
    evidence: {
      'Billing': { synced: '4 min ago', rows: [['Account balance', '$312.00 in arrears'], ['Age of debt', '45 days'], ['Last payment', '$60.00 · 12 Sep 2026'], ['Payment plan', 'None active'], ['Billing cycle', 'Monthly · issued 1st']] },
      'CRM': { synced: '12 min ago', rows: [['Employment note', 'Reduced work hours · 24 Jun'], ['Sensitive marker', 'Detected — handle per FDV policy'], ['Contact preference', 'SMS · after 5pm'], ['Tenure', '4.2 years']] },
      'Communications': { synced: '1 hr ago', rows: [['Last outbound', 'SMS 14 Jul — no reply'], ['Last inbound', 'Nothing in 60 days'], ['Preferred window', 'After 5pm']] },
      'Payment History': { synced: '4 min ago', rows: [['24-month record', 'Deterioration from May'], ['Average payment', '$123.83'], ['Failed direct debits', '1 — 28 June'], ['Partial payments', '2 in 45 days']] },
    },
  },
};

const WORKFLOW_CASES = {
  'Data Quality & Reconciliation': {
    recommendation: 'Resolve the source conflict before customer action',
    summary: 'Reconcile the inconsistent customer record, confirm the authoritative value and rerun dependent checks before any downstream decision.',
    protections: 1,
    rules: [
      ['Source conflict', 'Found', 'req', 'Customer data differs across connected operational systems.'],
      ['Authoritative source', 'Required', 'req', 'The officer must identify which source controls each disputed field.'],
      ['Downstream impact', 'Blocked', 'ok', 'Customer action stays paused until affected decisions are rerun with corrected data.'],
      ['Human correction', 'Required', 'req', 'An accountable officer must approve the before-and-after record.'],
    ],
    actions: ['Identify the conflicting fields', 'Confirm the authoritative record', 'Correct affected source systems', 'Rerun dependent eligibility checks'],
    effects: ['Freeze before-and-after values', 'Update connected systems', 'Rerun affected decisions', 'Create a reconciliation audit record'],
    outcome: 'Customer data reconciliation approved',
  },
  'Hardship & Best Offer': {
    recommendation: 'Confirm hardship eligibility and required best offer',
    summary: 'Combine payment, debt, plan, pricing and opt-out data; contact silent customers; and approve the correct best-offer action from 1 October.',
    protections: 2,
    rules: [
      ['Payment-difficulty signals', 'Detected', 'ok', 'Payment and contact behaviour indicate possible hardship, including customers who have not self-identified.'],
      ['Eligibility inputs', 'Assembled', 'ok', 'Hardship status, debt age, balance, current plan, pricing and opt-out status are brought together across systems.'],
      ['Best-offer duty from 1 October', 'Applies', 'ok', 'An eligible hardship customer must be assessed against the best available plan using current pricing.'],
      ['Opt-out and consent', 'Verify', 'req', 'The latest opt-out or consent state must be confirmed before executing the switch.'],
      ['Human determination', 'Required', 'req', 'An accountable officer must approve eligibility and the switch with the trigger recorded.'],
    ],
    actions: ['Contact the customer about payment difficulty', 'Confirm hardship eligibility', 'Validate the best available plan', 'Verify opt-out or consent and prepare the switch'],
    effects: ['Record the hardship trigger', 'Freeze the eligibility input snapshot', 'Document the plan comparison', 'Execute the approved switch and create an audit record'],
    outcome: 'Hardship eligibility and best-offer action approved',
  },
};

const CASE_PROFILES = {
  'C-10496': { balance: '$86.40 credit', plan: 'Home Saver', behaviour: '12 months interval data', contact: 'Email · weekdays', detail: 'Potential saving $14/month', missing: ['Explicit consent not recorded', 'Preferred switch date not confirmed'] },
  'C-10471': { balance: '$684.20 arrears', plan: 'Everyday Energy', behaviour: '3 missed payments · 62 days', contact: 'Phone · mornings', detail: 'Billing complaint remains open', missing: ['Complaint outcome pending', 'Household expenses not confirmed'] },
  'C-10455': { balance: '$1,146.80 unbilled', plan: 'Residential Flex', behaviour: '14-month meter exception', contact: 'Email', detail: 'Meter configuration error suspected', missing: ['Actual-read sequence requires confirmation', 'Correction amount not approved'] },
  'C-10502': { balance: '$428.10 deemed usage', plan: 'Deemed supply', behaviour: 'Consumption since 18 June', contact: 'Premises letter', detail: 'Occupant identity unknown', missing: ['Occupant identity', 'Confirmed move-in date', 'Direct contact not established'] },
  'C-10444': { balance: '$0.00', plan: 'Assisted Essentials', behaviour: 'Plan maintained · 9 months', contact: 'SMS', detail: 'Support exit review due', missing: ['Customer view on program exit', '60-day check-in preference'] },
  'C-10510': { balance: '$238.70 current', plan: 'SME Flex', behaviour: 'New account · validation paused', contact: 'Business email', detail: 'ABN and legal name mismatch', missing: ['Authoritative ABN extract', 'Authorised contact confirmation'] },
  'C-10437': { balance: '$42.10 credit', plan: 'Standard Flexi', behaviour: 'Stable · 12 months', contact: 'Phone · afternoons', detail: 'Potential saving $11/month', missing: ['Verbal consent not captured'] },
  'C-10489': { balance: '$2,408.55 unbilled', plan: 'Home Time-of-Use', behaviour: '11-month billing gap', contact: 'Phone', detail: 'Estimated-read substitution found', missing: ['Customer-fault assessment', 'Final recovery calculation'] },
  'C-10521': { balance: '$527.30 arrears', plan: 'Basic Home', behaviour: '2 missed payments · 38 days', contact: 'Arabic interpreter requested', detail: 'CRM synchronisation incomplete', missing: ['Latest CRM notes unavailable', 'Interpreter booking not confirmed'] },
  'C-10466': { balance: '$119.80 current', plan: 'Residential Saver', behaviour: 'New concession request', contact: 'Email', detail: 'Card number does not validate', missing: ['Current concession-card evidence', 'Consent to recheck eligibility'] },
  'C-10515': { balance: '$73.20 current', plan: 'Evening Plus', behaviour: 'Stable · 12 months', contact: 'App notification', detail: 'Potential saving $9/month', missing: ['In-app consent pending', 'Effective date not selected'] },
};

const HARDSHIP_INPUTS = {
  'C-10482': { debtAge: '45 days', offer: 'Assisted Essentials', saving: '$18/month', optOut: 'No opt-out recorded', contact: 'Silent - last SMS unanswered' },
  'C-10471': { debtAge: '62 days', offer: 'Essential Saver', saving: '$21/month', optOut: 'No opt-out recorded', contact: 'Silent - outbound contact required' },
  'C-10444': { debtAge: '0 days', offer: 'Assisted Essentials', saving: 'Current plan remains best', optOut: 'No opt-out recorded', contact: 'Check-in completed 22 July' },
  'C-10437': { debtAge: '0 days', offer: 'Essential Saver', saving: '$11/month', optOut: 'No opt-out recorded', contact: 'Consent outstanding' },
  'C-10521': { debtAge: '38 days', offer: 'Home Support', saving: '$16/month', optOut: 'Unknown - CRM sync incomplete', contact: 'Interpreter-assisted contact required' },
  'C-10515': { debtAge: '0 days', offer: 'Everyday Saver', saving: '$9/month', optOut: 'Pending verification', contact: 'In-app response pending' },
};

const RECONCILIATION_INPUTS = {
  'C-10496': [['CRM', 'Plan preference differs from billing', 'Customer master'], ['Billing', 'Home Saver active', 'Billing ledger'], ['Pricing', '$14/month lower offer identified', 'Pricing engine'], ['Communications', 'Switch consent not recorded', 'Consent register']],
  'C-10455': [['Metering', 'Read sequence contains substitution', 'Meter data platform'], ['Billing', '14-month exception', 'Billing ledger'], ['CRM', 'No customer-fault indication', 'Customer master'], ['Account', 'Configuration requires correction', 'Product catalogue']],
  'C-10502': [['Identity', 'Occupant is unknown', 'Verified identity record'], ['Service address', '14 Merri Pde', 'Market address register'], ['Billing', '$428.10 deemed usage', 'Billing ledger'], ['Communications', 'Direct contact not established', 'Contact history']],
  'C-10510': [['CRM', 'Trading name recorded', 'Customer master'], ['Identity', 'Legal name differs', 'ABN register'], ['Billing', 'Activation paused', 'Billing ledger'], ['Communications', 'Authorised contact unconfirmed', 'Contact history']],
  'C-10489': [['Metering', 'Estimated-read substitution', 'Meter data platform'], ['Billing', '11-month gap', 'Billing ledger'], ['CRM', 'Customer-fault assessment missing', 'Customer master'], ['Pricing', 'Recovery amount not final', 'Billing calculation engine']],
  'C-10466': [['CRM', 'Concession requested', 'Customer master'], ['Identity', 'Card number does not validate', 'Eligibility service'], ['Billing', 'Benefit not applied', 'Billing ledger'], ['Communications', 'Recheck consent required', 'Consent register']],
};

function hardshipDecisionInputs(item, profile) {
  const input = HARDSHIP_INPUTS[item.id];
  return [
    ['Hardship status', item.status === 'Monitoring' ? 'Existing arrangement' : 'Assessment required', 'Hardship register', 'Review'],
    ['Debt exposure', `${profile.balance} · ${input.debtAge}`, 'Billing ledger', 'Verified'],
    ['Opt-out status', input.optOut, 'Consent register', input.optOut.startsWith('No ') ? 'Verified' : 'Confirm'],
    ['Customer engagement', input.contact, 'Communications', input.contact.startsWith('Silent') ? 'Attention' : 'Review'],
    ['Current plan', profile.plan, 'Product catalogue', 'Verified'],
    ['Best available plan', `${input.offer} - ${input.saving}`, 'Pricing engine', 'Verified'],
  ];
}

function reconciliationDecisionInputs(item) {
  return RECONCILIATION_INPUTS[item.id].map(([system, value, authority]) => [system, value, authority, 'Conflict']);
}

function buildCase(item, index) {
  const template = WORKFLOW_CASES[item.workflow];
  const profile = CASE_PROFILES[item.id];
  const evidence = 6 + (index % 3);
  const version = item.policy.match(/v\d+(?:\.\d+)?/i)?.[0] || 'current';
  const isHardship = item.workflow === 'Hardship & Best Offer';
  const hardship = HARDSHIP_INPUTS[item.id];
  const decisionInputs = isHardship ? hardshipDecisionInputs(item, profile) : reconciliationDecisionInputs(item);
  return {
    ...item,
    meta: `${item.id.replace('C-', 'AU-')} · ${item.state} · ${item.team}`,
    stateLabel: `${item.state} ${item.customer.includes('Pty Ltd') ? 'small business' : 'residential'}`,
    recommendation: template.recommendation,
    recommendationSummary: template.summary,
    evidenceCompletion: `${82 + (index * 3) % 17}%`,
    confidence: `${86 + (index * 2) % 13}%`,
    protections: template.protections,
    policyVersion: version,
    snapshot: [
      ['Balance', profile.balance, item.priority === 'High' ? 'hot' : ''],
      ['Current plan', profile.plan],
      ['Account activity', profile.behaviour],
      ['Contact preference', profile.contact],
      ['Case signal', profile.detail, item.status === 'Exception found' || item.status === 'Data issue' ? 'hot' : ''],
      ['Owning team', item.team],
    ],
    rules: template.rules,
    decisionInputs,
    sources: [
      ...(isHardship
        ? [['Hardship register', 'Current status and assistance history', true], ['Pricing engine', hardship.saving, true], ['Consent register', hardship.optOut, true]]
        : [['Customer master', 'Identity and account attributes', true], ['Authoritative register', 'Source-of-truth verification', true], ['Operational system', profile.detail, true]]),
      ['Billing ledger', profile.balance, true],
      ['CRM and contact history', profile.contact, true],
      ['Policy library', item.policy, true],
      ['Previous decisions', 'Relevant account review history', true],
      ...(evidence > 6 ? [['Workflow records', `${item.workflow} activity`, true]] : []),
      ...(evidence > 7 ? [['External verification', 'Authoritative validation result', true]] : []),
    ],
    missing: profile.missing,
    actions: template.actions.map((action) => [action, true]),
    approvalEffects: [...template.effects, 'Freeze evidence, rules, uncertainty and officer in the audit record'],
    outcome: template.outcome,
    switchTrace: isHardship ? {
      trigger: `${item.action} - best-offer duty effective 1 October`,
      from: profile.plan,
      to: hardship.offer,
      saving: hardship.saving,
      optOut: hardship.optOut,
      effective: 'On approval under the 1 October best-offer workflow',
    } : null,
    sourceQuery: `For ${item.customer} in case ${item.id}, what policy obligations apply to this ${item.workflow.toLowerCase()} and what must the officer verify before deciding?`,
  };
}

export const CASES = Object.fromEntries(QUEUE.map((item, index) => [
  item.id,
  item.id === AMELIA_CASE.id
    ? {
        ...AMELIA_CASE,
        ...item,
        stateLabel: 'VIC residential',
        recommendation: 'Protect the account and move to the best available offer',
        recommendationSummary: 'Confirm Amelia’s hardship eligibility, block adverse action and approve the $18/month lower offer using the 1 October workflow.',
        evidenceCompletion: '94%',
        confidence: '96%',
        protections: 3,
        policyVersion: 'v4.2',
        outcome: 'Disconnection blocked · support review approved',
        decisionInputs: hardshipDecisionInputs(item, { balance: '$312.00 arrears', plan: 'Standard Flexi' }),
        switchTrace: { trigger: 'Silent hardship signals: two partial payments, failed direct debit and reduced work hours - best-offer duty effective 1 October', from: 'Standard Flexi', to: 'Assisted Essentials', saving: '$18/month', optOut: 'No opt-out recorded', effective: 'On officer approval under the 1 October workflow' },
        outcome: 'Hardship protection and best-offer switch approved',
        sourceQuery: 'For Amelia Hart, confirm hardship eligibility, the best available offer, opt-out status, and why a switch is required from 1 October.',
      }
    : buildCase(item, index),
]));

export const MONITORING = [
  { customer: 'Sofia Nguyen', id: 'AU-51120', caseId: 'C-10444', trend: [8, 7, 7, 6, 5, 4, 3, 2, 1, 0], pay: 'Consistent · 9 months', debt: '$0 — cleared', last: 'Check-in call 22 Jul', status: 'Stable', next: '14 Aug 2026', confidence: 92, trigger: 'Balance cleared and arrangement maintained for nine months', rec: 'Review whether tailored assistance remains appropriate.', nextAction: 'Contact Sofia before changing support', evidence: ['9 successful monthly payments', 'Balance reduced to zero', 'No failed payments since November', 'Last check-in completed 22 July'] },
  { customer: 'Liam Forsyth', id: 'AU-49673', trend: [5, 5, 6, 6, 5, 6, 7, 7, 8, 8], pay: 'Deteriorating · 2 missed', debt: '$486 — rising', last: 'SMS unanswered 29 Jul', status: 'At risk', next: '8 Aug 2026', confidence: 95, trigger: 'Two consecutive arrangement instalments missed', rec: 'Start an early hardship reassessment before the arrangement defaults.', nextAction: 'Attempt contact and reassess capacity to pay', evidence: ['Two consecutive missed instalments', 'Debt increased across three cycles', 'SMS unanswered on 29 July', 'Existing arrangement remains active'], hot: true },
  { customer: 'Rosa Silva', id: 'AU-52034', trend: [6, 6, 5, 5, 5, 4, 4, 4, 3, 3], pay: 'On plan · $45/week', debt: '$188 — reducing', last: 'Plan payment 1 Aug', status: 'On track', next: '30 Sep 2026', confidence: 96, trigger: 'Arrangement performing within agreed tolerance', rec: 'Keep current support in place; no intervention is required.', nextAction: 'Continue monitoring until the scheduled review', evidence: ['All recent instalments received', 'Debt continues to reduce', 'No new vulnerability signal', 'Review already scheduled for 30 September'] },
  { customer: 'Ken Watanabe', id: 'AU-50711', trend: [4, 4, 4, 5, 4, 4, 5, 5, 5, 5], pay: 'Stable · concession applied', debt: '$220 — flat', last: 'Bill issued 28 Jul', status: 'Watch', next: '21 Aug 2026', confidence: 84, trigger: 'Debt has remained flat for three billing cycles', rec: 'Review tariff suitability at the next customer contact.', nextAction: 'Run a best-offer comparison before 21 August', evidence: ['Concession remains active', 'Debt unchanged for three cycles', 'Payments cover current usage only', 'No tariff review in the last 12 months'] },
];

export const AUDITS = [
  { id: 'DEC-2026-08841', case: 'C-10390 · Harvey Lin', workflow: 'Hardship & Best Offer', outcome: 'Hardship protection and best-offer action approved', trigger: 'Silent payment-difficulty signals identified', officer: 'P. Nair', ts: '2026-08-03 14:22', policy: 'v4.2', evidence: 9, rules: 5 },
  { id: 'DEC-2026-08836', case: 'C-10371 · Mia Torres', workflow: 'Hardship & Best Offer', outcome: 'Best-offer switch approved', trigger: 'Eligible hardship customer assessed under the 1 October workflow', officer: 'D. Whitfield', ts: '2026-08-03 11:05', policy: 'v4.2', evidence: 7, rules: 5 },
  { id: 'DEC-2026-08829', case: 'C-10355 · Owen Blake', workflow: 'Data Quality & Reconciliation', outcome: 'Customer data reconciliation approved', trigger: 'Billing and meter records conflicted', officer: 'P. Nair', ts: '2026-08-02 16:48', policy: 'v3.0', evidence: 7, rules: 4 },
  { id: 'DEC-2026-08815', case: 'C-10344 · Hana Yusuf', workflow: 'Hardship & Best Offer', outcome: 'Human reassessment opened', trigger: 'Arrangement performance deteriorated', officer: 'T. Marchetti', ts: '2026-08-01 09:31', policy: 'v4.2', evidence: 8, rules: 5 },
  { id: 'DEC-2026-08802', case: 'C-10322 · Northbrook Cafe', workflow: 'Data Quality & Reconciliation', outcome: 'Customer data reconciliation approved', trigger: 'Legal name and account identity differed', officer: 'D. Whitfield', ts: '2026-07-31 15:12', policy: 'v3.0', evidence: 5, rules: 4 },
];

export const POLICIES = [
  {
    name: 'Payment Difficulty Framework', ver: 'v4.2', eff: '1 Jul 2026',
    summary: 'Entitlements and retailer obligations for VIC customers anticipating or in payment difficulty — tailored assistance, minimum disconnection amount, contact requirements.',
    workflows: ['Hardship & Best Offer', 'Continuous Monitoring'],
    change: 'Minimum disconnection amount raised $300 → $500. 14 open cases re-evaluated; 2 recommendations changed.',
    hot: true,
  },
  {
    name: 'Best Offer Notice', ver: 'v2.1', eff: '1 Apr 2026',
    summary: 'Quarterly best-offer check: identify cheapest available plan for the customer\'s usage and disclose on the bill; switch on request with explicit consent.',
    workflows: ['Hardship & Best Offer', 'Continuous Monitoring'],
    change: 'Comparison window extended to 12 months of interval data.',
  },
  {
    name: 'Billing Accuracy Standard', ver: 'v3.0', eff: '15 May 2026',
    summary: 'Controls for unbilled energy, estimated reads and re-billing; caps back-billing at 9 months absent customer fault.',
    workflows: ['Data Quality & Reconciliation'],
    change: 'Back-billing cap reduced from 12 to 9 months.',
  },
  {
    name: 'Move-in Deemed Supply', ver: 'v1.8', eff: '20 Feb 2026',
    summary: 'Handling unknown occupants consuming energy without an account — contact sequence, deemed contract terms, disconnection safeguards.',
    workflows: ['Data Quality & Reconciliation'],
    change: 'No changes this quarter.',
  },
  {
    name: 'Concession Verification', ver: 'v3.1', eff: '1 Jul 2026',
    summary: 'Centrelink card verification flow, retrospective application windows and annual revalidation.',
    workflows: ['Data Quality & Reconciliation', 'Hardship & Best Offer'],
    change: 'Annual revalidation moved to rolling anniversary date.',
  },
];

export const ANALYTICS = {
  kpis: [
    ['Data conflicts open', '6', 'across CRM, billing and identity', 'warn'],
    ['Reconciliations completed', '28', 'this week', 'good'],
    ['Silent customers identified', '12', 'before proactive contact', 'good'],
    ['Best-offer switches approved', '9', '$14 average monthly saving', 'good'],
    ['Hardship reviews due', '2', 'one account currently at risk', 'warn'],
    ['Support plans reassessed', '64', 'this month', 'good'],
  ],
  workload: [12, 11, 10, 9, 8, 7, 6],
  detection: [3, 4, 5, 7, 8, 10, 12],
};
