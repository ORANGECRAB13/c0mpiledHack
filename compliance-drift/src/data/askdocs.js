// Document library + scripted answers for the ask-your-documents agent.
// Each doc renders as styled "PDF" pages; clauses carry ids the agent
// scrolls to, highlights, and annotates.

export const DOC_LIB = {
  'aer-2026': {
    title: 'AER (Retail Law) Instrument 2026',
    file: 'AER-Retail-Law-Instrument-2026.pdf',
    pages: 14,
    body: [
      { h: 'AER (Retail Law) Instrument 2026', meta: 'National Energy Retail Law · Minimum disconnection amount · Commonwealth of Australia', title: true },
      { h: '1 · Authority', paras: [{ t: '1.1 This instrument is made under section 111 of the National Energy Retail Law as applied in participating jurisdictions.' }] },
      { h: '2 · Definitions', paras: [
        { t: '2.1 In this instrument, "arrears" means amounts payable by a customer to a retailer for the sale and supply of energy that remain unpaid after the pay-by date.' },
        { t: '2.2 "De-energisation" has the meaning given by the National Energy Retail Rules.' },
      ]},
      { h: '3 · Application', paras: [
        { t: '3.1 This instrument applies to retailers under the National Energy Retail Law in participating jurisdictions.' },
        { t: '3.2 It supersedes the amount specified in the 2024 instrument from the commencement date.' },
      ]},
      { h: '4 · Minimum disconnection amount', paras: [
        { id: 'aer-s111-floor', t: '4.1 A retailer must not arrange de-energisation of premises for a customer whose arrears are below the minimum disconnection amount.' },
        { id: 'aer-s111-amount', t: '4.2 The minimum disconnection amount is $500 (GST inclusive).' },
      ]},
      { h: '5 · Commencement', paras: [
        { id: 'aer-commence', t: '5.1 This instrument commences on 1 July 2026.' },
        { t: '5.2 Decisions made before commencement are assessed under the instrument in force at the time.' },
      ]},
    ],
  },
  'hardship-policy': {
    title: 'Customer Hardship Policy Rev 4',
    file: '01. Customer Hardship Policy Rev 4.docx',
    pages: 18,
    body: [
      { h: 'Customer Hardship Policy', meta: 'Aurora Retail Energy · Rev 4 · AER approved 21 June 2026', title: true },
      { h: '3 · Identifying hardship', paras: [
        { t: '3.1 We proactively identify residential customers showing early signs of payment difficulty before disconnection is contemplated.' },
        { id: 'hp-indicators', t: '3.2 Minimum indicators include one or more missed or partial payments occurring within a single billing cycle, a failed direct debit, or information suggesting a change in the customer\'s financial circumstances.' },
      ]},
      { h: '4 · Protections while engaged', paras: [
        { id: 'hp-no-disco', t: '4.3 A customer who has entered our hardship program, or who is being assessed for entry, must not be disconnected while they remain in contact and are meeting the terms of any arrangement.' },
        { t: '4.4 Debt collection activity and default listing are suspended for customers in the program.' },
      ]},
      { h: '5 · Assistance we must offer', paras: [
        { id: 'hp-better-offer', t: '5.1 Eligible customers must be advised if a lower-cost plan is available for their consumption profile, and moved to it on request at no charge.' },
        { t: '5.2 Payment arrangements must reflect the customer\'s capacity to pay.' },
      ]},
    ],
  },
  'fdv-policy': {
    title: 'Family and Domestic Violence Policy Rev 2',
    file: '06. Family and Domestic Violence Policy Rev 2.docx',
    pages: 9,
    body: [
      { h: 'Family and Domestic Violence Policy', meta: 'Aurora Retail Energy · Rev 2 · Effective 30 June 2026', title: true },
      { h: '2 · Safe engagement', paras: [
        { id: 'fdv-safe', t: '2.1 Where an account carries a sensitive customer marker, all contact must follow the customer\'s recorded safe contact preferences, and account information must never be disclosed to another party regardless of their claimed relationship to the customer.' },
        { t: '2.2 Affected customers must not be required to provide evidence of their circumstances more than once.' },
      ]},
      { h: '3 · Debt and disconnection', paras: [
        { id: 'fdv-debt', t: '3.1 Disconnection must not be used as a means of recovering debt from a customer affected by family violence, and any de-energisation process in flight must be halted when a marker is identified.' },
      ]},
    ],
  },
  'wi-4': {
    title: 'Credit & Collections Work Instruction v11',
    file: 'WI-4. Credit and Collections Work Instruction v11.docx',
    pages: 22,
    body: [
      { h: 'Credit & Collections Work Instruction', meta: 'Aurora Retail Energy · v11 · Last revised 25 May 2026', title: true },
      { h: '4 · Disconnection eligibility screening', paras: [
        { t: '4.1 Before referring an account for de-energisation, the agent must complete the eligibility screen in full.' },
        { id: 'wi-42', t: '4.2 Do not refer an account for disconnection where the outstanding balance is below $300, the account holds a life support flag, or a payment plan is active.' },
        { t: '4.3 Screening outcomes are recorded in the breach register feed.' },
      ]},
    ],
  },
};

// scripted Q&A — matched loosely on keywords, default first
export const SCRIPTS = [
  {
    match: ['disconnect', 'amelia', '312', 'arrears'],
    question: 'Can we disconnect Amelia Hart over her $312 arrears?',
    citations: [
      { n: 1, doc: 'aer-2026', clause: 'aer-s111-amount', page: 5, reason: 'Her $312 arrears sit below the $500 minimum disconnection amount — disconnection is prohibited outright.' },
      { n: 2, doc: 'hardship-policy', clause: 'hp-no-disco', page: 7, reason: 'She is under payment-difficulty assessment, which blocks disconnection while she stays in contact.' },
      { n: 3, doc: 'fdv-policy', clause: 'fdv-debt', page: 5, reason: 'Her account carries a sensitive marker — disconnection cannot be used for debt recovery at all.' },
    ],
    answer: [
      ['No — disconnection is prohibited on three independent grounds.', 'b'],
      ['Her arrears of $312 are below the $500 minimum disconnection amount in the AER (Retail Law) Instrument 2026, s 111, effective 1 July 2026 ', 0], ['[1]', 'c1'], ['. ', 0],
      ['She is also being assessed for payment-difficulty support, and our Customer Hardship Policy cl 4.3 prevents disconnection while she remains in contact ', 0], ['[2]', 'c2'], ['. ', 0],
      ['Finally, her account carries a sensitive marker — the Family & Domestic Violence Policy cl 3.1 bars disconnection as a debt-recovery step entirely ', 0], ['[3]', 'c3'], ['.', 0],
    ],
  },
  {
    match: ['wi', 'work instruction', 'aligned', 'threshold', 'up to date', 'stale'],
    question: 'Is WI-4 aligned with the current disconnection threshold?',
    citations: [
      { n: 1, doc: 'wi-4', clause: 'wi-42', page: 6, reason: 'WI-4 §4.2 still instructs agents to screen against $300 — the superseded amount.' },
      { n: 2, doc: 'aer-2026', clause: 'aer-s111-amount', page: 5, reason: 'The instrument in force since 1 July 2026 sets the floor at $500.' },
    ],
    answer: [
      ['No — WI-4 has drifted from the instrument it implements.', 'b'],
      ['Section 4.2 of the work instruction still screens disconnection referrals against a $300 balance ', 0], ['[1]', 'c1'], [', but the AER (Retail Law) Instrument 2026 raised the minimum disconnection amount to $500 from 1 July 2026 ', 0], ['[2]', 'c2'], ['. ', 0],
      ['Accounts between $300 and $500 could currently be referred unlawfully. The register flagged this drift on 4 August; §4.2, letter template EL-018, training module 6 and breach rule R-22 all need the new amount.', 0],
    ],
  },
];

export const SUGGESTIONS = [
  'Can we disconnect Amelia Hart over her $312 arrears?',
  'Is WI-4 aligned with the current disconnection threshold?',
];
