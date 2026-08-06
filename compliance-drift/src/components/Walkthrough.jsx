import React, { useEffect, useState } from 'react';
import { Icon, Tile } from '../icons.jsx';

// Mirrors the benefits2 slide series: vertical numbered rail on the left,
// one centered slide card per step with a scene inside, progress dots
// bottom-center. Problem slide first, outcome slide last.
const STEPS = [
  {
    n: 1, title: 'Proactive Source Watch', tag: 'INSTRUMENT REGISTERS',
    sub: 'Watching the regulatory registers…',
    color: '#8AA6FF', scene: 'watch',
  },
  {
    n: 2, title: 'Obligation Extraction', tag: 'AER · 2026 INSTRUMENT',
    sub: 'Fragments still unstructured…',
    color: '#6FD3E0', scene: 'extract',
  },
  {
    n: 3, title: 'Human Verification', tag: 'OBLIGATION REGISTER',
    sub: 'Running the register checks…',
    color: '#B79BFF', scene: 'verify',
  },
  {
    n: 4, title: 'Change Propagation', tag: 'POLICY REPO · GRAPH',
    sub: 'Diffing everything downstream…',
    color: '#F5B979', scene: 'propagate',
  },
];

const SLIDE_COUNT = STEPS.length + 2; // problem + steps + outcome

export default function Walkthrough() {
  const [i, setI] = useState(0);
  const step = i >= 1 && i <= STEPS.length ? STEPS[i - 1] : null;

  // keyboard paging like a deck
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(SLIDE_COUNT - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="walk">
      <div className="walkstage">
        {/* vertical numbered rail */}
        <div className="rail">
          {STEPS.map((s, r) => (
            <React.Fragment key={s.n}>
              {r > 0 && <span className="railtick" />}
              <button
                className={`railpill ${step?.n === s.n ? 'on' : ''}`}
                style={step?.n === s.n ? { background: s.color, color: '#FFF', boxShadow: `0 8px 20px ${s.color}66` } : {}}
                onClick={() => setI(r + 1)}
              >
                0{s.n}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="slidecard" key={i}>
          {i === 0 && <ProblemSlide onNext={() => setI(1)} />}
          {step && (
            <>
              <div className="sc-micro" style={{ color: 'var(--faintest)', letterSpacing: '0.16em' }}>
                STEP 0{step.n} / 0{STEPS.length} &nbsp;·&nbsp; {step.tag}
              </div>
              <div className="sc-title" style={{ fontSize: 24, marginTop: 8 }}>{step.title}</div>
              <div className="sc-sub" style={{ marginTop: 5 }}>{step.sub}</div>
              <div className="scene">
                {step.scene === 'watch' && <SceneWatch />}
                {step.scene === 'extract' && <SceneExtract />}
                {step.scene === 'verify' && <SceneVerify />}
                {step.scene === 'propagate' && <ScenePropagate />}
              </div>
            </>
          )}
          {i === SLIDE_COUNT - 1 && <OutcomeSlide />}

          <div className="dotsrow">
            {Array.from({ length: SLIDE_COUNT }).map((_, d) => (
              <button
                key={d}
                className={`walkdot ${d === i ? 'on' : ''}`}
                style={d === i && step ? { background: step.color } : {}}
                onClick={() => setI(d)}
              />
            ))}
          </div>
          <div className="walkarrows">
            <button className="ghostbtn" style={{ height: 36, padding: '0 14px' }} onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>←</button>
            <button className="blackbtn" style={{ height: 36, padding: '0 16px' }} onClick={() => setI(Math.min(SLIDE_COUNT - 1, i + 1))} disabled={i === SLIDE_COUNT - 1}>→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── slide 0: the problem ── */
function ProblemSlide() {
  return (
    <>
      <div className="sc-micro" style={{ color: '#C94F44' }}>THE PROBLEM</div>
      <div className="sc-title" style={{ fontSize: 26 }}>Today, regulatory change is caught far too late.</div>
      <div className="sc-sub">Your documents quietly go stale…</div>
      <div className="problemgrid">
        <svg viewBox="0 0 380 200" width="100%">
          <line x1="20" y1="172" x2="360" y2="172" stroke="#ECE9E1" />
          <path d="M20 144 H210 V64 H360" fill="none" stroke="#C94F44" strokeWidth="2" />
          <path d="M20 144 H360" fill="none" stroke="#B7B3A7" strokeWidth="2" strokeDasharray="4 5" />
          <circle cx="210" cy="64" r="3.5" fill="#C94F44" />
          <text x="218" y="54" fontSize="11" fontWeight="800" fill="#C94F44" fontFamily="inherit">$500 · 1 Jul</text>
          <text x="250" y="138" fontSize="10.5" fontWeight="700" fill="#8A867A" fontFamily="inherit">your documents · $300</text>
          <text x="20" y="192" fontSize="9.5" fontWeight="600" fill="#B7B3A7" fontFamily="inherit">Day 0 · instrument published</text>
          <text x="308" y="192" fontSize="9.5" fontWeight="600" fill="#B7B3A7" fontFamily="inherit">Day 90</text>
        </svg>
        <div>
          {[
            ['clock', 'Reactive, not proactive', 'A rule moves; the stale work instruction surfaces months later, on a discovery call.'],
            ['nodes', 'Fragmented corpus', '22 instruments across AEMC, AER, ESC and three states — no machine-readable versions.'],
            ['warn', 'Civil penalty exposure', 'Letters and thresholds derived from superseded instruments are Tier 1 territory.'],
          ].map(([ic, t, d]) => (
            <div className="ppoint" key={t}>
              <span className="ic"><Icon name={ic} size={16} /></span>
              <span>
                <div className="t">{t}</div>
                <div className="d">{d}</div>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── scenes ── */

// floating fragment chips, like the triage fragment cloud
const FRAGMENTS = [
  ['AEMC · NERR', 'v51 · clause hash stable', '#8AA6FF', 24, 12],
  ['AER · REGISTERS', 'etag changed ⚠', '#F0736B', 46, 34],
  ['ESC · ERCOP', 'v4 published · not commenced', '#6FD3E0', 12, 48],
  ['ENERGY.NSW', '2026-07 · stable', '#7FE0B8', 62, 16],
  ['QLD.GOV.AU', 'concessions · stable', '#B79BFF', 70, 56],
  ['AER · GUIDELINES', 'merge notice · Sep 2026', '#F5B979', 36, 68],
];

function SceneWatch() {
  return (
    <div className="fragcloud">
      {FRAGMENTS.map(([lab, val, col, x, y], i) => (
        <div className="fragchip" key={lab} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${0.12 + i * 0.1}s` }}>
          <div className="fl"><i style={{ background: col }} />{lab}</div>
          <div className="fv">{val}</div>
        </div>
      ))}
    </div>
  );
}

// light field cards + dark terminal, like plan optimization
function SceneExtract() {
  return (
    <div className="extractgrid">
      <div className="plancard">
        <div className="pc-h"><i style={{ background: '#8AA6FF' }} /> Draft row · OBL-014</div>
        {['instrument · AER (Retail Law) 2026', 'clause · s 111', 'value · $500 (was $300)', 'effective · 2026-07-01'].map((f) => (
          <div className="pc-f" key={f}>{f}</div>
        ))}
      </div>
      <div className="plancard">
        <div className="pc-h"><i style={{ background: '#6FD3E0' }} /> Draft row · OBL-041</div>
        {['instrument · ESC ERCoP v4', 'clause · cl 129', 'trigger · arrears > $55', 'effective · 2026-09-01'].map((f) => (
          <div className="pc-f" key={f}>{f}</div>
        ))}
      </div>
      <div className="terminal mono">
        <div className="tm-h">EXTRACTION LOG</div>
        {[
          '> parse s111 --instrument aer-2026',
          '  threshold: 500.00 AUD  ✓',
          '  effective: 2026-07-01  ✓',
          '  penalty: tier-1',
          '> status: draft · awaiting verify',
        ].map((l) => <div className="tm-l" key={l}>{l}</div>)}
      </div>
    </div>
  );
}

// check counter + approval, like "0/12 checks passed"
function SceneVerify() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v < 9 ? v + 1 : v)), 350);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="verifyscene">
      <div className="checkbig">
        <span className="n" style={{ color: n === 9 ? '#2C8F5C' : '#B79BFF' }}>{n}</span>
        <span className="d">/ 9 fields verified</span>
      </div>
      <div className="verifychips">
        {['clause ref', 'jurisdiction', 'version', 'effective date', 'obligated party', 'trigger', 'action', 'penalty tier', 'value'].map((c, i) => (
          <span className={`chip ${i < n ? 'ok' : 'neutral'}`} key={c}>{i < n ? '✓ ' : ''}{c}</span>
        ))}
      </div>
      {n === 9 && (
        <div className="approver" style={{ animation: 'popstamp .5s var(--ease)' }}>
          <span className="av">MO</span>
          <span>
            <div className="an">Approved by M. Okafor</div>
            <div className="ad">2026-07-02 09:41 · row frozen · immutable</div>
          </span>
        </div>
      )}
    </div>
  );
}

// big stat + flag chip + artifact cards, like the arrears/program-exit scene
function ScenePropagate() {
  return (
    <div className="propscene">
      <div className="bigstat">
        <div className="bs-c">REGISTER DIFF · OBL-014</div>
        <div className="bs-n"><s>$300</s> <span>$500</span></div>
        <div className="bs-bar" />
      </div>
      <div className="propright">
        <span className="flagchip">⚑ 4 ARTIFACTS FLAGGED</span>
        {[
          ['WI-4.2', 'Work instruction §4.2', 'critical'],
          ['EL-018', 'Warning letter template', 'critical'],
          ['TRN-M6', 'Training deck · module 6', 'high'],
          ['R-22', 'Breach register rule', 'high'],
        ].map(([id, nm, sev], i) => (
          <div className="propitem" key={id} style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
            <span className={`chip ${sev === 'critical' ? 'bad' : 'warn'}`}>{sev}</span>
            <span className="pn">{nm}</span>
            <span className="pi mono">{id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── final slide: the outcome ── */
function OutcomeSlide() {
  const cards = [
    ['Proactive, not reactive', 'Version bumps surface within a poll cycle — not on a discovery call.', 'pulse', ['#8AA6FF', '#9AAEF5']],
    ['One obligation register', 'A database of verified rows — not an index of chunks.', 'layers', ['#6FD3E0', '#8FD4DE']],
    ['Deterministic by design', 'No model output reaches a customer decision — a person approved every row.', 'shield', ['#B79BFF', '#C9B2FF']],
    ['Propagation, automatic', 'Every mapped artifact and graph node flags the moment its source moves.', 'send', ['#F5B979', '#F5CA9B']],
    ['Provenance built in', 'Every eligibility node cites its clause, with an instrument version.', 'map', ['#7FE0B8', '#8FE0B8']],
    ['History stays valid', 'Decisions are versioned, never overwritten — both outcomes correct for their date.', 'check', ['#8FE0B8', '#6FD3E0']],
  ];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 30 }}>
        <div>
          <div className="sc-micro" style={{ color: '#A6A296' }}>THE OUTCOME</div>
          <div className="sc-title" style={{ maxWidth: 430, fontSize: 26 }}>Compliance drift, caught the day it happens.</div>
        </div>
        <div className="outstats" style={{ paddingTop: 24 }}>
          {[['~4 min', 'vs months', '#8AA6FF'], ['0', 'stale artifacts', '#F5B979'], ['100%', 'decisions versioned', '#7FE0B8']].map(([n, c, col]) => (
            <div className="outstat" key={c}>
              <div className="n" style={{ color: col }}>{n}</div>
              <div className="c">{c}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="outgrid">
        {cards.map(([t, d, ic, grad], j) => (
          <div className="outcard" key={t} style={{ animationDelay: `${0.08 + j * 0.07}s` }}>
            <Tile icon={ic} grad={grad} size={40} radius={12} iconSize={18} />
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        ))}
      </div>
    </>
  );
}
