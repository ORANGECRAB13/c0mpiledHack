import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';
import { CASE } from '../data/ops.js';

export default function CaseWorkspace({ back }) {
  const [openSrc, setOpenSrc] = useState(null);
  const [modal, setModal] = useState(false);
  const [approved, setApproved] = useState(false);
  const c = CASE;

  return (
    <div className="page">
      <div className="crumbs">
        <a onClick={back}><Icon name="home" size={14} /> Home</a>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <a onClick={back}>Operational Queue</a>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <span className="here">{c.id} · {c.customer}</span>
      </div>

      <div className="h1row">
        <div>
          <h1 className="display" style={{ fontSize: 36 }}>{c.customer}</h1>
          <div className="h1sub">{c.meta} · {c.workflow} · Payment Difficulty Framework v4.2</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost"><Icon name="clock" size={14} /> Snooze</button>
          <button className="btn-orange" onClick={() => setModal(true)} disabled={approved}>
            <Icon name="check" size={14} /> {approved ? 'Approved' : 'Approve recommendation'}
          </button>
        </div>
      </div>

      {approved && (
        <div className="okbanner">
          <Icon name="check" size={16} />
          Decision DEC-2026-08847 recorded — hardship workflow updated, best-offer review initiated, follow-up scheduled 3 Nov 2026. Approving officer: Priya N.
        </div>
      )}

      <div className="casegrid">
        {/* ── left: snapshot + events ── */}
        <div>
          <div className="cpanel">
            <div className="ph">Customer snapshot</div>
            {c.snapshot.map(([k, v, hot]) => (
              <div className="snaprow" key={k}>
                <span className="k">{k}</span>
                <span className={`v ${hot ? 'hot' : ''}`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="cpanel">
            <div className="ph">Recent events</div>
            {c.events.map(([d, t]) => (
              <div className="evrow" key={t}><span className="d">{d}</span><span>{t}</span></div>
            ))}
          </div>
          <div className="cpanel">
            <div className="ph">Context sources <span style={{ color: 'var(--green)', letterSpacing: 0 }}>9 of 9 connected</span></div>
            {c.sources.map(([nm, detail], i) => (
              <div className="srcrow" key={nm}>
                <button className="srcbtn" onClick={() => setOpenSrc(openSrc === i ? null : i)}>
                  <span className="tick"><Icon name="check" size={14} /></span>
                  {nm}
                  <span className={`chev ${openSrc === i ? 'open' : ''}`}><Icon name="chevR" size={13} /></span>
                </button>
                {openSrc === i && <div className="srcdetail">{detail}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── middle: context + rules + actions ── */}
        <div>
          <div className="cpanel">
            <div className="ph">Operational context — what changed</div>
            {c.context.map((l) => <div className="ctxline" key={l}>{l}</div>)}
          </div>
          <div className="cpanel">
            <div className="ph">Rule evaluation — Payment Difficulty Framework v4.2</div>
            {c.rules.map(([nm, verdict, tone, why]) => (
              <div className="rule" key={nm}>
                <div className="top">
                  <span className="nm">{nm}</span>
                  <span className={`vchip ${tone}`}>{verdict}</span>
                </div>
                <div className="why"><b>Reason:</b> {why}</div>
              </div>
            ))}
          </div>
          <div className="cpanel">
            <div className="ph">Recommended actions</div>
            {c.actions.map(([a, on]) => (
              <div className="actrow" key={a}>
                <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={10} />}</span>
                {a}
              </div>
            ))}
          </div>
        </div>

        {/* ── right: readiness + missing ── */}
        <div>
          <div className="cpanel">
            <div className="ph">Recommendation</div>
            {c.readiness.map(([k, v]) => (
              <div className="readyrow" key={k}>
                <span className="k">{k}</span>
                <span className="v" style={v === 'Required' ? { color: '#3B6FE0' } : v === 'High' ? { color: 'var(--green)' } : {}}>{v}</span>
              </div>
            ))}
            <div className="readynote">
              Review for Payment Difficulty Support, switch to best available offer (saves $18/month) and
              prepare a $45/week arrangement. Nothing proceeds without your approval.
            </div>
          </div>
          <div className="cpanel">
            <div className="ph">Missing information</div>
            {c.missing.map((m) => <div className="missrow" key={m}>{m}</div>)}
            <div className="readynote" style={{ marginTop: 10 }}>
              Uncertainty is recorded with the decision — these gaps appear in the audit record and drive the follow-up contact.
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <div className="modalveil" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Approve recommendation</h3>
            <div className="sub">This approval will:</div>
            <div style={{ marginTop: 10 }}>
              {c.approvalEffects.map((e) => (
                <div className="effrow" key={e}><span className="tk">✓</span>{e}</div>
              ))}
            </div>
            <textarea placeholder="Notes for the decision record (optional)…" />
            <div className="note">Recorded as approving officer: <b>Priya N.</b> · Policy version PDF v4.2 · 9 evidence sources</div>
            <div className="btns">
              <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-orange" onClick={() => { setModal(false); setApproved(true); }}>
                Confirm approval
              </button>
            </div>
          </div>
        </div>
      )}

      <AskBar />
    </div>
  );
}
