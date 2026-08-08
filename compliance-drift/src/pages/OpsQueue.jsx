import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { QUEUE } from '../data/ops.js';

const PRIO = { High: '#D64545', Medium: '#E5A833', Low: '#C4C4CA' };
const SCHIP = {
  'Ready for review': 'ready', 'Evidence assembling': 'wait', 'Exception found': 'issue',
  'Investigation open': 'wait', Monitoring: 'mon', 'Data issue': 'issue',
};

export default function OpsQueue({ openCase, decisions, filters, setFilters }) {
  const filtered = QUEUE.filter((item) => (
    (filters.priority === 'All' || item.priority === filters.priority)
    && (filters.workflow === 'All' || item.workflow === filters.workflow)
    && (filters.status === 'All' || (decisions[item.id]?.approved ? 'Completed' : item.status) === filters.status)
    && (filters.team === 'All' || item.team === filters.team)
    && (!filters.query || `${item.customer} ${item.id} ${item.action} ${item.workflow}`.toLowerCase().includes(filters.query.toLowerCase()))
  ));

  const workflows = [...new Set(QUEUE.map((item) => item.workflow))];
  const statuses = [...new Set(QUEUE.map((item) => item.status)), 'Completed'];
  const teams = [...new Set(QUEUE.map((item) => item.team))];
  const readyCount = QUEUE.filter((item) => item.status === 'Ready for review' && !decisions[item.id]?.approved).length;
  const evidenceCount = QUEUE.filter((item) => item.status === 'Evidence assembling' || item.status === 'Data issue').length;
  const completedCount = Object.values(decisions).filter((item) => item.approved).length;

  return (
    <div className="page product-page">
      <Crumbs items={['Operations', 'Operational reviews']} />
      <div className="h1row product-heading">
        <div>
          <h1 className="display">Operational reviews</h1>
          <div className="h1sub">Reconcile customer data or determine hardship and best-offer action.</div>
        </div>
        <button className="btn-orange" onClick={() => filtered[0] && openCase(filtered[0].id)} disabled={!filtered.length}>Review next case <Icon name="chevR" size={13} /></button>
      </div>

      <div className="queue-summary">
        <div><b>{readyCount}</b><span>Ready for review</span></div>
        <div><b>{evidenceCount}</b><span>Awaiting evidence</span></div>
        <div><b>{completedCount}</b><span>Completed this session</span></div>
      </div>

      <div className="queue-toolbar">
        <div className="secheading">Open cases</div>
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
            <span><span className={`schip ${decisions[item.id]?.approved ? 'ready' : SCHIP[item.status]}`}>{decisions[item.id]?.approved ? 'Completed' : item.status}</span></span>
            <span className="sub">{item.action}</span>
            <span><button className="row-action" onClick={(event) => { event.stopPropagation(); openCase(item.id); }}>{decisions[item.id]?.approved ? 'View' : 'Review'}</button></span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="queue-empty">
            <Icon name="search" size={18} />
            <span>No cases match these filters.</span>
            <button onClick={() => setFilters({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' })}>Clear filters</button>
          </div>
        )}
      </div>

      <AskBar />
    </div>
  );
}
