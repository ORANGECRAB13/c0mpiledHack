import React, { useEffect, useState } from 'react';
import ReviewModal from './ReviewModal.jsx';
import RecommendedPlan from './RecommendedPlan.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';

// Reviewing one customer is the same bounded run as the bulk review, scoped by
// customerIds. As soon as it returns we re-read the case so the recommended plan
// is on screen without a second click.
export default function SingleReview({ customerId, customerName, actorId, onClose, openCase, onReviewed }) {
  const [state, setState] = useState({ status: 'running' });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const run = await decisionLayerApi.reviewAll({ customerIds: [customerId], actorId });
        const result = run.results?.[0] || null;
        let caseData = null;
        let caseError = null;
        try { caseData = await decisionLayerApi.loadCase(customerId); } catch (error) { caseError = error.message; }
        if (!live) return;
        setState({ status: 'done', run, result, caseData, caseError });
        onReviewed?.();
      } catch (error) {
        if (live) setState({ status: 'error', error: error.message });
      }
    })();
    return () => { live = false; };
  }, [customerId]);

  const run = state.run?.run;
  const failure = state.run?.failures?.[0];
  const skipped = state.run?.skipped?.[0];
  const halted = state.run?.circuitBreaker?.stillHalted || [];

  return (
    <ReviewModal
      title={`Hardship review · ${customerName || customerId}`}
      subtitle={run ? `Evaluated in ${run.durationMs} ms · ${run.evaluated} evaluated, ${run.failed} failed, ${run.skipped} skipped` : 'Running the deterministic evaluation against live Salesforce and billing data'}
      onClose={onClose}
      footer={(
        <>
          <span>{state.result ? `Category: ${state.result.categoryLabel}` : 'Nothing is written until the evaluation completes.'}</span>
          <span className="rv-actions">
            {openCase && <button className="rv-btn" onClick={() => { onClose(); openCase(customerId); }}>Open full case</button>}
            <button className="rv-btn primary" onClick={onClose}>Done</button>
          </span>
        </>
      )}
    >
      {state.status === 'running' && (
        <div className="rv-progress"><span className="rv-spinner" /> Evaluating {customerName || customerId}…</div>
      )}
      {state.status === 'error' && (
        <div className="rv-note bad">The review failed: {state.error}. No decision was written.</div>
      )}
      {state.status === 'done' && (
        <>
          {failure && <div className="rv-note bad">Evaluation failed for {failure.name || failure.customerId}: {failure.error}{failure.circuitBreaker ? ' (circuit breaker)' : ''}.</div>}
          {skipped && <div className="rv-note warn">Skipped: {skipped.reason}{skipped.hint ? ` — ${skipped.hint}` : ''}</div>}
          {!!halted.length && <div className="rv-note bad">This customer&apos;s pipeline is still halted and was not re-evaluated.</div>}
          {state.caseError && <div className="rv-note bad">Could not re-read the case record: {state.caseError}</div>}
          <RecommendedPlan caseData={state.caseData} result={state.result} />
        </>
      )}
    </ReviewModal>
  );
}
