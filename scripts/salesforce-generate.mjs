#!/usr/bin/env node
/**
 * Generate a mock customer book for the compliance demo.
 *
 * The spread is deliberate, not uniform noise: the point is to exercise the
 * Victorian 1 October 2026 rules, so the population straddles the $1,000
 * disconnection floor and the automatic best-offer trigger ($1,000+ arrears,
 * 3 months behind, no opt-out) rather than clustering in the safe middle.
 *
 * Deterministic: the same seed produces the same book every run, so re-seeding
 * updates records in place instead of inventing a new population.
 *
 *   node scripts/salesforce-generate.mjs [count] > salesforce/data/customers.csv
 */
import { writeFileSync } from 'node:fs';

const COUNT = Number(process.argv[2] || 150);
const START_ID = 1001;
// Fixed "today" so generated dates never drift between runs.
const TODAY = new Date('2026-08-19T00:00:00Z');

// mulberry32 — small deterministic PRNG, seeded so the book is reproducible.
let seed = 0x5eed1234;
const rand = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = ['Amelia','Daniel','Priya','Marcus','Sofia','Grace','Tom','Leila','Ravi','Jia','Liam','Rosa','Ken','Hana','Noah','Mia','Ethan','Zara','Oliver','Aisha','Lucas','Chloe','Arjun','Isla','Mateo','Freya','Sione','Nina','Caleb','Yuki','Omar','Elena','Jack','Fatima','Hugo','Ruby','Dev','Anika','Felix','Talia','Cooper','Maya','Enzo','Sara','Blake','Leilani','Rohan','Ivy','Angus','Nadia'];
const LAST = ['Hart','Okonkwo','Raman','Webb','Nguyen','Muller','Castellano','Haddad','Patel','Chen','Forsyth','Silva','Watanabe','Kim','Brennan','Kaur','Moretti','Abbas','Donnelly','Fraser','Okafor','Lombardi','Sharma','Whitlock','Vargas','Nakamura','Ellis','Bashir','Tupou','Kovac','Reyes','Mercer','Dube','Salib','Hoang','Barlow','Iyer','Novak','Camilleri','Adeyemi','Quinn','Rossi','Bui','Mahmoud','Sutton','Faletau','Deng','Larsen','Marsh','Petrov'];
const PLANS = ['Everyday Saver','Standard Flexi','Time-of-Use Plus','Solar Saver','Assisted Essentials','Hardship Saver'];

const iso = (date) => date.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(TODAY.getTime() - n * 86400000));
const daysAhead = (n) => iso(new Date(TODAY.getTime() + n * 86400000));

/**
 * Segments chosen so the demo queue has real regulatory variety. Weights sum
 * to 100 and are walked in order.
 */
const SEGMENTS = [
  // Healthy: no arrears worth acting on.
  { name: 'current', weight: 22, build: () => ({
      balance: between(0, 120), days: between(0, 20), missed: 0, partial: between(0, 1),
      hardship: 'none', stress: false, optOut: rand() < 0.1 }) },
  // Early trouble, still under the floor — disconnection is blocked.
  { name: 'below_floor', weight: 26, build: () => ({
      balance: between(150, 980), days: between(25, 88), missed: between(1, 2), partial: between(0, 2),
      hardship: rand() < 0.25 ? 'requested' : 'none', stress: rand() < 0.55, optOut: rand() < 0.12 }) },
  // Over $1,000 and 3+ months behind: both October rules fire at once.
  { name: 'both_rules', weight: 20, build: () => ({
      balance: between(1000, 3200), days: between(92, 260), missed: between(2, 5), partial: between(0, 3),
      hardship: 'none', stress: rand() < 0.8, optOut: false }) },
  // Already on tailored assistance — best-offer duty applies via assistance.
  { name: 'on_hardship', weight: 18, build: () => ({
      balance: between(200, 2400), days: between(40, 300), missed: between(0, 3), partial: between(1, 4),
      hardship: 'active', stress: true, optOut: rand() < 0.08 }) },
  // Over the floor but opted out: the switch must NOT be automatic.
  { name: 'opted_out', weight: 8, build: () => ({
      balance: between(1000, 2600), days: between(95, 200), missed: between(2, 4), partial: between(0, 2),
      hardship: 'none', stress: rand() < 0.6, optOut: true }) },
  // Came through hardship and recovered.
  { name: 'exited', weight: 6, build: () => ({
      balance: between(0, 300), days: between(0, 45), missed: 0, partial: between(0, 2),
      hardship: 'exited', stress: false, optOut: rand() < 0.1 }) },
];

const REASONS = ['reduced work hours','job loss','medical costs','separation','bereavement','rental stress','business downturn','carer responsibilities'];

const segmentFor = (n) => {
  let roll = n % 100;
  for (const seg of SEGMENTS) {
    if (roll < seg.weight) return seg;
    roll -= seg.weight;
  }
  return SEGMENTS[SEGMENTS.length - 1];
};

const customers = [];
for (let i = 0; i < COUNT; i++) {
  const id = String(START_ID + i);
  const seg = segmentFor(Math.floor(rand() * 100));
  const s = seg.build();
  const enteredDays = s.hardship === 'active' ? between(20, 200) : s.hardship === 'exited' ? between(220, 400) : null;

  customers.push({
    customer_id: id,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    segment: seg.name,
    account: {
      balance: s.balance,
      oldest_debt_days: s.days,
      current_plan: s.hardship === 'active' ? pick(['Assisted Essentials', 'Hardship Saver']) : pick(PLANS.slice(0, 4)),
    },
    payments: { missed_payments_90d: s.missed, partial_payments_90d: s.partial },
    hardship: {
      status: s.hardship,
      entered_at: enteredDays ? daysAgo(enteredDays) : null,
      review_due_at: s.hardship === 'active' ? daysAhead(between(-30, 120)) : null,
    },
    crm: { financial_stress_signal: s.stress, reason: s.stress ? pick(REASONS) : null },
    preferences: { best_offer_opt_out: s.optOut },
  });
}

// CSV for the Bulk API — 150 single REST calls would be needlessly slow.
const COLUMNS = [
  ['External_Customer_Id__c', (c) => c.customer_id],
  ['Name', (c) => c.name],
  ['Arrears_Balance__c', (c) => c.account.balance],
  ['Oldest_Debt_Days__c', (c) => c.account.oldest_debt_days],
  ['Current_Plan__c', (c) => c.account.current_plan],
  ['Missed_Payments_90d__c', (c) => c.payments.missed_payments_90d],
  ['Partial_Payments_90d__c', (c) => c.payments.partial_payments_90d],
  ['Hardship_Status__c', (c) => c.hardship.status],
  ['Hardship_Entered_At__c', (c) => c.hardship.entered_at ?? ''],
  ['Hardship_Review_Due_At__c', (c) => c.hardship.review_due_at ?? ''],
  ['Financial_Stress_Signal__c', (c) => c.crm.financial_stress_signal],
  ['Financial_Stress_Reason__c', (c) => c.crm.reason ?? ''],
  ['Best_Offer_Opt_Out__c', (c) => c.preferences.best_offer_opt_out],
];

const escape = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  COLUMNS.map(([h]) => h).join(','),
  ...customers.map((c) => COLUMNS.map(([, get]) => escape(get(c))).join(',')),
].join('\n');

writeFileSync('salesforce/data/customers.csv', csv + '\n');
writeFileSync('salesforce/data/customers.json', JSON.stringify(customers, null, 2) + '\n');

const tally = {};
for (const c of customers) tally[c.segment] = (tally[c.segment] || 0) + 1;
const overFloor = customers.filter((c) => c.account.balance >= 1000).length;
const bothRules = customers.filter((c) => c.account.balance >= 1000 && c.account.oldest_debt_days >= 90 && !c.preferences.best_offer_opt_out).length;
console.log(`${customers.length} customers · ids ${START_ID}-${START_ID + COUNT - 1}`);
console.log('segments:', tally);
console.log(`over the $1,000 floor: ${overFloor}`);
console.log(`mandatory best-offer switch (>=$1,000, 90+ days, not opted out): ${bothRules}`);
