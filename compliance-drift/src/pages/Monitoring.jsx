import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import '../styles/review.css';
import CustomerProfile from './CustomerProfile.jsx';
import { Chip } from '../components/ui.jsx';

/* Monitoring reuses the Operational reviews (OpsQueue) treatment verbatim:
 * one hero action, the .rv-countline summary line, queue-toolbar search +
 * filter-selects, and the .qtable.product-queue list with the same row density,
 * priority rail and status chips. The row itself is the affordance — there is no
 * per-row button duplicating it. Selecting a row opens the customer profile,
 * which reads live Salesforce + Stripe data. */

const RISK = { High: '#D64545', Medium: '#E5A833', Low: '#C4C4CA' };
/* Monitoring status → chip tone. Same vocabulary as the detection queue. */
const STATUS_TONE = { Stable: 'pass', 'On track': 'pass', Watch: 'attention', 'At risk': 'blocking', Monitoring: 'neutral' };

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

export default function Monitoring({ decisions = {}, onDecision, openCase, openCustomer, focusId, monitoring = [] }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => { if (focusId) setSelectedId(focusId); }, [focusId]);

  /* The list runs to 100+ rows, so a panel rendered after the table would open
   * off-screen. It sits above the table instead, and we bring it into view. */
  const panelRef = useRef(null);
  useEffect(() => {
    if (selectedId && panelRef.current) panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  const statuses = useMemo(() => [...new Set(monitoring.map((item) => item.status).filter(Boolean))], [monitoring]);

  const filtered = useMemo(() => monitoring.filter((item) => (
    (filters.status === 'All' || (decisions[item.id] ? 'Decision recorded' : item.status) === filters.status)
    && (filters.risk === 'All' || riskOf(item) === filters.risk)
    && (filters.review === 'All' || reviewBucket(item) === filters.review)
    && (!filters.query || `${item.customer} ${item.id} ${item.nextAction || ''} ${item.rec || ''}`.toLowerCase().includes(filters.query.toLowerCase()))
  )), [monitoring, filters, decisions]);

  const dueCount = monitoring.filter((item) => ['Overdue', 'Due in 30 days'].includes(reviewBucket(item)) && !decisions[item.id]).length;
  const atRiskCount = monitoring.filter((item) => riskOf(item) === 'High' && !decisions[item.id]).length;
  const recordedCount = monitoring.filter((item) => decisions[item.id]).length;

  const selected = monitoring.find((item) => item.id === selectedId) || null;

  return (
    <div className="page product-page">
      <Crumbs items={['Operations', 'Monitoring']} />
      <div className="h1row product-heading">
        <div>
          <h1 className="display">Continuous monitoring</h1>
          <div className="h1sub">Reassess whether support still fits as circumstances change — never simply leave customers enrolled indefinitely.</div>
        </div>
        <button className="btn-orange" onClick={() => filtered[0] && setSelectedId(filtered[0].id)} disabled={!filtered.length}>Review next account <Icon name="chevR" size={13} /></button>
      </div>

      <div className="queue-toolbar">
        <div>
          <div className="secheading">Supported accounts</div>
          <div className="rv-countline">
            <b>{dueCount}</b> reviews due · <b>{atRiskCount}</b> at risk · <b>{recordedCount}</b> decisions recorded
          </div>
        </div>
        <div>
          <label className="queue-search">
            <Icon name="search" size={13} />
            <input aria-label="Search monitored accounts" placeholder="Customer or account ID" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="All">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              <option value="Decision recorded">Decision recorded</option>
            </select>
            <Icon name="chevD" size={12} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Review window</span>
            <select value={filters.review} onChange={(event) => setFilters((current) => ({ ...current, review: event.target.value }))}>
              <option value="All">All review windows</option>
              <option value="Overdue">Overdue</option>
              <option value="Due in 30 days">Due in 30 days</option>
              <option value="Later">Later</option>
              <option value="Not scheduled">Not scheduled</option>
            </select>
            <Icon name="chevD" size={12} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Risk</span>
            <select value={filters.risk} onChange={(event) => setFilters((current) => ({ ...current, risk: event.target.value }))}>
              <option value="All">All risk bands</option>
              <option value="High">High risk</option>
              <option value="Medium">Medium risk</option>
              <option value="Low">Low risk</option>
            </select>
            <Icon name="chevD" size={12} />
          </label>
        </div>
      </div>

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
                  <button className="btn-ghost" onClick={() => onDecision?.(selected, 'Support retained · monitoring continues')}>Keep current support</button>
                  <button className="btn-orange" onClick={() => { onDecision?.(selected, 'Human reassessment opened'); if (selected.caseId) openCase?.(selected.caseId); else openCustomer?.(selected.customer); }}>Start reassessment</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="qtable product-queue">
        <div className="q-head">
          <span>Customer</span><span>Review</span><span>Risk</span><span>Status</span><span>Next action</span><span />
        </div>
        {filtered.map((item) => {
          const risk = riskOf(item);
          const recorded = decisions[item.id];
          return (
            <div
              className={`q-row ${risk === 'High' ? 'priority-row' : ''} ${selectedId === item.id ? 'q-row-selected' : ''}`}
              key={item.id}
              onClick={() => setSelectedId((current) => (current === item.id ? null : item.id))}
            >
              <span>
                <div className="cust">{item.customer}</div>
                <div className="cid">{item.id}{item.debt ? ` · ${item.debt}` : ''}</div>
              </span>
              <span className="sub">{reviewLabel(item)}</span>
              <span className="prio"><i style={{ background: RISK[risk] }} />{risk}</span>
              <span><Chip tone={recorded ? 'pass' : (STATUS_TONE[item.status] || 'neutral')}>{recorded ? 'Decision recorded' : item.status}</Chip></span>
              <span className="sub">{item.nextAction || item.rec || 'Reassess current support'}</span>
              <span className="rv-actions"><Icon name="chevR" size={13} /></span>
            </div>
          );
        })}
        {filtered.length === 0 && monitoring.length > 0 && (
          <div className="rv-empty">
            No monitored accounts match these filters.
            <button className="rv-btn small" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
          </div>
        )}
        {monitoring.length === 0 && (
          <div className="rv-empty">
            <b>No accounts under continuous monitoring</b>
            <div>Accounts appear here once Salesforce records a hardship status other than NONE. Nothing is shown until the CRM says so.</div>
          </div>
        )}
      </div>

      <AskBar />
    </div>
  );
}
