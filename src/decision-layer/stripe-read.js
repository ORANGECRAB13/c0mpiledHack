import Stripe from 'stripe';

// Stripe is the billing mirror seeded by scripts/stripe-seed.mjs. Salesforce
// holds the CRM view; Stripe holds the money. The join key is the
// external_customer_id carried in Stripe metadata (and encoded in the seeded
// email address, which is the only strongly-consistent lookup Stripe offers —
// the search index is eventually consistent and unusable right after a seed).

let client = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY);
}

function stripe() {
  if (client) return client;
  const key = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not configured. Set STRIPE_API_KEY.');
  client = new Stripe(key, { maxNetworkRetries: 2 });
  return client;
}

const dollars = (cents) => Math.round(Number(cents || 0)) / 100;
const iso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/** Mirrors the address scheme scripts/stripe-seed.mjs writes. */
const emailFor = (externalCustomerId) => `customer.${externalCustomerId}@vocare-demo.invalid`;

/**
 * Returns { customer, denied }. `denied` is true ONLY when every lookup we
 * attempted completed successfully and none matched — a positive denial. If a
 * lookup errored we do not know whether the customer exists, and saying "no
 * such customer" on that basis would be a false claim made during an outage.
 */
async function findCustomer(externalCustomerId) {
  const byEmail = await stripe().customers.list({ email: emailFor(externalCustomerId), limit: 1 });
  if (byEmail.data.length) return { customer: byEmail.data[0], denied: false };
  // Fall back to the search index for customers written by something other
  // than our seeder (different email scheme, same metadata contract).
  try {
    const found = await stripe().customers.search({
      query: `metadata['external_customer_id']:'${String(externalCustomerId).replaceAll("'", "")}'`,
      limit: 1,
    });
    // Both the email lookup and the search completed and matched nothing.
    return { customer: found.data[0] || null, denied: !found.data[0] };
  } catch (error) {
    // The search could not be performed. The email lookup's miss is not enough
    // on its own to deny the customer, so this is unknown, not absent.
    return { customer: null, denied: false, lookupError: error.message };
  }
}

/**
 * Per-month totals from real invoice history, oldest first — the debt sparkline.
 *
 * The billing period comes from the invoice itself, not from `created`: the
 * seeder writes a whole book in one pass, so every invoice shares a creation
 * timestamp and bucketing by it collapses the series to a single point. The
 * line description carries the real cycle ("Electricity usage — 2026-05") and
 * the arrears invoice carries `overdue_since`, so both name their true period.
 */
function periodOf(invoice) {
  const described = /(\d{4}-\d{2})/.exec(invoice.lines?.data?.[0]?.description || invoice.description || '');
  if (described) return described[1];
  if (invoice.metadata?.overdue_since) return String(invoice.metadata.overdue_since).slice(0, 7);
  return invoice.created ? new Date(invoice.created * 1000).toISOString().slice(0, 7) : null;
}

function trendFrom(invoices, points = 6) {
  const buckets = new Map();
  for (const invoice of invoices) {
    const month = periodOf(invoice);
    if (!month) continue;
    buckets.set(month, (buckets.get(month) || 0) + Number(invoice.total || 0));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-points)
    .map(([month, cents]) => ({ month, amount: dollars(cents) }));
}

/**
 * The billing half of a customer profile. Never throws for "not configured" or
 * "not found" — those are reported as `available: false` plus a reason, so the
 * UI can say what is missing instead of rendering a fabricated zero.
 */
export async function readStripeBilling(externalCustomerId) {
  if (!stripeConfigured()) {
    return { available: false, denied: false, error: 'Stripe is not configured (STRIPE_API_KEY unset).', invoices: [], trend: [] };
  }
  try {
    const { customer, denied, lookupError } = await findCustomer(externalCustomerId);
    if (!customer) {
      return denied
        ? { available: false, denied: true, error: `No Stripe customer mirrors ${externalCustomerId}.`, invoices: [], trend: [] }
        : { available: false, denied: false, error: `Could not determine whether ${externalCustomerId} has a Stripe mirror${lookupError ? `: ${lookupError}` : '.'}`, invoices: [], trend: [] };
    }
    const list = await stripe().invoices.list({ customer: customer.id, limit: 100 });
    const raw = list.data || [];

    const invoices = raw
      .slice()
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, 12)
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number || null,
        status: invoice.status,
        amount: dollars(invoice.total),
        currency: invoice.currency,
        description: invoice.lines?.data?.[0]?.description || invoice.description || null,
        cycle: invoice.metadata?.cycle || null,
        createdAt: iso(invoice.created),
        dueAt: iso(invoice.due_date),
        paidAt: iso(invoice.status_transitions?.paid_at),
        overdueDays: invoice.metadata?.overdue_days ? Number(invoice.metadata.overdue_days) : null,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      }));

    const open = raw.filter((invoice) => invoice.status === 'open' || invoice.status === 'uncollectible');
    const paid = raw.filter((invoice) => invoice.status === 'paid');
    const overdue = open
      .map((invoice) => Number(invoice.metadata?.overdue_days || 0))
      .filter((days) => days > 0);
    const paidAtTimes = paid.map((invoice) => invoice.status_transitions?.paid_at).filter(Boolean);

    return {
      available: true,
      error: null,
      customerId: customer.id,
      email: customer.email || null,
      currency: (raw[0]?.currency || customer.currency || process.env.STRIPE_CURRENCY || 'aud').toLowerCase(),
      accountBalance: dollars(customer.balance),
      openInvoiceCount: open.length,
      openAmount: dollars(open.reduce((total, invoice) => total + Number(invoice.amount_due ?? invoice.total ?? 0), 0)),
      paidInvoiceCount: paid.length,
      paidAmount: dollars(paid.reduce((total, invoice) => total + Number(invoice.total || 0), 0)),
      oldestOverdueDays: overdue.length ? Math.max(...overdue) : null,
      lastPaymentAt: paidAtTimes.length ? iso(Math.max(...paidAtTimes)) : null,
      invoices,
      trend: trendFrom(raw),
    };
  } catch (error) {
    // Transport/auth/etc — we never learned whether this customer exists.
    return { available: false, denied: false, error: error.message, invoices: [], trend: [] };
  }
}
