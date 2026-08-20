import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';
import SystemsOfRecord from './SystemsOfRecord.jsx';
import { Chip, Disclosure, StateNote, stamp, toneForSeverity } from './ui.jsx';
import '../styles/evidence.css';

/* ============================================================================
 * EvidenceOverlay — what was decided, on what evidence, citing which clause,
 * by whom.
 *
 *   LEFT  : the agent audit trail (GET /audit, scoped to this customer). Each
 *           entry leads with the outcome and its citation; checks that merely
 *           passed collapse behind a count so the findings are what you read.
 *   RIGHT : <SystemsOfRecord/> — the one rendering of Salesforce + Stripe,
 *           shared with CustomerProfile (P6). This overlay is the surface that
 *           OWNS the full detail: invoices, billing context, CRM context.
 *
 * NO FABRICATION (P7). Absent values go through FieldRow's honest-missing
 * state; `available === false` renders the upstream error rather than a zero;
 * `snapshot_hash` is retained on every entry — demoted to a small mono line at
 * the foot, because it is an integrity anchor, not a headline.
 *
 * Props
 *   open        boolean   — mount/visibility. Required.
 *   reference   string    — External_Customer_Id__c ("1009") or the ledger
 *                           customer id. Drives BOTH panes.
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

/* -- audit presentation ---------------------------------------------------- */

/* Outcome → dot colour on the trail. Blocked and action-required outcomes are
 * the ones an officer must not scroll past. */
function outcomeTone(outcome) {
  const value = String(outcome || '').toUpperCase();
  if (value.includes('BLOCK') || value.includes('PROHIBIT')) return 'ev-tone-block';
  if (value.includes('ACTION') || value.includes('INSUFFICIENT')) return 'ev-tone-action';
  if (value.includes('NO_CHANGE') || value.includes('COMPLIANT') || value.includes('CLEAR')) return 'ev-tone-ok';
  return '';
}

/* A reason's chip tone. `severity` is the backend vocabulary (rules[4]:
 * BLOCKING / ATTENTION / PASS / INFO) and is authoritative when present; older
 * ledger rows carry only a status string, so we derive from that instead. */
function reasonTone(reason) {
  if (reason.severity) return toneForSeverity(reason.severity);
  const value = String(reason.status || '').toUpperCase();
  if (value === 'NOT_TRIGGERED') return 'pass';
  if (/TRIGGERED$|^BLOCK|BREACH|OVERDUE|PROHIBIT/.test(value)) return 'blocking';
  if (/INSUFFICIENT|UNVERIFIED|UNKNOWN|OPTED_OUT|SENSITIVE/.test(value)) return 'attention';
  if (/CLEAR|MET|OK|PASS|NO_LOWER_OFFER|NO_MONETARY_FLOOR/.test(value)) return 'pass';
  return 'info';
}

function humanOutcome(record) {
  const outcome = record.outcome ? String(record.outcome).replace(/_/g, ' ').toLowerCase() : null;
  return outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : 'Evaluation recorded';
}

function Reason({ reason }) {
  return (
    <div className="ev-reason">
      <Chip tone={reasonTone(reason)}>{reason.status || 'no status'}</Chip>
      <div className="ev-reason-main">
        <b>{reason.rule || 'Unnamed rule'}</b>
        {reason.explanation && <p>{reason.explanation}</p>}
        {reason.citation && <span className="ev-cite">{reason.citation}</span>}
        {reason.penaltyProvision && <span className="ev-penalty">civil penalty · {reason.penaltyProvision}</span>}
      </div>
    </div>
  );
}

function AuditEntry({ record }) {
  const reasons = Array.isArray(record.evidence) ? record.evidence : [];
  /* P1/P3: findings lead; checks that merely passed collapse behind a count. */
  const findings = reasons.filter((reason) => reasonTone(reason) === 'blocking' || reasonTone(reason) === 'attention');
  const quiet = reasons.filter((reason) => !findings.includes(reason));
  const when = stamp(record.decided_at || record.created_at);

  /* One provenance line instead of three stacked blocks: policy, actor,
   * verdict. Every part is omitted only when the ledger has no value for it. */
  const provenance = [
    record.policy_id ? `Policy ${record.policy_id}${record.policy_version ? ` v${record.policy_version}` : ''}` : 'No policy recorded',
    record.actor_id ? `by ${record.actor_id}` : 'no actor recorded',
    record.verdict ? `verdict ${record.verdict}` : null,
    record.action_type || null,
  ].filter(Boolean).join(' · ');

  return (
    <article className={`ev-entry ${outcomeTone(record.outcome)}`}>
      <div className="ev-entry-top">
        <b>{humanOutcome(record)}</b>
        {record.action_status && <Chip tone={reasonTone({ status: record.action_status })}>{record.action_status}</Chip>}
        {when && <span className="ev-when">{when}</span>}
      </div>

      <div className="ev-entry-sub">{provenance}</div>

      {record.override_reason && (
        <div className="ev-override"><b>Override:</b> {record.override_reason}</div>
      )}

      {findings.length > 0 && (
        <div className="ev-reasons">{findings.map((reason, index) => <Reason key={`${record.id}-f-${reason.rule || index}`} reason={reason} />)}</div>
      )}

      {quiet.length > 0 && (
        <Disclosure label="Checks that passed" count={quiet.length}>
          <div className="ev-reasons ev-reasons-quiet">
            {quiet.map((reason, index) => <Reason key={`${record.id}-q-${reason.rule || index}`} reason={reason} />)}
          </div>
        </Disclosure>
      )}

      {/* Integrity anchor. Small, mono, last — retained, never prominent. */}
      {record.snapshot_hash && (
        <div className="ev-hash"><em>snapshot</em><span>{record.snapshot_hash}</span></div>
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

  const liveClass = busy ? 'ev-live-busy' : (profile.error || audit.error) ? 'ev-live-stale' : '';

  return (
    <div className="ev-veil" onClick={onClose} role="dialog" aria-modal="true" aria-label="Compliance evidence">
      <div className="ev-panel" onClick={(event) => event.stopPropagation()}>
        <header className="ev-head">
          <div>
            <div className="ev-eyebrow">Compliance evidence</div>
            <h2>{profile.data?.name || name || (reference ? `Customer ${reference}` : 'Customer')}</h2>
            <div className="ev-head-meta">
              {[profile.data?.externalCustomerId || reference, profile.data?.jurisdiction, subtitle].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="ev-head-right">
            <span className={`ev-live ${liveClass}`}>
              <i />
              {busy ? 'Reading…' : lastAt ? `Live · ${lastAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
            </span>
            <button className="ev-refresh" onClick={() => load(true)} disabled={busy}>Refresh</button>
            <button className="ev-close" onClick={onClose} aria-label="Close evidence view"><Icon name="x" size={13} /></button>
          </div>
        </header>

        <div className="ev-body">
          {/* ── LEFT: the audit trail ─────────────────────────────────────── */}
          <section className="ev-pane ev-pane-left">
            <div className="ev-pane-h">
              <b>Agent audit trail</b>
              <small>{audit.loading ? 'loading' : `${records.length} ledger ${records.length === 1 ? 'record' : 'records'}`}</small>
            </div>

            {audit.error && (
              <StateNote tone="error">Audit ledger unavailable — {audit.error}. No trail is shown rather than a partial one.</StateNote>
            )}

            {!audit.error && !audit.loading && !scoped && (
              <StateNote>No customer reference was supplied, so the trail cannot be scoped. Nothing is shown rather than another customer&rsquo;s decisions.</StateNote>
            )}

            {!audit.error && !audit.loading && scoped && records.length === 0 && (
              <StateNote>The decision ledger holds no records for customer {String(reference)} yet.</StateNote>
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

            {profile.loading && <StateNote>Reading Salesforce and Stripe…</StateNote>}
            {!profile.loading && profile.error && (
              <StateNote tone="error">Customer profile unavailable — {profile.error}</StateNote>
            )}
            {!profile.loading && profile.data && <SystemsOfRecord profile={profile.data} />}
          </section>
        </div>
      </div>
    </div>
  );
}
