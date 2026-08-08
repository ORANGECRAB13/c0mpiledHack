import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { POLICIES } from '../data/ops.js';

export default function PolicyLibrary({ goMgmt, openCase, showImpact }) {
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
        {POLICIES.map((policy) => (
          <div className="polcard" key={policy.name}>
            <div className="top">
              <span className="nm">{policy.name}</span>
              <span className="ver">{policy.ver}</span>
              <span className="eff">Effective {policy.eff}</span>
            </div>
            <div className="sum">{policy.summary}</div>
            <div className="polwf">
              {policy.workflows.map((workflow) => <span className="wfchip" key={workflow}>{workflow}</span>)}
            </div>
            <div className={`polchange ${policy.hot ? 'hot' : ''}`}>
              <Icon name={policy.hot ? 'warn' : 'clock'} size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {policy.change}
            </div>
          </div>
        ))}
      </div>

      <AskBar />
    </div>
  );
}
