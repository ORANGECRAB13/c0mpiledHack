import React, { useState } from 'react';
import { Sidebar, ProjectSidebar, IconRail } from './components/Chrome.jsx';
import Frameworks from './pages/Frameworks.jsx';
import ManagementSystem from './pages/ManagementSystem.jsx';
import RequiresAttention from './pages/RequiresAttention.jsx';
import Assistant from './pages/Assistant.jsx';
import Routines from './pages/Routines.jsx';
import OpsQueue from './pages/OpsQueue.jsx';
import CaseWorkspace from './pages/CaseWorkspace.jsx';
import Monitoring from './pages/Monitoring.jsx';
import AuditHistory from './pages/AuditHistory.jsx';
import PolicyLibrary from './pages/PolicyLibrary.jsx';
import Analytics from './pages/Analytics.jsx';

// Five screens, three sidebar variants (per the reference):
// frameworks/attention/assistant → expanded workspace sidebar
// mgmt → collapsed icon rail · routines → project sidebar
export default function App() {
  const [page, setPage] = useState('queue');
  const go = setPage;

  return (
    <div className="app">
      {page === 'mgmt' && <IconRail go={go} />}
      {page === 'routines' && <ProjectSidebar page={page} go={go} />}
      {!['mgmt', 'routines'].includes(page) && <Sidebar page={page} go={go} />}

      <div className="main">
        {page === 'frameworks' && <Frameworks />}
        {page === 'mgmt' && <ManagementSystem />}
        {page === 'attention' && <RequiresAttention />}
        {page === 'assistant' && <Assistant />}
        {page === 'routines' && <Routines />}
        {page === 'queue' && <OpsQueue openCase={() => go('case')} />}
        {page === 'case' && <CaseWorkspace back={() => go('queue')} />}
        {page === 'monitoring' && <Monitoring />}
        {page === 'audit' && <AuditHistory />}
        {page === 'policies' && <PolicyLibrary goMgmt={() => go('mgmt')} />}
        {page === 'analytics' && <Analytics />}
      </div>

      {/* temporary page switcher for the assistant screen (reachable via sidebar later) */}
      {page !== 'assistant' && (
        <button
          onClick={() => go('assistant')}
          style={{
            position: 'fixed', top: 12, right: 14, zIndex: 40,
            background: '#FFF', border: '1px solid var(--line2)', borderRadius: 8,
            fontSize: 12, fontWeight: 600, color: 'var(--t2)', padding: '6px 10px',
          }}
        >
          Assistant ↗
        </button>
      )}
    </div>
  );
}
