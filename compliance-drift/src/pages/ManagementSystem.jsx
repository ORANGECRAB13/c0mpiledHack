import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';
import { DOC_TABS, DOCS, DOC_OVERFLOW } from '../data/docs.js';

const OCTOBER_CONTROLS = [
  ['$1,000 floor', 'Disconnection blocked below the new minimum amount'],
  ['Tailored assistance', 'Automatic deemed-best-offer eligibility'],
  ['3 months + $1,000', 'Separate automatic-switch eligibility trigger'],
  ['Payment choice', 'Accessible fee-free method; direct debit optional'],
  ['Simple switching', '10-day check · 5-day notice · 10-day opt-out'],
  ['Concessions', 'Check at key interactions and preserve on switch'],
];

export default function ManagementSystem() {
  const [tab, setTab] = useState('Regulatory corpus');
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
      </div>

      <div className="tabrow" style={{ borderBottom: 'none', gap: 20, flexWrap: 'wrap' }}>
        {DOC_TABS.map(({ id, n }) => (
          <button key={id} className={`tb ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)} style={{ borderBottom: tab === id ? '2px solid var(--t1)' : '2px solid transparent' }}>
            {id} <span className="n">{n}</span>
          </button>
        ))}
      </div>
      <div className="tabdesc">{active.desc}</div>

      {tab === 'Regulatory corpus' && (
        <section className="october-controls">
          <div><b>Version 7 controls active</b><span>Victoria · effective 1 October 2026</span></div>
          <div className="october-control-grid">
            {OCTOBER_CONTROLS.map(([name, detail]) => <span key={name}><b>{name}</b><small>{detail}</small></span>)}
          </div>
        </section>
      )}

      <div className="doctable">
        <div className="dt-head">
          <span>Name</span>
          <span>Discipline</span>
          <span>Uploaded by</span>
          <span>Updated</span>
        </div>
        {rows.map(([nm, icons, by, date, flag]) => {
          const ext = nm.endsWith('.xlsx') ? 'XLSX' : nm.endsWith('.pdf') ? 'PDF' : 'DOCX';
          const extBg = ext === 'XLSX' ? '#2E9E63' : ext === 'PDF' ? '#D64545' : 'var(--blue)';
          return (
            <div className="dt-row" key={nm}>
              <span className="docname">
                <span className="docxicon" style={{ background: extBg }}>{ext}</span>
                <span>
                  <div className="nm">{nm}</div>
                  <div className="sb">
                    {flag === 'stale'
                      ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>Drift flagged — threshold and workflow update required</span>
                      : flag === 'superseded'
                        ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>Superseded by Version 7 from 1 October 2026</span>
                        : 'Auto-filed'}
                  </div>
                </span>
              </span>
              <span className="dt-icons">
                {icons.map((ic, i) => <Icon name={ic} size={15} key={i} />)}
              </span>
              <span className={by ? 'dt-date' : 'dt-dash'}>{by || '—'}</span>
              <span className="dt-date">{date}</span>
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
