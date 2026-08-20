import React from 'react';
import { Icon } from '../icons.jsx';
import {
  Disclosure, FieldRow, Fields, Section, StateNote,
  NOT_SET, aud, count, days, isoDate, money, plain,
} from './ui.jsx';

/* ============================================================================
 * SystemsOfRecord — the ONE rendering of Salesforce CRM + Stripe billing.
 *
 * P6. Before this file, CustomerProfile and EvidenceOverlay each drew the same
 * `profile` payload with different field sets, different emphasis rules and
 * different missing-state markup. Both now render this component, so the two
 * systems are described identically wherever they appear.
 *
 * Shape (P1/P2/P3):
 *   1. Reconciliation verdict — the hero. Do the two systems agree?
 *   2. Decision inputs — the seven values that move a regulatory threshold,
 *      merged across both systems and labelled with their source.
 *   3. Everything else, collapsed, with counts.
 *
 * P7: `available === false` and its upstream error render ALWAYS, above the
 * disclosures, never inside one. Absent values go through FieldRow, which owns
 * the "Not recorded in <system>" state, so no zero is ever invented here.
 *
 * Presentation only — it reads the same `profile` object the API already
 * returned to its parent and issues no requests of its own.
 * ========================================================================== */

const NA = <span className="u-na">not recorded</span>;

function amount(value, currency) {
  const formatted = money(value, currency);
  return formatted === NOT_SET ? NA : formatted;
}

/** Real per-month invoice totals from stripe.trend. Never synthetic. */
function TrendLine({ trend }) {
  const points = (trend || []).filter((item) => typeof item?.amount === 'number');
  if (points.length < 2) return <div className="u-trend-empty">Not enough billing history to plot</div>;
  const values = points.map((item) => item.amount);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const path = points
    .map((item, index) => `${(index / (points.length - 1)) * 180},${34 - ((item.amount - min) / span) * 28}`)
    .join(' ');
  const rising = values[values.length - 1] > values[0];
  return (
    <div className="u-trend">
      <svg width="180" height="38" viewBox="0 0 180 38" role="img" aria-label="Invoiced amount by month">
        <polyline points={path} fill="none" stroke={rising ? 'var(--red)' : 'var(--green)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="u-trend-axis"><span>{points[0].month}</span><span>{points[points.length - 1].month}</span></div>
    </div>
  );
}

/** The hero. `matched` is three-state; null is an unknown, not a finding. */
function Reconciliation({ rec, currency }) {
  const state = rec.matched === null ? 'unknown' : rec.matched ? 'ok' : 'off';
  const title = state === 'unknown'
    ? 'Cannot reconcile CRM against billing'
    : state === 'ok' ? 'CRM and billing agree' : 'CRM and billing disagree — compliance finding';
  const detail = state === 'unknown'
    ? 'One of the two systems did not return a figure, so no comparison is possible.'
    : state === 'ok'
      ? 'The arrears figure the CRM holds matches the amount Stripe has open.'
      : 'The arrears figure driving the regulatory assessment does not match the billed amount. Resolve before acting on either number.';
  return (
    <div className={`u-recon u-recon-${state}`}>
      <Icon name={state === 'unknown' ? 'help' : state === 'ok' ? 'check' : 'warn'} size={15} />
      <div>
        <b className="u-recon-t">{title}</b>
        <small className="u-recon-s">{detail}</small>
        <div className="u-recon-n">
          <span>Salesforce arrears <b>{amount(rec.salesforceArrears, 'AUD')}</b></span>
          <span>Stripe open <b>{amount(rec.stripeOpenAmount, currency)}</b></span>
          <span>Delta <b>{typeof rec.delta === 'number' ? aud(rec.delta) : NA}</b></span>
        </div>
      </div>
    </div>
  );
}

function Invoices({ invoices, currency }) {
  if (!invoices.length) {
    return <div className="u-inv"><div className="u-inv-empty">No invoices returned by Stripe for this customer.</div></div>;
  }
  return (
    <div className="u-inv">
      <div className="u-inv-row u-inv-h"><span>Invoice</span><span>Issued</span><span>Amount</span><span>Status</span></div>
      {invoices.map((invoice) => {
        const issued = isoDate(invoice.createdAt);
        const value = money(invoice.amount, invoice.currency || currency);
        return (
          <div className="u-inv-row" key={invoice.id}>
            <span>
              {invoice.hostedInvoiceUrl
                ? <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">{invoice.number || invoice.id}</a>
                : (invoice.number || invoice.id)}
              {(invoice.description || invoice.cycle) && <small>{invoice.description || invoice.cycle}</small>}
            </span>
            <span className={issued === NOT_SET ? 'u-inv-na' : ''}>{issued === NOT_SET ? 'not recorded' : issued}</span>
            <span className={value === NOT_SET ? 'u-inv-na' : ''}>{value === NOT_SET ? 'not recorded' : value}</span>
            <span>
              {invoice.status || 'unknown'}
              {typeof invoice.overdueDays === 'number' && invoice.overdueDays > 0 && <small>{invoice.overdueDays}d overdue</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SystemsOfRecord({ profile }) {
  if (!profile) return null;
  const sf = profile.salesforce || null;
  const stripe = profile.stripe || null;
  const rec = profile.reconciliation || null;
  const currency = stripe?.currency;
  const sfUp = sf && sf.available !== false;
  const stripeUp = stripe && stripe.available !== false;
  const invoices = stripe?.invoices || [];

  /* Both systems' decision-driving values, merged into one list. These are the
   * only fields visible without a click: each one moves a threshold that
   * carries a penalty. Seven — the P3 ceiling. */
  /* A hardship review that has come due is a live finding — cl 132C sets the
   * cadence and Schedule 1 attaches a penalty to missing it. A review dated in
   * the future is just a date. So it earns a decision slot only once it is
   * overdue, which keeps the common case inside the seven-field ceiling. */
  const reviewDue = sfUp ? sf.hardshipReviewDueAt : null;
  const reviewOverdue = Boolean(reviewDue) && new Date(reviewDue) < new Date(profile.asOf || Date.now());

  const decisionFields = [
    reviewOverdue && ['Hardship review overdue', isoDate(reviewDue), 'Salesforce'],
    sfUp && ['Arrears balance', money(sf.arrearsBalance, 'AUD'), 'Salesforce'],
    sfUp && ['Oldest debt', days(sf.oldestDebtDays), 'Salesforce'],
    sfUp && ['Hardship status', plain(sf.hardshipStatus), 'Salesforce'],
    sfUp && ['Best-offer opt out', plain(sf.bestOfferOptOut), 'Salesforce'],
    sfUp && ['Sensitive customer', plain(sf.sensitiveCustomer), 'Salesforce'],
    stripeUp && ['Open amount', money(stripe.openAmount, currency), 'Stripe'],
    stripeUp && ['Oldest overdue', stripe.oldestOverdueDays === null ? 'Nothing overdue' : days(stripe.oldestOverdueDays), 'Stripe'],
  ].filter(Boolean);

  const crmContext = sfUp ? [
    ['Salesforce account id', plain(sf.accountId)],
    ['External customer id', plain(profile.externalCustomerId)],
    ['Jurisdiction', plain(profile.jurisdiction)],
    ['Current plan', plain(sf.currentPlan)],
    ['CRM status (raw)', plain(sf.hardshipStatusRaw)],
    ['Hardship entered', isoDate(sf.hardshipEnteredAt)],
    // Promoted above when overdue; kept here as context while it is still future.
    ...(reviewOverdue ? [] : [['Hardship review due', isoDate(sf.hardshipReviewDueAt)]]),
    ['Financial stress signals', plain(sf.financialStressSignals)],
    ['Missed payments (90d)', count(sf.missedPayments90d)],
    ['Partial payments (90d)', count(sf.partialPayments90d)],
    ['CRM last modified', isoDate(sf.lastModified)],
  ] : [];

  const billingContext = stripeUp ? [
    ['Stripe customer', plain(stripe.customerId)],
    ['Billing email', plain(stripe.email)],
    ['Account balance', money(stripe.accountBalance, currency)],
    ['Open invoices', count(stripe.openInvoiceCount)],
    ['Paid invoices', count(stripe.paidInvoiceCount)],
    ['Paid amount', money(stripe.paidAmount, currency)],
    ['Last payment', isoDate(stripe.lastPaymentAt)],
  ] : [];

  return (
    <div className="u-sor">
      {rec && <Reconciliation rec={rec} currency={currency} />}

      {/* P7 — upstream failures stay visible and carry their message. */}
      {sf && sf.available === false && (
        <StateNote tone="error">
          Salesforce unavailable — {sf.error || 'no detail returned'}. No CRM figures are shown rather than estimated ones.
        </StateNote>
      )}
      {stripe && stripe.available === false && (
        <StateNote tone="error">
          Billing data unavailable — {stripe.error || 'no detail returned'}. No figures are shown rather than estimated ones.
        </StateNote>
      )}

      {decisionFields.length > 0 && (
        <Section title="Decision inputs" meta="values the policy reads to reach its finding">
          <Fields>
            {decisionFields.map(([label, value, system]) => (
              <FieldRow
                key={label}
                label={<>{label}<span className="u-src">{system === 'Salesforce' ? 'CRM' : 'billing'}</span></>}
                value={value}
                emphasis="decision"
                system={system}
              />
            ))}
          </Fields>
        </Section>
      )}

      {(crmContext.length > 0 || billingContext.length > 0) && (
        <Section>
          {crmContext.length > 0 && (
            <Disclosure label="Salesforce account context" count={crmContext.length}>
              <Fields>
                {crmContext.map(([label, value]) => (
                  <FieldRow key={label} label={label} value={value} emphasis="muted" system="Salesforce" />
                ))}
              </Fields>
            </Disclosure>
          )}
          {billingContext.length > 0 && (
            <Disclosure label="Stripe billing context" count={billingContext.length}>
              <Fields>
                {billingContext.map(([label, value]) => (
                  <FieldRow key={label} label={label} value={value} emphasis="muted" system="Stripe" />
                ))}
              </Fields>
            </Disclosure>
          )}
          {stripeUp && (
            <Disclosure label="Invoices &amp; payment history" count={invoices.length}>
              <Invoices invoices={invoices} currency={currency} />
              <TrendLine trend={stripe.trend} />
            </Disclosure>
          )}
        </Section>
      )}
    </div>
  );
}
