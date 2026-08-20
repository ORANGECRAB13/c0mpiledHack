import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import SingleReview from '../components/SingleReview.jsx';
import ReviewAllSummary from '../components/ReviewAllSummary.jsx';
import BulkApproval from '../components/BulkApproval.jsx';
import { Chip } from '../components/ui.jsx';
import '../styles/review.css';

const PRIO = { High: '#D64545', Medium: '#E5A833', Low: '#C4C4CA' };
/* Queue status → chip tone. P4: colour only where it changes what the officer
   does next. "Monitoring" and "Evidence assembling" are states of the world, not
   findings, so they stay neutral. */
const STATUS_TONE = {
  'Ready for review': 'attention',
  'Exception found': 'blocking',
  'Data issue': 'blocking',
  'Investigation open': 'attention',
  'Evidence assembling': 'neutral',
  Monitoring: 'neutral',
  Completed: 'pass',
};

export default function OpsQueue({ openCase, decisions, filters, setFilters, queue = [], actorId = 'Priya N.', onLedgerChanged }) {
  // Which review surface is open: a single-customer review, the whole-book
  // summary, or the bulk approval dialog. Only one at a time.
  const [singleReview, setSingleReview] = useState(null);
  const [reviewAll, setReviewAll] = useState(false);
  const [approveAll, setApproveAll] = useState(false);

  const filtered = queue.filter((item) => (
    (filters.priority === 'All' || item.priority === filters.priority)
    && (filters.workflow === 'All' || item.workflow === filters.workflow)
    && (filters.status === 'All' || (decisions[item.id]?.approved ? 'Completed' : item.status) === filters.status)
    && (filters.team === 'All' || item.team === filters.team)
    && (!filters.query || `${item.customer} ${item.id} ${item.action} ${item.workflow}`.toLowerCase().includes(filters.query.toLowerCase()))
  ));

  const workflows = [...new Set(queue.map((item) => item.workflow))];
  const statuses = [...new Set(queue.map((item) => item.status)), 'Completed'];
  const teams = [...new Set(queue.map((item) => item.team).filter(Boolean))];
  const readyCount = queue.filter((item) => item.status === 'Ready for review' && !decisions[item.id]?.approved).length;
  const evidenceCount = queue.filter((item) => item.status === 'Evidence assembling' || item.status === 'Data issue').length;
  const completedCount = Object.values(decisions).filter((item) => item.approved).length;

  return (
    <div className="page product-page">
      <Crumbs items={['Operations', 'Detection']} />
      <div className="h1row product-heading">
        <div>
          <h1 className="display">Operational reviews</h1>
          <div className="h1sub">Reconcile customer data or determine hardship and best-offer action.</div>
        </div>
        <button className="btn-orange" onClick={() => filtered[0] && setSingleReview({ id: filtered[0].id, customer: filtered[0].customer })} disabled={!filtered.length}>Review next case <Icon name="chevR" size={13} /></button>
      </div>

      <div className="queue-toolbar">
        <div>
          <div className="secheading">Open cases</div>
          <div className="rv-countline">
            <b>{readyCount}</b> ready for review · <b>{evidenceCount}</b> awaiting evidence · <b>{completedCount}</b> completed this session
          </div>
        </div>
        <div>
          <label className="queue-search">
            <Icon name="search" size={13} />
            <input aria-label="Search cases" placeholder="Customer or case ID" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Workflow</span>
            <select value={filters.workflow} onChange={(event) => setFilters((current) => ({ ...current, workflow: event.target.value }))}>
              <option value="All">All workflows</option>
              {workflows.map((workflow) => <option key={workflow} value={workflow}>{workflow}</option>)}
            </select>
            <Icon name="chevD" size={12} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="All">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <Icon name="chevD" size={12} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Team</span>
            <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))}>
              <option value="All">All teams</option>
              {teams.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
            <Icon name="chevD" size={12} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Priority</span>
            <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
              <option value="All">All priorities</option>
              <option value="High">High priority</option>
              <option value="Medium">Medium priority</option>
              <option value="Low">Low priority</option>
            </select>
            <Icon name="chevD" size={12} />
          </label>
        </div>
      </div>

      <div className="rv-batchbar">
        <span>Batch operations</span>
        <button className="rv-btn small" onClick={() => setReviewAll(true)}>Review entire customer book</button>
        <button className="rv-btn small" onClick={() => setApproveAll(true)}>Approve hardship transitions</button>
      </div>

      <div className="qtable product-queue">
        <div className="q-head">
          <span>Customer</span><span>Workflow</span><span>Priority</span><span>Status</span><span>Next action</span><span />
        </div>
        {filtered.map((item) => (
          <div className={`q-row ${item.priority === 'High' ? 'priority-row' : ''}`} key={item.id} onClick={() => openCase(item.id)}>
            <span>
              <div className="cust">{item.customer}</div>
              <div className="cid">{item.id} · {item.state}</div>
            </span>
            <span>{item.workflow}</span>
            <span className="prio"><i style={{ background: PRIO[item.priority] }} />{item.priority}</span>
            <span><Chip tone={decisions[item.id]?.approved ? 'pass' : (STATUS_TONE[item.status] || 'neutral')}>{decisions[item.id]?.approved ? 'Completed' : item.status}</Chip></span>
            <span className="sub">{item.action}</span>
            <span className="rv-actions">
              <button className="rv-btn small" onClick={(event) => { event.stopPropagation(); setSingleReview({ id: item.id, customer: item.customer }); }}>Run review</button>
              <Icon name="chevR" size={13} />
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rv-empty">
            No cases match these filters.
            <button className="rv-btn small" onClick={() => setFilters({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' })}>Clear filters</button>
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
