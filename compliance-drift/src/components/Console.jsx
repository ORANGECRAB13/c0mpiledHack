import React, { useEffect, useRef, useState } from 'react';
import { Icon, Tile } from '../icons.jsx';
import { ACTIVE_CASE, CASE_STATE, QUEUE, AGENTS, DOC, SYSTEMS } from '../data/platform.js';

// One scripted run: agents complete in order (~3.4s each); the document
// panel scans in sync (title → sections light up → clauses highlight).
export default function Console({ paused }) {
  const [step, setStep] = useState(-1); // index of last completed agent
  const [subEv, setSubEv] = useState(0); // events shown for the active agent
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setSubEv((e) => {
        const active = stepRef.current + 1;
        if (active >= AGENTS.length) return e;
        if (e + 1 > AGENTS[active].events.length) {
          setStep((s) => s + 1);
          return 0;
        }
        return e + 1;
      });
    }, 1700);
    return () => clearInterval(id);
  }, []);

  const stepRef = useRef(step);
  stepRef.current = step;

  const activeIdx = step + 1;
  const complete = step + 1;
  const running = activeIdx < AGENTS.length;
  const started = step >= 0 || subEv > 0;

  // document scan phases keyed off agent progress
  const scanning = started && activeIdx <= 1;
  const secOn = (i) => (activeIdx > 0 || subEv > 0 ? i <= activeIdx : false);
  const hlOn = activeIdx >= 2 || (activeIdx === 1 && subEv >= 2);
  const matched = activeIdx >= 3;
  const page = !started ? 1 : Math.min(3 + activeIdx * 2, DOC.pages);

  const stateDone = (i) => {
    // case-state rows resolve as the matching agents complete
    const gate = [2, 2, 3, 4, 5];
    return complete >= gate[i];
  };

  return (
    <div className="console">
      {/* ── left: active change ── */}
      <div>
        <div className="card panel-pad settle">
          <div className="microlabel">Active change</div>
          <div className="case-id">
            <span className="av">{ACTIVE_CASE.initials}</span>
            <span>
              <div className="nm">{ACTIVE_CASE.title}</div>
              <div className="rf">{ACTIVE_CASE.ref}</div>
            </span>
          </div>
          <span className={`chip ${started ? 'indigo' : 'neutral'}`}>
            {started ? ACTIVE_CASE.runChip : ACTIVE_CASE.idleChip}
          </span>

          <div className="progresslabel">
            <span className="microlabel">Agents complete</span>
            <span className="n">{complete} / {AGENTS.length}</span>
          </div>
          <div className="bar"><i style={{ width: `${(complete / AGENTS.length) * 100}%` }} /></div>

          <div className="microlabel" style={{ margin: '20px 0 4px' }}>Change state</div>
          {CASE_STATE.map((r, i) => (
            <div className="staterow" key={r.key}>
              <span className="k">{r.label}</span>
              <span className={`v ${stateDone(i) ? (r.accent ? 'hot' : '') : 'dim'}`}>
                {stateDone(i) ? r.done : r.idle}
              </span>
            </div>
          ))}
        </div>

        <div className="card panel-pad settle" style={{ marginTop: 16, animationDelay: '.1s' }}>
          <div className="microlabel" style={{ marginBottom: 6 }}>Queue</div>
          {QUEUE.map((q) => (
            <div className="queuerow" key={q.name}>
              <span className="av">{q.initials}</span>
              <span>
                <div className="nm">{q.name}</div>
                <div className="sb">{q.sub}</div>
              </span>
              <span className="dt" style={{ background: q.dot }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── middle: agent activity ── */}
      <div className="card panel-pad settle" style={{ animationDelay: '.06s' }}>
        <div className="aa-head">
          <div className="t">Agent<br />activity</div>
          <div className="s">· context<br />engine · live<br />transparency</div>
        </div>
        {AGENTS.map((a, i) => {
          const isDone = i <= step;
          const isActive = i === activeIdx && running;
          const shown = isDone ? a.events.length : isActive ? subEv : 0;
          return (
            <div className={`agentcard ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`} key={a.id}>
              <div className="agenttop">
                <Tile icon={a.icon} grad={a.grad} size={40} radius={12} iconSize={18} />
                <span>
                  <div className="nm">{a.name}</div>
                  <div className="sb">{a.sub}</div>
                </span>
                <span className="st">
                  {isDone && <span className="chip ok">Done</span>}
                  {isActive && <span className="chip indigo">Running</span>}
                </span>
              </div>
              {shown > 0 && (
                <div className="timeline">
                  {a.events.slice(0, shown).map((ev) => (
                    <div className={`tl-ev ${ev.state}`} key={ev.t + ev.text}>
                      <span className="ts mono">{ev.t}</span>
                      <span className="tx">{ev.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── right: document + systems ── */}
      <div>
        <div className="card docpanel settle" style={{ animationDelay: '.12s' }}>
          <div className="dochead">
            <span className="pdficon">PDF</span>
            <span>
              <div className="t">{DOC.title}</div>
              <div className="s">{DOC.sub}</div>
            </span>
            <span className="pg">p. {page} / {DOC.pages}</span>
          </div>
          <div className={`scanstate ${matched ? 'matched' : scanning || running ? 'scanning' : ''}`}>
            {matched
              ? <><Icon name="check" size={13} /> 3 clauses matched · register diff drafted</>
              : started
                ? <><span className="spinner" /> Scanning s 111 · extracting obligations…</>
                : 'Compliance check pending'}
          </div>
          <div className="docbody">
            <div className={`doctitle ${started ? 'on' : ''}`}>{DOC.title}</div>
            <div className="docmeta">National Energy Retail Law · Minimum disconnection amount · 2026</div>
            {DOC.sections.map((sec, i) => (
              <div className={`docsec ${secOn(i) ? 'on' : ''}`} key={sec.id}>
                <div className="h">{sec.heading}</div>
                {sec.paras.map((p) => (
                  <div className={`docp ${p.highlight && hlOn ? 'hl' : ''}`} key={p.text.slice(0, 24)}>
                    {p.text}
                    {p.highlight && hlOn && p.chip && (
                      <div><span className="clausechip"><Icon name="check" size={11} /> {p.chip}</span></div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="card panel-pad settle" style={{ marginTop: 16, animationDelay: '.18s' }}>
          <div className="microlabel" style={{ marginBottom: 4 }}>Connected systems</div>
          {SYSTEMS.map((s) => {
            const on = s.status === 'Connected';
            return (
              <div className="staterow" key={s.name}>
                <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: on ? '#34B37A' : '#D4D4D8',
                    boxShadow: on ? '0 0 6px rgba(52,179,122,.5)' : 'none',
                  }} />
                  <b style={{ color: 'var(--t1)', fontWeight: 700 }}>{s.name}</b>
                </span>
                <span className={`v ${on ? '' : 'dim'}`} style={{ color: on ? 'var(--deepgreen)' : undefined, fontSize: 11.5 }}>
                  {s.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
