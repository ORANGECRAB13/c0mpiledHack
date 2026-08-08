import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

// Each issue links to the page in the platform where it is worked:
// drifted documents → Policy Library · case work → Operational Queue ·
// re-bills and evidence → Audit History · plan performance → Monitoring.
const ISSUES = [
  { t: 'Rules check found drift in "Credit & Collections Work Instruction v11" — §4.2 still screens at $300 against the AER\'s $500 minimum', sub: 'Policy drift · flagged 4 Aug', page: 'policies', where: 'Policy Library' },
  { t: 'Amelia Hart (C-10482) — payment difficulty review ready, sensitive marker requires FDV handling', sub: 'Case work · High priority', page: 'queue', where: 'Operational Queue' },
  { t: 'Tom Castellano (C-10489) — 11-month unbilled period; 9-month back-billing cap applies before re-bill', sub: 'Revenue assurance · High priority', page: 'queue', where: 'Operational Queue' },
  { t: 'Letter template EL-018 still cites the superseded $300 disconnection amount', sub: 'Policy drift · flagged 4 Aug', page: 'policies', where: 'Policy Library' },
  { t: 'Liam Forsyth (AU-49673) — payment plan missed twice consecutively; re-engage before default listing window', sub: 'Plan performance · At risk', page: 'monitoring', where: 'Monitoring' },
  { t: 'Decision DEC-2026-08829 re-bill awaiting evidence bundle checksum', sub: 'Evidence · Audit trail', page: 'audit', where: 'Audit History' },
  { t: 'Training module 6 not yet updated for the AER (Retail Law) Instrument 2026 amounts', sub: 'Policy drift · flagged 4 Aug', page: 'policies', where: 'Policy Library' },
];

export default function RequiresAttention({ go }) {
  const [tab, setTab] = useState('my');
  return (
    <div className="page">
      <Crumbs items={['Compliance', 'Requires attention']} />
      <h1 className="display">Requires attention</h1>
      <div className="h1sub">Your to-do list — everything that needs a human.</div>

      <div className="tabrow">
        <button className={`tb icon-tb ${tab === 'my' ? 'on' : ''}`} onClick={() => setTab('my')}>
          <Icon name="user" size={15} /> My work <span className="n">37</span>
        </button>
        <button className={`tb icon-tb ${tab === 'all' ? 'on' : ''}`} onClick={() => setTab('all')}>
          <Icon name="layers" size={15} /> Everything
        </button>
      </div>
      <div className="tabdesc">Assigned to you or waiting on you — worst first.</div>

      <div className="workstats">
        {[['Overdue', 0], ['New', 0], ['Open', 37], ['Approvals', 0], ['Done', 1]].map(([l, v]) => (
          <div className="ws" key={l}>
            <div className="l">{l}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>

      <div className="grouph">
        <span className="gdot" />
        <span className="gt">Open</span>
        <span className="gn">37</span>
      </div>
      <div className="groupsub">Yours, with no deadline pressure yet.</div>

      <div className="issuelist">
        {ISSUES.map((it, i) => (
          <div className="issuerow" key={i} onClick={() => go(it.page)} role="button">
            <span className="rdot" />
            <span>
              <div className="tt">{it.t}</div>
              <div className="st">{it.sub} · opens {it.where}</div>
            </span>
            <span className="chev"><Icon name="chevR" size={15} /></span>
          </div>
        ))}
      </div>

      <AskBar />
    </div>
  );
}
