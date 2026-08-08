import React, { useState } from 'react';
import AskOverlay from './AskOverlay.jsx';
import { SUGGESTIONS } from '../data/askdocs.js';
import { Icon, Mark } from '../icons.jsx';

/* ── expanded workspace sidebar (Frameworks / Requires attention / etc.) ── */
export function Sidebar({ page, go }) {
  return (
    <div className="sidebar">
      <div className="sb-top">
        <div className="sb-logo">
          <Mark size={26} />
          <span className="word">Compliance</span>
        </div>
        <span className="bell"><Icon name="bell" size={17} /><span className="badge">50</span></span>
        <button className="collapse"><Icon name="chevL" size={15} /></button>
      </div>

      <div className="sb-search">
        <Icon name="search" size={15} />
        Find or ask anything…
        <span className="kbd">⌘K</span>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Workspace <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="sun" size={16} /> Today</button>
        <button className="sb-item" onClick={() => go('routines')}><Icon name="grid" size={16} /> Projects <span className="chev"><Icon name="chevR" size={13} /></span></button>
        <button className="sb-item"><Icon name="org" size={16} /> Organization <span className="chev"><Icon name="chevR" size={13} /></span></button>
        <button className="sb-item"><Icon name="zap" size={16} /> Operations <span className="chev"><Icon name="chevD" size={13} /></span></button>
        <div className="sb-sub">
          <button className={`sb-item ${['queue','case'].includes(page) ? 'on' : ''}`} onClick={() => go('queue')}>Operational Queue</button>
          <button className={`sb-item ${page === 'monitoring' ? 'on' : ''}`} onClick={() => go('monitoring')}>Monitoring</button>
          <button className={`sb-item ${page === 'audit' ? 'on' : ''}`} onClick={() => go('audit')}>Audit History</button>
          <button className={`sb-item ${page === 'policies' ? 'on' : ''}`} onClick={() => go('policies')}>Policy Library</button>
          <button className={`sb-item ${page === 'analytics' ? 'on' : ''}`} onClick={() => go('analytics')}>Analytics</button>
        </div>
        <button className={`sb-item ${['frameworks','attention','mgmt'].includes(page) ? '' : ''}`}><Icon name="shield" size={16} /> Compliance <span className="chev"><Icon name="chevD" size={13} /></span></button>
        <div className="sb-sub">
          <button className={`sb-item ${page === 'frameworks' ? 'on' : ''}`} onClick={() => go('frameworks')}>Frameworks</button>
          <button className={`sb-item ${page === 'attention' ? 'on' : ''}`} onClick={() => go('attention')}>Requires attention</button>
          <button className={`sb-item ${page === 'mgmt' ? 'on' : ''}`} onClick={() => go('mgmt')}>Management system</button>
          <button className="sb-item">Audits</button>
        </div>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Between companies <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="exchange" size={16} /> Exchange</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Manage <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="plug" size={16} /> Integrations</button>
        <button className="sb-item"><Icon name="clock" size={16} /> History</button>
      </div>

      <div className="sb-foot">
        <button className="sb-item"><Icon name="warn" size={16} /> Report a problem</button>
        <button className="sb-item"><Icon name="help" size={16} /> Help</button>
        <div className="sb-account">
          <span className="av"><Icon name="user" size={16} /></span>
          <span>
            <div className="nm">Account</div>
            <div className="rl">Project Manager, Northgate Tower</div>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── project sidebar (Routines screen) ── */
export function ProjectSidebar({ page, go }) {
  return (
    <div className="sidebar" style={{ width: 230 }}>
      <div className="sb-top">
        <div className="sb-logo">
          <Mark size={24} />
          <span className="word" style={{ fontSize: 15 }}>Compliance</span>
        </div>
        <span className="bell"><Icon name="bell" size={16} /><span className="badge">45</span></span>
        <button className="collapse"><Icon name="chevL" size={14} /></button>
      </div>

      <div className="sb-search">
        <Icon name="search" size={14} />
        Find or ask anything…
        <span className="kbd">⌘K</span>
      </div>

      <button className="sb-item" onClick={() => go('frameworks')} style={{ marginBottom: 10 }}>
        <Icon name="back" size={15} /> All projects
      </button>

      <div className="sb-sec">
        <div className="sb-h">Work <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="file" size={15} /> Files</button>
        <button className={`sb-item ${page === 'routines' ? 'on' : ''}`} style={page === 'routines' ? { borderLeft: '2px solid var(--orange)', borderRadius: '0 8px 8px 0' } : {}}>
          <Icon name="refresh" size={15} /> Routines
        </button>
        <button className="sb-item"><Icon name="mic" size={15} /> Meetings</button>
        <button className="sb-item"><Icon name="phone" size={15} /> Phone</button>
        <button className="sb-item"><Icon name="mail" size={15} /> Emails</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">Knowledge <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="brain" size={15} /> Brain</button>
        <button className="sb-item"><Icon name="activity" size={15} /> Activity</button>
        <button className="sb-item"><Icon name="findings" size={15} /> Findings</button>
      </div>

      <div className="sb-sec">
        <div className="sb-h">People <Icon name="chevU" size={12} /></div>
        <button className="sb-item"><Icon name="people" size={15} /> Members</button>
        <button className="sb-item"><Icon name="key" size={15} /> Access</button>
      </div>

      <div className="sb-foot">
        <button className="sb-item"><Icon name="warn" size={15} /> Report a problem</button>
        <button className="sb-item"><Icon name="help" size={15} /> Help</button>
        <div className="sb-account">
          <span className="av"><Icon name="user" size={15} /></span>
          <span>
            <div className="nm">Account</div>
            <div className="rl">Project Manager, Northgate Tower</div>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── collapsed icon rail (Management system screen) ── */
export function IconRail({ go }) {
  return (
    <div className="rail-side">
      <button className="ric" style={{ marginBottom: 6 }}><Mark size={22} /></button>
      <button className="ric"><Icon name="chevR" size={15} /></button>
      <div style={{ height: 26 }} />
      <button className="ric"><Icon name="search" size={16} /></button>
      <div style={{ height: 14 }} />
      <button className="ric"><Icon name="sun" size={16} /></button>
      <button className="ric" onClick={() => go('routines')}><Icon name="grid" size={16} /></button>
      <button className="ric"><Icon name="org" size={16} /></button>
      <button className="ric on" onClick={() => go('frameworks')}><Icon name="shield" size={16} /></button>
      <button className="ric"><Icon name="exchange" size={16} /></button>
      <div style={{ height: 22 }} />
      <button className="ric"><Icon name="plug" size={16} /></button>
      <button className="ric"><Icon name="clock" size={16} /></button>
      <div className="spacer" />
      <button className="ric"><Icon name="warn" size={16} /></button>
      <button className="ric"><Icon name="help" size={16} /></button>
      <button className="ric"><Icon name="user" size={16} /></button>
    </div>
  );
}

export function Crumbs({ items }) {
  return (
    <div className="crumbs">
      <a><Icon name="home" size={14} /> Home</a>
      {items.map((it, i) => (
        <React.Fragment key={it}>
          <span className="sep"><Icon name="chevR" size={11} /></span>
          <span className={i === items.length - 1 ? 'here' : ''}>{it}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function AskBar() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null); // the submitted query
  const submit = (text) => {
    const query = (text ?? q).trim() || SUGGESTIONS[0];
    setOpen(query);
    setQ('');
  };
  return (
    <>
      <div className="askbar">
        <span className="alogo"><Mark size={22} /></span>
        <input
          placeholder="Ask your documents, draft reports, automate — type @ for a project or file…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="mic" onClick={() => submit(SUGGESTIONS[0])}><Icon name="mic" size={18} /></button>
      </div>
      <div className="askhandle" />
      {open && <AskOverlay query={open} onClose={() => setOpen(null)} />}
    </>
  );
}
