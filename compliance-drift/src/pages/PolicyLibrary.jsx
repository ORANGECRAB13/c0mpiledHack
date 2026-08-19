import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

export default function PolicyLibrary({ goMgmt, openCase, showImpact, policies = [] }) {
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Policy Impact']} />
      <div className="h1row">
        <div>
          <h1 className="display">Policy Impact</h1>
          <div className="h1sub">When a source rule moves, Vocare finds every affected policy, workflow, case and decision.</div>
        </div>
        <button className="btn-ghost" onClick={goMgmt}><Icon name="doc" size={14} /> Source documents</button>
      </div>

      <div className={`change-card ${showImpact ? 'change-card-live' : ''}`}>
        <div className="change-main">
          <span className="schip issue">Action required</span>
          <div>
            <h2>Minimum disconnection amount changed to $500</h2>
            <p>AER s 111 · effective 1 July 2026 · detected 4 August</p>
          </div>
        </div>
        <div className="change-counts">
          <span><b>4</b> artifacts</span>
          <span><b>14</b> open cases</span>
          <span><b>2</b> changed recommendations</span>
        </div>
        <button className="btn-ghost" onClick={openCase}>Review affected case <Icon name="chevR" size={12} /></button>
      </div>

      <div className="section-title-row">
        <div><div className="secheading">Versioned policy objects</div><span>Mapped to live rules and workflows</span></div>
      </div>
      <div>
        {policies.map((policy) => (
          <div className="polcard" key={`${policy.id}@${policy.version}`}>
            <div className="top">
              <span className="nm">{policy.id}</span>
              <span className="ver">{policy.version}</span>
              <span className="eff">Effective {new Date(policy.effectiveFrom).toLocaleDateString('en-AU')}</span>
            </div>
            <div className="sum">{policy.owner} · {policy.jurisdiction} · {policy.citations?.map((item) => `${item.instrument} ${item.clauses}`).join(' · ')}</div>
            <div className="polwf">
              {policy.readFields?.map((field) => <span className="wfchip" key={field}>{field}</span>)}
            </div>
            <div className="polchange">
              <Icon name="clock" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              Versioned code policy · joins to the decision ledger as {policy.id}@{policy.version}
            </div>
          </div>
        ))}
      </div>

      <AskBar />
    </div>
  );
}
