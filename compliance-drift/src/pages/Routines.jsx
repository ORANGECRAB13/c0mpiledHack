import React, { useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';

const ROUTINES = [
  {
    name: 'Daily Diary Guard',
    desc: 'No site diary by 5pm → a nudge on Today. Publish when you\'re keeping diaries here.',
    draft: true, sched: null, actions: ['star', 'copy', 'trash'],
  },
  {
    name: 'End-of-Day Site Review',
    desc: 'Call you to review the day\'s progress and draft the Daily site diary.',
    draft: true, sched: ['Weekdays', 'Sun 26 Jul, 23:30 (Brisbane time)'], actions: ['star', 'copy', 'trash'],
  },
  {
    name: 'Weekly Site Report',
    desc: 'Draft the weekly site report from daily diaries, add reviewing it to your to-do list, and email Tony Marchetti and Marcus Ellington with the report.',
    draft: true, sched: ['Weekly', 'Thu 30 Jul, 22:00 (Brisbane time)'], actions: ['star', 'copy', 'trash'],
  },
  {
    name: 'Job Commencement Checklist',
    desc: 'Run the job commencement checklist and flag any outstanding items.',
    draft: false, sched: ['Daily', 'Wed 5 Aug, 14:00 (Brisbane time)'], actions: ['star', 'copy', 'trash'], open: true,
  },
  {
    name: 'Overdue Task Escalation',
    desc: 'Overdue tasks climb the ladder — site manager first, then you — and stop the moment anyone acts.',
    draft: false, sched: null, actions: ['star', 'play', 'copy', 'trash'],
  },
  {
    name: 'Monday Look-ahead',
    desc: 'Every Monday 6:30am — the week\'s top three risks, on Today.',
    draft: false, sched: ['Weekly', 'Sun 2 Aug, 13:30 (Brisbane time)'], actions: ['star', 'copy', 'trash'],
  },
  {
    name: 'Notice Clock',
    desc: 'Every contract deadline surfaces on Today 14 days out — nothing expires quietly.',
    draft: false, sched: null, actions: ['star', 'play', 'copy', 'trash'],
  },
  {
    name: 'Friday Site Diary Variation Check',
    desc: 'Reviews site diaries for work without variation or instruction and flags anything unclaimed.',
    draft: false, sched: ['Weekly', 'Fri 31 Jul, 16:00'], actions: ['star', 'copy', 'trash'],
  },
];

const RUN_STEPS = [
  ['clock', 'On a schedule', 'Daily · 07:00'],
  ['refresh', 'Check the documents', 'Subcontract agreement signed returned insurance certificate licence VOC induction · Last 14 days'],
  ['refresh', 'Check the inbox', 'Subcontract contract insurance licence induction commencement · Last 3 days'],
  ['refresh', 'Add to Needs you', 'Flag every job commencement checklist item that is still outstanding or overdue — subcontracts sent and signed…'],
];

export default function Routines() {
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState('My routines');
  const [pill, setPill] = useState('All');
  const [runTab, setRunTab] = useState('This run');
  return (
    <div className="page" style={{ paddingRight: panel ? 400 : 40 }}>
      <div className="crumbs">
        <a><Icon name="home" size={14} /> Home</a>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <span>Projects</span>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <span>Marlowe Distribution Centre <Icon name="chevD" size={11} style={{ verticalAlign: -1 }} /></span>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <span className="here">Routines</span>
      </div>

      <h1 className="display">Routines</h1>
      <div className="h1sub" style={{ maxWidth: 480 }}>
        Run repeatable project routines for notices, check-ins, reports, registers, and follow-ups.
      </div>

      <div className="tabrow">
        {[['Favourites', 'star', null], ['My routines', null, 8], ['Actions', null, null], ['History', null, 42]].map(([t, ic, n]) => (
          <button key={t} className={`tb ${ic ? 'icon-tb' : ''} ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {ic && <Icon name={ic} size={14} />} {t} {n && <span className="n">{n}</span>}
          </button>
        ))}
      </div>

      <div className="filterpills">
        <div className="searchbox"><Icon name="search" size={14} /> Search routines…</div>
        {[['All', 8], ['Drafts', 3], ['Scheduled', 3]].map(([p, n]) => (
          <button key={p} className={`fpill ${pill === p ? 'on' : ''}`} onClick={() => setPill(p)}>
            {p} <span className="n">{n}</span>
          </button>
        ))}
      </div>

      <div className="routgrid">
        {ROUTINES.map((r) => (
          <div className="routcard" key={r.name} style={r.open ? { borderColor: 'var(--line2)', boxShadow: '0 6px 20px rgba(0,0,0,0.06)' } : {}}>
            <div className="rc-h"><span className="cbx" /> {r.name}</div>
            <div className="rc-d">{r.desc}</div>
            <div className="rc-f">
              {r.draft && <span className="draftchip">DRAFT</span>}
              {r.sched && (
                <>
                  <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="refresh" size={12} /> {r.sched[0]}</span>
                  <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="clock" size={12} /> {r.sched[1]}</span>
                </>
              )}
              <span className="rc-icons">
                {r.actions.map((a) => <button key={a}><Icon name={a} size={14} /></button>)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="tplline">
        <span className="serif">Start from a template</span>
        <span>11 ways to get ahead</span>
      </div>

      {panel && (
        <div className="runpanel">
          <div className="rp-l">Routine run</div>
          <div className="rp-t">Job Commencement<br />Checklist</div>
          <div className="rp-actions">
            <button className="btn-ghost" style={{ height: 30, padding: '0 11px', fontSize: 12.5 }}><Icon name="play" size={12} /> Run</button>
            <button className="btn-ghost" style={{ height: 30, padding: '0 11px', fontSize: 12.5 }}><Icon name="edit" size={12} /> Edit</button>
            <button className="xbtn" onClick={() => setPanel(false)}><Icon name="x" size={14} /></button>
          </div>
          <div className="rp-tabs">
            {['This run', 'History'].map((t) => (
              <button key={t} className={`t ${runTab === t ? 'on' : ''}`} onClick={() => setRunTab(t)}>{t}</button>
            ))}
          </div>
          <div className="rp-steps">
            <div className="rp-l" style={{ marginTop: 16 }}>Steps</div>
            <div className="rp-note">Not running right now — here's what it'll do. Hit <b>Run</b> above to watch each step run.</div>
            {RUN_STEPS.map(([ic, t, d]) => (
              <div className="rp-step" key={t}>
                <span className="ic"><Icon name={ic} size={16} /></span>
                <span>
                  <div className="t">{t}</div>
                  <div className="d">{d}</div>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <AskBar />
    </div>
  );
}
