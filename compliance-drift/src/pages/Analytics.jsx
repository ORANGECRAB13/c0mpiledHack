import React from 'react';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { ANALYTICS } from '../data/ops.js';

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

export default function Analytics() {
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Analytics']} />
      <h1 className="display">Analytics</h1>
      <div className="h1sub">The numbers operations leaders manage to — investigation effort, turnaround and detection lead time.</div>

      <div className="anagrid">
        {ANALYTICS.kpis.map(([k, v, s, tone]) => (
          <div className="anacard" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
            <div className={`s ${tone || ''}`}>{s}</div>
          </div>
        ))}
      </div>

      <div className="chartrow">
        <div className="chartcard">
          <div className="secheading" style={{ margin: '0 0 6px' }}>Manual review workload</div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 10 }}>Open cases requiring a human, weekly</div>
          <Bars data={ANALYTICS.workload} color="#1F1F23" labels={WEEKS} />
        </div>
        <div className="chartcard">
          <div className="secheading" style={{ margin: '0 0 6px' }}>Hardship detection lead time</div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 10 }}>Days before first missed bill, weekly median</div>
          <Bars data={ANALYTICS.detection} color="#3D5AFE" labels={WEEKS} />
        </div>
      </div>

      <AskBar />
    </div>
  );
}
