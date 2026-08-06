import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { RETRO } from '../data/platform.js';

export default function Retrospective() {
  const [ran, setRan] = useState(false);
  const [side, setSide] = useState('summary');

  return (
    <div className="retro">
      <div className="retroside">
        <div className="sec">
          <div className="microlabel" style={{ padding: '0 12px 8px' }}>Portfolio</div>
          <div className={`sideitem ${side === 'summary' ? 'on' : ''}`} onClick={() => setSide('summary')}>
            <Icon name="chart" size={16} /> Portfolio summary
          </div>
          <div className={`sideitem ${side === 'missed' ? 'on' : ''}`} onClick={() => setSide('missed')}>
            <Icon name="list" size={16} /> Missed updates
            <span className="cnt">{RETRO.missed}</span>
          </div>
        </div>

        <div className="sec">
          <div className="opencase">
            <div className="oc">Open case</div>
            <div className="id">{RETRO.openCase.id}</div>
            <div className="sb">{RETRO.openCase.sub}</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="sideitem"><Icon name="clock" size={15} /> Event timeline</div>
            <div className="sideitem"><Icon name="check" size={15} /> Clause diffs &amp; action</div>
            <div className="sideitem"><Icon name="doc" size={15} /> Audit trail</div>
          </div>
        </div>

        <div className="sidefoot">
          Analysis window
          <b>{RETRO.window}</b>
          <span style={{ display: 'block', marginTop: 8 }}>
            Read-only · human-in-the-loop · no autonomous edits
          </span>
        </div>
      </div>

      <div className="retromain">
        <div className="micro">{RETRO.micro}</div>
        <h1>{RETRO.title}</h1>
        <div className="sub">{RETRO.sub}</div>

        <div className="retrostats">
          {RETRO.stats.map(([c, n]) => (
            <div className="retrostat" key={c}>
              <div className="c">{c}</div>
              <div className="n">{n}</div>
            </div>
          ))}
          {ran && (
            <div className="retrostat" style={{ borderColor: '#F3C7C2' }}>
              <div className="c">Missed updates found</div>
              <div className="n" style={{ color: '#C94F44' }}>{RETRO.missed}</div>
            </div>
          )}
        </div>

        {!ran ? (
          <div className="runcard">
            <div style={{ flex: 1 }}>
              <div className="t">Run the retrospective</div>
              <div className="d">
                Reconstruct every instrument's version timeline, apply it against the
                retailer's own work instructions, letters and controls, and surface the
                update points that were missed — with a full evidence trail.
              </div>
            </div>
            <button className="blackbtn" onClick={() => setRan(true)}>
              Run retrospective analysis →
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: '22px 26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="microlabel">Missed update points · Jan – Jun 2026</span>
              <span className="chip bad">{RETRO.missed} found</span>
            </div>
            {RETRO.findings.map((f, i) => (
              <div className="findrow" key={f.id} style={{ animationDelay: `${i * 0.09}s` }}>
                <span className={`chip ${f.sev === 'critical' ? 'bad' : f.sev === 'high' ? 'warn' : 'neutral'}`}>{f.sev}</span>
                <span style={{ flex: 1 }}>
                  <div className="nm">{f.name}</div>
                  <div className="dt"><span className="mono" style={{ color: '#4A66C9' }}>{f.id}</span> · {f.detail}</div>
                </span>
                <Icon name="doc" size={16} color="#B7B3A7" />
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
              + 7 more across VIC entitlement text and QLD concession references · full evidence trail on each
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
