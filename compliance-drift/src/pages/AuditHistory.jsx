import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { AUDITS } from '../data/ops.js';

export default function AuditHistory() {
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Audit History']} />
      <div className="h1row">
        <div>
          <h1 className="display">Audit History</h1>
          <div className="h1sub">Every decision, regulator-ready — evidence, rules, policy version, officer and timestamp.</div>
        </div>
        <button className="btn-ghost"><Icon name="upload" size={14} /> Export JSON</button>
      </div>

      <div className="qtable audittable" style={{ marginTop: 26 }}>
        <div className="q-head">
          <span>Decision ID</span><span>Case</span><span>Workflow</span><span>Outcome</span>
          <span>Evidence</span><span>Approver</span><span>Timestamp</span>
        </div>
        {AUDITS.map((a) => (
          <div className="q-row" key={a.id}>
            <span className="mono" style={{ fontSize: 12, color: '#3B6FE0' }}>{a.id}</span>
            <span className="cust" style={{ fontWeight: 600 }}>{a.case}</span>
            <span className="sub">{a.workflow}</span>
            <span style={{ fontWeight: 600 }}>{a.outcome}</span>
            <span className="auditmeta">{a.evidence} sources · {a.rules} rules · {a.policy}</span>
            <span className="sub">{a.officer}</span>
            <span className="auditmeta mono">{a.ts}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '12px 4px' }}>
        + 8,836 prior decisions · each record bundles the evidence used, rules evaluated, policy version, source systems, human notes, approver and timestamp
      </div>

      <AskBar />
    </div>
  );
}
