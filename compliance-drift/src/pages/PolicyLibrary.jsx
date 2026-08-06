import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { POLICIES } from '../data/ops.js';

export default function PolicyLibrary({ goMgmt }) {
  return (
    <div className="page">
      <Crumbs items={['Operations', 'Policy Library']} />
      <div className="h1row">
        <div>
          <h1 className="display">Policy Library</h1>
          <div className="h1sub">Policies are first-class objects — versioned, and wired to the workflows and rules they drive.</div>
        </div>
        <button className="btn-ghost" onClick={goMgmt}><Icon name="doc" size={14} /> Source documents</button>
      </div>

      <div style={{ marginTop: 26 }}>
        {POLICIES.map((p) => (
          <div className="polcard" key={p.name}>
            <div className="top">
              <span className="nm">{p.name}</span>
              <span className="ver">{p.ver}</span>
              <span className="eff">Effective {p.eff}</span>
            </div>
            <div className="sum">{p.summary}</div>
            <div className="polwf">
              {p.workflows.map((w) => <span className="wfchip" key={w}>{w}</span>)}
            </div>
            <div className={`polchange ${p.hot ? 'hot' : ''}`}>
              <Icon name={p.hot ? 'warn' : 'clock'} size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {p.change}
            </div>
          </div>
        ))}
      </div>

      <AskBar />
    </div>
  );
}
