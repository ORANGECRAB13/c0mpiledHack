import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';
import '../styles/evidence.css';

/* ============================================================================
 * EvidenceOverlay — the replacement for the deleted compliance popup.
 *
 *   LEFT  : live audit trail of agent actions (GET /audit, scoped to this
 *           customer), including each decision's evidence reasons — rule,
 *           status, clause citation, civil-penalty provision — because that
 *           IS the agent's reasoning made auditable. Not a chat.
 *   RIGHT : the Salesforce CRM record and the Stripe billing account side by
 *           side, with the fields that actually drive the regulatory decision
 *           marked distinctly from the merely informative ones, and the
 *           CRM-vs-billing reconciliation rendered loudly when it disagrees.
 *
 * NO FABRICATION. This file follows CustomerProfile.jsx's discipline exactly:
 * a NOT_SET symbol, formatters that never coerce null→0, "Not recorded in
 * <system>" for absent fields, and an explicit unavailable state carrying the
 * upstream error whenever `available === false`. A blank is never rendered as
 * "$0" or as an em-dash that could be misread as zero.
 *
 * Props
 *   open        boolean   — mount/visibility. Required.
 *   reference   string    — External_Customer_Id__c ("1009") or the ledger
 *                           customer id. Drives BOTH panes: it is the profile
 *                           lookup key and the `customer_id` the audit feed is
 *                           filtered on. Required.
 *   name        string?   — display name shown while the profile loads.
 *   subtitle    string?   — free text under the name (e.g. case id · workflow).
 *   onClose     ()=>void  — close button, veil click and Escape all call this.
 *   pollMs      number?   — audit/profile refresh interval, default 15000.
 *                           Pass 0 to disable polling (refetch on open only).
 * ========================================================================== */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5182').replace(/\/$/, '');

/* decisionLayerApi has no single-endpoint audit reader — loadProduct() pulls
 * four endpoints at once, which is far too heavy to poll. We read /audit
 * directly, using the same base-URL convention that module owns. */
async function fetchAudit() {
  const response = await fetch(`${API_BASE}/api/decision-layer/audit`, { headers: { 'Content-Type': 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `Audit request failed (${response.status})`);
  return Array.isArray(body.records) ? body.records : [];
}

/* -- formatters: lifted from CustomerProfile.jsx, same contract ------------ */

const NOT_SET = Symbol('not-set');
const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

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
function stamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function plain(value) {
  if (value === null || value === undefined || value === '') return NOT_SET;
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** A field. `keyField` marks it as decision-driving rather than informative. */
function F({ label, value, system, keyField }) {
  const missing = value === NOT_SET || value === undefined || value === null;
  return (
    <div className={`ev-f ${keyField ? 'ev-f-key' : ''}`}>
      <div className="ev-f-k">{label}</div>
      <div className={`ev-f-v ${missing ? 'ev-f-missing' : ''}`}>
        {missing ? `Not recorded in ${system}` : value}
      </div>
    </div>
  );
}

/* -- audit presentation ---------------------------------------------------- */

/* Outcome → dot colour on the trail. ACTION_REQUIRED and blocked/sensitive
 * outcomes are the ones an officer must not scroll past. */
function outcomeTone(outcome) {
  const value = String(outcome || '').toUpperCase();
  if (value.includes('BLOCK') || value.includes('PROHIBIT')) return 'ev-tone-block';
  if (value.includes('ACTION')) return 'ev-tone-action';
  if (value.includes('NO_CHANGE') || value.includes('COMPLIANT') || value.includes('CLEAR')) return 'ev-tone-ok';
  return '';
}

/* Reason status → chip weight. Anything that triggered, blocked, or could not
 * be verified is loud; a clear/not-triggered check is quiet. */
function statusTone(status) {
  const value = String(status || '').toUpperCase();
  if (/TRIGGERED$|^BLOCK|BREACH|OVERDUE/.test(value) && value !== 'NOT_TRIGGERED') return 'hot';
  if (/INSUFFICIENT|UNVERIFIED|UNKNOWN|OPTED_OUT|SENSITIVE/.test(value)) return 'warm';
  if (/CLEAR|MET|OK|PASS|NO_LOWER_OFFER|NO_MONETARY_FLOOR|NOT_TRIGGERED/.test(value)) return 'cool';
  return '';
}

function humanOutcome(record) {
  const outcome = record.outcome ? String(record.outcome).replace(/_/g, ' ').toLowerCase() : null;
  return outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : 'Evaluation recorded';
}

function AuditEntry({ record }) {
  const reasons = Array.isArray(record.evidence) ? record.evidence : [];
  const when = stamp(record.decided_at || record.created_at);
  return (
    <article className={`ev-entry ${outcomeTone(record.outcome)}`}>
      <div className="ev-entry-top">
        <b>{humanOutcome(record)}</b>
        {record.action_type && <span className="ev-status">{record.action_type}</span>}
        {record.action_status && <span className={`ev-status ${statusTone(record.action_status)}`}>{record.action_status}</span>}
        {when && <span className="ev-when">{when}</span>}
      </div>

      <div className="ev-entry-sub">
        {record.decision_key ? <>Decision <code>{record.decision_key}</code>. </> : null}
        Evaluated under policy {record.policy_id || 'unknown policy'}
        {record.policy_version ? ` v${record.policy_version}` : ''}.
      </div>

      {(record.actor_id || record.verdict) && (
        <div className="ev-actor">
          {record.actor_id ? <>Actioned by <b>{record.actor_id}</b></> : <>No actor recorded</>}
          {record.verdict ? <> · verdict <b>{record.verdict}</b></> : null}
        </div>
      )}

      {record.override_reason && (
        <div className="ev-override"><b>Override reason:</b> {record.override_reason}</div>
      )}

      {reasons.length > 0 && (
        <div className="ev-reasons">
          {reasons.map((reason, index) => (
            <div className="ev-reason" key={`${record.id}-${reason.rule || index}`}>
              <span className={`ev-status ${statusTone(reason.status)}`}>{reason.status || 'NO STATUS'}</span>
              <div className="ev-reason-main">
                <b>{reason.rule || 'Unnamed rule'}</b>
                {reason.explanation && <p>{reason.explanation}</p>}
                {reason.citation && <span className="ev-cite">{reason.citation}</span>}
                {reason.penaltyProvision && <span className="ev-penalty">civil penalty · {reason.penaltyProvision}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {record.snapshot_hash && (
        <div className="ev-hash">
          <em>snapshot</em><span>{record.snapshot_hash}</span>
        </div>
      )}
    </article>
  );
}

/* -------------------------------------------------------------------------- */

export default function EvidenceOverlay({ open, reference, name, subtitle, onClose, pollMs = 15000 }) {
  const [profile, setProfile] = useState({ loading: true, error: null, data: null });
  const [audit, setAudit] = useState({ loading: true, error: null, records: [] });
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState(null);
  const alive = useRef(true);

  const load = useCallback(async (background) => {
    if (!reference) return;
    if (!background) {
      setProfile({ loading: true, error: null, data: null });
      setAudit({ loading: true, error: null, records: [] });
    }
    setBusy(true);
    const [profileResult, auditResult] = await Promise.allSettled([
      decisionLayerApi.loadCustomerProfile(reference),
      fetchAudit(),
    ]);
    if (!alive.current) return;
    setProfile(profileResult.status === 'fulfilled'
      ? { loading: false, error: null, data: profileResult.value }
      : { loading: false, error: profileResult.reason?.message || 'profile request failed', data: null });
    setAudit(auditResult.status === 'fulfilled'
      ? { loading: false, error: null, records: auditResult.value }
      : { loading: false, error: auditResult.reason?.message || 'audit request failed', records: [] });
    setLastAt(new Date());
    setBusy(false);
  }, [reference]);

  useEffect(() => {
    if (!open) return undefined;
    alive.current = true;
    load(false);
    /* "Live" is a real refetch on a timer, not an animation. */
    const timer = pollMs > 0 ? setInterval(() => load(true), pollMs) : null;
    return () => { alive.current = false; if (timer) clearInterval(timer); };
  }, [open, load, pollMs]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Scope the feed to this customer. `customer_id` on an audit record is the
   * External_Customer_Id__c, the same key the profile lookup accepts — but a
   * caller may pass the ledger id, so we compare both fields loosely and fall
   * back to saying the feed is unscoped rather than showing another
   * customer's decisions as if they were this one's. */
  const { records, scoped } = useMemo(() => {
    const key = reference == null ? null : String(reference);
    const all = audit.records || [];
    const mine = key ? all.filter((row) => String(row.customer_id) === key) : [];
    return { records: mine.slice().sort((a, b) => new Date(b.decided_at || b.created_at || 0) - new Date(a.decided_at || a.created_at || 0)), scoped: Boolean(key) };
  }, [audit.records, reference]);

  if (!open) return null;

  const data = profile.data;
  const sf = data?.salesforce || null;
  const stripe = data?.stripe || null;
  const rec = data?.reconciliation || null;
  const currency = stripe?.currency;
  const liveClass = busy ? 'ev-live-busy' : (profile.error || audit.error) ? 'ev-live-stale' : '';

  return (
    <div className="ev-veil" onClick={onClose} role="dialog" aria-modal="true" aria-label="Compliance evidence">
      <div className="ev-panel" onClick={(event) => event.stopPropagation()}>
        <header className="ev-head">
          <div>
            <div className="ev-eyebrow">Compliance evidence</div>
            <h2>{data?.name || name || (reference ? `Customer ${reference}` : 'Customer')}</h2>
            <div className="ev-head-meta">
              {[data?.externalCustomerId || reference, data?.jurisdiction, subtitle].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="ev-head-right">
            <span className={`ev-live ${liveClass}`}>
              <i />
              {busy ? 'Reading…' : lastAt ? `Live · updated ${lastAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Live'}
            </span>
            <button className="ev-refresh" onClick={() => load(true)} disabled={busy}>Refresh now</button>
            <button className="ev-close" onClick={onClose} aria-label="Close evidence view"><Icon name="x" size={13} /></button>
          </div>
        </header>

        <div className="ev-body">
          {/* ── LEFT: live audit trail of agent actions ───────────────────── */}
          <section className="ev-pane ev-pane-left ev-pane-scroll">
            <div className="ev-pane-h">
              <b>Agent audit trail</b>
              <small>
                {audit.loading ? 'loading' : `${records.length} ledger ${records.length === 1 ? 'record' : 'records'}`}
                {pollMs > 0 ? ` · refreshes every ${Math.round(pollMs / 1000)}s` : ''}
              </small>
            </div>

            {audit.error && (
              <div className="ev-state ev-state-error">
                <Icon name="warn" size={13} />
                <span>Audit ledger unavailable — {audit.error}. No trail is shown rather than a partial one.</span>
              </div>
            )}

            {!audit.error && !audit.loading && !scoped && (
              <div className="ev-state">No customer reference was supplied, so the trail cannot be scoped to one customer. Nothing is shown rather than another customer&rsquo;s decisions.</div>
            )}

            {!audit.error && !audit.loading && scoped && records.length === 0 && (
              <div className="ev-state">The decision ledger holds no records for customer {String(reference)} yet. Nothing has been decided or actioned on this account.</div>
            )}

            {!audit.error && records.length > 0 && (
              <div className="ev-trail">
                {records.map((record) => <AuditEntry key={record.id} record={record} />)}
              </div>
            )}
          </section>

          {/* ── RIGHT: the two systems of record ──────────────────────────── */}
          <section className="ev-pane ev-pane-right">
            <div className="ev-pane-h">
              <b>Systems of record</b>
              <small>Salesforce CRM &amp; Stripe billing, read live</small>
            </div>

            {profile.loading && <div className="ev-state">Reading Salesforce and Stripe…</div>}
            {!profile.loading && profile.error && (
              <div className="ev-state ev-state-error">
                <Icon name="warn" size={13} />
                <span>Customer profile unavailable — {profile.error}</span>
              </div>
            )}

            {!profile.loading && data && (
              <>
                {rec && (() => {
                  /* Three-state, per profile.js: true / false / null when one
                   * side could not answer. An unknown is not a finding and
                   * must not be styled like a disagreement. */
                  const tone = rec.matched === null ? 'ev-recon-unknown' : rec.matched ? 'ev-recon-ok' : 'ev-recon-off';
                  const sfAmount = money(rec.salesforceArrears, 'AUD');
                  const stripeAmount = money(rec.stripeOpenAmount, currency);
                  return (
                    <div className={`ev-recon ${tone}`}>
                      <Icon name={rec.matched === null ? 'help' : rec.matched ? 'check' : 'warn'} size={15} />
                      <div>
                        <b>
                          {rec.matched === null ? 'Cannot reconcile CRM against billing'
                            : rec.matched ? 'CRM and billing agree'
                            : 'CRM and billing disagree — compliance finding'}
                        </b>
                        <small>
                          {rec.matched === null
                            ? 'One of the two systems did not return a figure, so no comparison is possible.'
                            : rec.matched
                              ? 'The arrears figure the CRM holds matches the amount Stripe has open.'
                              : 'The arrears figure driving the regulatory assessment does not match the billed amount. Resolve before acting on either number.'}
                        </small>
                        <div className="ev-recon-delta">
                          <span>Salesforce arrears <b>{sfAmount === NOT_SET ? 'not recorded' : sfAmount}</b></span>
                          <span>Stripe open <b>{stripeAmount === NOT_SET ? 'not recorded' : stripeAmount}</b></span>
                          <span>Delta <b>{typeof rec.delta === 'number' ? AUD.format(rec.delta) : 'not calculable'}</b></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <p className="ev-key-legend"><i /> Highlighted fields are the ones the policy reads to reach its decision.</p>

                <div className="ev-sys">
                  {/* ── Salesforce ── */}
                  <div className="ev-card">
                    <div className="ev-card-h">
                      <span className="ev-badge ev-badge-sf">Salesforce</span>
                      <b>CRM record</b>
                      {sf?.lastModified && <small>as at {isoDate(sf.lastModified) === NOT_SET ? 'unknown' : isoDate(sf.lastModified)}</small>}
                    </div>

                    {sf && sf.available === false && (
                      <div className="ev-state ev-state-error">
                        <Icon name="warn" size={13} />
                        <span>Salesforce unavailable — {sf.error || 'no detail returned'}. No CRM figures are shown rather than estimated ones.</span>
                      </div>
                    )}

                    {sf && sf.available !== false && (
                      <>
                        <div className="ev-fields">
                          <F label="Arrears balance" value={money(sf.arrearsBalance, 'AUD')} system="Salesforce" keyField />
                          <F label="Oldest debt" value={days(sf.oldestDebtDays)} system="Salesforce" keyField />
                          <F label="Hardship status" value={plain(sf.hardshipStatus)} system="Salesforce" keyField />
                          <F label="Best-offer opt out" value={plain(sf.bestOfferOptOut)} system="Salesforce" keyField />
                          <F label="Sensitive customer" value={plain(sf.sensitiveCustomer)} system="Salesforce" keyField />
                        </div>
                        <div className="ev-sub-h">Account context</div>
                        <div className="ev-fields">
                          <F label="Salesforce account id" value={plain(sf.accountId)} system="Salesforce" />
                          <F label="Current plan" value={plain(sf.currentPlan)} system="Salesforce" />
                          <F label="CRM status (raw)" value={plain(sf.hardshipStatusRaw)} system="Salesforce" />
                          <F label="Hardship entered" value={isoDate(sf.hardshipEnteredAt)} system="Salesforce" />
                          <F label="Hardship review due" value={isoDate(sf.hardshipReviewDueAt)} system="Salesforce" />
                          <F label="Financial stress signals" value={plain(sf.financialStressSignals)} system="Salesforce" />
                          <F label="Missed payments (90d)" value={count(sf.missedPayments90d)} system="Salesforce" />
                          <F label="Partial payments (90d)" value={count(sf.partialPayments90d)} system="Salesforce" />
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── Stripe ── */}
                  <div className="ev-card">
                    <div className="ev-card-h">
                      <span className="ev-badge ev-badge-stripe">Stripe</span>
                      <b>Billing account</b>
                      {stripe?.customerId && <small>{stripe.customerId}</small>}
                    </div>

                    {stripe && stripe.available === false && (
                      <div className="ev-state ev-state-error">
                        <Icon name="warn" size={13} />
                        <span>Billing data unavailable — {stripe.error || 'no detail returned'}. No figures are shown rather than estimated ones.</span>
                      </div>
                    )}

                    {stripe && stripe.available !== false && (
                      <>
                        <div className="ev-fields">
                          <F label="Open amount" value={money(stripe.openAmount, currency)} system="Stripe" keyField />
                          <F label="Oldest overdue" value={stripe.oldestOverdueDays === null ? 'Nothing overdue' : days(stripe.oldestOverdueDays)} system="Stripe" keyField />
                        </div>
                        <div className="ev-sub-h">Billing context</div>
                        <div className="ev-fields">
                          <F label="Billing email" value={plain(stripe.email)} system="Stripe" />
                          <F label="Account balance" value={money(stripe.accountBalance, currency)} system="Stripe" />
                          <F label="Open invoices" value={count(stripe.openInvoiceCount)} system="Stripe" />
                          <F label="Paid invoices" value={count(stripe.paidInvoiceCount)} system="Stripe" />
                          <F label="Paid amount" value={money(stripe.paidAmount, currency)} system="Stripe" />
                          <F label="Last payment" value={isoDate(stripe.lastPaymentAt)} system="Stripe" />
                        </div>

                        <div className="ev-sub-h">Invoices &amp; payment history</div>
                        <div className="ev-inv">
                          <div className="ev-inv-row ev-inv-h">
                            <span>Invoice</span><span>Issued</span><span>Amount</span><span>Status</span>
                          </div>
                          {(stripe.invoices || []).map((invoice) => {
                            const amount = money(invoice.amount, invoice.currency || currency);
                            const issued = isoDate(invoice.createdAt);
                            return (
                              <div className={`ev-inv-row ${invoice.status === 'open' ? 'ev-inv-open' : ''}`} key={invoice.id}>
                                <span>
                                  {invoice.hostedInvoiceUrl
                                    ? <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">{invoice.number || invoice.id}</a>
                                    : (invoice.number || invoice.id)}
                                  {invoice.description && <small>{invoice.description}</small>}
                                </span>
                                <span>{issued === NOT_SET ? 'not recorded' : issued}</span>
                                <span>{amount === NOT_SET ? 'not recorded' : amount}</span>
                                <span>
                                  <span className={`ev-status ${invoice.status === 'open' ? 'hot' : invoice.status === 'paid' ? 'cool' : ''}`}>{invoice.status || 'unknown'}</span>
                                  {typeof invoice.overdueDays === 'number' && invoice.overdueDays > 0 && <small>{invoice.overdueDays}d overdue</small>}
                                </span>
                              </div>
                            );
                          })}
                          {!(stripe.invoices || []).length && <div className="ev-inv-empty">No invoices returned by Stripe for this customer.</div>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
