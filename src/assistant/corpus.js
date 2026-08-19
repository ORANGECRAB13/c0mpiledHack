import REGULATION_DOCS from './regulations.generated.js';

// The ask-your-documents corpus, mirrored from compliance-drift/scripts-gen-docs.mjs.
// Page numbers follow the generator's pageBreak layout so citations returned by
// the model land on the page the viewer actually renders.

const CURATED_DOCS = [
  {
    id: 'vic-ercop-v7-amendment',
    title: 'Energy Retail Code of Practice Version 7 — Energy Consumer Reforms Amendment 2025',
    scope: 'VIC only — Version 7 Schedule 4 commences 1 October 2026; automatic best offer, $1,000 disconnection threshold, payment methods, switching and concessions',
    file: 'Energy Retail Code of Practice - Energy Consumer Reforms Amendment 2025.pdf',
    sections: [
      { page: 4, ref: 'cl 16A', text: 'A retailer must determine residential customer concession eligibility whenever reasonable and always when entering a contract, switching contracts, or when the customer first requests standard or tailored assistance.' },
      { page: 11, ref: 'cl 72(2A)', text: 'A retailer must offer at least one commonly used and accessible payment method for which neither the retailer nor payment service provider imposes a charge.' },
      { page: 12, ref: 'cl 111A', text: 'A retailer must maintain a simple and accessible deemed-best-offer switching process, including clear website instructions and both website and telephone switching paths.' },
      { page: 13, ref: 'cl 132B', text: 'An eligible residential customer is receiving tailored assistance, or has been in arrears for at least three months with arrears of at least $1,000 per fuel. All residential customers in arrears must be checked at least every six months.' },
      { page: 14, ref: 'cl 132C', text: 'The deemed-best-offer check is due within 10 business days after eligibility and at least every six months while eligibility continues, or every 12 months after an opt-out.' },
      { page: 14, ref: 'cl 132D(1)', text: 'Where the check finds a cheaper deemed best offer, the intention-to-switch notice is due no later than 5 business days after the check.' },
      { page: 16, ref: 'cl 132D(5)-(9)', text: 'The customer may opt out orally or in writing and receives 10 business days to do so. If they do not opt out, the retailer must switch without charge and preserve any government concession or rebate.' },
      { page: 16, ref: 'cl 132G', text: 'The retailer must retain records, including the data inputs used for deemed-best-offer checks, sufficient to evidence compliance.' },
      { page: 17, ref: 'cl 187(2)', text: 'A retailer or exempt electricity seller must not arrange disconnection where the customer’s total arrears are less than $1,000 inclusive of GST.' },
    ]
  },
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
    scope: 'VIC only — pre-1 October 2026 policy; superseded by Version 7 for automatic best-offer switching',
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

const CURATED_IDS = new Set(CURATED_DOCS.map((doc) => doc.id));
export const DOCS = [
  ...CURATED_DOCS,
  ...REGULATION_DOCS.filter((doc) => !CURATED_IDS.has(doc.id)),
];

const EXPANSIONS = {
  disconnect: ['disconnection', 'de-energisation', 'de energisation', 'arrears', 'warning notice', 'minimum amount'],
  hardship: ['payment difficulty', 'tailored assistance', 'hardship', 'vulnerable', 'financial difficulty'],
  silent: ['proactive', 'early identification', 'payment difficulty', 'missed payment', 'failed payment'],
  switch: ['best offer', 'better offer', 'retail offer', 'explicit informed consent', 'tariff'],
  'best offer': ['best offer', 'better offer', 'retail offer', 'tariff', 'switch'],
  consent: ['explicit informed consent', 'consent', 'opt out', 'opt-out'],
  'direct debit': ['payment method', 'accessible', 'fee-free', 'charges', 'clause 72'],
  concession: ['concession eligibility', 'rebate', 'clause 16A', 'preserve concession'],
  '1 october': ['automatic best offer', '$1,000', 'three months', 'payment method', 'concession', 'switching process'],
  billing: ['bill', 'billing', 'undercharge', 'overcharge', 'estimated read', 'meter data'],
  reconcile: ['reconcile', 'data quality', 'record', 'information', 'billing error'],
  monitor: ['monitor', 'review', 'reassess', 'arrangement', 'ongoing assistance'],
  vulnerable: ['vulnerable', 'family violence', 'payment difficulty', 'hardship', 'life support'],
};

const STOP_WORDS = new Set(['about', 'after', 'before', 'could', 'does', 'from', 'have', 'into', 'should', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'officer', 'customer']);

function queryTerms(query) {
  const text = String(query || '').toLowerCase();
  const terms = new Set((text.match(/[a-z0-9$-]{3,}/g) || []).filter((term) => !STOP_WORDS.has(term)));
  for (const [trigger, additions] of Object.entries(EXPANSIONS)) {
    if (text.includes(trigger)) additions.forEach((term) => terms.add(term));
  }
  return [...terms];
}

/** Rank original PDF pages locally so only relevant evidence enters the model context. */
export function retrieveSections(query, limit = 12) {
  const terms = queryTerms(query);
  const version7Query = /version\s*7|1\s+october\s+2026|october\s+1,?\s+2026/i.test(String(query || ''));
  const ranked = [];
  for (const doc of DOCS) {
    const title = `${doc.title} ${doc.scope}`.toLowerCase();
    for (const section of doc.sections) {
      const text = section.text.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 8;
        const occurrences = text.split(term).length - 1;
        score += Math.min(occurrences, 5) * (term.includes(' ') ? 5 : 2);
      }
      if (score > 0 && CURATED_IDS.has(doc.id)) score += 6;
      if (version7Query && doc.id === 'vic-ercop-v7-amendment') score += 220;
      if (version7Query && ['energy-retail-code-v6', 'best-offer'].includes(doc.id)) score -= 120;
      if (score > 0) ranked.push({ doc, section, score });
    }
  }
  const selected = [];
  const perDocument = new Map();
  for (const hit of ranked.sort((a, b) => b.score - a.score || a.section.page - b.section.page)) {
    const count = perDocument.get(hit.doc.id) || 0;
    const maxPerDocument = version7Query && hit.doc.id === 'vic-ercop-v7-amendment' ? 9 : 3;
    if (count >= maxPerDocument) continue;
    selected.push(hit);
    perDocument.set(hit.doc.id, count + 1);
    if (selected.length === limit) break;
  }
  return selected;
}

/** Render retrieved evidence with stable ids and original PDF page numbers. */
export function corpusPrompt(selected) {
  const rows = Array.isArray(selected)
    ? selected
    : DOCS.flatMap((doc) => doc.sections.map((section) => ({ doc, section })));
  return rows.map(({ doc, section }) =>
    `### ${doc.title} (doc id: ${doc.id})\nJurisdiction: ${doc.scope}\n` +
    `[page ${section.page} · ${section.ref}] ${section.text}`
  ).join('\n\n');
}

/** Exact-match check so model citations can be verified against the corpus. */
export function findQuote(docId, quote) {
  const doc = DOCS.find((d) => d.id === docId);
  if (!doc) return null;
  const clean = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
  return doc.sections.find((s) => clean(s.text).includes(clean(quote)) || clean(quote).includes(clean(s.text))) || null;
}
