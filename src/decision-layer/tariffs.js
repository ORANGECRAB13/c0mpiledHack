// Tariff table + the pure arithmetic that turns real billing history into a
// modelled plan comparison.
//
// WHY A DECLARED DATASET IS ACCEPTABLE HERE, AND ONLY HERE
// -------------------------------------------------------
// We hold real money for every customer (Stripe invoices) but no market price
// list. A comparison needs both. The declared table is the price side; it is
// authored, not observed, and `data/tariffs.json` says so in its provenance
// block. The rule that keeps this honest is that the provenance travels: every
// offer this module produces carries `source: 'TARIFF_TABLE_V1'` plus the
// provenance and the derivation basis, so a reader of the evidence record can
// always tell a modelled saving from a quoted one.
//
// Nothing in this file reads the clock, the network or the DB.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TABLE = JSON.parse(readFileSync(fileURLToPath(new URL('./data/tariffs.json', import.meta.url)), 'utf8'));

export const TARIFF_TABLE = TABLE;
export const TARIFF_VERSION = TABLE.version;
export const TARIFF_PROVENANCE = TABLE.provenance;
export const DAYS_PER_MONTH = TABLE.assumptions.daysPerMonth;
export const DAYS_PER_YEAR = TABLE.assumptions.daysPerYear;

const HARDSHIP_STATUSES = ['TAILORED_ASSISTANCE', 'PAYMENT_DIFFICULTY'];

/** Minimum distinct paid billing months before a spend baseline is honest. */
export const MIN_BILLING_MONTHS = Number(process.env.PRICING_MIN_BILLING_MONTHS || 3);

const round2 = (n) => Math.round(n * 100) / 100;

export function planFor(planId) {
  return TABLE.plans.find((p) => p.planId === planId) || null;
}

export const isHardshipPlan = (planId) => Boolean(planFor(planId)?.eligibility?.hardshipOnly);
export const inHardship = (state) => HARDSHIP_STATUSES.includes(state?.hardshipStatus);

/**
 * The billing period a paid invoice belongs to. Same rule stripe-read.js uses:
 * the seeded book shares one `created` timestamp, so the line description
 * ("Electricity usage — 2026-05") is the only truthful period marker.
 */
export function invoiceMonth(invoice) {
  const described = /(\d{4}-\d{2})/.exec(invoice?.description || '');
  if (described) return described[1];
  return invoice?.createdAt ? String(invoice.createdAt).slice(0, 7) : null;
}

/**
 * Average monthly billed amount from PAID invoices only.
 *
 * Paid, not open: an open arrears invoice is a debt, not a month of
 * consumption, and counting it would inflate the baseline by the whole
 * arrears figure. Distinct months are averaged so a re-issued invoice inside
 * one cycle does not double-count the month.
 */
export function monthlySpendFrom(billing) {
  if (!billing || billing.available !== true) {
    return { ok: false, reason: `Billing history unavailable: ${billing?.error || 'no Stripe billing in this snapshot'}.` };
  }
  const buckets = new Map();
  for (const invoice of billing.invoices || []) {
    if (invoice.status !== 'paid') continue;
    const month = invoiceMonth(invoice);
    const amount = Number(invoice.amount);
    if (!month || !Number.isFinite(amount) || amount <= 0) continue;
    buckets.set(month, (buckets.get(month) || 0) + amount);
  }
  const months = [...buckets.keys()].sort();
  if (months.length < MIN_BILLING_MONTHS) {
    return {
      ok: false,
      months,
      reason: `Only ${months.length} distinct paid billing month(s) on record; ${MIN_BILLING_MONTHS} are required to derive a spend baseline.`,
    };
  }
  const total = months.reduce((sum, m) => sum + buckets.get(m), 0);
  return {
    ok: true,
    months,
    monthCount: months.length,
    paidTotal: round2(total),
    monthlySpend: round2(total / months.length),
    annualSpend: round2((total / months.length) * 12),
  };
}

/**
 * Back out annual consumption (kWh) from annual spend on the plan the customer
 * is actually on. Explicit assumption, recorded in every basis we emit: the
 * paid bills were priced on the CURRENT plan for their whole period. If the
 * customer switched mid-history the kWh figure is wrong, and we have no
 * plan-change history to detect that.
 */
export function annualKwhFrom(annualSpend, plan) {
  const supplyYear = (plan.dailySupplyCents * DAYS_PER_YEAR) / 100;
  const rate = (plan.usageRateCentsPerKwh * (1 - plan.discountFraction)) / 100;
  const usageSpend = annualSpend - supplyYear;
  if (!(rate > 0)) return { ok: false, reason: `Plan ${plan.planId} has a non-positive effective usage rate.` };
  if (usageSpend <= 0) {
    return {
      ok: false,
      reason: `Annual spend of $${round2(annualSpend)} does not exceed the $${round2(supplyYear)} annual supply charge of ${plan.planId}, so no consumption can be derived.`,
    };
  }
  return { ok: true, annualKwh: Math.round(usageSpend / rate), supplyYear: round2(supplyYear), effectiveRate: round2(rate * 100) };
}

/** What this plan would cost that same annual consumption. */
export function annualCostOf(plan, annualKwh) {
  const supply = (plan.dailySupplyCents * DAYS_PER_YEAR) / 100;
  const usage = (annualKwh * plan.usageRateCentsPerKwh * (1 - plan.discountFraction)) / 100;
  return round2(supply + usage);
}

/**
 * Which plans may be offered to this customer.
 *
 * - never the plan they are already on;
 * - never a solar plan without a solar marker (the snapshot has none, so a
 *   solar customer can stay on Solar Saver but nobody is moved onto it);
 * - hardship plans only for customers in hardship;
 * - a customer ALREADY on a hardship plan is only ever compared against other
 *   hardship plans. Moving someone off tailored assistance onto a nominally
 *   cheaper commercial plan would strip the assistance protections that plan
 *   carries, so the cheaper number is not the whole picture and the comparison
 *   is not ours to make automatically.
 */
export function eligiblePlans(state) {
  const current = state?.currentPlan;
  const hardship = inHardship(state);
  const onHardshipPlan = isHardshipPlan(current);
  const hasSolar = state?.solar === true || state?.hasSolar === true;
  const excluded = [];
  const plans = TABLE.plans.filter((plan) => {
    const e = plan.eligibility || {};
    if (plan.planId === current) { excluded.push({ planId: plan.planId, reason: 'CURRENT_PLAN' }); return false; }
    if (e.requiresSolar && !hasSolar) { excluded.push({ planId: plan.planId, reason: 'NO_SOLAR_MARKER_IN_SNAPSHOT' }); return false; }
    if (e.hardshipOnly && !hardship) { excluded.push({ planId: plan.planId, reason: 'HARDSHIP_ONLY_PLAN' }); return false; }
    if (onHardshipPlan && !e.hardshipOnly) { excluded.push({ planId: plan.planId, reason: 'WOULD_MOVE_OFF_HARDSHIP_PLAN' }); return false; }
    return true;
  });
  return { plans, excluded, onHardshipPlan, hardship };
}

export { round2 };
