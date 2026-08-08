import React from 'react';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { Mark } from '../icons.jsx';

const SYSTEMS = [
  { id: 'salesforce', name: 'Salesforce', kind: 'CRM', status: 'connected', tone: '#00A1E0', initials: 'SF' },
  { id: 'sap', name: 'SAP IS-U', kind: 'Billing', status: 'connected', tone: '#0FAAFF', initials: 'SAP' },
  { id: 'kraken', name: 'Kraken', kind: 'Billing platform', status: 'connected', tone: '#5A31F4', initials: 'KR' },
  { id: 'slack', name: 'Slack', kind: 'Messaging', status: 'placeholder', tone: '#611F69', initials: 'SL' },
  { id: 'gentrack', name: 'Gentrack', kind: 'Billing platform', status: 'placeholder', tone: '#1B7F5C', initials: 'GT' },
  { id: 'hubspot', name: 'HubSpot', kind: 'CRM', status: 'placeholder', tone: '#FF7A59', initials: 'HS' },
  { id: 'msdyn', name: 'MS Dynamics', kind: 'CRM', status: 'placeholder', tone: '#2266E3', initials: 'DY' },
  { id: 'nemlink', name: 'AEMO / NEM', kind: 'Market data', status: 'connected', tone: '#C7511F', initials: 'NEM' },
];

// hub-and-spoke: Vocare mark in the middle, each system on a ring around it
export default function Systems() {
  const W = 860, H = 520, CX = W / 2, CY = H / 2, R = 195;
  const nodes = SYSTEMS.map((s, i) => {
    const angle = (i / SYSTEMS.length) * Math.PI * 2 - Math.PI / 2;
    return { ...s, x: CX + Math.cos(angle) * R, y: CY + Math.sin(angle) * R * 0.82 };
  });

  return (
    <div className="page product-page">
      <Crumbs items={['Knowledge', 'Connected systems']} />
      <div className="h1row product-heading">
        <div>
          <h1 className="display">Connected systems</h1>
          <div className="h1sub">Every source Vocare reads from and writes back to — CRMs, billing platforms and messaging.</div>
        </div>
        <div className="monitor-summary">
          <b>{SYSTEMS.filter((s) => s.status === 'connected').length}</b><span>connected</span>
          <b>{SYSTEMS.filter((s) => s.status !== 'connected').length}</b><span>available</span>
        </div>
      </div>

      <div className="systems-graph">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Systems connected to Vocare">
          {nodes.map((n) => (
            <line key={`l-${n.id}`} x1={CX} y1={CY} x2={n.x} y2={n.y}
              stroke={n.status === 'connected' ? 'var(--green)' : 'var(--t3)'}
              strokeWidth="1.5" strokeDasharray={n.status === 'connected' ? '0' : '5 5'} opacity="0.55" />
          ))}
          {nodes.map((n) => (
            <g key={n.id} className={`sysnode ${n.status}`}>
              <circle cx={n.x} cy={n.y} r="34" fill="var(--bg1, #fff)" stroke={n.tone} strokeWidth="2" />
              <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="700" fill={n.tone}>{n.initials}</text>
              <text x={n.x} y={n.y + 50} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--t1, #222)">{n.name}</text>
              <text x={n.x} y={n.y + 65} textAnchor="middle" fontSize="11" fill="var(--t3, #888)">{n.kind}{n.status === 'placeholder' ? ' · coming soon' : ''}</text>
            </g>
          ))}
          <circle cx={CX} cy={CY} r="46" fill="var(--bg1, #fff)" stroke="var(--orange)" strokeWidth="2.5" />
          <foreignObject x={CX - 18} y={CY - 18} width="36" height="36">
            <Mark size={36} />
          </foreignObject>
          <text x={CX} y={CY + 66} textAnchor="middle" fontSize="13.5" fontWeight="700" fill="var(--t1, #222)">Vocare</text>
        </svg>
      </div>

      <div className="systems-list">
        {SYSTEMS.map((s) => (
          <div className="syscard" key={s.id}>
            <span className="sysbadge" style={{ color: s.tone, borderColor: s.tone }}>{s.initials}</span>
            <span className="sysid"><b>{s.name}</b><small>{s.kind}</small></span>
            <span className={`schip ${s.status === 'connected' ? 'ready' : 'wait'}`}>{s.status === 'connected' ? 'Connected' : 'Placeholder'}</span>
          </div>
        ))}
      </div>
      <AskBar />
    </div>
  );
}
