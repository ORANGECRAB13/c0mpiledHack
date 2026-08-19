#!/usr/bin/env node
/**
 * Mirror the compliance customer book into Stripe as the billing platform.
 *
 * Salesforce holds the CRM view (who the customer is, hardship state); Stripe
 * holds the money: an open invoice standing in for the arrears, dated to match
 * the debt age, plus a short paid history so payment behaviour is real rather
 * than a number in a field. The two systems are joined by external_customer_id,
 * which is what lets the compliance workspace reconcile them.
 *
 *   STRIPE_API_KEY=sk_test_... node scripts/stripe-seed.mjs [--limit 150]
 *
 * Test keys only. The script refuses a live key: this writes hundreds of
 * customers and invoices, which has no business touching real billing data.
 */
import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config();
config({ path: '.env.local', override: true });

const KEY = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY || '';
if (!KEY) {
  console.error('No STRIPE_API_KEY (or STRIPE_SECRET_KEY) found in .env / .env.local.');
  process.exit(1);
}
if (KEY.startsWith('sk_live') || KEY.startsWith('rk_live')) {
  console.error('That is a LIVE Stripe key. This script seeds mock customers and invoices and');
  console.error('will not run against live billing data. Use a test key (sk_test_...).');
  process.exit(1);
}

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Infinity;
const CURRENCY = process.env.STRIPE_CURRENCY || 'aud';
const CONCURRENCY = 8;

const stripe = new Stripe(KEY, { maxNetworkRetries: 2 });

const TODAY = new Date('2026-08-19T00:00:00Z');
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000);
const cents = (dollars) => Math.round(dollars * 100);

/** Deterministic address so re-runs find the same customer (email lookup is
 *  strongly consistent, unlike the search index). .invalid never resolves. */
const emailFor = (id) => `customer.${id}@vocare-demo.invalid`;

const metadataFor = (c) => ({
  external_customer_id: c.customer_id,
  arrears_balance: String(c.account.balance),
  oldest_debt_days: String(c.account.oldest_debt_days),
  current_plan: c.account.current_plan,
  missed_payments_90d: String(c.payments.missed_payments_90d),
  partial_payments_90d: String(c.payments.partial_payments_90d),
  hardship_status: c.hardship.status,
  hardship_entered_at: c.hardship.entered_at ?? '',
  hardship_review_due_at: c.hardship.review_due_at ?? '',
  financial_stress_signal: String(c.crm.financial_stress_signal),
  financial_stress_reason: c.crm.reason ?? '',
  best_offer_opt_out: String(c.preferences.best_offer_opt_out),
  source_system: 'vocare-compliance-demo',
});

async function upsertCustomer(c) {
  const email = emailFor(c.customer_id);
  const payload = {
    name: c.name,
    email,
    description: `${c.account.current_plan} · ${c.hardship.status === 'none' ? 'no hardship' : c.hardship.status}`,
    metadata: metadataFor(c),
    preferred_locales: ['en-AU'],
  };

  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length) {
    return { customer: await stripe.customers.update(existing.data[0].id, payload), created: false };
  }
  return { customer: await stripe.customers.create(payload), created: true };
}

/** One open invoice carrying the arrears, plus a short paid history. */
async function seedInvoices(customer, c) {
  const existing = await stripe.invoices.list({ customer: customer.id, limit: 1 });
  if (existing.data.length) return 0; // already has billing history

  let written = 0;
  const monthly = Math.max(40, Math.round((c.account.balance || 120) / 3));

  // Items must name their invoice explicitly: pending invoice items are no
  // longer swept onto new invoices by default, which silently yields a $0
  // invoice that auto-pays the moment it is finalized.
  // Stripe refuses a due_date in the past, so an arrears invoice cannot be
  // literally backdated without test clocks. It is instead due immediately and
  // carries the real age in metadata and its description, which is what the
  // compliance workspace reads.
  const writeInvoice = async ({ amount, description, cycle, dueInDays = 21, overdueDays, settle }) => {
    const inv = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      auto_advance: false,
      days_until_due: dueInDays,
      metadata: {
        external_customer_id: c.customer_id,
        cycle,
        ...(overdueDays === undefined ? {} : { overdue_days: String(overdueDays), overdue_since: daysAgo(overdueDays).toISOString().slice(0, 10) }),
      },
    });
    await stripe.invoiceItems.create({
      customer: customer.id, invoice: inv.id, currency: CURRENCY, amount: cents(amount), description,
    });
    const finalized = await stripe.invoices.finalizeInvoice(inv.id);
    if (finalized.total === 0) throw new Error(`invoice ${inv.id} finalized empty`);
    if (settle) await stripe.invoices.pay(inv.id, { paid_out_of_band: true });
    written++;
  };

  // Paid history: three settled monthly bills before the trouble started.
  for (let i = 5; i >= 3; i--) {
    await writeInvoice({
      amount: monthly,
      description: `Electricity usage — ${daysAgo(i * 30).toISOString().slice(0, 7)}`,
      cycle: 'historical',
      settle: true,
    });
  }

  // The arrears themselves: one open invoice, due as far back as the debt age.
  if (c.account.balance > 0) {
    await writeInvoice({
      amount: c.account.balance,
      description: `Outstanding balance — ${c.account.oldest_debt_days} days overdue`,
      cycle: 'arrears',
      dueInDays: 0,
      overdueDays: c.account.oldest_debt_days,
      settle: false,
    });
  }
  return written;
}

/** Simple bounded-concurrency map — keeps us well inside Stripe's rate limits. */
async function pooled(items, worker, size) {
  const results = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: error.message, id: items[index].customer_id };
      }
    }
  }));
  return results;
}

const main = async () => {
  const book = JSON.parse(readFileSync('salesforce/data/customers.json', 'utf8')).slice(0, LIMIT);
  console.log(`Seeding ${book.length} customers into Stripe (${CURRENCY.toUpperCase()}, test mode)…`);

  let created = 0, updated = 0, invoices = 0;
  const failures = [];

  const results = await pooled(book, async (c) => {
    const { customer, created: isNew } = await upsertCustomer(c);
    const n = await seedInvoices(customer, c);
    return { isNew, n };
  }, CONCURRENCY);

  for (const r of results) {
    if (!r) continue;
    if (r.error) { failures.push(r); continue; }
    r.isNew ? created++ : updated++;
    invoices += r.n;
  }

  console.log(`customers created: ${created}`);
  console.log(`customers updated: ${updated}`);
  console.log(`invoices written:  ${invoices}`);
  if (failures.length) {
    console.log(`failures: ${failures.length}`);
    for (const f of failures.slice(0, 5)) console.log(` - ${f.id}: ${f.error}`);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
