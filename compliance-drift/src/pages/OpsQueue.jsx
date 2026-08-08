import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { WORKLOAD, QUEUE } from '../data/ops.js';

const PRIO = { High: '#D64545', Medium: '#E5A833', Low: '#C4C4CA' };
const SCHIP = {
  'Ready for review': 'ready', 'Evidence assembling': 'wait', 'Exception found': 'issue',
  'Investigation open': 'wait', Monitoring: 'mon', 'Data issue': 'issue',
};

export default function OpsQueue({ openCase }) {
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Operational Queue']} />
      <div className="h1row">
        <div>
          <h1 className="display">Operational Queue</h1>
          <div className="h1sub">Today's operational workload — cases assembled, evaluated and ready for a human.</div>
        </div>
        <button className="btn-orange" onClick={() => document.querySelector('.qtable')?.scrollIntoView({ behavior: 'smooth' })}>
          Review Operational Queue <Icon name="chevR" size={13} />
        </button>
      </div>

      <div className="workgrid">
        {WORKLOAD.map((w) => (
          <div className="workcard" key={w.label}>
            <div className="n">{w.n}</div>
            <div className="l">{w.label}</div>
            <div className="wf">{w.wf}</div>
          </div>
        ))}
      </div>

      <div className="secheading" style={{ marginTop: 34 }}>Queue</div>
      <div className="qtable">
        <div className="q-head">
          <span>Customer</span><span>Location</span><span>Workflow</span><span>Priority</span><span>Decision status</span>
          <span>Required action</span><span>Policy impact</span><span>Team</span>
        </div>
        {QUEUE.map((q) => (
          <div className="q-row" key={q.id} onClick={() => q.hot && openCase()} style={q.hot ? { background: '#FCFCFD' } : {}}>
            <span>
              <div className="cust">{q.customer}</div>
              <div className="cid">{q.id}</div>
            </span>
            <span><span className="wfchip">{q.state}</span></span>
            <span>{q.workflow}</span>
            <span className="prio"><i style={{ background: PRIO[q.priority] }} />{q.priority}</span>
            <span><span className={`schip ${SCHIP[q.status]}`}>{q.status}</span></span>
            <span className="sub">{q.action}</span>
            <span className="sub">{q.policy}</span>
            <span className="sub">{q.team}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '12px 4px' }}>
        + 81 more cases across payment difficulty, best offer, onboarding, revenue assurance and unknown consumer workflows
      </div>

      <AskBar />
    </div>
  );
}
