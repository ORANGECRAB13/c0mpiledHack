import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AskBar } from '../components/Chrome.jsx';
import SingleReview from '../components/SingleReview.jsx';
import ReviewAllSummary from '../components/ReviewAllSummary.jsx';
import BulkApproval from '../components/BulkApproval.jsx';
import { StateNote } from '../components/ui.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';
import '../styles/review.css';

/* ============================================================================
 * Detection — the design's `queue` screen.
 *
 * The design ships three per-case tabs (needs / evidence / done). Our ledger has
 * a richer, authoritative vocabulary, so the strip is extended rather than
 * collapsed — flattening it would present recorded-for-audit customers as work
 * an officer had cleared.
 *
 *   needs (design)    → ACTION_REQUIRED
 *   evidence (design) → INSUFFICIENT_EVIDENCE, with the unresolved limbs named
 *   done (design)     → Completed (approved in this session)
 *   plus              → SENSITIVE_CUSTOMER · OPTED_OUT · ON_TAILORED_ASSISTANCE ·
 *                       NO_CHANGE · NOT_EVALUATED, each explicitly labelled
 *                       audit-only or unknown
 *
 * Categories are NOT derived here. GET /review-summary is the one place that
 * classifies a customer (it knows a lineage outcome like
 * PREVIOUS_DECISION_SUPERSEDED is not a policy verdict), and Home and the
 * customer-book review already render from it — so Detection reads the same
 * source rather than inventing a second, divergent set of buckets. It is a
 * read-only endpoint: opening this page never writes to the ledger.
 *
 * Nothing in a row or panel is synthesised: the reason column is the
 * deterministic outcome, the action column is the ledger's own action text, and
 * the panel is read from GET /cases/:id on expand.
 * ========================================================================== */

/* Priority rail — the design's PRIO map, in canonical tokens. Colour carries
   attention (rust) and nothing else; Medium/Low are greys. */
const RAIL = {
  High: 'var(--rust, #B4532A)',
  Medium: 'var(--muted, #6E767E)',
  Low: 'var(--line, #D2D6DA)',
};

/** The deterministic outcome, in plain English. One label per outcome the
 *  backend actually returns, and the raw value if it returns a new one. */
function reasonOf(outcome, fallback) {
  switch (outcome) {
    case 'ACTION_REQUIRED': return 'Policy action required';
    case 'INSUFFICIENT_EVIDENCE': return 'Evidence incomplete';
    case 'NO_CHANGE': return 'No change required';
    case null:
    case undefined: return 'Policy verdict not established';
    default: return outcome || fallback || 'Outcome not recorded';
  }
}

const DONE = 'SESSION_COMPLETED';

/* Order the strip so the two actionable categories lead, exactly as the design
   leads with "Needs decision" and "Awaiting evidence". */
const TAB_ORDER = ['ACTION_REQUIRED', 'INSUFFICIENT_EVIDENCE', 'NOT_EVALUATED', 'SENSITIVE_CUSTOMER', 'OPTED_OUT', 'ON_TAILORED_ASSISTANCE', 'NO_CHANGE'];

/* Every non-actionable tab says, in its own words, why it is not work. */
const TAB_NOTE = {
  INSUFFICIENT_EVIDENCE: 'These customers were evaluated but a limb of the eligibility test could not be proven, so no plan is proposed. Expand a row to see which limb is unresolved.',
  NO_CHANGE: 'These customers were evaluated and require no change. They are recorded for audit only and never enter the operations queue.',
  NOT_EVALUATED: 'No policy verdict has been established for these customers. Their latest decision carries a lineage outcome — it records that the decision moved, not what the policy found. This is not a pass; it is an unknown. Running a review establishes a verdict.',
  SENSITIVE_CUSTOMER: 'The CRM flags these customers as sensitive, so automated switching is held. They are recorded for audit and no transition is proposed.',
  OPTED_OUT: 'These customers have opted out of best-offer switching. They are recorded for audit and no transition is proposed.',
  ON_TAILORED_ASSISTANCE: 'These customers are already on tailored assistance. They are recorded for audit and no transition is proposed.',
  [DONE]: 'Approvals you recorded in this browser session. The ledger record itself is in Decision audit.',
};

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

export default function OpsQueue({ openCase, decisions, filters, setFilters, queue = [], actorId = 'Priya N.', onLedgerChanged }) {
  // Which review surface is open: a single-customer review, the whole-book
  // summary, or the bulk approval dialog. Only one at a time.
  const [singleReview, setSingleReview] = useState(null);
  const [reviewAll, setReviewAll] = useState(false);
  const [approveAll, setApproveAll] = useState(false);

  const [tab, setTab] = useState('ACTION_REQUIRED');
  const [expanded, setExpanded] = useState(null);
  const [summary, setSummary] = useState({ status: 'loading' });
  const rowsRef = useRef(null);

  /* Read-only classification. Re-read whenever the ledger changes underneath us
     (a review run or an approval) so the tabs never lag the rows. */
  const ledgerStamp = queue.map((item) => item.evaluatedAt).join('|');
  useEffect(() => {
    let live = true;
    decisionLayerApi.loadReviewSummary({ limit: 500, includeCustomers: true })
      .then((body) => {
        if (!live) return;
        setSummary({
          status: 'ready',
          tabs: body.summary?.tabs || [],
          byId: new Map((body.customers || []).map((row) => [row.customerId, row])),
        });
      })
      .catch((error) => { if (live) setSummary({ status: 'error', error: error.message }); });
    return () => { live = false; };
  }, [ledgerStamp]);

  const byId = summary.byId;

  const categoryOf = (item) => {
    if (decisions[item.id]?.approved) return DONE;
    const record = byId?.get(item.id);
    if (record) return record.category;
    // Summary unavailable (or this row is not on its page): fall back to the
    // ledger row's own outcome, and never claim a verdict we do not have.
    if (item.status === 'Ready for review') return 'ACTION_REQUIRED';
    if (item.outcome === 'INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
    if (item.outcome === 'NO_CHANGE') return 'NO_CHANGE';
    return 'NOT_EVALUATED';
  };

  /* The filter object is shared with the ask bar and the voice tools
     (`filter_queue`, "show me high priority hardship cases"), so every filter it
     can set is still applied and still has a visible control. Category is owned
     by the tab strip; if a command sets a ledger status we surface it as an
     extra active filter rather than silently dropping rows. */
  const matches = useMemo(() => queue.filter((item) => (
    (filters.priority === 'All' || item.priority === filters.priority)
    && (filters.workflow === 'All' || item.workflow === filters.workflow)
    && (filters.team === 'All' || item.team === filters.team)
    && (filters.status === 'All' || item.status === filters.status)
    && (!filters.query || `${item.customer} ${item.id} ${item.action} ${item.workflow}`.toLowerCase().includes(filters.query.toLowerCase()))
  )), [queue, filters]);

  const counts = useMemo(() => {
    const tally = {};
    matches.forEach((item) => { const key = categoryOf(item); tally[key] = (tally[key] || 0) + 1; });
    return tally;
  }, [matches, decisions, byId]);

  const labels = useMemo(() => {
    const map = { [DONE]: 'Completed' };
    (summary.tabs || []).forEach((item) => { map[item.key] = item.label; });
    TAB_ORDER.forEach((key) => { if (!map[key]) map[key] = key.toLowerCase().replace(/_/g, ' '); });
    return map;
  }, [summary.tabs]);

  const actionable = useMemo(() => new Set((summary.tabs || []).filter((item) => item.actionable).map((item) => item.key)), [summary.tabs]);

  const visibleTabs = [...TAB_ORDER, DONE].filter((key) => key === tab || key === 'ACTION_REQUIRED' || counts[key]);

  const rows = useMemo(() => matches
    .filter((item) => categoryOf(item) === tab)
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
      || (b.oldestDebtDays || 0) - (a.oldestDebtDays || 0)
      || a.customer.localeCompare(b.customer)),
  [matches, tab, decisions, byId]);

  const workflows = useMemo(() => [...new Set(queue.map((item) => item.workflow))], [queue]);
  const teams = useMemo(() => [...new Set(queue.map((item) => item.team).filter(Boolean))], [queue]);
  const filtersActive = filters.priority !== 'All' || filters.workflow !== 'All' || filters.team !== 'All' || filters.status !== 'All' || !!filters.query;
  const clearFilters = () => setFilters({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' });

  const reviewNext = () => {
    const next = matches.find((item) => categoryOf(item) === 'ACTION_REQUIRED');
    if (!next) return;
    setTab('ACTION_REQUIRED');
    setExpanded(next.id);
    requestAnimationFrame(() => rowsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="page dq">
      <div className="dq-eyebrow">Detection</div>
      <div className="dq-head">
        <div>
          <h1>Cases waiting on you</h1>
          <p>Ordered by priority, then by the age of the oldest debt. Every row is a recorded evaluation against {queue[0]?.policy || 'the policy in force'}.</p>
        </div>
        <div className="dq-head-actions">
          <button className="dq-btn solid" onClick={reviewNext} disabled={!counts.ACTION_REQUIRED}>Review next case →</button>
        </div>
      </div>

      <div className="dq-tabbar">
        <div className="dq-tabs">
          {visibleTabs.map((key) => (
            <button
              key={key}
              className={`dq-tab${key === tab ? ' on' : ''}`}
              onClick={() => { setTab(key); setExpanded(null); }}
            >
              {labels[key]}{!actionable.has(key) && key !== DONE ? ' · audit only' : ''}
              <span className="n">{counts[key] || 0}</span>
            </button>
          ))}
        </div>
        <label className="dq-search">
          <span aria-hidden="true" style={{ fontSize: 12 }}>⌕</span>
          <input
            aria-label="Search cases"
            placeholder="Customer or case ID"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </label>
      </div>

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
        {filters.status !== 'All' && <span>Ledger status: <b>{filters.status}</b></span>}
        {filtersActive && <button className="dq-clear" onClick={clearFilters}>Clear filters</button>}
      </div>

      <div className="dq-batch">
        <span className="k">Batch operations</span>
        <button className="dq-btn sm" onClick={() => setReviewAll(true)}>Review entire customer book</button>
        <button className="dq-btn sm" onClick={() => setApproveAll(true)}>Approve hardship transitions</button>
      </div>

      {summary.status === 'error' && (
        <div className="dq-note bad">
          The classification service could not be read: {summary.error}. Rows are grouped from each ledger row&apos;s own
          outcome instead, which cannot tell a lineage outcome from a policy verdict — treat the counts as provisional.
        </div>
      )}
      {TAB_NOTE[tab] && <div className={`dq-note${actionable.has(tab) ? '' : ' audit'}`}>{TAB_NOTE[tab]}</div>}

      <div className="dq-rows" ref={rowsRef}>
        {rows.map((item) => {
          const isOpen = expanded === item.id;
          const record = byId?.get(item.id);
          const done = !!decisions[item.id]?.approved;
          const stateLabel = done ? 'Completed' : tab === 'INSUFFICIENT_EVIDENCE' ? 'Held' : `${item.priority} priority`;
          const stateClass = done ? 'dq-fg-green'
            : tab === 'INSUFFICIENT_EVIDENCE' ? 'dq-fg-muted'
              : item.priority === 'High' ? 'dq-fg-rust' : 'dq-fg-muted';
          return (
            <div className={`dq-item${isOpen ? ' is-open' : ''}`} key={item.id}>
              <button
                className="dq-row"
                aria-expanded={isOpen}
                onClick={() => setExpanded((current) => (current === item.id ? null : item.id))}
              >
                <span className="dq-rail" style={{ background: done ? 'var(--body, #454B52)' : (RAIL[item.priority] || RAIL.Low) }} />
                <span className="dq-name">
                  <b>{item.customer}</b>
                  <small>
                    {item.id} · {item.state} · {item.team}
                    {item.sensitiveCustomer ? ' · sensitive' : ''}
                    {item.pipelineHalted ? ' · pipeline halted' : ''}
                  </small>
                </span>
                <span className="dq-reason">{record ? reasonOf(record.outcome, item.outcome) : reasonOf(item.outcome)}</span>
                <span className="dq-action">{item.action}</span>
                <span className={`dq-state ${stateClass}`}>{stateLabel}</span>
                <span className="dq-chev" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <CasePanel
                  item={item}
                  openCase={openCase}
                  onRunReview={() => setSingleReview({ id: item.id, customer: item.customer })}
                />
              )}
            </div>
          );
        })}

        {!rows.length && (
          <div className="dq-empty">
            {queue.length === 0 ? (
              <>
                <b>The ledger has not returned any customers</b>
                <div>Nothing is shown until the decision layer answers. Retry from the banner above.</div>
              </>
            ) : (
              <>
                <b>Nothing in this view</b>
                <div>No customer currently sits in “{labels[tab]}”{filtersActive ? ' under these filters' : ''}.</div>
                {filtersActive && <button className="dq-btn sm" onClick={clearFilters}>Clear filters</button>}
              </>
            )}
          </div>
        )}
      </div>

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

/* ----------------------------------------------------------------------------
 * The expanded case panel. Read-only: it fetches GET /cases/:id and shows what
 * is there. It never writes — running the review and approving both stay behind
 * their own explicit controls, so opening a row can never mutate the ledger.
 * -------------------------------------------------------------------------- */
function CasePanel({ item, openCase, onRunReview }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    decisionLayerApi.loadCase(item.id)
      .then((caseData) => { if (live) setState({ status: 'ready', caseData }); })
      .catch((error) => { if (live) setState({ status: 'error', error: error.message }); });
    return () => { live = false; };
  }, [item.id]);

  const caseData = state.caseData;
  // Unresolved limbs, straight from the case record. An INSUFFICIENT_EVIDENCE
  // result must say WHY, so both the named blocking rules and any BLOCKING
  // evidence rows are shown; if neither is present we say that instead of
  // rendering an empty panel.
  const evidence = Array.isArray(caseData?.evidence) ? caseData.evidence : [];
  const blockingNames = Array.isArray(caseData?.blockingEvidence) ? caseData.blockingEvidence : [];
  const blocking = evidence.filter((row) => row.severity === 'BLOCKING' || blockingNames.includes(row.rule));
  const unnamedBlocking = blockingNames.filter((name) => !blocking.some((row) => row.rule === name));
  const held = caseData?.outcome === 'INSUFFICIENT_EVIDENCE';
  const limbs = blocking.length + unnamedBlocking.length;

  return (
    <div className="dq-panel">
      <div>
        <div className="kicker">{held ? 'Held — evidence insufficient' : 'Recommendation'}</div>
        <h3>{caseData?.recommendation || (state.status === 'loading' ? 'Reading the case record…' : 'No recommendation recorded')}</h3>

        {state.status === 'error' && (
          <div className="dq-note bad">The case record could not be read: {state.error}. Nothing is inferred here.</div>
        )}
        {caseData && <p className="summary">{caseData.recommendationSummary || `The evaluation returned ${caseData.outcome}.`}</p>}

        {caseData?.actionStatus === 'AWAITING_APPROVAL' && (
          <div className="dq-note warn">
            This action is queued and <b>awaiting officer approval</b>. It has not been executed. Approval records a
            per-item verdict and, where the verdict is not AGREED, a reason.
          </div>
        )}
        {item.pipelineHalted && (
          <div className="dq-note bad">This customer&apos;s pipeline is <b>halted</b>. It is excluded from evaluation runs until it is resumed.</div>
        )}

        {!!limbs && (
          <div className="dq-blocking">
            <span className="k">{limbs} unresolved {limbs === 1 ? 'limb' : 'limbs'}</span>
            <ul>
              {blocking.map((row, index) => (
                <li key={`${row.rule}-${index}`}>
                  <b>{row.rule}{row.status ? ` · ${row.status}` : ''}</b>
                  {row.explanation}
                  {row.citation && <div className="cite">{row.citation}</div>}
                </li>
              ))}
              {unnamedBlocking.map((name) => (
                <li key={name}><b>{name}</b>The evaluation named this rule as blocking without recording an explanation.</li>
              ))}
            </ul>
          </div>
        )}
        {held && !limbs && state.status === 'ready' && (
          <StateNote tone="error">The evaluation returned INSUFFICIENT_EVIDENCE without naming a blocking rule. Nothing further is recorded against this case.</StateNote>
        )}
        {!!caseData?.missing?.length && (
          <div className="dq-note bad">Missing inputs: {caseData.missing.join(', ')}</div>
        )}

        <div className="dq-panel-actions">
          <button className="dq-btn solid md" onClick={onRunReview}>Run review</button>
          <button className="dq-btn md" onClick={() => openCase(item.id)}>Open full case</button>
        </div>
      </div>

      <div className="dq-side">
        <div><span>Confidence</span><b>{caseData?.confidence || (state.status === 'ready' ? 'Not recorded' : '…')}</b></div>
        <div><span>Evidence sources</span><b>{caseData ? (caseData.evidenceCompletion || `${caseData.sources?.length ?? 0} sources`) : '…'}</b></div>
        <div><span>Policy</span><b>{caseData?.policyVersion || item.policy || 'Not recorded'}</b></div>
        <div><span>Last evaluated</span><b>{item.evaluatedAt ? new Date(item.evaluatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not recorded'}</b></div>
        {caseData?.snapshotHash && (
          <div><span>Snapshot</span><b className="mono">{caseData.snapshotHash.slice(0, 20)}…</b></div>
        )}
      </div>
    </div>
  );
}
