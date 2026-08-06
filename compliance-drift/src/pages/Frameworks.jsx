import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

const STANDARDS = [
  ['ISO 9001', 45],
  ['ISO 14001', 36],
  ['ISO 45001', 42],
];

const LEGEND = [
  ['OK', '#3F9C5C', 0],
  ['Started', '#E5A833', 34],
  ['Missing evidence', '#D64545', 41],
  ['Not assessed', '#C9C5BD', 7],
];

// heatmap squares: g=grey, r=red, y=amber
const CATS = [
  { icon: 'findings', name: 'Context of the organisation', cells: 'ggrrrggggrryryrryyryr', foot: '0/21 OK' },
  { icon: 'grid', name: 'Leadership & policies', cells: 'yyyyyyyyyyyr', foot: '0/12 OK' },
  { icon: 'layers', name: 'Planning', cells: 'rryyyyyr', foot: '0/8 OK', miss: '3 missing evidence' },
];

const CELL = { g: '#DFDCD5', r: '#D64545', y: '#E5A833' };

function Donut() {
  const R = 34, C = 2 * Math.PI * R;
  const segs = [
    ['#E5A833', 34 / 82],
    ['#D64545', 41 / 82],
    ['#C9C5BD', 7 / 82],
  ];
  let off = 0;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      {segs.map(([col, f], i) => {
        const el = (
          <circle
            key={i} cx="48" cy="48" r={R} fill="none" stroke={col} strokeWidth="13"
            strokeDasharray={`${f * C} ${C}`} strokeDashoffset={-off * C}
            transform="rotate(-90 48 48)"
          />
        );
        off += f;
        return el;
      })}
      <text x="48" y="53" textAnchor="middle" fontSize="20" fontWeight="600" fill="#1C1B18" fontFamily="Inter">82</text>
    </svg>
  );
}

export default function Frameworks() {
  const [tab, setTab] = useState('Overview');
  const [banner, setBanner] = useState(true);
  return (
    <div className="page">
      <Crumbs items={['Frameworks']} />
      <div className="h1row">
        <div>
          <h1 className="display">Frameworks</h1>
          <div className="h1sub">Where you stand, and what changed — decisions in one place.</div>
        </div>
        <button className="btn-ghost"><Icon name="shield" size={15} /> Standards <span style={{ color: 'var(--t4)' }}>(3)</span> <Icon name="chevD" size={13} /></button>
      </div>

      {banner && (
        <div className="banner-info">
          <span>
            We check your documents against the standards and contracts you must meet — and flag missing
            evidence before an auditor does. Two things power it: what your company says it does, and the
            proof it did.
          </span>
          <button className="x" onClick={() => setBanner(false)}><Icon name="x" size={14} /></button>
        </div>
      )}

      <div className="kpirow">
        <div className="kpi">
          <div className="kl">Evidence coverage</div>
          <div className="kv"><span className="ringmini" /> 41% <span className="hl">0 of 82 OK · 34 started</span></div>
        </div>
        <div className="kpi">
          <div className="kl">Unowned rules</div>
          <div className="kv">0</div>
        </div>
      </div>

      <div className="tabrow">
        {[['Overview', 'grid'], ['Standards', 'shield'], ['Your rules', 'activity'], ['Evidence', 'check']].map(([t, ic]) => (
          <button key={t} className={`tb icon-tb ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            <Icon name={ic} size={15} /> {t}
          </button>
        ))}
      </div>
      <div className="tabdesc">Where you stand against the standards you work to.</div>

      <div className="secheading">Standards</div>
      <div className="cardgrid3">
        <div className="fcard">
          <div className="fc-h">Standards progress <button className="viewall">View all <Icon name="chevR" size={12} /></button></div>
          {STANDARDS.map(([nm, pct]) => (
            <div className="stdrow" key={nm}>
              <span className="ic"><Icon name="check" size={14} /></span>
              <span className="nm">{nm}</span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="pct">{pct}%</span>
            </div>
          ))}
          <div className="foot">Percentages count clauses with evidence — OK or started.</div>
        </div>

        <div className="fcard">
          <div className="fc-h">0% of rules have owners</div>
          <div className="ownerline">
            <span><span className="dot" style={{ background: '#D64545' }} />0 owned</span>
            <span><span className="dot" style={{ background: '#C9C5BD' }} />0 unowned</span>
          </div>
          <div className="thinbar" />
          <div className="hint">Assign owners from any rule's details.</div>
        </div>

        <div className="fcard">
          <div className="fc-h">41% of clauses have evidence</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              {LEGEND.map(([nm, col, n]) => (
                <div className="legendrow" key={nm}>
                  <span className="sw" style={{ background: col }} /> {nm} <span className="n">{n}</span>
                </div>
              ))}
            </div>
            <div className="donutwrap"><Donut /></div>
          </div>
        </div>
      </div>

      <div className="secheading">Categories</div>
      <div className="cardgrid3">
        {CATS.map((c) => (
          <div className="fcard catcard" key={c.name}>
            <div className="fc-h">
              <span className="lft"><span className="cat-ic"><Icon name={c.icon} size={13} /></span> {c.name}</span>
              <button className="viewall"><Icon name="chevR" size={14} /></button>
            </div>
            <div className="heat">
              {c.cells.split('').map((ch, i) => <i key={i} style={{ background: CELL[ch] }} />)}
            </div>
            <div className="catfoot">
              <span>{c.foot}</span>
              {c.miss && <span className="chip-miss">{c.miss}</span>}
            </div>
          </div>
        ))}
      </div>

      <AskBar />
    </div>
  );
}
