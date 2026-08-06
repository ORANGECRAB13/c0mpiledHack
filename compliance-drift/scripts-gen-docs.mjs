// Generate the internal-document PDFs for the ask-agent demo.
// Each doc: serif headings, justified-ish body, footer page numbers.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'fs';

const W = 595, H = 842, M = 64; // A4 portrait

function wrap(text, font, size, width) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function makeDoc(file, title, meta, sections) {
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);

  let page = pdf.addPage([W, H]);
  let y = H - 90;
  const ink = rgb(0.16, 0.15, 0.12);
  const mut = rgb(0.5, 0.48, 0.44);

  const newPage = () => { page = pdf.addPage([W, H]); y = H - 76; };
  const ensure = (need) => { if (y - need < 70) newPage(); };

  // title block
  const tw = serifB.widthOfTextAtSize(title, 22);
  page.drawText(title, { x: (W - tw) / 2, y, size: 22, font: serifB, color: ink });
  y -= 20;
  const mw = sans.widthOfTextAtSize(meta, 8.5);
  page.drawText(meta, { x: (W - mw) / 2, y, size: 8.5, font: sans, color: mut });
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: rgb(0.82, 0.8, 0.75) });
  y -= 30;

  for (const sec of sections) {
    if (sec.pageBreak) newPage();
    ensure(40);
    page.drawText(sec.h, { x: M, y, size: 13, font: serifB, color: ink });
    y -= 22;
    for (const para of sec.paras) {
      const lines = wrap(para, serif, 10.5, W - 2 * M);
      ensure(lines.length * 15 + 8);
      for (const ln of lines) {
        page.drawText(ln, { x: M, y, size: 10.5, font: serif, color: ink });
        y -= 15;
      }
      y -= 8;
    }
    y -= 8;
  }

  // page numbers
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${title} — page ${i + 1} of ${pages.length}`, { x: M, y: 40, size: 7.5, font: sans, color: mut });
  });

  writeFileSync(`public/docs/${file}`, await pdf.save());
  console.log(file, pages.length, 'pages');
}

const LOREM = [
  'Records generated under this section are retained for seven years and made available to the AER on request. Team leaders review a sample of screening outcomes each month as part of the quality framework.',
  'Where a customer cannot be reached after two attempts on their preferred channel, the account is referred to the specialist team for alternative contact before any further action is taken.',
  'Nothing in this document limits a customer\'s rights under the National Energy Retail Law, the National Energy Retail Rules, or any applicable state instrument. Where this document conflicts with a regulatory obligation, the obligation prevails.',
  'Training on this document is mandatory for all customer-facing staff and is refreshed annually. Completion is recorded in the learning management system and reported to the compliance committee quarterly.',
];

await makeDoc('AER-Retail-Law-Instrument-2026.pdf', 'AER (Retail Law) Instrument 2026', 'National Energy Retail Law · Minimum disconnection amount · Commonwealth of Australia', [
  { h: '1 · Authority', paras: ['1.1 This instrument is made under section 111 of the National Energy Retail Law as applied in participating jurisdictions.', LOREM[2]] },
  { h: '2 · Definitions', paras: ['2.1 In this instrument, "arrears" means amounts payable by a customer to a retailer for the sale and supply of energy that remain unpaid after the pay-by date.', '2.2 "De-energisation" has the meaning given by the National Energy Retail Rules.'] },
  { h: '3 · Application', paras: ['3.1 This instrument applies to retailers under the National Energy Retail Law in participating jurisdictions.', '3.2 It supersedes the amount specified in the 2024 instrument from the commencement date.', LOREM[0]] },
  { h: '4 · Minimum disconnection amount', pageBreak: true, paras: [
    '4.1 A retailer must not arrange de-energisation of premises for a customer whose arrears are below the minimum disconnection amount.',
    '4.2 The minimum disconnection amount is $500 (GST inclusive).',
    '4.3 The amount in subsection 4.2 is indexed in accordance with the method published by the AER from time to time.'] },
  { h: '5 · Commencement', paras: ['5.1 This instrument commences on 1 July 2026.', '5.2 Decisions made before commencement are assessed under the instrument in force at the time.'] },
]);

await makeDoc('Customer-Hardship-Policy-Rev4.pdf', 'Customer Hardship Policy', 'Aurora Retail Energy · Rev 4 · AER approved 21 June 2026', [
  { h: '1 · Purpose', paras: ['1.1 This policy sets out the assistance available to residential customers experiencing payment difficulty, and the protections that apply while they engage with us.', LOREM[3]] },
  { h: '2 · Scope', paras: ['2.1 This policy applies to all residential customers in all jurisdictions in which we retail energy.', LOREM[2]] },
  { h: '3 · Identifying hardship', paras: [
    '3.1 We proactively identify residential customers showing early signs of payment difficulty before disconnection is contemplated.',
    '3.2 Minimum indicators include one or more missed or partial payments occurring within a single billing cycle, a failed direct debit, or information suggesting a change in the customer\'s financial circumstances.', LOREM[1]] },
  { h: '4 · Protections while engaged', pageBreak: true, paras: [
    '4.1 Customers assessed under this policy are treated with respect and without judgement.',
    '4.2 Entry to the program is confirmed in writing on the customer\'s preferred channel.',
    '4.3 A customer who has entered our hardship program, or who is being assessed for entry, must not be disconnected while they remain in contact and are meeting the terms of any arrangement.',
    '4.4 Debt collection activity and default listing are suspended for customers in the program.', LOREM[0]] },
  { h: '5 · Assistance we must offer', paras: [
    '5.1 Eligible customers must be advised if a lower-cost plan is available for their consumption profile, and moved to it on request at no charge.',
    '5.2 Payment arrangements must reflect the customer\'s capacity to pay.', LOREM[3]] },
]);

await makeDoc('FDV-Policy-Rev2.pdf', 'Family and Domestic Violence Policy', 'Aurora Retail Energy · Rev 2 · Effective 30 June 2026', [
  { h: '1 · Commitment', paras: ['1.1 We recognise family and domestic violence as a potential cause of payment difficulty and of risk to personal safety, and we train our people to respond safely.', LOREM[3]] },
  { h: '2 · Safe engagement', paras: [
    '2.1 Where an account carries a sensitive customer marker, all contact must follow the customer\'s recorded safe contact preferences, and account information must never be disclosed to another party regardless of their claimed relationship to the customer.',
    '2.2 Affected customers must not be required to provide evidence of their circumstances more than once.', LOREM[1]] },
  { h: '3 · Debt and disconnection', pageBreak: true, paras: [
    '3.1 Disconnection must not be used as a means of recovering debt from a customer affected by family violence, and any de-energisation process in flight must be halted when a marker is identified.',
    '3.2 Debt recovery action is paused while safety concerns are being assessed.', LOREM[2]] },
]);

await makeDoc('WI-4-Credit-Collections-v11.pdf', 'Credit & Collections Work Instruction', 'Aurora Retail Energy · v11 · Last revised 25 May 2026', [
  { h: '1 · Purpose', paras: ['1.1 This work instruction guides collections agents through arrears management from reminder notice to de-energisation referral.', LOREM[3]] },
  { h: '2 · Reminder and warning sequence', paras: ['2.1 A reminder notice issues the business day after the pay-by date. A disconnection warning notice may issue no earlier than 6 business days later.', LOREM[1]] },
  { h: '3 · Contact attempts', paras: ['3.1 Two contact attempts on the customer\'s preferred channel are required before referral.', LOREM[0]] },
  { h: '4 · Disconnection eligibility screening', pageBreak: true, paras: [
    '4.1 Before referring an account for de-energisation, the agent must complete the eligibility screen in full.',
    '4.2 Do not refer an account for disconnection where the outstanding balance is below $300, the account holds a life support flag, or a payment plan is active.',
    '4.3 Screening outcomes are recorded in the breach register feed.', LOREM[2]] },
]);

await makeDoc('Best-Offer-Policy-v2.pdf', 'Best Offer Policy', 'Aurora Retail Energy · v2.1 · Effective 1 April 2026', [
  { h: '1 · Obligation', paras: ['1.1 Victorian customers must be shown the best offer message on at least every third bill, comparing their current plan cost with our cheapest generally available plan for their usage.', LOREM[2]] },
  { h: '2 · Comparison method', paras: ['2.1 The comparison uses the customer\'s most recent 12 months of interval data, or a profile estimate where 12 months is unavailable.', LOREM[0]] },
  { h: '3 · Switching', pageBreak: true, paras: [
    '3.1 A customer who requests the best offer must be switched with explicit informed consent, at no charge, effective from their next billing cycle.',
    '3.2 Customers in payment difficulty are proactively advised of the best offer as part of tailored assistance.', LOREM[3]] },
]);

await makeDoc('Billing-Accuracy-Standard-v3.pdf', 'Billing Accuracy Standard', 'Aurora Retail Energy · v3.0 · Effective 15 May 2026', [
  { h: '1 · Purpose', paras: ['1.1 This standard governs bill accuracy, estimated reads, unbilled energy and re-billing.', LOREM[3]] },
  { h: '2 · Estimated reads', paras: ['2.1 Estimates must use the customer\'s historical consumption where available and be clearly identified on the bill.', LOREM[1]] },
  { h: '3 · Back-billing', pageBreak: true, paras: [
    '3.1 Where a customer has been undercharged and the undercharging is not the customer\'s fault, recovery is limited to the 9 months preceding the date the error was identified.',
    '3.2 Recovered amounts must be offered as an interest-free instalment plan matching the period of the undercharge.', LOREM[0]] },
]);
