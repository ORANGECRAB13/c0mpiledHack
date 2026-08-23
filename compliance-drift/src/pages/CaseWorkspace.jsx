import React, { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';
import EvidenceOverlay from '../components/EvidenceOverlay.jsx';
import { FindingList, findingsOf, findingTone } from '../components/Finding.jsx';
import { humanSummary, phrase } from '../components/ui.jsx';
import '../styles/review.css';
import '../styles/evidence.css';

/* ============================================================================
 * CaseWorkspace — the case detail, in the Vocare Oversight language.
 *
 * The design's expanded case row is the template: a rust "RECOMMENDATION"
 * eyebrow, a serif headline, a prose summary, the two actions (Approve /
 * Open evidence) and a hairline-separated right rail carrying Confidence,
 * Evidence sources and Policy. Every one of those five values comes off the
 * case record the ledger already produced; none is computed here.
 *
 * The rail renders a value only when the case carries one. A missing
 * confidence says "not recorded", never a default grade.
 *
 * Everything the previous cleanup established survives: blocking/attention
 * rules lead, passes and informational limbs sit behind one counted
 * disclosure, nothing is dropped, and evidence has exactly one home — the
 * compliance evidence overlay.
 * ========================================================================== */

function PlanCard({ plan, best = false }) {
  return (
    <div className={`plan-card ${best ? 'best' : ''}`}>
      <div className="plan-topline">
        <span className="decision-label">{plan.label}</span>
        {plan.recommended && <span className="plan-recommended">Recommended</span>}
      </div>
      <div className="plan-name">{plan.name}</div>
      {plan.delta && <div className="plan-price"><em>{plan.delta}</em></div>}
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
    current: { label: 'Current plan', name: c.switchTrace.from },
    best: { label: 'Best available', name: c.switchTrace.to, delta: c.switchTrace.saving, recommended: true },
    savings: c.switchTrace.saving || null,
    trigger: c.switchTrace.trigger || c.action,
  };
}

/** A rail value, or an honest blank. Never a substituted default. */
function RailValue({ label, value }) {
  return (
    <div>
      <div>{label}</div>
      {value === null || value === undefined || value === ''
        ? <b className="ov-na">not recorded</b>
        : <b>{value}</b>}
    </div>
  );
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
  const findings = findingsOf(customer);
  const liveCount = findings.filter((item) => ['blocking', 'attention'].includes(findingTone(item))).length;
  const sourceCount = Array.isArray(customer.sources) ? customer.sources.length : null;

  useEffect(() => {
    setModal(false);
    setEvidenceOpen(false);
  }, [customer.id]);

  return (
    <div className="page ov-audit case-profile">
      <div className="crumbs">
        <a onClick={back}><Icon name="back" size={14} /> Detection</a>
        <span className="sep"><Icon name="chevR" size={11} /></span>
        <span className="here">{customer.id}</span>
      </div>

      <div className="ov-case-head">
        <div>
          <div className="ov-eyebrow">Case</div>
          <h1 className="ov-display">{customer.customer}</h1>
          <div className="ov-case-sub">{[customer.id, customer.workflow, customer.stateLabel].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      {approved && (
        <div className="ov-banner">
          <span>Decision recorded as <b>{decisionRecord?.id}</b>.</span>
          <button onClick={viewAudit}>View record →</button>
        </div>
      )}

      {/* ── hero: what the system concluded, and the two things you can do ── */}
      <section className="ov-reco">
        <div className="ov-reco-main">
          <div className="ov-eyebrow ov-eyebrow-accent">Recommendation</div>
          <h2 className="ov-reco-title">{customer.recommendation}</h2>
          {/* The ledger writes this as "Latest deterministic outcome: X."
              humanSummary states the same fact in plain English. */}
          {customer.recommendationSummary && <p className="ov-reco-summary">{humanSummary(customer.recommendationSummary)}</p>}
          {customer.action && (
            <div className="ov-reco-next"><span>Next action</span>{phrase(customer.action)}</div>
          )}
          <div className="ov-reco-actions">
            <button className="ov-btn-dark ov-btn-sm" onClick={() => setModal(true)} disabled={approved}>
              {approved ? 'Approved' : 'Approve'}
            </button>
            <button className="ov-btn ov-btn-sm" onClick={() => setEvidenceOpen(true)}>Open evidence</button>
          </div>
        </div>
        <div className="ov-reco-rail">
          <RailValue label="Confidence" value={customer.confidence} />
          <RailValue label="Evidence sources" value={sourceCount} />
          <RailValue label="Policy" value={customer.policyVersion} />
        </div>
      </section>

      {/* ── was the regulation applied correctly ── */}
      <section className="ov-panel">
        <div className="ov-panel-h">
          <h2>Why this was flagged</h2>
          <small>
            {liveCount ? `${liveCount} ${liveCount === 1 ? 'finding' : 'findings'} · ` : ''}
            {findings.length} {findings.length === 1 ? 'check' : 'checks'} evaluated
          </small>
        </div>
        <div className="ov-panel-b">
          {/* One line per finding. The explanation, the clause it cites, its
              civil-penalty provision and the threshold provenance are all one
              click away — demoted, never removed. */}
          <FindingList
            findings={findings}
            idPrefix={customer.id}
            quietLabel="Checks that passed or were informational"
            emptyNote={(
              <p className="ov-quiet">
                This customer has not been evaluated against the policy yet, so no rule has been
                applied and no finding exists. Run a review from the detection queue to produce one.
              </p>
            )}
          />
        </div>
      </section>

      {/* ── the switch, shown only when the case actually proposes one ── */}
      {decision && (
        <section className="ov-panel">
          <div className="ov-panel-h">
            <h2>The switch</h2>
            <small>{decision.effective}</small>
          </div>
          <div className="ov-panel-b">
            <div className="plan-compare">
              <PlanCard plan={decision.current} />
              <span className="plan-arrow"><Icon name="chevR" size={18} /></span>
              <PlanCard plan={decision.best} best />
            </div>
            {(decision.savings || decision.trigger) && (
              <p className="ov-quiet">
                {decision.savings && <b>{decision.savings}</b>}
                {decision.savings && decision.trigger ? ' — ' : ''}
                {decision.trigger}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Evidence lives in one place only — the compliance evidence overlay. */}
      <button className="ov-evidence-link" onClick={() => setEvidenceOpen(true)}>
        <span>
          <b>Compliance evidence</b>
          <small>
            {sourceCount === null ? 'The' : `${sourceCount} connected-system sources, the`} decision
            trail, the systems of record and the frozen snapshot for this decision.
          </small>
        </span>
        <i>→</i>
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
            <div className="note">
              Approving officer: <b>Priya N.</b> · Policy {customer.policyVersion}
              {sourceCount !== null && ` · ${sourceCount} evidence sources`}
            </div>
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
