import React from 'react';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { MONITORING } from '../data/ops.js';

function Spark({ data, color }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 120},${28 - ((v - min) / (max - min || 1)) * 24}`).join(' ');
  return (
    <svg width="120" height="32" viewBox="0 0 120 32">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS = { Stable: 'ready', 'At risk': 'issue', 'On track': 'ready', Watch: 'wait' };

export default function Monitoring() {
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Monitoring']} />
      <h1 className="display">Monitoring</h1>
      <div className="h1sub">Customers already receiving support — trends watched continuously, changes surfaced for review.</div>

      <div className="mongrid">
        {MONITORING.map((m) => (
          <div className="moncard" key={m.id}>
            <div className="mh">
              <span>
                <div className="nm">{m.customer}</div>
                <div className="mid">{m.id} · next review {m.next}</div>
              </span>
              <span className={`schip ${STATUS[m.status]}`}>{m.status}</span>
            </div>
            <div className="monstats">
              <div className="ms">
                <div className="k">Debt trend</div>
                <Spark data={m.trend} color={m.hot ? '#D64545' : '#3F9C5C'} />
              </div>
              <div className="ms"><div className="k">Payments</div><div className="v">{m.pay}</div></div>
              <div className="ms"><div className="k">Balance</div><div className="v">{m.debt}</div></div>
              <div className="ms"><div className="k">Last interaction</div><div className="v">{m.last}</div></div>
            </div>
            <div className="monrec">{m.rec}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '14px 4px' }}>
        + 38 more supported accounts · removal of support always requires human review
      </div>

      <AskBar />
    </div>
  );
}
