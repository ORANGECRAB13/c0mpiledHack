import React, { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

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

export default function Monitoring({ decisions = {}, onDecision, openCase, openCustomer, focusId, monitoring = [] }) {
  const [selected, setSelected] = useState(null);
  const openProfile = (m) => (m.caseId ? openCase(m.caseId) : openCustomer?.(m.customer));
  useEffect(() => {
    if (focusId) setSelected(focusId);
  }, [focusId]);
  return (
    <div className="page product-page">
      <Crumbs items={['Operations', 'Monitoring']} />
      <div className="h1row product-heading">
        <div>
          <h1 className="display">Continuous monitoring</h1>
          <div className="h1sub">Reassess support when circumstances change—never simply leave customers enrolled indefinitely.</div>
        </div>
        <div className="monitor-summary"><b>2</b><span>reviews due</span><b>1</b><span>at risk</span></div>
      </div>

      <div className="mongrid">
        {monitoring.map((m) => (
          <div className={`moncard ${selected === m.id ? 'selected' : ''}`} key={m.id}>
            <div className="mh">
              <span>
                <div className="nm">{m.customer}</div>
                <div className="mid">{m.id} · next review {m.next}</div>
              </span>
              <span className={`schip ${decisions[m.id] ? 'ready' : STATUS[m.status]}`}>{decisions[m.id] ? 'Decision recorded' : m.status}</span>
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
            <div className="monitor-trigger"><span>Change detected</span>{m.trigger}</div>
            <div className="monrec">
              <div><b>{m.confidence}% confidence</b>{m.rec}</div>
              <small>Next action · {m.nextAction}</small>
            </div>
            <div className="monitor-actions">
              <button className="btn-ghost" onClick={() => setSelected((value) => value === m.id ? null : m.id)}>{selected === m.id ? 'Close evidence' : 'Review recommendation'}</button>
              {m.caseId && <button className="text-button primary" onClick={() => openCase(m.caseId)}>Open customer case</button>}
            </div>
            {selected === m.id && (
              <div className="monitor-review">
                <div className="monitor-evidence-title">Supporting evidence</div>
                {m.evidence.map((item) => <div className="monitor-evidence" key={item}><Icon name="check" size={12} />{item}</div>)}
                {decisions[m.id] ? (
                  <div className="monitor-recorded"><Icon name="check" size={13} />{decisions[m.id].outcome} · {decisions[m.id].officer}</div>
                ) : (
                  <div className="monitor-decision-actions">
                    <button className="btn-ghost" onClick={() => onDecision(m, 'Support retained · monitoring continues')}>Keep current support</button>
                    <button className="btn-orange" onClick={() => { onDecision(m, 'Human reassessment opened'); openProfile(m); }}>Start reassessment</button>
                  </div>
                )}
              </div>
            )}
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
