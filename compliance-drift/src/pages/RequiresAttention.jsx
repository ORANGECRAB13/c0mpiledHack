import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

const ISSUES = [
  'Rules check found an issue in "Site Instruction: SW Stormwater Trench Rock Face Protection, Dewatering and Excavation Hold Point"',
  'Rules check found an issue in "Formal Variation Claim VO-102: Latent Rock Encountered in SW Stormwater Trench"',
  'Rules check found an issue in "Delay Notification Letter: Storm Event on 23 July 2026"',
  'Rules check found an issue in "New Starter Day-One Briefing Notice"',
  'Rules check found an issue in "New Joiner Welcome Briefing Notice"',
  'Rules check found an issue in "New Starter Day-One Briefing Notice"',
  'Rules check found an issue in "Subcontractor Insurance Certificate: Halevorn Construction"',
];

export default function RequiresAttention() {
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
        {ISSUES.map((t, i) => (
          <div className="issuerow" key={i}>
            <span className="rdot" />
            <span>
              <div className="tt">{t}</div>
              <div className="st">Rule conflict · Northgate Tower</div>
            </span>
            <span className="chev"><Icon name="chevR" size={15} /></span>
          </div>
        ))}
      </div>

      <AskBar />
    </div>
  );
}
