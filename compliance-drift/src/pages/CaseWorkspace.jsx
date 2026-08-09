import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';
import AskOverlay from '../components/AskOverlay.jsx';

/* Debt-trend bar chart: 12 monthly bars against a dashed regulatory threshold.
   The y-axis tops out at the threshold so "how far from disconnection" is the
   first thing the chart says. */
function TrendChart({ trend }) {
  const W = 560, H = 190, padL = 46, padR = 8, padT = 26, padB = 22;
  const max = trend.threshold;
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
  const seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const values = Array.from({ length: 12 }, (_, i) => (i < 8 ? 4 + ((seed + i) % 5) : Math.round((i - 7) * (80 + (seed % 60))) ));
  const titles = ['What changed', 'Current position', 'What the evidence shows'];
  return {
    trendAnalysis: c.context.slice(0, 3).map((text, i) => [titles[i], text]),
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
    evidence: Object.fromEntries(c.sources.slice(0, 6).map(([name, detail]) => [name, { synced: 'just now', rows: [['Record', detail]] }])),
  };
}

export default function CaseWorkspace({
  caseData,
  back,
  sourceVerified,
  approved,
  onVerifySource,
  onApprove,
  decisionRecord,
  viewAudit,
  evidenceRequest,
  onEvidenceRequestHandled,
}) {
  const [modal, setModal] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofQuery, setProofQuery] = useState(caseData.sourceQuery);
  // 'recommendation' is the landing view; 'trend' is the debt-trend drill-in.
  const [view, setView] = useState('recommendation');
  const customer = caseData;
  const profile = buildProfile(customer);
  const systems = Object.keys(profile.evidence);
  const [activeSystem, setActiveSystem] = useState(systems[0]);
  const decisionRef = useRef(null);

  const inspectSource = () => {
    setProofQuery(customer.sourceQuery);
    onVerifySource();
    setProofOpen(true);
  };

  useEffect(() => {
    setModal(false);
    setProofOpen(false);
    setView('recommendation');
    setProofQuery(customer.sourceQuery);
    setActiveSystem(Object.keys(buildProfile(customer).evidence)[0]);
  }, [customer.id]);

  useEffect(() => {
    if (!evidenceRequest) return;
    if (evidenceRequest.caseId && evidenceRequest.caseId !== customer.id) return;
    setProofQuery(evidenceRequest.query || customer.sourceQuery);
    onVerifySource();
    setProofOpen(true);
    onEvidenceRequestHandled?.();
  }, [evidenceRequest?.id]);

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
          <button className="btn-ghost" onClick={inspectSource}>{sourceVerified ? 'Changes requested' : 'Request changes'}</button>
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

      {view === 'trend' ? (
        /* ── debt trend analysis (drill-in) ── */
        <section className="profile-card trend-card">
          <div className="trend-narrative">
            <div className="profile-card-h">Debt trend analysis <span className="engine-chip">12 months</span></div>
            {profile.trendAnalysis.map(([title, body], i) => (
              <div className="trend-point" key={title}>
                <span className="trend-n">{String(i + 1).padStart(2, '0')}</span>
                <div><b>{title}</b><p>{body}</p></div>
              </div>
            ))}
          </div>
          <div className="trend-viz">
            <div className="trend-viz-h"><span>Debt trend</span><small>{profile.trend.caption}</small></div>
            <TrendChart trend={profile.trend} />
            <button className="btn-ghost" onClick={() => setView('recommendation')}>
              Back to recommendation
            </button>
          </div>
        </section>
      ) : (
        /* ── recommendation (landing view) ── */
        <section className="profile-card">
          <div className="recommendation-topline">
            <span className="decision-label">Recommendation</span>
            <span className="schip wait">Human review required</span>
          </div>
          <div className="decision-fallback" style={{ marginTop: 10 }}>
            <h2>{customer.recommendation}</h2>
            <p>{customer.recommendationSummary}</p>
            <div className="recommendation-next"><span>Next action</span>{customer.action}</div>
            <div className="recommendation-meta">
              <span><b>{customer.confidence}</b> decision confidence</span>
              <span><b>{customer.sources.length}</b> evidence sources</span>
              <span><b>{customer.policyVersion}</b> policy version</span>
            </div>
          </div>
          <div className="trend-open">
            <button className="btn-ghost" onClick={() => setView('trend')}>
              <Icon name="activity" size={14} /> Debt trend analysis
            </button>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="profile-card-h">Decision checks <span className="engine-chip">{customer.rules.length} checks</span></div>
            {customer.rules.map(([name, verdict, tone, reason]) => (
              <details className="decision-check" key={name}>
                <summary>
                  <span className="nm">{name}</span>
                  <span className={`vchip ${tone}`}>{verdict}</span>
                </summary>
                <p>{reason}</p>
              </details>
            ))}
          </div>
        </section>
      )}

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

      <AskBar />
      {proofOpen && <AskOverlay query={proofQuery} onClose={() => setProofOpen(false)} fresh />}
    </div>
  );
}
