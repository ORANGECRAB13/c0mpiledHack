import React, { useEffect, useState } from 'react';
import ReviewModal from './ReviewModal.jsx';
import RecommendedPlan from './RecommendedPlan.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';

// "Review entire customer cases": one bounded run over the book, then the
// category summary. Counts come from /review-summary — never from anything this
// component computes — and NO_CHANGE keeps its own tab so it is never presented
// as work to do.
export default function ReviewAllSummary({ actorId, onClose, openCase, onApproveAll, onFinished }) {
  const [phase, setPhase] = useState('running');
  const [run, setRun] = useState(null);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ACTION_REQUIRED');
  const [plan, setPlan] = useState(null);

  const loadSummary = async () => {
    const body = await decisionLayerApi.loadReviewSummary({ limit: 200, includeCustomers: true });
    setSummary(body.summary);
    setCustomers(body.customers || []);
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const result = await decisionLayerApi.reviewAll({ limit: 200, concurrency: 4, actorId });
        if (!live) return;
        setRun(result);
        await loadSummary();
        if (!live) return;
        setPhase('done');
        onFinished?.();
      } catch (err) {
        if (live) { setError(err.message); setPhase('failed'); }
      }
    })();
    return () => { live = false; };
  }, []);

  const tabs = summary?.tabs || [];
  const active = tabs.find((item) => item.key === tab) || tabs[0];
  const rows = customers.filter((customer) => customer.category === (active?.key || tab));
  const meta = run?.run;
  const breaker = run?.circuitBreaker;

  const showPlan = async (customer) => {
    setPlan({ loading: true, customer });
    try {
      const caseData = await decisionLayerApi.loadCase(customer.customerId);
      setPlan({ customer, caseData });
    } catch (err) {
      setPlan({ customer, error: err.message });
    }
  };

  return (
    <ReviewModal
      title="Customer book review"
      subtitle={meta
        ? `${meta.evaluated} evaluated · ${meta.failed} failed · ${meta.skipped} skipped · ${(meta.durationMs / 1000).toFixed(1)}s · concurrency ${meta.concurrency}${meta.aborted ? ' · ABORTED' : ''}`
        : 'Evaluating every customer against the current policy'}
      onClose={onClose}
      footer={(
        <>
          <span>{summary ? `${summary.actionableCount} actionable of ${summary.page.total} customers reviewed.` : 'Nothing is written until each evaluation completes.'}</span>
          <span className="rv-actions">
            <button className="rv-btn" onClick={onClose}>Close</button>
            <button className="rv-btn primary" disabled={phase !== 'done'} onClick={onApproveAll}>Approve all hardship transitions</button>
          </span>
        </>
      )}
    >
      {phase === 'running' && (
        <div className="rv-progress"><span className="rv-spinner" /> Reviewing the customer book — this evaluates every customer and writes decisions, so it takes a moment.</div>
      )}
      {phase === 'failed' && <div className="rv-note bad">The review run failed: {error}</div>}

      {phase === 'done' && (
        <>
          {meta?.aborted && <div className="rv-note bad">The run aborted early: {meta.abortReason || 'reason not reported'}. Counts below cover only what was evaluated.</div>}
          {!!run?.failures?.length && (
            <div className="rv-note bad">
              <b>{run.failures.length} customer{run.failures.length === 1 ? '' : 's'} failed to evaluate</b>
              <ul>{run.failures.slice(0, 8).map((failure) => <li key={failure.customerId}>{failure.name || failure.customerId}: {failure.error}{failure.circuitBreaker ? ' (circuit breaker)' : ''}{failure.autoResumed ? ' — auto-resumed' : ''}</li>)}</ul>
            </div>
          )}
          {!!run?.skipped?.length && (
            <div className="rv-note warn">
              <b>{run.skipped.length} skipped</b>
              <ul>{run.skipped.slice(0, 8).map((item) => <li key={item.customerId}>{item.name || item.customerId}: {item.reason}{item.hint ? ` — ${item.hint}` : ''}</li>)}</ul>
            </div>
          )}
          {!!breaker?.stillHalted?.length && (
            <div className="rv-note bad"><b>{breaker.stillHalted.length} customer pipeline(s) remain halted</b> after this run and were not evaluated.</div>
          )}
          {!!breaker?.tripped?.length && !breaker.stillHalted?.length && (
            <div className="rv-note warn">The circuit breaker tripped for {breaker.tripped.length} customer(s); all were auto-resumed.</div>
          )}

          <div className="rv-tabs">
            {tabs.map((item) => (
              <button
                key={item.key}
                className={`rv-tab${item.key === (active?.key) ? ' on' : ''}${item.actionable ? ' act' : ''}`}
                onClick={() => { setTab(item.key); setPlan(null); }}
              >
                <span className="dot" />{item.label}<span className="n">{item.count}</span>
              </button>
            ))}
          </div>

          {active && !active.actionable && (
            <div className="rv-note">
              {active.key === 'NO_CHANGE'
                ? 'These customers were evaluated and require no change. They are recorded for audit only and never enter the operations queue.'
                : `${active.label} customers are recorded for audit. No transition is proposed for them.`}
            </div>
          )}

          <div className="rv-rows">
            {rows.map((customer) => (
              <div className="rv-row" key={customer.customerId} role="button" tabIndex={0}
                onClick={() => openCase(customer.customerId)}
                onKeyDown={(event) => { if (event.key === 'Enter') openCase(customer.customerId); }}>
                <span>
                  <div className="nm">{customer.name}</div>
                  <div className="meta">{customer.customerId}{customer.externalCustomerId && customer.externalCustomerId !== customer.customerId ? ` · ${customer.externalCustomerId}` : ''} · {customer.jurisdiction || 'jurisdiction not recorded'} · {customer.policy || 'no policy recorded'}</div>
                </span>
                <span className="num">
                  {customer.balance != null ? `$${customer.balance}` : 'balance not recorded'}
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{customer.hardshipStatus || 'no hardship status'}</div>
                </span>
                <span>
                  <span className={`rv-pill ${customer.actionable ? 'act' : ''}`}>{customer.categoryLabel}</span>
                  {customer.pipelineHalted && <span className="rv-pill block" style={{ marginLeft: 4 }}>halted</span>}
                </span>
                <span className="rv-actions">
                  <button className="rv-btn small" onClick={(event) => { event.stopPropagation(); showPlan(customer); }}>Plan</button>
                  <button className="rv-btn small" onClick={(event) => { event.stopPropagation(); openCase(customer.customerId); }}>Profile</button>
                </span>
              </div>
            ))}
            {!rows.length && <div className="rv-empty">No customers in {active?.label || tab}.</div>}
          </div>

          {plan && (
            <div style={{ marginTop: 16 }}>
              <div className="secheading" style={{ marginBottom: 8 }}>{plan.customer.name}</div>
              {plan.loading && <div className="rv-progress"><span className="rv-spinner" /> Loading case…</div>}
              {plan.error && <div className="rv-note bad">Could not load the case: {plan.error}</div>}
              {plan.caseData && <RecommendedPlan caseData={plan.caseData} />}
            </div>
          )}
        </>
      )}
    </ReviewModal>
  );
}
