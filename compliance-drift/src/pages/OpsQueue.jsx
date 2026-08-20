import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AskBar } from '../components/Chrome.jsx';
import SingleReview from '../components/SingleReview.jsx';
import ReviewAllSummary from '../components/ReviewAllSummary.jsx';
import BulkApproval from '../components/BulkApproval.jsx';
import SweepProgress from '../components/SweepProgress.jsx';
import SweepColumns from '../components/SweepColumns.jsx';
import {
  subscribeSweep, getSweepState, runHardshipSweep, resetSweep,
  BATCH_LIMIT, BATCH_CONCURRENCY,
} from '../components/HardshipSweepRunner.js';
import '../styles/review.css';

/* ============================================================================
 * Detection — the design's `queue` screen, rebuilt around the sweep.
 *
 * The page has three states and no others:
 *
 *   1. INVITATION  — nothing is populated and there are no tabs. The sweep
 *      WRITES to the ledger, so it never runs on mount; it runs because an
 *      officer pressed the button.
 *   2. RUNNING     — a live status line whose every number is a count the
 *      server returned (see HardshipSweepRunner).
 *   3. RESULTS     — the assessed book separated into THREE columns.
 *
 * The seven-tab strip is gone. Sensitive-customer, opted-out and tailored
 * assistance were never separate work — they are flags carried on the card, so
 * the information survives while the navigation collapses to the three
 * groupings the design ships (needs / evidence / done → cleared).
 *
 * Sweep state lives in a module-level store, so navigating away and back shows
 * the last result with a "Run again" control instead of silently re-running.
 * ========================================================================== */

export default function OpsQueue({ openCase, decisions, filters, setFilters, queue = [], actorId = 'Priya N.', onLedgerChanged }) {
  const sweep = useSyncExternalStore(subscribeSweep, getSweepState);

  const [singleReview, setSingleReview] = useState(null);
  const [reviewAll, setReviewAll] = useState(false);
  const [approveAll, setApproveAll] = useState(false);

  // `animate` is only true for the moment the columns first appear, so the
  // fan-out plays once per sweep and not on every re-render or filter change.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (sweep.phase !== 'done') return undefined;
    setAnimate(true);
    const id = setTimeout(() => setAnimate(false), 1400);
    return () => clearTimeout(id);
  }, [sweep.phase, sweep.finishedAt]);

  const workflows = useMemo(() => [...new Set(queue.map((item) => item.workflow))], [queue]);
  const teams = useMemo(() => [...new Set(queue.map((item) => item.team).filter(Boolean))], [queue]);
  const filtersActive = filters.priority !== 'All' || filters.workflow !== 'All' || filters.team !== 'All' || filters.status !== 'All' || !!filters.query;
  const clearFilters = () => setFilters({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' });

  /* The filter object is shared with the ask bar and the voice tools
     (`filter_queue`), so every filter it can set still applies — it now narrows
     the sweep's own results rather than a tab. Counts on the column headers are
     the counts of what is shown, so a filtered view never claims to be the book. */
  const byId = useMemo(() => new Map(queue.map((item) => [item.id, item])), [queue]);
  const filtered = useMemo(() => {
    if (!filtersActive) return sweep.results;
    return sweep.results.filter((row) => {
      const item = byId.get(row.customerId);
      if (!item) return !filters.query || (row.name || '').toLowerCase().includes(filters.query.toLowerCase());
      return (filters.priority === 'All' || item.priority === filters.priority)
        && (filters.workflow === 'All' || item.workflow === filters.workflow)
        && (filters.team === 'All' || item.team === filters.team)
        && (filters.status === 'All' || item.status === filters.status)
        && (!filters.query || `${item.customer} ${item.id} ${item.action} ${item.workflow}`.toLowerCase().includes(filters.query.toLowerCase()));
    });
  }, [sweep.results, filters, filtersActive, byId]);

  const viewSweep = useMemo(() => ({ ...sweep, results: filtered }), [sweep, filtered]);

  const notEvaluated = sweep.results.filter((row) => row.category === 'NOT_EVALUATED');
  const firstActionable = sweep.results.find((row) => row.category === 'ACTION_REQUIRED');

  const startSweep = () => runHardshipSweep({ actorId, onLedgerChanged });

  const idle = sweep.phase === 'idle';
  const running = sweep.phase === 'running';
  const hasResults = sweep.phase === 'done' || sweep.phase === 'failed';

  return (
    <div className="page dq sw">
      <div className="dq-eyebrow">Detection</div>
      <div className="dq-head">
        <div>
          <h1>{idle ? 'Find the customers in hardship' : 'The book, assessed'}</h1>
          <p>
            {idle
              ? `Nothing is assessed until you ask for it. The sweep evaluates every customer in the book against ${queue[0]?.policy || 'the policy in force'}, records each decision in the ledger, and separates the result into what needs a decision, what is blocked on evidence, and what is cleared.`
              : `${sweep.assessed} of ${sweep.total ?? '—'} customers evaluated against ${queue[0]?.policy || 'the policy in force'}. Every decision below is recorded in the ledger.`}
          </p>
        </div>
        {hasResults && (
          <div className="dq-head-actions">
            <button className="dq-btn" onClick={() => { resetSweep(); }}>Clear</button>
            <button className="dq-btn solid" onClick={startSweep}>Run the sweep again</button>
          </div>
        )}
      </div>

      {/* ── 1. INVITATION ────────────────────────────────────────────────── */}
      {idle && (
        <div className="sw-invite">
          <div className="sw-invite-art" aria-hidden="true">
            <span /><span /><span />
          </div>
          <h2>Run the hardship sweep</h2>
          <p>
            {queue.length
              ? `${queue.length} customers are in the book. The sweep works through them in batches of ${BATCH_LIMIT} at concurrency ${BATCH_CONCURRENCY}; progress below counts customers the decision layer has actually evaluated, not elapsed time.`
              : 'The ledger has not returned any customers yet. The sweep will report what it finds.'}
          </p>
          <button className="dq-btn solid lg" onClick={startSweep}>Run the hardship sweep →</button>
          <div className="sw-invite-warn">This writes a decision for every customer it evaluates. It is a recorded action, not a preview.</div>
        </div>
      )}

      {/* ── 2. RUNNING ───────────────────────────────────────────────────── */}
      {running && <SweepProgress sweep={sweep} />}

      {/* ── 3. RESULTS ───────────────────────────────────────────────────── */}
      {hasResults && (
        <>
          <div className="dq-filters">
            <span className="k">Filter</span>
            <label>
              <span className="sr-only">Priority</span>
              <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
                <option value="All">All priorities</option>
                <option value="High">High priority</option>
                <option value="Medium">Medium priority</option>
                <option value="Low">Low priority</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Workflow</span>
              <select value={filters.workflow} onChange={(event) => setFilters((current) => ({ ...current, workflow: event.target.value }))}>
                <option value="All">All workflows</option>
                {workflows.map((workflow) => <option key={workflow} value={workflow}>{workflow}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Team</span>
              <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))}>
                <option value="All">All teams</option>
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>
            <label className="dq-search">
              <span aria-hidden="true" style={{ fontSize: 12 }}>⌕</span>
              <input
                aria-label="Search cases"
                placeholder="Customer or case ID"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              />
            </label>
            {filters.status !== 'All' && <span>Ledger status: <b>{filters.status}</b></span>}
            {filtersActive && <button className="dq-clear" onClick={clearFilters}>Clear filters</button>}
            {filtersActive && <span>Showing {filtered.length} of {sweep.results.length} assessed.</span>}
          </div>

          {/* Honest reporting of anything that did not complete. */}
          {sweep.stoppedShort && (
            <div className="dq-note bad">
              <b>The sweep stopped before the whole book was assessed.</b> {sweep.stopReason || 'No reason was reported.'}
              {' '}Only the {sweep.assessed} customer{sweep.assessed === 1 ? '' : 's'} below were evaluated; the remaining
              {' '}{sweep.total != null ? Math.max(0, sweep.total - sweep.assessed) : 'unknown number of'} customers were not, and nothing is claimed about them.
            </div>
          )}
          {!!sweep.failures.length && (
            <div className="dq-note bad">
              <b>{sweep.failures.length} customer{sweep.failures.length === 1 ? '' : 's'} failed to evaluate</b>
              <ul>
                {sweep.failures.slice(0, 8).map((failure, index) => (
                  <li key={`${failure.customerId}-${index}`}>
                    {failure.name || failure.customerId}: {failure.error}
                    {failure.circuitBreaker ? ' (circuit breaker)' : ''}{failure.autoResumed ? ' — auto-resumed' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!sweep.skips.length && (
            <div className="dq-note warn">
              <b>{sweep.skips.length} skipped</b>
              <ul>
                {sweep.skips.slice(0, 8).map((item, index) => (
                  <li key={`${item.customerId}-${index}`}>{item.name || item.customerId}: {item.reason}{item.hint ? ` — ${item.hint}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {!!sweep.breaker.stillHalted.length && (
            <div className="dq-note bad">
              <b>{sweep.breaker.stillHalted.length} customer pipeline(s) remain halted</b> after this sweep and were not evaluated.
            </div>
          )}
          {!!sweep.breaker.tripped.length && !sweep.breaker.stillHalted.length && (
            <div className="dq-note warn">The circuit breaker tripped for {sweep.breaker.tripped.length} customer(s) during the sweep; all were auto-resumed.</div>
          )}
          {!!notEvaluated.length && (
            <div className="dq-note warn">
              <b>{notEvaluated.length} customer{notEvaluated.length === 1 ? '' : 's'} still carry no policy verdict.</b> The sweep
              did not establish an outcome for {notEvaluated.slice(0, 6).map((row) => row.name || row.customerId).join(', ')}
              {notEvaluated.length > 6 ? ` and ${notEvaluated.length - 6} more` : ''}. This is an unknown, not a pass.
            </div>
          )}
          {sweep.phase === 'failed' && (
            <div className="dq-note bad">The sweep could not start: {sweep.error}. Nothing was assessed.</div>
          )}

          {sweep.results.length > 0 && (
            <SweepColumns sweep={viewSweep} queue={queue} openCase={openCase} animate={animate} />
          )}

          <div className="dq-batch">
            <span className="k">Batch operations</span>
            <button
              className="dq-btn sm"
              disabled={!firstActionable}
              onClick={() => setSingleReview({ id: firstActionable.customerId, customer: firstActionable.name })}
            >
              Review next case
            </button>
            <button className="dq-btn sm" onClick={() => setReviewAll(true)}>Review entire customer book</button>
            <button className="dq-btn sm" onClick={() => setApproveAll(true)}>Approve hardship transitions</button>
          </div>
        </>
      )}

      <AskBar />

      {singleReview && (
        <SingleReview
          customerId={singleReview.id}
          customerName={singleReview.customer}
          actorId={actorId}
          openCase={openCase}
          onReviewed={onLedgerChanged}
          onClose={() => setSingleReview(null)}
        />
      )}
      {reviewAll && (
        <ReviewAllSummary
          actorId={actorId}
          openCase={(customerId) => { setReviewAll(false); openCase(customerId); }}
          onApproveAll={() => { setReviewAll(false); setApproveAll(true); }}
          onFinished={onLedgerChanged}
          onClose={() => setReviewAll(false)}
        />
      )}
      {approveAll && (
        <BulkApproval
          actorId={actorId}
          openCase={openCase}
          onApproved={onLedgerChanged}
          onClose={() => setApproveAll(false)}
        />
      )}
    </div>
  );
}
