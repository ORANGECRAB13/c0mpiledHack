import React from 'react';
import { Chip, Disclosure, toneForSeverity } from './ui.jsx';

// Pulls the recommended plan out of a live case record. Nothing here invents a
// value: if the pricing provider returned no cheaper offer, or a limb of the
// eligibility test is unproven, that is what the card says. A
// "no cheaper offer could be determined" result must never render as a
// recommendation.
export function readPlan(caseData) {
  if (!caseData) return { kind: 'unknown' };
  const evidence = Array.isArray(caseData.evidence) ? caseData.evidence : [];
  const offer = evidence.find((item) => /best available offer/i.test(item.rule || ''));
  const blockingNames = Array.isArray(caseData.blockingEvidence) ? caseData.blockingEvidence : [];
  const blocking = evidence.filter((item) => item.severity === 'BLOCKING' || blockingNames.includes(item.rule));
  const outcome = caseData.outcome;

  if (outcome === 'INSUFFICIENT_EVIDENCE' || blocking.length) {
    return { kind: 'blocked', blocking, offer, outcome };
  }
  if (offer && offer.status === 'AVAILABLE' && outcome === 'ACTION_REQUIRED') {
    return { kind: 'plan', offer, outcome, evidence };
  }
  if (offer && offer.status && offer.status !== 'AVAILABLE') {
    return { kind: 'no-offer', offer, outcome };
  }
  return { kind: 'no-change', outcome, offer };
}

function Evidence({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="rv-evlist">
      {items.map((item, index) => (
        <li key={`${item.rule}-${index}`}>
          <span className="r">{item.rule}</span>
          <Chip tone={toneForSeverity(item.severity || 'ATTENTION')}>{item.severity || 'ATTENTION'}</Chip>
          <div>{item.explanation}</div>
          {item.citation && <div className="cite">{item.citation}</div>}
          {item.penaltyProvision && <div className="cite penalty">Civil penalty exposure · {item.penaltyProvision}</div>}
        </li>
      ))}
    </ul>
  );
}

export default function RecommendedPlan({ caseData, result }) {
  if (!caseData) {
    return <div className="rv-plan none"><h3>Case record unavailable</h3><p>The review ran, but this customer&apos;s case could not be re-read from the ledger. Nothing is inferred here.</p></div>;
  }
  const plan = readPlan(caseData);
  const category = result?.categoryLabel || caseData.outcome;
  const meta = (
    <Disclosure label="Decision record" count={6}>
    <dl className="rv-kv">
      <dt>Outcome</dt><dd>{caseData.outcome}{result?.lineageOutcome && result.lineageOutcome !== caseData.outcome ? ` · lineage ${result.lineageOutcome}` : ''}</dd>
      <dt>Category</dt><dd>{category}</dd>
      <dt>Policy</dt><dd>{caseData.policyVersion || result?.policyVersion || 'not recorded'}</dd>
      <dt>Decision</dt><dd>{caseData.decisionId || result?.decisionId || 'none written'}</dd>
      <dt>Action</dt><dd>{caseData.actionId ? `${caseData.action} · ${caseData.actionStatus}` : 'no approval-gated action'}</dd>
      <dt>Snapshot hash</dt><dd className="mono">{(caseData.snapshotHash || '').slice(0, 24) || 'not recorded'}</dd>
    </dl>
    </Disclosure>
  );

  if (plan.kind === 'plan') {
    return (
      <div className="rv-plan has">
        <h3>Recommended plan · {caseData.recommendation}</h3>
        <p>{plan.offer.explanation}</p>
        <p className="rv-cite">{plan.offer.citation}</p>
        {caseData.actionStatus === 'AWAITING_APPROVAL' && <div className="rv-note warn">This switch is queued and <b>awaiting officer approval</b>. It has not been executed.</div>}
        {meta}
        <Evidence items={(caseData.evidence || []).filter((item) => item.severity === 'BLOCKING' || item.severity === 'ATTENTION')} />
      </div>
    );
  }

  if (plan.kind === 'blocked') {
    return (
      <div className="rv-plan blocked">
        <h3>No plan can be recommended — evidence is insufficient</h3>
        <p>The eligibility test could not be completed, so no switch is proposed. The unresolved limbs are listed below.</p>
        {plan.blocking.length
          ? <Evidence items={plan.blocking} />
          : <p>The evaluation returned {plan.outcome} without naming a blocking rule. Nothing further is recorded.</p>}
        {!!caseData.missing?.length && (
          <div className="rv-note bad">Missing inputs:<ul>{caseData.missing.map((item) => <li key={item}>{item}</li>)}</ul></div>
        )}
        {meta}
      </div>
    );
  }

  if (plan.kind === 'no-offer') {
    return (
      <div className="rv-plan none">
        <h3>No cheaper offer could be determined</h3>
        <p>{plan.offer.explanation}</p>
        <p className="rv-cite">{plan.offer.citation}</p>
        <div className="rv-note">This is <b>not</b> a recommendation to switch. A negative best-offer check carries its own notice obligation; it does not produce a plan.</div>
        {meta}
      </div>
    );
  }

  return (
    <div className="rv-plan none">
      <h3>No change required</h3>
      <p>{caseData.recommendationSummary || `The evaluation returned ${caseData.outcome}.`}</p>
      <div className="rv-note">No action is queued for this customer, and nothing enters the operations queue.</div>
      {meta}
    </div>
  );
}
