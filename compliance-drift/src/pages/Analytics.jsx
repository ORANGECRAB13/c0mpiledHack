import React from 'react';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

function Bars({ data, color, labels }) {
  const max = Math.max(...data);
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" preserveAspectRatio="none">
      {data.map((v, i) => {
        const h = (v / max) * 92;
        return <rect key={i} x={i * 40 + 8} y={104 - h} width="24" height={h} rx="4" fill={color} />;
      })}
      {labels.map((l, i) => (
        <text key={l} x={i * 40 + 20} y={117} fontSize="8.5" fill="#ACACB2" textAnchor="middle" fontFamily="Inter">{l}</text>
      ))}
    </svg>
  );
}

const WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'];

export default function Analytics({ queue = [], auditRecords = [] }) {
  const actionRequired = auditRecords.filter((item) => item.outcome === 'ACTION_REQUIRED').length;
  const analytics = {
    kpis: [
      ['Customers in scope', String(queue.length), 'Live from decision ledger'],
      ['Decisions recorded', String(auditRecords.length), 'Append-only history'],
      ['Actions required', String(actionRequired), 'Human approval queue', actionRequired ? 'hot' : ''],
      ['Pipelines halted', String(queue.filter((item) => item.pipelineHalted).length), 'Circuit-breaker protection'],
    ],
    workload: [0, 0, 0, 0, 0, Math.max(1, queue.length - 1), queue.length],
    detection: [0, 0, 0, 0, 0, Math.max(1, actionRequired - 1), actionRequired],
  };
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Outcomes']} />
      <h1 className="display">Workflow outcomes</h1>
      <div className="h1sub">Results for data reconciliation, hardship and best-offer action, and continuous monitoring.</div>

      <div className="anagrid">
        {analytics.kpis.map(([k, v, s, tone]) => (
          <div className="anacard" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
            <div className={`s ${tone || ''}`}>{s}</div>
          </div>
        ))}
      </div>

      <div className="chartrow">
        <div className="chartcard">
          <div className="secheading" style={{ margin: '0 0 6px' }}>Unresolved data conflicts</div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 10 }}>Customer records awaiting reconciliation, weekly</div>
          <Bars data={analytics.workload} color="#1F1F23" labels={WEEKS} />
        </div>
        <div className="chartcard">
          <div className="secheading" style={{ margin: '0 0 6px' }}>Silent customers identified</div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 10 }}>Customers detected before proactively requesting support</div>
          <Bars data={analytics.detection} color="#3D5AFE" labels={WEEKS} />
        </div>
      </div>

      <AskBar />
    </div>
  );
}
