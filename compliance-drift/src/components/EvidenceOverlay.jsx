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

/* A finding at rest is status · rule · explanation. Its clause citation and
   civil-penalty provision are the legal backing an officer reaches for when
   challenging or writing up the finding — real, retained, but not something
   every finding needs to shout at rest (P3). One click reveals them.
   The tone vocabulary is unchanged — still `reasonTone`, still driven by the
   backend's BLOCKING/ATTENTION/PASS/INFO. */
function Reason({ reason, quiet = false }) {
  // A blocking finding's citation is the payload an officer writes a breach up
  // from, so it stays at rest. Everything else keeps its citation one click
  // away — that distinction is what stopped the trail being a wall.
  const [open, setOpen] = useState(reasonTone(reason) === 'blocking');
  const backing = [
    reason.citation ? { k: 'clause', v: reason.citation, className: 'ev-cite' } : null,
    reason.penaltyProvision ? { k: 'civil penalty', v: reason.penaltyProvision, className: 'ev-penalty' } : null,
    reason.thresholdSource ? { k: 'threshold', v: reason.thresholdSource, className: '' } : null,
  ].filter(Boolean);

  return (
    <div className={`ev-reason ${open ? 'is-open' : ''}`}>
      <span className={`ev-reason-status ov-t-${reasonTone(reason)}`}>{reason.status || 'no status'}</span>
      <div className="ev-reason-main">
        <b>{reason.rule || 'Unnamed rule'}</b>
        {!quiet && reason.explanation && <p>{reason.explanation}</p>}
        {backing.length > 0 && (
          <button type="button" className="ev-reason-more" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide clause citation' : reason.penaltyProvision ? 'Clause citation · civil penalty' : 'Clause citation'}
          </button>
        )}
        {open && (
          <div className="ev-reason-backing">
            {backing.map((item) => (
              <div key={item.k} className={item.className}><em>{item.k}</em> {item.v}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* An entry's whole detail lives behind its own header. Only the newest record
 * opens by default: a customer with four superseded decisions should read as
 * four lines, not four screens. */
function AuditEntry({ record, defaultOpen }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const reasons = Array.isArray(record.evidence) ? record.evidence : [];
  /* P1/P3: findings lead; checks that merely passed collapse behind a count. */
  const findings = reasons.filter((reason) => reasonTone(reason) === 'blocking' || reasonTone(reason) === 'attention');
  const quiet = reasons.filter((reason) => !findings.includes(reason));
  const when = stamp(record.decided_at || record.created_at);
  /* Penalty exposure as ONE marker on the entry, not a badge per finding. The
   * provisions themselves stay on each finding, one click away. */
  const penalties = new Set(findings.map((reason) => reason.penaltyProvision).filter(Boolean));

  /* Provenance: decision key, policy id + version, actor, verdict, action type
   * and the snapshot hash. All retained (P7), all demoted into one quiet group
   * rather than four stacked headline rows. */
  const provenance = [
    ['decision key', record.decision_key || 'not recorded'],
    ['policy', record.policy_id ? `${record.policy_id}${record.policy_version ? ` v${record.policy_version}` : ''}` : 'No policy recorded'],
    ['actor', record.actor_id || 'no actor recorded'],
    record.verdict ? ['verdict', record.verdict] : null,
    record.action_type ? ['action', record.action_type] : null,
    /* Integrity anchor. Small, mono — retained, never prominent. */
    record.snapshot_hash ? ['snapshot', record.snapshot_hash] : null,
  ].filter(Boolean);

  return (
    <article className={`ev-entry ${outcomeTone(record.outcome)} ${open ? 'is-open' : ''}`}>
      <button type="button" className="ev-entry-top" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <i className="u-caret" aria-hidden="true" />
        <b>{humanOutcome(record)}</b>
        {when && <span className="ev-when">{when}</span>}
        <span className="ev-entry-marks">
          {findings.length > 0 && (
            <span className="ev-mark ev-mark-finding">
              {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
            </span>
          )}
          {penalties.size > 0 && <span className="ev-mark ev-mark-penalty" title="A finding cites a civil-penalty provision">civil penalty</span>}
          {record.override_reason && <span className="ev-mark ev-mark-override">override</span>}
          {record.action_status && <Chip tone={reasonTone({ status: record.action_status })}>{record.action_status}</Chip>}
        </span>
      </button>

      {open && (
        <div className="ev-entry-body">
          {record.override_reason && (
            <div className="ev-override"><b>Override:</b> {record.override_reason}</div>
          )}

          {/* The design's "Why this was flagged" heading, carrying the real count. */}
          {reasons.length > 0 && (
            <div className={`ev-findings-h ${findings.length ? '' : 'ev-findings-none'}`}>
              {findings.length
                ? `Why this was flagged · ${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`
                : 'No blocking or attention finding'}
            </div>
          )}

          {findings.length > 0 && (
            <div className="ev-reasons">{findings.map((reason, index) => <Reason key={`${record.id}-f-${reason.rule || index}`} reason={reason} />)}</div>
          )}

          {quiet.length > 0 && (
            <Disclosure label="Checks that passed" count={quiet.length}>
              <div className="ev-reasons ev-reasons-quiet">
                {quiet.map((reason, index) => <Reason key={`${record.id}-q-${reason.rule || index}`} reason={reason} quiet />)}
              </div>
            </Disclosure>
          )}

          <Disclosure label="Provenance and integrity" count={provenance.length}>
            <dl className="ev-prov">
              {provenance.map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </Disclosure>
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

  /* Client-side only: serialise exactly what this panel already loaded. */
  const exportBundle = () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      customerReference: reference == null ? null : String(reference),
      source: 'Vocare decision ledger and connected systems, as read by this panel',
      decisionRecords: records,
      systemsOfRecord: profile.data || null,
      profileError: profile.error || null,
      auditError: audit.error || null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocare-evidence-${reference || 'customer'}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
              <b>Decision trail</b>
              <small>
                {audit.loading
                  ? 'loading'
                  : `${records.length} ledger ${records.length === 1 ? 'record' : 'records'}${records.length > 1 ? ' · newest open' : ''}`}
              </small>
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
                {/* Newest open, plus any entry carrying an override: a reason an
                    officer typed to justify departing from the recommendation is
                    the most consequential human act in the trail, and it should
                    not need a click to read. */}
                {records.map((record, index) => (
                  <AuditEntry key={record.id} record={record} defaultOpen={index === 0 || Boolean(record.override_reason)} />
                ))}
              </div>
            )}
          </section>

          {/* ── RIGHT: the two systems of record ──────────────────────────── */}
          <section className="ev-pane ev-pane-right">
            <div className="ev-pane-h">
              <b>Systems of record</b>
              <small>Salesforce CRM &amp; Stripe billing, read live</small>
            </div>
            {/* The design's dash caveat, restated for what we actually render:
                FieldRow prints "Not recorded in <system>" rather than a zero. */}

            {profile.loading && <StateNote>Reading Salesforce and Stripe…</StateNote>}
            {!profile.loading && profile.error && (
              <StateNote tone="error">Customer profile unavailable — {profile.error}</StateNote>
            )}
            {!profile.loading && profile.data && <SystemsOfRecord profile={profile.data} />}
          </section>
        </div>

        {/* The design's footer. "Export bundle" is real — it writes the ledger
            records and the profile payload this panel is already holding to a
            JSON file. There is no export endpoint and none is implied. */}
        <footer className="ev-foot">
          <span>Evidence is frozen at approval and retained with the decision.</span>
          <div>
            <button className="ov-btn ov-btn-sm" onClick={exportBundle} disabled={!records.length && !profile.data}>
              Export bundle
            </button>
            <button className="ov-btn-dark ov-btn-sm" onClick={onClose}>Back to case</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
