import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar, Crumbs } from '../components/Chrome.jsx';

const STATUS_TONE = {
  'Ready for review': 'ready',
  'Evidence assembling': 'mon',
  'Exception found': 'issue',
  'Data issue': 'amber',
  'Monitoring': 'mon',
  'Investigation open': 'wait',
};

export default function Customers({ openCase, decisions, initialQuery = '', queue = [] }) {
  const [query, setQuery] = useState(initialQuery);
  const matches = queue.filter((item) => `${item.customer} ${item.id} ${item.state} ${item.team || ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page product-page">
      <Crumbs items={['Customers']} />
      <div className="h1row product-heading">
        <div>
          <h1 className="display">Customers</h1>
          <div className="h1sub">Find an account and continue its current review.</div>
        </div>
        <label className="customer-search">
          <Icon name="search" size={15} />
          <input aria-label="Search customers" placeholder="Name or case ID" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <div className="customer-directory">
        {matches.map((item) => (
          <button key={item.id} onClick={() => openCase(item.id)}>
            <span className="customer-avatar">{item.customer.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>
            <span className="customer-identity"><b>{item.customer}</b><small>{item.id} · {item.state} · {item.team}</small></span>
            <span className="customer-work"><b>{item.workflow}</b><small>{item.action}</small></span>
            <span className={`schip ${decisions[item.id]?.approved ? 'ready' : (STATUS_TONE[item.status] || 'wait')}`}>{decisions[item.id]?.approved ? 'Completed' : item.status}</span>
            <Icon name="chevR" size={14} />
          </button>
        ))}
        {!matches.length && <div className="queue-empty"><Icon name="search" size={18} /><span>No customers match “{query}”.</span></div>}
      </div>
      <AskBar />
    </div>
  );
}
