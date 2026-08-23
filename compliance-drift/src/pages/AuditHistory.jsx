import React, { useMemo } from 'react';
import { AskBar } from '../components/Chrome.jsx';
import { phrase } from '../components/ui.jsx';
import '../styles/evidence.css';

/* ============================================================================
 * AuditHistory — "Decision audit" in the Vocare Oversight language.
 *
 * The design renders the ledger as a day-grouped timeline: a 132px day column
 * on the left, a hairline rail on the right, one dot per decision. Each record
 * carries its id, time, outcome, customer, approver, source count and policy.
 * That maps onto our ledger rows one-for-one — nothing in the design's record
 * needs a field we do not already serve.
 *
 * HONESTY
 *  - "Approved by" is only written when the ledger holds an `actor_id`. A row
 *    with no actor says "Awaiting approval" in the caution tone; it is never
 *    dressed as an approved decision.
 *  - `verdict` and `override_reason` are regulatory controls, so they render
 *    here as well as in the evidence overlay. An override reason is never
 *    collapsed away.
 *  - Day grouping uses the row's real timestamp. Decisions approved in this
 *    browser session carry a locale-formatted string rather than an ISO
 *    instant (see the note in the report), so when a timestamp cannot be
 *    parsed the row is grouped under "Recorded this session" instead of being
 *    filed under a guessed date.
 *
 * "Export evidence bundle" is real: it serialises the records this screen is
 * already holding client-side and downloads them as JSON. There is no export
 * endpoint, and the button does not pretend there is one — the note under the
 * timeline says exactly what the file contains.
 * ========================================================================== */

const SESSION_GROUP = 'Recorded this session';

function parseWhen(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Day heading: "Today", "Yesterday", else "6 Aug". */
function dayLabel(date) {
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86400000);
  const written = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  if (diff === 0) return `Today, ${written}`;
  if (diff === 1) return `Yesterday, ${written}`;
  return written;
}

/* The dot tone. Outcome vocabulary is the backend's; we only read it. */
function dotClass(outcome) {
  const value = String(outcome || '').toUpperCase();
  if (value.includes('BLOCK') || value.includes('PROHIBIT') || value.includes('INSUFFICIENT')) return 'ov-dot-attention';
  if (value.includes('NO_CHANGE')) return 'ov-dot-quiet';
  if (value.includes('COMPLIANT') || value.includes('CLEAR') || value.includes('APPROV')) return 'ov-dot-pass';
  return '';
}

function humanOutcome(value) {
  /* Display only — `rawOutcome` is kept on every row and still drives dotClass. */
  return phrase(value, 'Evaluation recorded');
}

export default function AuditHistory({ latestDecision, sessionDecisions = [], records: persisted = [] }) {
  /* One normalised record shape, whatever the source. `at` is the real instant
     when we have one and null when we do not — never a substituted date. */
  const records = useMemo(() => {
    const fromLedger = persisted.map((row) => {
      const at = parseWhen(row.decided_at || row.created_at);
      return {
        key: row.id,
        id: row.id,
        at,
        timeLabel: at ? at.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : null,
        outcome: humanOutcome(row.outcome),
        rawOutcome: row.outcome,
        customer: [row.name, row.customer_id].filter(Boolean).join(' · ') || null,
        officer: row.actor_id || null,
        verdict: row.verdict || null,
        overrideReason: row.override_reason || null,
        sources: Array.isArray(row.evidence) ? row.evidence.length : null,
        policy: row.policy_id ? `${row.policy_id}${row.policy_version ? ` v${row.policy_version}` : ''}` : null,
        trigger: row.action_type || null,
        isNew: false,
        raw: row,
      };
    });

    const fromSession = [...sessionDecisions].reverse().map((row) => {
      /* `ts` is a display string, so it only counts when the browser can read
         it back as a real instant. An unreadable one groups under
         SESSION_GROUP rather than being filed under a guessed date. */
      const at = parseWhen(row.at || row.decidedAt || row.ts);
      return {
        key: `session-${row.id}`,
        id: row.id,
        at,
        timeLabel: at ? at.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : row.ts || null,
        outcome: humanOutcome(row.outcome),
        rawOutcome: row.outcome,
        customer: row.case || null,
        officer: row.officer || null,
        verdict: null,
        overrideReason: null,
        sources: typeof row.evidence === 'number' ? row.evidence : null,
        policy: row.policy || null,
        trigger: row.trigger || null,
        isNew: row.id === latestDecision?.id,
        raw: row,
      };
    });

    return [...fromSession, ...fromLedger];
  }, [persisted, sessionDecisions, latestDecision]);

  /* Group by real day; unparseable timestamps get their own honest group. */
  const groups = useMemo(() => {
    const buckets = new Map();
    records.forEach((record) => {
      const label = record.at ? dayLabel(record.at) : SESSION_GROUP;
      if (!buckets.has(label)) buckets.set(label, { label, sort: record.at ? record.at.getTime() : Infinity, rows: [] });
      buckets.get(label).rows.push(record);
    });
    return [...buckets.values()]
      .sort((a, b) => b.sort - a.sort)
      .map((group) => ({
        ...group,
        rows: group.rows.slice().sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0)),
      }));
  }, [records]);

  /* Real export: the ledger rows this screen already holds, written to disk as
     JSON. No server round-trip is claimed and none happens. */
  const exportEvidence = () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      source: 'Vocare decision ledger, as rendered in this browser session',
      recordCount: records.length,
      records: records.map((record) => record.raw),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocare-decision-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="page ov-audit">

      <div className="ov-audit-head">
        <div>
          <div className="ov-eyebrow">Decision audit</div>
          <h1 className="ov-display">Every decision, reproducible</h1>
          <p className="ov-audit-lede">
            Each record keeps the inputs it read, the clauses it cited, the policy version in
            force, the accountable officer and the frozen evidence snapshot.
          </p>
        </div>
        <button className="ov-btn" onClick={exportEvidence} disabled={!records.length}>
          Export evidence bundle
        </button>
      </div>

      {latestDecision && (
        <div className="ov-banner">
          <span>
            <b>{latestDecision.id}</b> was recorded with {latestDecision.evidence} evidence
            sources and {latestDecision.officer}’s approval. The snapshot is preserved.
          </span>
        </div>
      )}

      <div className="ov-audit-groups">
        {!groups.length && <div className="ov-audit-empty">No decisions have been recorded yet.</div>}

        {groups.map((group) => (
          <div className="ov-audit-group" key={group.label}>
            <div className="ov-audit-day">
              <b>{group.label}</b>
              <small>{group.rows.length} {group.rows.length === 1 ? 'decision' : 'decisions'}</small>
            </div>
            <div className="ov-audit-rail">
              {group.rows.map((record) => (
                <div className={`ov-audit-rec ${dotClass(record.rawOutcome)}`} key={record.key}>
                  <div className="ov-audit-topline">
                    <span className="ov-audit-id">{record.id}</span>
                    {record.timeLabel && <span className="ov-audit-time">{record.timeLabel}</span>}
                  </div>
                  <div className="ov-audit-outcome">
                    {record.outcome}
                    {record.isNew && <span className="ov-audit-new">New</span>}
                  </div>
                  {record.customer && <div className="ov-audit-customer">{record.customer}</div>}
                  <div className="ov-audit-meta">
                    {record.officer
                      ? <span>Approved by <b>{record.officer}</b></span>
                      : <span className="ov-unapproved">Awaiting approval</span>}
                    {record.verdict && <span>Verdict <b>{phrase(record.verdict)}</b></span>}
                    {typeof record.sources === 'number' && (
                      <span>{record.sources} {record.sources === 1 ? 'source' : 'sources'}</span>
                    )}
                    {record.policy && <span>{record.policy}</span>}
                    {record.trigger && <span>{phrase(record.trigger)}</span>}
                  </div>
                  {record.overrideReason && (
                    <div className="ov-audit-override">
                      <b>Override reason.</b> {record.overrideReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {records.length > 0 && (
        <p className="ov-audit-note">
          <b>{records.length}</b> {records.length === 1 ? 'decision' : 'decisions'} in the ledger.
          The export writes these records as JSON from this browser — it is the same data shown
          above, not a server-generated bundle.
        </p>
      )}

      <AskBar />
    </div>
  );
}
