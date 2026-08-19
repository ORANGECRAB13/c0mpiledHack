import React, { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';

/* ============================================================================
 * CustomerProfile — the detail view opened from Monitoring.
 * Owner: MonitoringUX. Path registered with Coordinator.
 *
 * Every value rendered here is attributable to a system of record, and each
 * block carries a provenance badge saying which one:
 *   · Salesforce CRM   → profile.salesforce   (.cp-sys-sf)
 *   · Stripe billing   → profile.stripe       (.cp-sys-stripe)
 *   · Decision ledger  → reconciliation       (.cp-sys-ledger)
 *
 * Contract published by DataWiring:
 *   GET /api/decision-layer/customers/:externalCustomerId/profile
 *   → { ok: true, profile: { externalCustomerId, name, jurisdiction,
 *        salesforce: { available, error, ... },
 *        stripe:     { available, error, ..., invoices[], trend[] },
 *        reconciliation: { salesforceArrears, stripeOpenAmount, delta, matched } } }
 *
 * All money fields are DOLLARS (numbers), not cents. Currency AUD.
 *
 * THERE ARE NO PLACEHOLDER OR FALLBACK NUMBERS IN THIS FILE. A field the source
 * system did not return renders via .cp-field-missing as an explicit
 * "Not recorded in <system>". A panel whose `available` is false renders
 * .cp-state-error with the upstream message. Nothing is ever invented.
 * ========================================================================== */

/* DataWiring shipped decisionLayerApi.loadCustomerProfile(); it returns the
 * `profile` object directly and owns the URL, so we never build one here.
 *
 * `reference` MUST be the External_Customer_Id__c ("1002"), never the
 * MON-prefixed display id the table shows. A wrong reference does not 404 —
 * the server answers 200 with available:false, which is why nothing in this
 * component infers success from HTTP status; every section branches on its
 * own `available` flag instead. */

/* -------------------------------------------------------------------------- */


const NOT_SET = Symbol('not-set');
const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/** Money arrives as dollars (numbers) per the contract. Never coerce null→0. */
function money(dollars, currency) {
  if (typeof dollars !== 'number' || Number.isNaN(dollars)) return NOT_SET;
  if (!currency || currency.toUpperCase() === 'AUD') return AUD.format(dollars);
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(dollars);
}

function count(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? String(value) : NOT_SET;
}

function days(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? `${value} days` : NOT_SET;
}

function isoDate(value) {
  if (!value) return NOT_SET;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function plain(value) {
  if (value === null || value === undefined || value === '') return NOT_SET;
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function Field({ label, value, system, emphasis }) {
  const missing = value === NOT_SET || value === undefined || value === null;
  return (
    <div className={`cp-field ${emphasis ? 'cp-field-hot' : ''}`}>
      <div className="cp-field-k">{label}</div>
      <div className={`cp-field-v ${missing ? 'cp-field-missing' : ''}`}>
        {missing ? `Not recorded in ${system}` : value}
      </div>
    </div>
  );
}

/** Sparkline over stripe.trend — real per-month invoice totals, never synthetic.
 *  Guarded: fewer than two points has no line to draw. */
function TrendLine({ trend }) {
  const points = (trend || []).filter((item) => typeof item?.amount === 'number');
  if (points.length < 2) return <div className="cp-trend-empty">Not enough billing history to plot</div>;
  const values = points.map((item) => item.amount);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const path = points.map((item, index) => `${(index / (points.length - 1)) * 180},${34 - ((item.amount - min) / span) * 28}`).join(' ');
  const rising = values[values.length - 1] > values[0];
  return (
    <div className="cp-trend">
      <svg width="180" height="38" viewBox="0 0 180 38" role="img" aria-label="Invoiced amount by month">
        <polyline points={path} fill="none" stroke={rising ? '#D64545' : '#3F9C5C'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="cp-trend-axis"><span>{points[0].month}</span><span>{points[points.length - 1].month}</span></div>
    </div>
  );
}

/* An em-dash in a MONEY column can be misread as zero, so absent amounts say so
 * in words. Dates are unambiguous with a dash and keep it. */
const NO_AMOUNT = <span className="cp-field-missing">not recorded</span>;

const INVOICE_CHIP = { paid: 'ready', open: 'amber', draft: 'wait', uncollectible: 'issue', void: 'wait' };

export default function CustomerProfile({ account, onClose, onOpenCase }) {
  const [state, setState] = useState({ loading: true, error: null, profile: null });

  // Accept either the External_Customer_Id__c or the ledger customer id.
  const lookupId = account?.externalCustomerId || account?.caseId || null;

  useEffect(() => {
    if (!account || !lookupId) {
      setState({ loading: false, error: account ? 'No customer identifier on this record — cannot reconcile Salesforce or Stripe.' : null, profile: null });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, error: null, profile: null });
    decisionLayerApi.loadCustomerProfile(lookupId)
      .then((profile) => { if (!cancelled) setState({ loading: false, error: null, profile }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: error.message, profile: null }); });
    return () => { cancelled = true; };
  }, [lookupId]);

  if (!account) return null;
  const { loading, error, profile } = state;
  const sf = profile?.salesforce || null;
  const stripe = profile?.stripe || null;
  const rec = profile?.reconciliation || null;
  const currency = stripe?.currency;

  return (
    <aside className="cp-panel" aria-label={`Customer profile for ${account.customer}`}>
      <div className="cp-head">
        <div>
          <div className="cp-eyebrow">Customer profile</div>
          <h2>{profile?.name || account.customer}</h2>
          <div className="cp-meta">
            {[profile?.externalCustomerId || account.externalCustomerId, profile?.jurisdiction, account.id].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="cp-head-actions">
          {account.caseId && <button className="text-button primary" onClick={() => onOpenCase?.(account.caseId)}>Open case</button>}
          <button className="cp-close" onClick={onClose} aria-label="Close profile"><Icon name="x" size={13} /></button>
        </div>
      </div>

      {loading && <div className="cp-state">Reading Salesforce and Stripe…</div>}
      {!loading && error && <div className="cp-state cp-state-error"><Icon name="warn" size={13} /> Profile unavailable — {error}</div>}

      {!loading && profile && (
        <>
          {rec && (() => {
            /* matched is THREE-STATE per profile.js: true, false, or null when
             * either side is unavailable and no comparison is possible. Null
             * must not read as "disagree" — an unknown is not a finding. */
            const tone = rec.matched === null ? 'cp-recon-unknown' : rec.matched ? 'cp-recon-ok' : 'cp-recon-off';
            const title = rec.matched === null
              ? 'Cannot reconcile CRM against billing'
              : rec.matched ? 'CRM and billing agree' : 'CRM and billing disagree';
            const sfAmount = money(rec.salesforceArrears, 'AUD');
            const stripeAmount = money(rec.stripeOpenAmount, currency);
            return (
              <div className={`cp-recon ${tone}`}>
                <Icon name={rec.matched === null ? 'help' : rec.matched ? 'check' : 'warn'} size={14} />
                <div>
                  <b>{title}</b>
                  <small>
                    {rec.matched === null
                      ? 'One of the two systems did not return a figure, so no comparison is shown.'
                      : <>
                          Salesforce arrears {sfAmount === NOT_SET ? NO_AMOUNT : sfAmount}
                          {' vs '}Stripe open {stripeAmount === NOT_SET ? NO_AMOUNT : stripeAmount}
                          {typeof rec.delta === 'number' ? ` · delta ${AUD.format(rec.delta)}` : ''}
                        </>}
                  </small>
                </div>
              </div>
            );
          })()}

          <section className="cp-block">
            <div className="cp-block-head">
              <span className="cp-sys cp-sys-sf">Salesforce</span>
              <span className="cp-block-title">Account &amp; hardship</span>
              {sf?.lastModified && <span className="cp-stamp">as at {isoDate(sf.lastModified)}</span>}
            </div>
            {sf && sf.available === false && (
              <div className="cp-state cp-state-error"><Icon name="warn" size={13} /> Salesforce unavailable — {sf.error || 'no detail returned'}</div>
            )}
            {sf && sf.available !== false && (
              <div className="cp-grid">
                <Field label="Account name" value={plain(profile.name)} system="Salesforce" />
                <Field label="External customer id" value={plain(profile.externalCustomerId)} system="Salesforce" />
                <Field label="Salesforce account id" value={plain(sf.accountId)} system="Salesforce" />
                <Field label="Jurisdiction" value={plain(profile.jurisdiction)} system="Salesforce" />
                <Field label="Current plan" value={plain(sf.currentPlan)} system="Salesforce" />
                <Field label="Hardship status" value={plain(sf.hardshipStatus)} system="Salesforce" emphasis />
                <Field label="CRM status (raw)" value={plain(sf.hardshipStatusRaw)} system="Salesforce" />
                <Field label="Hardship entered" value={isoDate(sf.hardshipEnteredAt)} system="Salesforce" />
                <Field label="Hardship review due" value={isoDate(sf.hardshipReviewDueAt)} system="Salesforce" emphasis />
                <Field label="Arrears balance" value={money(sf.arrearsBalance, 'AUD')} system="Salesforce" emphasis />
                <Field label="Oldest debt" value={days(sf.oldestDebtDays)} system="Salesforce" />
                <Field label="Financial stress signals" value={plain(sf.financialStressSignals)} system="Salesforce" />
                <Field label="Missed payments (90d)" value={count(sf.missedPayments90d)} system="Salesforce" />
                <Field label="Partial payments (90d)" value={count(sf.partialPayments90d)} system="Salesforce" />
                <Field label="Best-offer opt out" value={plain(sf.bestOfferOptOut)} system="Salesforce" />
                <Field label="Sensitive customer" value={plain(sf.sensitiveCustomer)} system="Salesforce" emphasis />
              </div>
            )}
          </section>

          <section className="cp-block">
            <div className="cp-block-head">
              <span className="cp-sys cp-sys-stripe">Stripe</span>
              <span className="cp-block-title">Billing &amp; payment history</span>
              {stripe?.customerId && <span className="cp-stamp">{stripe.customerId}</span>}
            </div>

            {stripe && stripe.available === false && (
              <div className="cp-state cp-state-error">
                <Icon name="warn" size={13} />
                Billing data unavailable — {stripe.error || 'no detail returned'}. No figures are shown rather than estimated ones.
              </div>
            )}

            {stripe && stripe.available !== false && (
              <>
                <div className="cp-grid">
                  <Field label="Stripe customer" value={plain(stripe.customerId)} system="Stripe" />
                  <Field label="Billing email" value={plain(stripe.email)} system="Stripe" />
                  <Field label="Account balance" value={money(stripe.accountBalance, currency)} system="Stripe" />
                  <Field label="Open invoices" value={count(stripe.openInvoiceCount)} system="Stripe" />
                  <Field label="Open amount" value={money(stripe.openAmount, currency)} system="Stripe" emphasis />
                  <Field label="Paid invoices" value={count(stripe.paidInvoiceCount)} system="Stripe" />
                  <Field label="Paid amount" value={money(stripe.paidAmount, currency)} system="Stripe" />
                  <Field label="Oldest overdue" value={stripe.oldestOverdueDays === null ? 'Nothing overdue' : days(stripe.oldestOverdueDays)} system="Stripe" emphasis />
                  <Field label="Last payment" value={isoDate(stripe.lastPaymentAt)} system="Stripe" />
                </div>

                <div className="cp-trend-wrap">
                  <div className="cp-field-k">Invoiced by month</div>
                  <TrendLine trend={stripe.trend} />
                </div>

                <div className="cp-invoices">
                  <div className="cp-inv-head"><span>Invoice</span><span>Issued</span><span>Due</span><span>Paid</span><span>Amount</span><span>Status</span></div>
                  {(stripe.invoices || []).map((invoice) => (
                    <div className="cp-inv-row" key={invoice.id}>
                      <span className="cp-inv-id">
                        {invoice.hostedInvoiceUrl
                          ? <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">{invoice.number || invoice.id}</a>
                          : (invoice.number || invoice.id)}
                        {invoice.cycle && <small className="cp-inv-cycle">{invoice.cycle}</small>}
                      </span>
                      <span>{isoDate(invoice.createdAt) === NOT_SET ? '—' : isoDate(invoice.createdAt)}</span>
                      <span>{isoDate(invoice.dueAt) === NOT_SET ? '—' : isoDate(invoice.dueAt)}</span>
                      <span>{isoDate(invoice.paidAt) === NOT_SET ? '—' : isoDate(invoice.paidAt)}</span>
                      <span>{money(invoice.amount, invoice.currency || currency) === NOT_SET ? NO_AMOUNT : money(invoice.amount, invoice.currency || currency)}</span>
                      <span>
                        <span className={`schip ${INVOICE_CHIP[invoice.status] || 'wait'}`}>{invoice.status || 'unknown'}</span>
                        {typeof invoice.overdueDays === 'number' && invoice.overdueDays > 0 && <small className="cp-inv-overdue">{invoice.overdueDays}d overdue</small>}
                      </span>
                    </div>
                  ))}
                  {!(stripe.invoices || []).length && <div className="cp-inv-empty">No invoices returned by Stripe for this customer.</div>}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
