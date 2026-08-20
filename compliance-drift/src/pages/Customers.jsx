import React, { useState } from 'react';
import { AskBar } from '../components/Chrome.jsx';
import '../styles/review.css';

/* The customer directory in the Detection language: same eyebrow + serif
   headline, same row rail and density as the detection queue, so moving between
   the two does not feel like moving between products. */

const RAIL = {
  High: 'var(--rust, #B4532A)',
  Medium: 'var(--muted, #6E767E)',
  Low: 'var(--line, #D2D6DA)',
};

export default function Customers({ openCase, decisions, initialQuery = '', queue = [] }) {
  const [query, setQuery] = useState(initialQuery);
  const matches = queue.filter((item) => `${item.customer} ${item.id} ${item.state} ${item.team || ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page dq">
      <div className="dq-eyebrow">Customers</div>
      <div className="dq-head">
        <div>
          <h1>The customer book</h1>
          <p>{queue.length} customer{queue.length === 1 ? '' : 's'} loaded from the decision ledger. Open an account to continue its current review.</p>
        </div>
      </div>

      <div className="dq-tabbar">
        <div className="dq-tabs">
          <button className="dq-tab on" type="button">All customers<span className="n">{matches.length}</span></button>
        </div>
        <label className="dq-search">
          <span aria-hidden="true" style={{ fontSize: 12 }}>⌕</span>
          <input aria-label="Search customers" placeholder="Name or case ID" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <div className="dq-rows">
        {matches.map((item) => {
          const done = !!decisions[item.id]?.approved;
          return (
            <div className="dq-item" key={item.id}>
              <button className="dq-row" onClick={() => openCase(item.id)}>
                <span className="dq-rail" style={{ background: done ? 'var(--body, #454B52)' : (RAIL[item.priority] || RAIL.Low) }} />
                <span className="dq-name">
                  <b>{item.customer}</b>
                  <small>{item.id} · {item.state} · {item.team}{item.sensitiveCustomer ? ' · sensitive' : ''}</small>
                </span>
                <span className="dq-reason">{item.workflow}</span>
                <span className="dq-action">{item.action}</span>
                <span className={`dq-state ${done ? 'dq-fg-green' : item.status === 'Ready for review' ? 'dq-fg-rust' : 'dq-fg-muted'}`}>
                  {done ? 'Completed' : item.status}
                </span>
                <span className="dq-chev" aria-hidden="true">→</span>
              </button>
            </div>
          );
        })}
        {!matches.length && (
          <div className="dq-empty">
            <b>No customers match “{query}”</b>
            <div>Only customers present in the decision ledger are listed here.</div>
          </div>
        )}
      </div>

      <AskBar />
    </div>
  );
}
