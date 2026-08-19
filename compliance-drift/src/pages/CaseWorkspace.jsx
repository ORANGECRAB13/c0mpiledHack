import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';
import EvidenceOverlay from '../components/EvidenceOverlay.jsx';

/* Debt-trend bar chart: 12 monthly bars against a dashed regulatory threshold.
   The y-axis tops out at the threshold so "how far from disconnection" is the
   first thing the chart says. */
function TrendChart({ trend }) {
  const W = 560, H = 190, padL = 46, padR = 8, padT = 26, padB = 22;
  const max = Math.max(trend.threshold, ...trend.values);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const barW = innerW / trend.values.length - 8;
  const y = (v) => padT + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const fmt = (v) => `$${v >= 1000 ? `${v / 1000}k` : v}`;
  const last = trend.values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label={trend.caption}>
      {ticks.map((t) => (
        <g key={t}>
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--t4)">{fmt(t)}</text>
          {t > 0 && t < max && <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="var(--line)" strokeWidth="1" />}
        </g>
      ))}
      <line x1={padL} y1={y(max)} x2={W - padR} y2={y(max)} stroke="#C97A2B" strokeWidth="1" strokeDasharray="3 4" />
      <text x={W - padR} y={y(max) - 6} textAnchor="end" fontSize="10" fontWeight="600" fill="#C97A2B">{trend.thresholdLabel}</text>
      {trend.values.map((v, i) => {
        const x = padL + (innerW / trend.values.length) * i + 4;
        const fill = i === last ? '#B4531F' : i === last - 1 ? '#D9A05B' : i === last - 2 ? '#E4B87E' : '#E7E3DB';
        const h = Math.max(2, (v / max) * innerH);
        return (
          <g key={i}>
            <rect x={x} y={padT + innerH - h} width={barW} height={h} rx="2" fill={fill} />
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--t4)">{trend.months[i]}</text>
          </g>
        );
      })}
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--line)" strokeWidth="1" />
    </svg>
  );
}

function PlanCard({ plan, best = false }) {
  return (
    <div className={`plan-card ${best ? 'best' : ''}`}>
      <div className="plan-topline">
        <span className="decision-label">{plan.label}</span>
        {plan.recommended && <span className="plan-recommended">Recommended</span>}
      </div>
      <div className="plan-name">{plan.name}</div>
      <div className="plan-price">{plan.price}<small>{plan.per}</small>{plan.delta && <em>{plan.delta}</em>}</div>
      {plan.rows?.length > 0 && (
        <div className="plan-rows">
          {plan.rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
      )}
    </div>
  );
}

/* Cases without curated profile data still get the same view, synthesised from
   what the case already knows about itself. */
function buildProfile(c) {
  if (c.profile) return c.profile;
  const seed = [...String(c.id || c.customer || 'case')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const snapshot = Array.isArray(c.snapshot) ? c.snapshot : [];
  const sources = Array.isArray(c.sources) ? c.sources : [];
  const rules = Array.isArray(c.rules) ? c.rules : [];
  const decisionInputs = Array.isArray(c.decisionInputs) ? c.decisionInputs : [];
  const context = Array.isArray(c.context) && c.context.length
    ? c.context
    : [
        c.action || c.recommendation,
        decisionInputs[0] && `${decisionInputs[0][0]}: ${decisionInputs[0][1]}`,
        rules[0] && rules[0][3],
      ].filter(Boolean);
  const balanceText = snapshot.find(([label]) => label === 'Balance')?.[1] || '$0';
  const balance = Number(String(balanceText).replace(/[^0-9.]/g, '')) || 0;
  const endValue = Math.min(Math.max(balance, 40), 1400);
  const values = Array.from({ length: 12 }, (_, i) => {
    const progress = Math.max(0, i - 5) / 6;
    return Math.round(Math.max(4, endValue * progress + ((seed + i) % 12)));
  });
  const titles = ['What changed', 'Current position', 'What the evidence shows'];
  return {
    trendAnalysis: Array.from({ length: 3 }, (_, i) => [
      titles[i],
      context[i] || context[0] || 'The available connected-system evidence is ready for officer review.',
    ]),
    trend: {
      months: ['O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S'],
      values,
      threshold: 1000,
      thresholdLabel: '$1,000 threshold',
      caption: 'Account exposure, 12 months',
    },
    decision: c.switchTrace ? {
      effective: c.switchTrace.effective || 'Effective 1 October',
      current: { label: 'Current plan', name: c.switchTrace.from, price: '', per: '', rows: [] },
      best: { label: 'Best available', name: c.switchTrace.to, price: '', per: '', delta: c.switchTrace.saving, recommended: true, rows: [] },
      savings: ['', c.switchTrace.saving || '', ` — ${c.switchTrace.trigger || c.action}.`],
    } : null,
    metrics: [
      ['Current balance', balanceText],
      ['Evidence completeness', c.evidenceCompletion || 'Review'],
      ['Evidence sources', String(sources.length)],
      ['Policy version', c.policyVersion || 'Current'],
    ],
    evidence: Object.fromEntries((sources.length ? sources : [['Case record', c.recommendationSummary || c.action || 'Review required']])
      .slice(0, 6)
      .map(([name, detail]) => [name, {
        synced: 'just now',
        rows: [
          ['Record', detail || 'Available'],
          ...decisionInputs
            .filter(([, , authority]) => !authority || authority.toLowerCase().includes(String(name).toLowerCase().split(' ')[0]))
            .slice(0, 2)
            .map(([label, value]) => [label, value]),
        ],
        note: `Included in the ${c.workflow || 'customer'} review and frozen when the officer approves the decision.`,
      }])),
  };
}

export default function CaseWorkspace({
  caseData,
  back,
  approved,
  onApprove,
  decisionRecord,
  viewAudit,
}) {
  const [modal, setModal] = useState(false);
  // The compliance evidence view: live audit trail + the two systems of record.
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // The left half of the top card cross-fades: 'recommendation' (default)
  // ⇄ 'trend'. The chart on the right never moves (per the design reference).
  const [view, setView] = useState('recommendation');
  const customer = caseData;
  const profile = buildProfile(customer);
  const systems = Object.keys(profile.evidence);
  const [activeSystem, setActiveSystem] = useState(systems[0]);
  const decisionRef = useRef(null);

  useEffect(() => {
    setModal(false);
    setEvidenceOpen(false);
    setView('recommendation');
    setActiveSystem(Object.keys(buildProfile(customer).evidence)[0]);
  }, [customer.id]);

  const active = profile.evidence[activeSystem] || { synced: '', rows: [] };

  return (
    <div className="page product-page case-profile">
      <div className="crumbs">
        <a onClick={back}><Icon name="back" size={14} /> Decision queue</a>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <span className="here">{customer.id}</span>
      </div>

      <div className="h1row product-heading">
        <div>
          <h1 className="display" style={{ fontSize: 36 }}>{customer.customer}</h1>
          <div className="h1sub">{customer.id} · {customer.workflow} · {customer.stateLabel}</div>
        </div>
        <div className="case-actions">
          <button className="btn-ghost" onClick={() => setEvidenceOpen(true)}>
            Compliance evidence
          </button>
          <button className="btn-dark" onClick={() => setModal(true)} disabled={approved}>
            {approved ? 'Approved' : 'Approve'}
          </button>
        </div>
      </div>

      {approved && (
        <div className="okbanner compact-banner">
          <Icon name="check" size={16} />
          <span>Decision recorded as {decisionRecord?.id}.</span>
          <button onClick={viewAudit}>View record <Icon name="chevR" size={12} /></button>
        </div>
      )}

      {/* ── top card: recommendation ⇄ trend narrative on the left, chart fixed right ── */}
      <section className="profile-card reco-card">
        <div className="reco-left">
          <div className={`reco-face ${view === 'trend' ? 'hidden' : ''}`}>
            <div className="reco-topline">
              <span className="decision-label">Recommendation</span>
              <span className="schip wait">Human review required</span>
            </div>
            <h2 className="reco-title">{customer.recommendation}</h2>
            <p className="reco-summary">{customer.recommendationSummary}</p>
            <div className="reco-meta">
              <span><b>{customer.confidence}</b> confidence</span>
              <span><b>{customer.sources.length}</b> evidence sources</span>
              <span><b>{customer.policyVersion}</b> policy</span>
            </div>
          </div>

          <div className={`reco-face ${view === 'trend' ? '' : 'hidden'}`}>
            <div className="reco-topline">
              <span className="decision-label">Debt trend analysis</span>
              <span className="schip wait">12 months</span>
            </div>
            <div className="trend-points">
              {profile.trendAnalysis.map(([title, body], i) => (
                <div className="trend-point" key={title}>
                  <span className="trend-n">{String(i + 1).padStart(2, '0')}</span>
                  <div><b>{title}</b><p>{body}</p></div>
                </div>
              ))}
            </div>
            {profile.metrics && (
              <div className="reco-meta trend-metrics">
                {profile.metrics.map(([k, v, tone]) => (
                  <span key={k}><b className={tone === 'hot' ? 'hot' : ''}>{v}</b> {k}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="reco-chart">
          <div className="trend-viz-h"><span>Debt trend</span><small>{profile.trend.caption}</small></div>
          <TrendChart trend={profile.trend} />
          <button className="btn-ghost" onClick={() => setView(view === 'trend' ? 'recommendation' : 'trend')}>
            {view === 'trend' ? 'Back to recommendation' : 'Debt trend analysis'}
          </button>
        </div>
      </section>

      {/* ── the decision ── */}
      <section className="profile-card decision-card" ref={decisionRef}>
        <div className="profile-card-h serif">The decision <small>{profile.decision?.effective || ''}</small></div>
        {profile.decision ? (
          <>
            <div className="plan-compare">
              <PlanCard plan={profile.decision.current} />
              <span className="plan-arrow"><Icon name="chevR" size={18} /></span>
              <PlanCard plan={profile.decision.best} best />
            </div>
            <div className="savings-banner">
              <Icon name="chevD" size={13} />
              <span>{profile.decision.savings[0]}<b>{profile.decision.savings[1]}</b>{profile.decision.savings[2]}</span>
            </div>
          </>
        ) : (
          <div className="decision-fallback">
            <h2>{customer.recommendation}</h2>
            <p>{customer.recommendationSummary}</p>
            <div className="recommendation-next"><span>Next action</span>{customer.action}</div>
          </div>
        )}
      </section>

      <section className="profile-card regulatory-controls">
        <div className="profile-card-h serif">Regulatory controls <small>{customer.rules.length} evaluated</small></div>
        <div className="regulatory-control-grid">
          {customer.rules.map(([name, result, tone, explanation]) => (
            <div className="regulatory-control" key={name}>
              <div><b>{name}</b><span className={`schip ${tone === 'ok' ? 'ready' : 'wait'}`}>{result}</span></div>
              <p>{explanation}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── evidence: connected-system browser ── */}
      <section className="profile-card evidence-browser">
        <div className="profile-card-h serif">Evidence <small>{systems.length} systems connected</small></div>
        <p className="evidence-sub">Select a system to see the records pulled into this recommendation.</p>
        <div className="evidence-split">
          <div className="evidence-tabs">
            {systems.map((name) => (
              <button key={name} className={name === activeSystem ? 'on' : ''} onClick={() => setActiveSystem(name)}>
                <i /> {name}
              </button>
            ))}
          </div>
          <div className="evidence-window">
            <div className="evidence-window-h">
              <span className="win-dots"><i /><i /><i /></span>
              <b>{activeSystem}</b>
              <small>Synced {active.synced}</small>
            </div>
            {active.rows.map(([k, v]) => (
              <div className="evidence-row" key={k}><span>{k}</span><b>{v}</b></div>
            ))}
            {active.note && <p className="evidence-note">{active.note}</p>}
          </div>
        </div>
      </section>

      {modal && (
        <div className="modalveil" onClick={() => setModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Approve decision</h3>
            <div className="sub">This freezes the decision inputs and records why the action was taken. Any plan switch starts only after your approval.</div>
            <div style={{ marginTop: 10 }}>
              {customer.approvalEffects.slice(0, 3).map((effect) => (
                <div className="effrow" key={effect}><span className="tk">✓</span>{effect}</div>
              ))}
              {customer.approvalEffects.length > 3 && <div className="approval-more">+ {customer.approvalEffects.length - 3} automated follow-up actions</div>}
            </div>
            <textarea placeholder="Add a note (optional)…" />
            <div className="note">Approving officer: <b>Priya N.</b> · Policy {customer.policyVersion} · {customer.sources.length} evidence sources</div>
            <div className="btns">
              <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-orange" onClick={() => { setModal(false); onApprove(); }}>Approve decision</button>
            </div>
          </div>
        </div>
      )}

      <EvidenceOverlay
        open={evidenceOpen}
        reference={customer.externalCustomerId || customer.id}
        name={customer.customer}
        subtitle={[customer.workflow, customer.stateLabel].filter(Boolean).join(' · ')}
        onClose={() => setEvidenceOpen(false)}
      />

      <AskBar />
    </div>
  );
}
