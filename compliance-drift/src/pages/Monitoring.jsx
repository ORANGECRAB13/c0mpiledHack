import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AskBar } from '../components/Chrome.jsx';
import { Icon } from '../icons.jsx';
import { humanSummary } from '../components/ui.jsx';
import '../styles/review.css';
import CustomerProfile from './CustomerProfile.jsx';

/* Monitoring reuses the Detection treatment verbatim: eyebrow + serif headline,
 * the same tab strip and search, and the same row (priority rail, name + meta,
 * reason, next action, state). The row itself is the affordance — there is no
 * per-row button duplicating it. Selecting a row opens the customer profile,
 * which reads live Salesforce + Stripe data. */

const RAIL = {
  High: 'var(--rust, #B4532A)',
  Medium: 'var(--muted, #6E767E)',
  Low: 'var(--line, #D2D6DA)',
};

const EMPTY_FILTERS = { status: 'All', risk: 'All', review: 'All', query: '' };

/** Risk band derived from the monitoring record, mirroring OpsQueue priorities. */
function riskOf(account) {
  if (account.risk) return account.risk;
  if (account.hot || account.status === 'At risk') return 'High';
  if (account.status === 'Watch') return 'Medium';
  return 'Low';
}

function reviewBucket(account) {
  const raw = account.next;
  if (!raw || raw === 'not scheduled') return 'Not scheduled';
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return 'Not scheduled';
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Overdue';
  if (days <= 30) return 'Due in 30 days';
  return 'Later';
}

function reviewLabel(account) {
  const raw = account.next;
  if (!raw || raw === 'not scheduled') return 'Review not scheduled';
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return `Next review ${raw}`;
  return `Next review ${due.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/* Tabs are cut on the review window, which is a real Salesforce field
   (Hardship_Review_Due_At__c). "Recorded" holds accounts an officer has already
   decided in this session — it is not a policy outcome, and says so. */
const TABS = [
  { key: 'due', label: 'Reassessment due' },
  { key: 'later', label: 'Scheduled' },
  { key: 'unscheduled', label: 'No review scheduled' },
  { key: 'recorded', label: 'Decision recorded' },
];

const TAB_NOTE = {
  unscheduled: 'No review date in Salesforce. Shown as missing, not as a date.',
  recorded: 'Recorded this session, in the browser only — the ledger is unchanged.',
};

export default function Monitoring({ decisions = {}, onDecision, openCase, openCustomer, focusId, monitoring = [] }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('due');

  useEffect(() => { if (focusId) setSelectedId(focusId); }, [focusId]);

  /* The list runs to 100+ rows, so a panel rendered after the table would open
   * off-screen. It sits above the table instead, and we bring it into view. */
  const panelRef = useRef(null);
  useEffect(() => {
    if (selectedId && panelRef.current) panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  const statuses = useMemo(() => [...new Set(monitoring.map((item) => item.status).filter(Boolean))], [monitoring]);

  const bucketOf = (item) => {
    if (decisions[item.id]) return 'recorded';
    const window = reviewBucket(item);
    if (window === 'Overdue' || window === 'Due in 30 days') return 'due';
    if (window === 'Not scheduled') return 'unscheduled';
    return 'later';
  };

  const matches = useMemo(() => monitoring.filter((item) => (
    (filters.status === 'All' || item.status === filters.status)
    && (filters.risk === 'All' || riskOf(item) === filters.risk)
    && (filters.review === 'All' || reviewBucket(item) === filters.review)
    && (!filters.query || `${item.customer} ${item.id} ${item.nextAction || ''} ${item.rec || ''}`.toLowerCase().includes(filters.query.toLowerCase()))
  )), [monitoring, filters]);

  const counts = useMemo(() => {
    const tally = {};
    matches.forEach((item) => { const b = bucketOf(item); tally[b] = (tally[b] || 0) + 1; });
    return tally;
  }, [matches, decisions]);

  const rows = useMemo(() => matches.filter((item) => bucketOf(item) === tab), [matches, tab, decisions]);

  const filtersActive = filters.status !== 'All' || filters.risk !== 'All' || filters.review !== 'All' || !!filters.query;
  const selected = monitoring.find((item) => item.id === selectedId) || null;

  const reviewNext = () => {
    const next = matches.find((item) => bucketOf(item) === 'due') || matches[0];
    if (next) { setTab(bucketOf(next)); setSelectedId(next.id); }
  };

  return (
    <div className="page dq">
      <div className="dq-eyebrow">Monitoring</div>
      <div className="dq-head">
        <div>
          <h1>Support that still has to fit</h1>
          <p>Reassess whether support still fits as circumstances change — never simply leave customers enrolled indefinitely. Removing support always requires human review.</p>
        </div>
        <div className="dq-head-actions">
          <button className="dq-btn solid" onClick={reviewNext} disabled={!matches.length}>Review next account →</button>
        </div>
      </div>

      <div className="dq-tabbar">
        <div className="dq-tabs">
          {TABS.map((item) => (
            <button key={item.key} className={`dq-tab${item.key === tab ? ' on' : ''}`} onClick={() => setTab(item.key)}>
              {item.label}<span className="n">{counts[item.key] || 0}</span>
            </button>
          ))}
        </div>
        <label className="dq-search">
          <span aria-hidden="true" style={{ fontSize: 12 }}>⌕</span>
          <input
            aria-label="Search monitored accounts"
            placeholder="Customer or account ID"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </label>
      </div>

      <div className="dq-filters">
        <span className="k">Filter</span>
        <label>
          <span className="sr-only">Status</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="All">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Review window</span>
          <select value={filters.review} onChange={(event) => setFilters((current) => ({ ...current, review: event.target.value }))}>
            <option value="All">All review windows</option>
            <option value="Overdue">Overdue</option>
            <option value="Due in 30 days">Due in 30 days</option>
            <option value="Later">Later</option>
            <option value="Not scheduled">Not scheduled</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Risk</span>
          <select value={filters.risk} onChange={(event) => setFilters((current) => ({ ...current, risk: event.target.value }))}>
            <option value="All">All risk bands</option>
            <option value="High">High risk</option>
            <option value="Medium">Medium risk</option>
            <option value="Low">Low risk</option>
          </select>
        </label>
        {filtersActive && <button className="dq-clear" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>}
      </div>

      {TAB_NOTE[tab] && <div className="dq-note audit">{TAB_NOTE[tab]}</div>}

      {selected && (
        <div className="mon-detail" ref={panelRef}>
          <CustomerProfile
            account={selected}
            onClose={() => setSelectedId(null)}
            onOpenCase={(caseId) => (caseId ? openCase?.(caseId) : openCustomer?.(selected.customer))}
          />
          <div className="cp-decision">
            {decisions[selected.id] ? (
              <div className="monitor-recorded"><Icon name="check" size={13} />{decisions[selected.id].outcome} · {decisions[selected.id].officer}</div>
            ) : (
              <>
                <div className="cp-decision-note">Removal of support always requires human review.</div>
                <div className="monitor-decision-actions">
                  <button className="dq-btn md" onClick={() => onDecision?.(selected, 'Support retained · monitoring continues')}>Keep current support</button>
                  <button className="dq-btn solid md" onClick={() => { onDecision?.(selected, 'Human reassessment opened'); if (selected.caseId) openCase?.(selected.caseId); else openCustomer?.(selected.customer); }}>Start reassessment</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="dq-rows">
        {rows.map((item) => {
          const risk = riskOf(item);
          const recorded = decisions[item.id];
          return (
            <div className={`dq-item${selectedId === item.id ? ' is-open' : ''}`} key={item.id}>
              <button
                className="dq-row"
                aria-expanded={selectedId === item.id}
                onClick={() => setSelectedId((current) => (current === item.id ? null : item.id))}
              >
                <span className="dq-rail" style={{ background: recorded ? 'var(--body, #454B52)' : (RAIL[risk] || RAIL.Low) }} />
                <span className="dq-name">
                  <b>{item.customer}</b>
                  <small>{item.id}{item.debt ? ` · ${item.debt}` : ''}</small>
                </span>
                <span className="dq-reason">{reviewLabel(item)}</span>
                <span className="dq-action">{item.nextAction || humanSummary(item.rec) || 'Reassess current support'}</span>
                <span className={`dq-state ${recorded ? 'dq-fg-green' : risk === 'High' ? 'dq-fg-rust' : 'dq-fg-muted'}`}>
                  {recorded ? 'Decision recorded' : item.status}
                </span>
                <span className="dq-chev" aria-hidden="true">{selectedId === item.id ? '▲' : '▼'}</span>
              </button>
            </div>
          );
        })}

        {!rows.length && (
          <div className="dq-empty">
            {monitoring.length === 0 ? (
              <>
                <b>No accounts under continuous monitoring</b>
                <div>Accounts appear here once Salesforce records a hardship status other than none. Nothing is shown until the CRM says so.</div>
              </>
            ) : (
              <>
                <b>Nothing in this view</b>
                <div>No monitored account currently sits in “{TABS.find((t) => t.key === tab)?.label}”{filtersActive ? ' under these filters' : ''}.</div>
                {filtersActive && <button className="dq-btn sm" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>}
              </>
            )}
          </div>
        )}
      </div>

      <AskBar />
    </div>
  );
}
