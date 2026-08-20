import React, { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';
import EvidenceOverlay from '../components/EvidenceOverlay.jsx';
import { Chip, Disclosure, toneForSeverity } from '../components/ui.jsx';
import '../styles/review.css';

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

/* The only synthesised structure left on this screen: the plan comparison,
   read straight from the case's switchTrace. Returns null when the case has no
   switch — in which case no plan comparison is shown at all. */
function readDecision(c) {
  if (!c.switchTrace) return null;
  return {
    effective: c.switchTrace.effective || 'Effective 1 October',
    current: { label: 'Current plan', name: c.switchTrace.from, price: '', per: '', rows: [] },
    best: { label: 'Best available', name: c.switchTrace.to, price: '', per: '', delta: c.switchTrace.saving, recommended: true, rows: [] },
    savings: ['', c.switchTrace.saving || '', ` — ${c.switchTrace.trigger || c.action}.`],
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
  // This overlay is the single owner of the connected-system rendering; the
  // workspace links to it rather than re-rendering the same payload inline.
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const customer = caseData;
  const decision = readDecision(customer);
  // P2/P3: rules that could block or change the officer's next move stay
  // visible; passes and informational limbs are demoted behind one disclosure.
  // Nothing is dropped — every evaluated rule is still on the page.
  const rules = Array.isArray(customer.rules) ? customer.rules : [];
  const liveRules = rules.filter(([, , , , severity]) => ['BLOCKING', 'ATTENTION'].includes(String(severity || '').toUpperCase()));
  const quietRules = rules.filter((rule) => !liveRules.includes(rule));

  useEffect(() => {
    setModal(false);
    setEvidenceOpen(false);
  }, [customer.id]);

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

      {/* ── hero: what the system concluded ── */}
      <section className="profile-card reco-hero">
        <div className="reco-topline">
          <span className="decision-label">Recommendation</span>
          <Chip tone="attention">Human review required</Chip>
        </div>
        <h2 className="reco-title">{customer.recommendation}</h2>
        <p className="reco-summary">{customer.recommendationSummary}</p>
        <div className="recommendation-next"><span>Next action</span>{customer.action}</div>
        <div className="reco-meta">
          <span><b>{customer.confidence}</b> confidence</span>
          <span><b>{customer.sources.length}</b> evidence sources</span>
          <span><b>{customer.policyVersion}</b> policy</span>
        </div>
      </section>

      {/* ── was the regulation applied correctly ── */}
      <section className="profile-card regulatory-controls">
        <div className="profile-card-h serif">Regulatory controls <small>{rules.length} evaluated</small></div>
        <div className="regulatory-control-grid">
          {liveRules.map(([name, result, , explanation, severity]) => (
            <div className="regulatory-control" key={name}>
              <div><b>{name}</b><Chip tone={toneForSeverity(severity)}>{result}</Chip></div>
              <p>{explanation}</p>
            </div>
          ))}
        </div>
        {!rules.length && (
          <p className="rv-quiet">This customer has not been evaluated against the policy yet, so no rule has been applied and no finding exists. Run a review from the decision queue to produce one.</p>
        )}
        {!!rules.length && !liveRules.length && (
          <p className="rv-quiet">No rule raised a blocking or attention finding. Every evaluated limb is listed below.</p>
        )}
        {!!quietRules.length && (
          <Disclosure label="Rules that passed or were informational" count={quietRules.length}>
            <div className="regulatory-control-grid">
              {quietRules.map(([name, result, , explanation, severity]) => (
                <div className="regulatory-control" key={name}>
                  <div><b>{name}</b><Chip tone={toneForSeverity(severity)}>{result}</Chip></div>
                  <p>{explanation}</p>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
      </section>

      {/* ── the switch, shown only when the case actually proposes one ── */}
      {decision && (
        <section className="profile-card decision-card">
          <div className="profile-card-h serif">The switch <small>{decision.effective}</small></div>
          <div className="plan-compare">
            <PlanCard plan={decision.current} />
            <span className="plan-arrow"><Icon name="chevR" size={18} /></span>
            <PlanCard plan={decision.best} best />
          </div>
          <div className="savings-banner">
            <Icon name="chevD" size={13} />
            <span>{decision.savings[0]}<b>{decision.savings[1]}</b>{decision.savings[2]}</span>
          </div>
        </section>
      )}

      {/* Evidence lives in one place only — the compliance evidence overlay. */}
      <button className="rv-evidence-link" onClick={() => setEvidenceOpen(true)}>
        <span>
          <b>Compliance evidence</b>
          <small>{customer.sources.length} connected-system sources, the audit trail and the frozen snapshot for this decision.</small>
        </span>
        <Icon name="chevR" size={14} />
      </button>

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
