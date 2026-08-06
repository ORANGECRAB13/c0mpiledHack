import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { DOC_TABS, DOCS, DOC_OVERFLOW } from '../data/docs.js';

export default function ManagementSystem() {
  const [tab, setTab] = useState('Policies');
  const active = DOC_TABS.find((t) => t.id === tab);
  const rows = DOCS[tab] || [];
  return (
    <div className="page">
      <Crumbs items={['Compliance', 'Management system']} />
      <div className="h1row">
        <div>
          <h1 className="display">Management system</h1>
          <div className="h1sub">Your documents — and what the system read from them.</div>
        </div>
        <button className="btn-orange"><Icon name="upload" size={15} /> Upload files <Icon name="chevD" size={13} /></button>
      </div>

      <div className="tabrow" style={{ borderBottom: 'none', gap: 20, flexWrap: 'wrap' }}>
        {DOC_TABS.map(({ id, n }) => (
          <button key={id} className={`tb ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)} style={{ borderBottom: tab === id ? '2px solid var(--t1)' : '2px solid transparent' }}>
            {id} <span className="n">{n}</span>
          </button>
        ))}
        <button className="addview"><Icon name="plus" size={12} /> Add view</button>
        <button className="btn-ghost" style={{ marginLeft: 'auto', height: 32, padding: '0 10px' }}><Icon name="dots" size={15} /></button>
      </div>
      <div className="tabdesc">{active.desc}</div>

      <div className="doctable">
        <div className="dt-head">
          <span className="cbx" />
          <span>Name</span>
          <span>Discipline</span>
          <span>Uploaded by</span>
          <span>Updated</span>
          <span />
        </div>
        {rows.map(([nm, icons, by, date, flag]) => {
          const ext = nm.endsWith('.xlsx') ? 'XLSX' : nm.endsWith('.pdf') ? 'PDF' : 'DOCX';
          const extBg = ext === 'XLSX' ? '#2E9E63' : ext === 'PDF' ? '#D64545' : 'var(--blue)';
          return (
            <div className="dt-row" key={nm}>
              <span className="cbx" />
              <span className="docname">
                <span className="docxicon" style={{ background: extBg }}>{ext}</span>
                <span>
                  <div className="nm">{nm}</div>
                  <div className="sb">
                    {flag === 'stale'
                      ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>Drift flagged — cites superseded $300 threshold</span>
                      : 'Auto-filed'}
                  </div>
                </span>
              </span>
              <span className="dt-icons">
                {icons.map((ic, i) => <Icon name={ic} size={15} key={i} />)}
              </span>
              <span className={by ? 'dt-date' : 'dt-dash'}>{by || '—'}</span>
              <span className="dt-date">{date}</span>
              <span className="dt-actions">
                <button className="movebtn">Move <Icon name="chevD" size={12} /></button>
                <button className="xbtn"><Icon name="x" size={14} /></button>
              </span>
            </div>
          );
        })}
      </div>
      {DOC_OVERFLOW[tab] && (
        <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '12px 4px' }}>{DOC_OVERFLOW[tab]}</div>
      )}

      <AskBar />
    </div>
  );
}
