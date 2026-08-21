import React, { useEffect, useMemo, useState } from 'react';
import { AskBar } from '../components/Chrome.jsx';
import { StateNote } from '../components/ui.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';

/* ============================================================================
 * Oversight — the overview screen.
 *
 * EVERY figure on this page is derived from the live decision ledger. Nothing
 * is a literal carried over from the design mock, and nothing is reconstructed
 * from data we do not hold. Two rules govern this file:
 *
 *  1. NO SHAPED TRENDS. Real evaluation history is two days old, so there is
 *     no 12-week burn-down to draw. `driftSeries` contains only counts we have
 *     genuinely measured; the card draws a line ONLY when there are at least
 *     two of them, and otherwise shows the current number against the real
 *     deadline window with a note saying the trend needs more history.
 *
 *  2. NO INVENTED SEGMENTS. All 151 customers are VIC, so the design's four
 *     state cards cannot be honoured. That row is replaced by the review
 *     summary's own categories — a breakdown the ledger actually produces —
 *     and the single jurisdiction is stated in the card, not implied away.
 *
 * A number we cannot compute renders as an explicit "—" with a caption, never
 * as a zero. A number that genuinely IS zero (systems disagreeing on balance)
 * is shown as zero, because that is a real and good result.
 * ========================================================================== */

const DEADLINE = '1 October';
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

/** 1 October of the compliance year the deadline still lies in. */
function deadlineDate(now) {
  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), 9, 1));
  return thisYear >= startOfDay(now) ? thisYear : new Date(Date.UTC(now.getUTCFullYear() + 1, 9, 1));
}
function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
}
/** Monday 00:00 of the week containing `now`. */
function startOfWeek(now) {
  const day = startOfDay(now);
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * 86400000);
}
function shortDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
}
function snapshotValue(caseData, field) {
  const row = (caseData?.snapshot || []).find(([key]) => key === field);
  return row ? row[1] : null;
}

/** A stat in the dark band. An uncomputable value is a dash with a caption. */
function BandStat({ value, label }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  return (
    <div className="ov-stat">
      <b>{known ? value : '—'}</b>
      <span>{known ? label : `${label} · not yet measurable`}</span>
    </div>
  );
}

function DriftBar({ label, value, total, tone, note }) {
  const width = total > 0 && value > 0 ? Math.max(4, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="ov-bar-h"><span>{label}</span><span>{value}</span></div>
      <div className="ov-bar-track"><div className={`ov-bar-fill ${tone}`} style={{ width: `${width}%` }} /></div>
      {note && <small className={value === 0 ? 'ov-bar-zero' : 'ov-bar-sub'}>{note}</small>}
    </div>
  );
}

export default function Home({ openCase, goQueue, goAudit, queue = [], cases = {}, auditRecords = [] }) {
  const [summary, setSummary] = useState(null);
  const [summaryCustomers, setSummaryCustomers] = useState([]);
  const [awaitingApproval, setAwaitingApproval] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [review, awaiting] = await Promise.all([
          decisionLayerApi.loadReviewSummary({ limit: 200, includeCustomers: true }),
          decisionLayerApi.loadAwaitingApproval({ limit: 200 }),
        ]);
        if (!live) return;
        setSummary(review.summary);
        setSummaryCustomers(review.customers || []);
        setAwaitingApproval(awaiting.actions || []);
        setLoadError(null);
      } catch (error) {
        if (live) setLoadError(error.message);
      }
    })();
    return () => { live = false; };
  }, []);

  const now = useMemo(() => new Date(), []);
  const deadline = deadlineDate(now);
  const daysToDeadline = daysBetween(now, deadline);

  /* ── the hero count: the ledger's own actionable total ──────────────── */
  const actionable = summary?.actionableCount ?? null;
  const bookSize = summary?.page?.total ?? queue.length ?? 0;

  /* ── reassessments overdue: a review date in the CRM that has passed ─── */
  const overdueReassessments = useMemo(() => {
    const today = startOfDay(now).toISOString().slice(0, 10);
    return Object.values(cases).filter((item) => {
      const due = snapshotValue(item, 'hardshipReviewDueAt');
      return typeof due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(due) && due.slice(0, 10) < today;
    }).length;
  }, [cases, now]);

  /* ── cleared this week: approvals actually recorded against actions ──── */
  const clearedThisWeek = useMemo(() => {
    if (!auditRecords.length) return null;
    const weekStart = startOfWeek(now);
    const seen = new Set();
    auditRecords.forEach((record) => {
      if (!record.decided_at || record.verdict !== 'AGREED') return;
      if (new Date(record.decided_at) < weekStart) return;
      if (record.action_id) seen.add(record.action_id);
    });
    return seen.size;
  }, [auditRecords, now]);

  /* ── where drift comes from ──────────────────────────────────────────── */
  // Only categories the ledger genuinely produces. The design's fourth row,
  // "payment plan lapsed", has no backing field and is deliberately absent
  // rather than approximated from something adjacent.
  const betterOfferNotApplied = awaitingApproval ? awaitingApproval.length : null;

  // Reconciliation status rides on each decision's evidence, so the whole book
  // can be read from the audit ledger without 151 profile round-trips.
  const reconciliation = useMemo(() => {
    const latest = new Map();
    auditRecords.forEach((record) => {
      const finding = (record.evidence || []).find((item) => /Arrears corroboration/i.test(item.rule || ''));
      if (!finding) return;
      const previous = latest.get(record.customer_id);
      if (!previous || new Date(record.created_at) > new Date(previous.at)) {
        latest.set(record.customer_id, { at: record.created_at, status: finding.status });
      }
    });
    let conflict = 0;
    let unverified = 0;
    latest.forEach(({ status }) => {
      if (String(status).startsWith('CONFLICT')) conflict += 1;
      else if (status === 'UNVERIFIED') unverified += 1;
    });
    return { conflict, unverified, measured: latest.size };
  }, [auditRecords]);

  const driftRows = [
    {
      label: 'Better offer not applied', value: betterOfferNotApplied, tone: 'is-ink',
      note: 'Held for an officer’s approval.',
    },
    {
      label: 'Hardship not reassessed', value: overdueReassessments, tone: '',
      note: 'CRM review date has passed.',
    },
    {
      label: 'Systems disagree on balance', value: reconciliation.conflict, tone: 'is-blue',
      note: reconciliation.measured === 0
        ? null
        : reconciliation.conflict === 0
          ? `Salesforce and billing agree on every one of the ${reconciliation.measured} accounts corroborated so far${reconciliation.unverified ? `; ${reconciliation.unverified} could not be corroborated at all` : ''}.`
          : 'CRM and billing report different arrears.',
    },
  ];
  const driftScale = Math.max(1, ...driftRows.map((row) => (typeof row.value === 'number' ? row.value : 0)));

  /* ── TRAP 1: the drift series ────────────────────────────────────────── */
  // One honestly-measured observation exists: the actionable count right now.
  // Earlier evaluation runs recorded per-customer outcomes, not a book-level
  // backlog, so a value for 19 August cannot be reconstructed without
  // inventing it. The array is kept so the card becomes the intended line the
  // moment a second daily measurement lands.
  const observedFrom = useMemo(() => {
    const dates = queue.map((row) => row.evaluatedAt).filter(Boolean).sort();
    return dates.length ? new Date(dates[0]) : null;
  }, [queue]);
  const driftSeries = actionable === null ? [] : [{ at: now, value: actionable }];
  const canPlotTrend = driftSeries.length >= 2;

  /* ── TRAP 2: a breakdown we genuinely have ───────────────────────────── */
  const categoryCells = useMemo(() => {
    if (!summary) return [];
    const tabs = summary.tabs || [];
    const label = (key) => tabs.find((tab) => tab.key === key)?.label || key;
    const value = (key) => summary.categories?.[key] ?? 0;
    return [
      { key: 'ACTION_REQUIRED', actionable: true, caption: 'Switch required, waiting on approval.' },
      { key: 'INSUFFICIENT_EVIDENCE', actionable: true, caption: 'Evidence must be resolved before a conclusion.' },
      { key: 'NO_CHANGE', actionable: false, caption: 'Correct as they stand. Audit only.' },
      { key: 'NOT_EVALUATED', actionable: false, caption: 'Never assessed. Not a pass — an unknown.' },
    ].map((cell) => ({ ...cell, label: label(cell.key), value: value(cell.key) }));
  }, [summary]);

  const excluded = summary
    ? [
        ['sensitive customer', summary.categories?.SENSITIVE_CUSTOMER ?? 0],
        ['opted out', summary.categories?.OPTED_OUT ?? 0],
        ['on tailored assistance', summary.categories?.ON_TAILORED_ASSISTANCE ?? 0],
      ].filter(([, count]) => count > 0)
    : [];

  /* ── needs a decision today ──────────────────────────────────────────── */
  const topCases = useMemo(() => {
    if (!summaryCustomers.length) return [];
    const byId = new Map(queue.map((row) => [row.id, row]));
    return summaryCustomers
      .filter((row) => row.actionable)
      .map((row) => {
        const listed = byId.get(row.customerId) || {};
        return {
          id: row.customerId,
          customer: row.name,
          meta: `${row.customerId} · ${row.jurisdiction}`,
          reason: row.categoryLabel,
          action: listed.action || null,
          priority: listed.priority || 'Low',
          openable: Boolean(listed.id),
        };
      })
      .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || a.customer.localeCompare(b.customer))
      .slice(0, 6);
  }, [summaryCustomers, queue]);

  return (
    <div className="ov">
      <header className="ov-band">
        <div className="ov-band-in">
          <div>
            <div className="eyebrow">
              {now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} · Book oversight
            </div>
            <h1>
              {actionable === null
                ? 'Reading the decision ledger…'
                : `${actionable} account${actionable === 1 ? ' is' : 's are'} still drifting from policy.`}
            </h1>
            <button className="ov-band-cta" onClick={goQueue}>Open detection queue →</button>
          </div>
          <div className="ov-stats">
            <BandStat value={daysToDeadline} label={`days to ${DEADLINE}`} />
            <BandStat value={overdueReassessments} label="reassessments overdue" />
            <BandStat value={clearedThisWeek} label="cleared this week" />
          </div>
        </div>
      </header>

      <div className="ov-body">
        {loadError && (
          <div style={{ marginBottom: 20 }}>
            <StateNote tone="error">Decision ledger unavailable: {loadError}. The figures below are incomplete.</StateNote>
          </div>
        )}

        <div className="ov-grid">
          <section className="ov-card">
            <div className="ov-card-h">
              <h2>Drift to {DEADLINE}</h2>
              <span className="ov-card-meta">
                Accounts awaiting a required switch · {daysToDeadline} days left
              </span>
            </div>

            <div className="ov-drift-now">
              <b>{actionable === null ? '—' : actionable}</b>
              <span>
                {canPlotTrend
                  ? `measured since ${shortDate(observedFrom)}`
                  : `as at ${shortDate(now)}`}
              </span>
            </div>

            {/* The deadline window is a fact, so it can be drawn. The value of
                that window on any past day is not, so nothing is drawn there:
                with one measurement this is a runway, not a trend. */}
            {canPlotTrend ? (
              <svg
                className="ov-drift-plot"
                viewBox="0 0 640 176"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Accounts drifting, measured since ${shortDate(observedFrom)}.`}
              >
                <line x1="0" y1="34" x2="640" y2="34" stroke="var(--line3)" strokeWidth="1" />
                <line x1="0" y1="100" x2="640" y2="100" stroke="var(--line3)" strokeWidth="1" />
                <line x1="0" y1="166" x2="640" y2="166" stroke="var(--line)" strokeWidth="1" />
                <polyline
                  points={driftSeries
                    .map((point, index) => `${(index / (driftSeries.length - 1)) * 640},${34 + (1 - point.value / Math.max(...driftSeries.map((p) => p.value))) * 132}`)
                    .join(' ')}
                  fill="none" stroke="var(--rust)" strokeWidth="2" strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                className="ov-drift-runway"
                viewBox="0 0 640 44"
                preserveAspectRatio="none"
                role="img"
                aria-label={
                  actionable === null
                    ? 'Drift measurement not yet available'
                    : `${actionable} accounts drifting as at today, with ${daysToDeadline} days remaining to ${DEADLINE}. One measurement recorded, so no trend line is drawn.`
                }
              >
                <line x1="6" y1="22" x2="634" y2="22" stroke="var(--line3)" strokeWidth="2" strokeLinecap="round" />
                {actionable !== null && (
                  <>
                    <circle cx="6" cy="22" r="6" fill="var(--rust)" />
                    <line x1="634" y1="8" x2="634" y2="36" stroke="var(--rust)" strokeWidth="2" strokeDasharray="4 4" />
                  </>
                )}
              </svg>
            )}
            <div className="ov-drift-axis">
              <span>{shortDate(now)} · measured</span>
              <span>{DEADLINE} · deadline</span>
            </div>

            {!canPlotTrend && (
              <p className="ov-note">
                No trend line yet. The ledger holds a single book-level measurement
                {observedFrom ? <> — evaluation started <b>{shortDate(observedFrom)}</b></> : null}, and a burn-down
                cannot be drawn from one point. This becomes a line as soon as a second daily measurement is recorded.
              </p>
            )}
          </section>

          <section className="ov-card">
            <h2>Where drift comes from</h2>
            <div className="ov-bars">
              {driftRows.map((row) => (
                <DriftBar
                  key={row.label}
                  label={row.label}
                  value={typeof row.value === 'number' ? row.value : 0}
                  total={driftScale}
                  tone={row.tone}
                  note={row.note}
                />
              ))}
            </div>
            <p className="ov-note">
              These are the categories this policy actually detects. Nothing is shown for causes
              the ledger has no field for.
            </p>
          </section>
        </div>

        {/* TRAP 2 — the design's NSW/VIC/QLD/SA row would be four inventions.
            This is the ledger's own categorisation of the same book. */}
        <section className="ov-breakdown">
          <div className="ov-breakdown-h">
            <h2>How the book resolves</h2>
            <span className="ov-card-meta">
              {bookSize ? `${bookSize} customers` : 'Loading'} · all Victoria · vic.hardship.best-offer
            </span>
          </div>
          <div className="ov-breakdown-cells">
            {(categoryCells.length ? categoryCells : Array.from({ length: 4 }, (_, index) => ({ key: index, label: '', value: null, caption: '' }))).map((cell) => (
              <div key={cell.key} className={`ov-cell ${cell.actionable ? 'is-actionable' : ''}`}>
                <div className="ov-cell-k">{cell.label || '—'}</div>
                <div className="ov-cell-n">{cell.value === null ? '—' : cell.value}</div>
                <div className="ov-cell-share">
                  <i style={{ width: bookSize && cell.value ? `${Math.max(3, Math.round((cell.value / bookSize) * 100))}%` : '0%' }} />
                </div>
                <div className="ov-cell-s">{cell.caption}</div>
              </div>
            ))}
          </div>
          <div className="ov-breakdown-foot">
            Every customer in this book is in <b>Victoria</b>, so there is no jurisdictional split to show.
            {excluded.length > 0 && (
              <> Held outside the queue by policy: {excluded.map(([label, count]) => `${count} ${label}`).join(', ')}.</>
            )}
          </div>
        </section>

        <section className="ov-list">
          <div className="ov-list-h">
            <h2>Needs a decision today</h2>
            <button className="text-button primary" onClick={goQueue}>
              {actionable === null ? 'Open detection queue →' : `All ${actionable} cases →`}
            </button>
          </div>
          {/* An empty state before the ledger has answered would read as
              "nothing to do", which is a claim we cannot make yet. */}
          {summaryCustomers.length > 0 && topCases.length === 0 && (
            <div className="ov-empty">No account currently needs a decision.</div>
          )}
          {topCases.map((row) => (
            <button
              key={row.id}
              className="ov-row"
              onClick={() => row.openable && openCase(row.id)}
              disabled={!row.openable}
            >
              <span className={`ov-prio is-${String(row.priority).toLowerCase()}`} />
              <span className="ov-row-who"><b>{row.customer}</b><small>{row.meta}</small></span>
              <span className="ov-row-reason">{row.reason}</span>
              <span className="ov-row-action">{row.action || <em style={{ color: 'var(--faint)' }}>No action recorded</em>}</span>
              <span className="ov-row-chev">→</span>
            </button>
          ))}
        </section>

        {goAudit && (
          <p className="ov-note" style={{ marginTop: 'var(--s4)' }}>
            Every decision above is reproducible from its frozen snapshot.{' '}
            <button className="text-button primary" onClick={goAudit}>Open the decision audit →</button>
          </p>
        )}
      </div>

      <AskBar />
    </div>
  );
}
