// Ask-agent corpus: real PDF files served from /docs, cited by page and
// quote. The viewer scrolls the actual PDF and highlights the quoted text.

export const DOC_META = {
  'aer-2026': { title: 'AER (Retail Law) Instrument 2026', file: 'AER-Retail-Law-Instrument-2026.pdf' },
  'nerr': { title: 'National Energy Retail Rules v51', file: 'NERR-v51.pdf' },
  'hardship-policy': { title: 'Customer Hardship Policy Rev 4', file: 'Customer-Hardship-Policy-Rev4.pdf' },
  'fdv-policy': { title: 'Family and Domestic Violence Policy Rev 2', file: 'FDV-Policy-Rev2.pdf' },
  'wi-4': { title: 'Credit & Collections Work Instruction v11', file: 'WI-4-Credit-Collections-v11.pdf' },
  'best-offer': { title: 'Best Offer Policy v2.1', file: 'Best-Offer-Policy-v2.pdf' },
  'billing-std': { title: 'Billing Accuracy Standard v3.0', file: 'Billing-Accuracy-Standard-v3.pdf' },
};

export const SCRIPTS = [
  {
    match: ['amelia', 'hart', '312', 'disconnect her'],
    question: 'Can we disconnect Amelia Hart over her $312 arrears?',
    citations: [
      { n: 1, doc: 'aer-2026', page: 2, quote: 'The minimum disconnection amount is $500 (GST inclusive).', reason: 'Her $312 arrears sit below the $500 minimum disconnection amount — disconnection is prohibited outright.' },
      { n: 2, doc: 'hardship-policy', page: 2, quote: 'A customer who has entered our hardship program, or who is being assessed for entry, must not be disconnected while they remain in contact and are meeting the terms of any arrangement.', reason: 'She is under payment-difficulty assessment, which blocks disconnection while she stays in contact.' },
      { n: 3, doc: 'fdv-policy', page: 2, quote: 'Disconnection must not be used as a means of recovering debt from a customer affected by family violence, and any de-energisation process in flight must be halted when a marker is identified.', reason: 'Her account carries a sensitive marker — disconnection cannot be used for debt recovery at all.' },
    ],
    answer: [
      ['No — disconnection is prohibited on three independent grounds.', 'b'],
      ['Her arrears of $312 are below the $500 minimum disconnection amount in the AER (Retail Law) Instrument 2026, s 111, effective 1 July 2026 ', 0], ['[1]', 'c1'], ['. ', 0],
      ['She is also being assessed for payment-difficulty support, and our Customer Hardship Policy cl 4.3 prevents disconnection while she remains in contact ', 0], ['[2]', 'c2'], ['. ', 0],
      ['Finally, her account carries a sensitive marker — the Family & Domestic Violence Policy cl 3.1 bars disconnection as a debt-recovery step entirely ', 0], ['[3]', 'c3'], ['.', 0],
    ],
  },
  {
    match: ['wi-4', 'wi 4', 'work instruction', 'aligned', 'stale', 'threshold', 'up to date'],
    question: 'Is WI-4 aligned with the current disconnection threshold?',
    citations: [
      { n: 1, doc: 'wi-4', page: 2, quote: 'Do not refer an account for disconnection where the outstanding balance is below $300, the account holds a life support flag, or a payment plan is active.', reason: 'WI-4 §4.2 still instructs agents to screen against $300 — the superseded amount.' },
      { n: 2, doc: 'aer-2026', page: 2, quote: 'The minimum disconnection amount is $500 (GST inclusive).', reason: 'The instrument in force since 1 July 2026 sets the floor at $500.' },
    ],
    answer: [
      ['No — WI-4 has drifted from the instrument it implements.', 'b'],
      ['Section 4.2 of the work instruction still screens disconnection referrals against a $300 balance ', 0], ['[1]', 'c1'], [', but the AER (Retail Law) Instrument 2026 raised the minimum disconnection amount to $500 from 1 July 2026 ', 0], ['[2]', 'c2'], ['. ', 0],
      ['Accounts between $300 and $500 could currently be referred unlawfully. The register flagged this drift on 4 August; §4.2, letter template EL-018, training module 6 and breach rule R-22 all need the new amount.', 0],
    ],
  },
  {
    match: ['okonkwo', 'daniel', 'jia', 'chen', 'grace', 'muller', 'best offer', 'plan switch', 'cheaper'],
    question: 'Can I approve the plan switch for Daniel Okonkwo?',
    citations: [
      { n: 1, doc: 'best-offer', page: 2, quote: 'A customer who requests the best offer must be switched with explicit informed consent, at no charge, effective from their next billing cycle.', reason: 'The switch needs his explicit informed consent on record — that is the only outstanding item.' },
      { n: 2, doc: 'best-offer', page: 1, quote: 'The comparison uses the customer\'s most recent 12 months of interval data, or a profile estimate where 12 months is unavailable.', reason: 'His comparison used 12 months of interval data, so the $14/month saving is soundly based.' },
      { n: 3, doc: 'hardship-policy', page: 2, quote: 'Eligible customers must be advised if a lower-cost plan is available for their consumption profile, and moved to it on request at no charge.', reason: 'If he later enters payment difficulty, advising the cheaper plan becomes mandatory — approving now gets ahead of that.' },
    ],
    answer: [
      ['Yes — once consent is recorded.', 'b'],
      ['The tariff comparison is complete and used his last 12 months of interval data ', 0], ['[2]', 'c2'], [', identifying a $14/month saving. Under the Best Offer Policy the switch must be made with explicit informed consent, at no charge, from his next billing cycle ', 0], ['[1]', 'c1'], ['. ', 0],
      ['Capture consent on the call or via SMS link, and the switch can be actioned immediately ', 0], ['[3]', 'c3'], ['.', 0],
    ],
  },
  {
    match: ['priya', 'raman', 'contact before', 'determination', 'complaint'],
    question: 'Why does Priya Raman need contact before determination?',
    citations: [
      { n: 1, doc: 'nerr', page: 111, quote: ['When retailer must not arrange de-energisation', 'where the customer has made a complaint, directly related to the reason for'], reason: 'NERR r 116 blocks de-energisation while a directly related complaint remains unresolved — her billing complaint is still open.' },
      { n: 2, doc: 'hardship-policy', page: 1, quote: 'Minimum indicators include one or more missed or partial payments occurring within a single billing cycle, a failed direct debit, or information suggesting a change in the customer\'s financial circumstances.', reason: 'Her payment pattern meets the minimum hardship indicators, so an assistance conversation must happen before any determination.' },
    ],
    answer: [
      ['Because two protections are engaged at once.', 'b'],
      ['She has an unresolved complaint directly related to the arrears, and NERR rule 116 prohibits arranging de-energisation while it stands ', 0], ['[1]', 'c1'], ['. ', 0],
      ['Her recent payment behaviour also meets our minimum hardship indicators, which requires an assistance discussion before any determination is recorded ', 0], ['[2]', 'c2'], ['. Resolve the complaint and complete the conversation first.', 0],
    ],
  },
  {
    match: ['webb', 'marcus', 'castellano', 'tom', 'unbilled', 'revenue', 'back-bill', 'backbill'],
    question: 'How far back can we bill Marcus Webb for the unbilled period?',
    citations: [
      { n: 1, doc: 'billing-std', page: 2, quote: 'Where a customer has been undercharged and the undercharging is not the customer\'s fault, recovery is limited to the 9 months preceding the date the error was identified.', reason: 'The meter-config error was ours, so recovery caps at 9 months even though 14 months went unbilled.' },
      { n: 2, doc: 'billing-std', page: 2, quote: 'Recovered amounts must be offered as an interest-free instalment plan matching the period of the undercharge.', reason: 'The recovered amount must be offered over a matching 9-month interest-free plan.' },
    ],
    answer: [
      ['Nine months — not the full unbilled period.', 'b'],
      ['The exception spans 14 months, but the undercharging came from our meter configuration error, so the Billing Accuracy Standard caps recovery at the 9 months before the error was identified ', 0], ['[1]', 'c1'], ['. ', 0],
      ['The recovered amount must also be offered as an interest-free instalment plan over an equivalent period ', 0], ['[2]', 'c2'], ['. Draft the re-bill for $1,088 across 9 months.', 0],
    ],
  },
  {
    match: ['sofia', 'nguyen', 'exit', 'remove support', 'remains appropriate', 'life support'],
    question: 'Can we exit Sofia Nguyen from hardship support?',
    citations: [
      { n: 1, doc: 'nerr', page: 111, quote: ['adhering to a payment plan under rule 33 or 72', 'where the customer is a hardship customer or residential customer and is'], reason: 'While she was on the plan, r 116(1)(d) protected her from de-energisation — exit removes that protection, so it must be deliberate.' },
      { n: 2, doc: 'hardship-policy', page: 2, quote: 'Payment arrangements must reflect the customer\'s capacity to pay.', reason: 'Nine months of consistent payments at the agreed level shows the arrangement matched her capacity — the exit criteria are genuinely met.' },
    ],
    answer: [
      ['The evidence supports it — but it is your call, not the system\'s.', 'b'],
      ['She has paid consistently for nine months and her balance is zero; the arrangement clearly matched her capacity to pay ', 0], ['[2]', 'c2'], ['. ', 0],
      ['Note that leaving the program ends the specific protection of NERR r 116(1)(d) for customers adhering to a plan ', 0], ['[1]', 'c1'], [', so confirm with her before recording the exit, and schedule a 60-day check-in.', 0],
    ],
  },
];

export const SUGGESTIONS = [
  'Can we disconnect Amelia Hart over her $312 arrears?',
  'Is WI-4 aligned with the current disconnection threshold?',
  'Can I approve the plan switch for Daniel Okonkwo?',
  'How far back can we bill Marcus Webb for the unbilled period?',
];
