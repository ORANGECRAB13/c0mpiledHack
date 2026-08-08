// The ask-your-documents corpus, mirrored from compliance-drift/scripts-gen-docs.mjs.
// Page numbers follow the generator's pageBreak layout so citations returned by
// the model land on the page the viewer actually renders.

export const DOCS = [
  {
    id: 'aer-2026',
    title: 'AER (Retail Law) Instrument 2026',
    scope: 'General — AER instrument, applies in all NERL states (NSW, QLD, SA, ACT, TAS)',
    file: 'AER-Retail-Law-Instrument-2026.pdf',
    sections: [
      { page: 1, ref: 's 1.1', text: 'This instrument is made under section 111 of the National Energy Retail Law as applied in participating jurisdictions.' },
      { page: 1, ref: 's 2.1', text: '"Arrears" means amounts payable by a customer to a retailer for the sale and supply of energy that remain unpaid after the pay-by date.' },
      { page: 1, ref: 's 3.2', text: 'It supersedes the amount specified in the 2024 instrument from the commencement date.' },
      { page: 2, ref: 's 4.1', text: 'A retailer must not arrange de-energisation of premises for a customer whose arrears are below the minimum disconnection amount.' },
      { page: 2, ref: 's 4.2', text: 'The minimum disconnection amount is $500 (GST inclusive).' },
      { page: 2, ref: 's 5.1', text: 'This instrument commences on 1 July 2026.' }
    ]
  },
  {
    id: 'hardship-policy',
    title: 'Customer Hardship Policy Rev 4',
    scope: 'General — AER-approved retailer policy, applies in all states we retail in',
    file: 'Customer-Hardship-Policy-Rev4.pdf',
    sections: [
      { page: 1, ref: 'cl 3.1', text: 'We proactively identify residential customers showing early signs of payment difficulty before disconnection is contemplated.' },
      { page: 1, ref: 'cl 3.2', text: 'Minimum indicators include one or more missed or partial payments occurring within a single billing cycle, a failed direct debit, or information suggesting a change in the customer\'s financial circumstances.' },
      { page: 2, ref: 'cl 4.3', text: 'A customer who has entered our hardship program, or who is being assessed for entry, must not be disconnected while they remain in contact and are meeting the terms of any arrangement.' },
      { page: 2, ref: 'cl 4.4', text: 'Debt collection activity and default listing are suspended for customers in the program.' },
      { page: 2, ref: 'cl 5.1', text: 'Eligible customers must be advised if a lower-cost plan is available for their consumption profile, and moved to it on request at no charge.' },
      { page: 2, ref: 'cl 5.2', text: 'Payment arrangements must reflect the customer\'s capacity to pay.' }
    ]
  },
  {
    id: 'fdv-policy',
    title: 'Family and Domestic Violence Policy Rev 2',
    scope: 'General — applies in all states',
    file: 'FDV-Policy-Rev2.pdf',
    sections: [
      { page: 1, ref: 'cl 2.1', text: 'Where an account carries a sensitive customer marker, all contact must follow the customer\'s recorded safe contact preferences, and account information must never be disclosed to another party regardless of their claimed relationship to the customer.' },
      { page: 1, ref: 'cl 2.2', text: 'Affected customers must not be required to provide evidence of their circumstances more than once.' },
      { page: 2, ref: 'cl 3.1', text: 'Disconnection must not be used as a means of recovering debt from a customer affected by family violence, and any de-energisation process in flight must be halted when a marker is identified.' },
      { page: 2, ref: 'cl 3.2', text: 'Debt recovery action is paused while safety concerns are being assessed.' }
    ]
  },
  {
    id: 'wi-4',
    title: 'Credit & Collections Work Instruction v11',
    scope: 'General — internal work instruction; state overlays apply on top',
    file: 'WI-4-Credit-Collections-v11.pdf',
    sections: [
      { page: 1, ref: '§2.1', text: 'A reminder notice issues the business day after the pay-by date. A disconnection warning notice may issue no earlier than 6 business days later.' },
      { page: 1, ref: '§3.1', text: 'Two contact attempts on the customer\'s preferred channel are required before referral.' },
      { page: 2, ref: '§4.2', text: 'Do not refer an account for disconnection where the outstanding balance is below $300, the account holds a life support flag, or a payment plan is active.' },
      { page: 2, ref: '§4.3', text: 'Screening outcomes are recorded in the breach register feed.' }
    ]
  },
  {
    id: 'best-offer',
    title: 'Best Offer Policy v2.1',
    scope: 'VIC only — Victorian Energy Retail Code obligation; does not apply to NSW, QLD or SA customers',
    file: 'Best-Offer-Policy-v2.pdf',
    sections: [
      { page: 1, ref: 'cl 1.1', text: 'Victorian customers must be shown the best offer message on at least every third bill, comparing their current plan cost with our cheapest generally available plan for their usage.' },
      { page: 1, ref: 'cl 2.1', text: 'The comparison uses the customer\'s most recent 12 months of interval data, or a profile estimate where 12 months is unavailable.' },
      { page: 2, ref: 'cl 3.1', text: 'A customer who requests the best offer must be switched with explicit informed consent, at no charge, effective from their next billing cycle.' },
      { page: 2, ref: 'cl 3.2', text: 'Customers in payment difficulty are proactively advised of the best offer as part of tailored assistance.' }
    ]
  },
  {
    id: 'billing-std',
    title: 'Billing Accuracy Standard v3.0',
    scope: 'General — derived from the NERR, applies in all states',
    file: 'Billing-Accuracy-Standard-v3.pdf',
    sections: [
      { page: 1, ref: 'cl 2.1', text: 'Estimates must use the customer\'s historical consumption where available and be clearly identified on the bill.' },
      { page: 2, ref: 'cl 3.1', text: 'Where a customer has been undercharged and the undercharging is not the customer\'s fault, recovery is limited to the 9 months preceding the date the error was identified.' },
      { page: 2, ref: 'cl 3.2', text: 'Recovered amounts must be offered as an interest-free instalment plan matching the period of the undercharge.' }
    ]
  }
];

/** The corpus rendered for the system prompt: every quotable clause, tagged. */
export function corpusPrompt() {
  return DOCS.map((d) =>
    `### ${d.title} (doc id: ${d.id})\nJurisdiction: ${d.scope}\n` +
    d.sections.map((s) => `[page ${s.page} · ${s.ref}] ${s.text}`).join('\n')
  ).join('\n\n');
}

/** Exact-match check so model citations can be verified against the corpus. */
export function findQuote(docId, quote) {
  const doc = DOCS.find((d) => d.id === docId);
  if (!doc) return null;
  const clean = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
  return doc.sections.find((s) => clean(s.text).includes(clean(quote)) || clean(quote).includes(clean(s.text))) || null;
}
