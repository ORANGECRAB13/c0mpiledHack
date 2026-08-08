import React, { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';
import AskOverlay from '../components/AskOverlay.jsx';

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
  const [showSources, setShowSources] = useState(false);
  const [showAllInputs, setShowAllInputs] = useState(false);
  const [modal, setModal] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofQuery, setProofQuery] = useState(caseData.sourceQuery);
  const customer = caseData;

  const inspectSource = () => {
    setProofQuery(customer.sourceQuery);
    onVerifySource();
    setProofOpen(true);
  };

  useEffect(() => {
    setShowSources(false);
    setShowAllInputs(false);
    setModal(false);
    setProofOpen(false);
    setProofQuery(customer.sourceQuery);
  }, [customer.id]);

  useEffect(() => {
    if (!evidenceRequest) return;
    if (evidenceRequest.caseId && evidenceRequest.caseId !== customer.id) return;
    setProofQuery(evidenceRequest.query || customer.sourceQuery);
    onVerifySource();
    setProofOpen(true);
    onEvidenceRequestHandled?.();
  }, [evidenceRequest?.id]);

  return (
    <div className="page product-page">
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
          <button className="btn-ghost" onClick={inspectSource}>
            <Icon name="doc" size={14} /> {sourceVerified ? 'Evidence verified' : 'Verify evidence'}
          </button>
          <button className="btn-orange" onClick={() => setModal(true)} disabled={approved || !sourceVerified} title={!sourceVerified ? 'Verify the evidence before approval' : ''}>
            <Icon name="check" size={14} /> {approved ? 'Approved' : 'Approve'}
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

      <div className="product-workspace">
        <div className="decision-column">
          <section className="recommendation-card">
            <div className="recommendation-topline">
              <span className="decision-label">Recommendation</span>
              <span className="schip wait">Human review required</span>
            </div>
            <h2>{customer.recommendation}</h2>
            <p>{customer.recommendationSummary}</p>
            <div className="recommendation-next"><span>Next action</span>{customer.action}</div>
            <div className="recommendation-meta">
              <span><b>{customer.confidence}</b> decision confidence</span>
              <span><b>{customer.sources.length}</b> evidence sources</span>
              <span><b>{customer.policyVersion}</b> policy version</span>
            </div>
          </section>

          <section className="cpanel product-panel">
            <div className="ph">Decision checks <span className="engine-chip">{customer.rules.length} checks</span></div>
            {customer.rules.map(([name, verdict, tone, reason]) => (
              <details className="decision-check" key={name}>
                <summary>
                  <span className="nm">{name}</span>
                  <span className={`vchip ${tone}`}>{verdict}</span>
                </summary>
                <p>{reason}</p>
              </details>
            ))}
          </section>

          {customer.switchTrace && (
            <section className="cpanel product-panel switch-trace">
              <div className="ph">Why this customer is being switched <span className="engine-chip">From 1 October</span></div>
              <div className="switch-path">
                <div><span>Current plan</span><b>{customer.switchTrace.from}</b></div>
                <Icon name="chevR" size={16} />
                <div><span>Best available plan</span><b>{customer.switchTrace.to}</b><small>{customer.switchTrace.saving}</small></div>
              </div>
              <details className="switch-details">
                <summary>View switch reason and controls</summary>
                <div className="switch-trigger"><span>Trigger</span><b>{customer.switchTrace.trigger}</b></div>
                <div className="switch-foot"><span>Opt-out</span><b>{customer.switchTrace.optOut}</b><span>Execution</span><b>{customer.switchTrace.effective}</b></div>
              </details>
            </section>
          )}
        </div>

        <aside className="context-column">
          <section className="cpanel product-panel decision-inputs">
            <div className="ph">{customer.workflow === 'Hardship & Best Offer' ? 'Eligibility inputs' : 'Reconciliation inputs'}</div>
            {customer.decisionInputs.slice(0, showAllInputs ? customer.decisionInputs.length : 4).map(([label, value, source, status]) => (
              <div className="decision-input-row" key={`${label}-${source}`}>
                <div><span>{label}</span><b>{value}</b><small>{source}</small></div>
                <em className={`input-state ${status.toLowerCase()}`}>{status}</em>
              </div>
            ))}
            {customer.decisionInputs.length > 4 && (
              <button className="text-button input-toggle" onClick={() => setShowAllInputs((value) => !value)}>
                {showAllInputs ? 'Show fewer inputs' : `View ${customer.decisionInputs.length - 4} more inputs`}
              </button>
            )}
          </section>

          <section className="cpanel product-panel evidence-panel">
            <div className="ph">Evidence <span className="connected-state"><i /> {customer.sources.length} connected</span></div>
            <p>Connected records used for this recommendation.</p>
            <div className="evidence-actions">
              <button className="text-button" onClick={() => setShowSources((value) => !value)}>{showSources ? 'Hide sources' : 'View sources'}</button>
              <button className="text-button primary" onClick={inspectSource}>Check policy evidence</button>
            </div>
            {showSources && (
              <div className="source-list">
                {customer.sources.map(([name]) => <span key={name}><Icon name="check" size={11} /> {name}</span>)}
              </div>
            )}
          </section>

          <section className="cpanel product-panel">
            <div className="ph">Before you approve <span className="engine-chip">{customer.missing.length}</span></div>
            {customer.missing.map((item) => <div className="missrow" key={item}>{item}</div>)}
          </section>
        </aside>
      </div>

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
