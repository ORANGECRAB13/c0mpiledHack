import { phrase, phraseInline } from './ui.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import ReviewModal from './ReviewModal.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';

const VERDICTS = ['AGREED', 'OVERRIDDEN', 'REJECTED'];

// Bulk approval of queued hardship transitions. The API requires an
// overrideReason for every item whose verdict is not AGREED and rejects the
// whole batch otherwise, so the reason is collected here before submit is
// enabled — we never send a blanket verdict.
export default function BulkApproval({ actorId, onClose, onApproved, openCase }) {
  const [actions, setActions] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let live = true;
    decisionLayerApi.loadAwaitingApproval({ limit: 50 })
      .then((body) => { if (!live) return; setActions(body.actions || []); setError(null); })
      .catch((err) => { if (live) { setActions([]); setError(err.message); } });
    return () => { live = false; };
  }, []);

  const rowFor = (actionId) => rows[actionId] || { verdict: 'AGREED', overrideReason: '' };
  const setRow = (actionId, patch) => setRows((current) => ({ ...current, [actionId]: { ...rowFor(actionId), ...patch } }));

  const items = useMemo(() => (actions || []).map((action) => ({ action, ...rowFor(action.actionId) })), [actions, rows]);
  const missingReasons = items.filter((item) => item.verdict !== 'AGREED' && !item.overrideReason.trim());
  const byVerdictPreview = items.reduce((acc, item) => ({ ...acc, [item.verdict]: (acc[item.verdict] || 0) + 1 }), {});

  const submit = async () => {
    if (missingReasons.length || !items.length) return;
    setSubmitting(true);
    try {
      const response = await decisionLayerApi.submitApprovals({
        actorId,
        items: items.map((item) => ({
          actionId: item.action.actionId,
          verdict: item.verdict,
          ...(item.verdict === 'AGREED' ? {} : { overrideReason: item.overrideReason.trim() }),
        })),
      });
      setOutcome({ ok: true, ...response });
      onApproved?.();
    } catch (err) {
      setOutcome({ ok: false, error: err.message, detail: err.body || null });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReviewModal
      title="Approve hardship transitions"
      subtitle={actions ? `${actions.length} action${actions.length === 1 ? '' : 's'} awaiting approval` : 'Loading queued actions…'}
      onClose={onClose}
      footer={(
        <>
          <span>
            {outcome ? 'Result recorded below.' : missingReasons.length
              ? `${missingReasons.length} item${missingReasons.length === 1 ? ' needs' : 's need'} a reason before this batch can be submitted.`
              : `Submitting as ${actorId}: ${VERDICTS.filter((verdict) => byVerdictPreview[verdict]).map((verdict) => `${byVerdictPreview[verdict]} ${phraseInline(verdict)}`).join(', ') || 'nothing'}.`}
          </span>
          <span className="rv-actions">
            <button className="rv-btn" onClick={onClose}>Close</button>
            {!outcome?.ok && (
              <button className="rv-btn primary" disabled={submitting || !items.length || !!missingReasons.length} onClick={submit}>
                {submitting ? 'Submitting…' : `Approve all ${items.length || ''}`.trim()}
              </button>
            )}
          </span>
        </>
      )}
    >
      {error && <div className="rv-note bad">Could not load the approval queue: {error}</div>}

      {outcome && !outcome.ok && (
        <div className="rv-note bad">
          Nothing was written. {outcome.error}
          {!!outcome.detail?.violations?.length && (
            <ul>{outcome.detail.violations.map((violation) => (
              <li key={violation.actionId || violation.index}>
                {actions?.find((action) => action.actionId === violation.actionId)?.customer || violation.actionId}: {violation.error}
              </li>
            ))}</ul>
          )}
          {outcome.detail?.rolledBack && <div>The batch was rolled back — an action had already moved on. Reload the queue.</div>}
        </div>
      )}
      {outcome?.ok && (
        <div className="rv-note good">
          <b>{outcome.batch.approved} of {outcome.batch.requested} recorded</b> by {outcome.batch.actorId} at {new Date(outcome.batch.decidedAt).toLocaleString('en-AU')}.
          <ul>
            {Object.entries(outcome.batch.byVerdict || {}).map(([verdict, count]) => <li key={verdict}>{phrase(verdict)}: {count}</li>)}
            {outcome.batch.failed ? <li className="bad">Failed: {outcome.batch.failed}</li> : null}
          </ul>
          {!!outcome.failures?.length && (
            <ul>{outcome.failures.map((failure, index) => <li key={index} className="bad">{failure.actionId}: {failure.error}</li>)}</ul>
          )}
        </div>
      )}

      {actions && !actions.length && !error && <div className="rv-empty">No actions are awaiting approval.</div>}

      {!!actions?.length && (
        <>
          <div className="rv-note">Approvals <b>append</b> to the ledger — decisions are never rewritten. A verdict other than <b>Agreed</b> requires its own reason.</div>
          <div className="rv-scroll">
            <div className="rv-appr rv-appr-head"><span>Customer</span><span>Action</span><span>Verdict</span><span>Override reason</span></div>
            {items.map(({ action, verdict, overrideReason }) => (
              <div className="rv-appr" key={action.actionId}>
                <span>
                  <button className="rv-linkname" onClick={() => { onClose(); openCase?.(action.customerId); }}>{action.customer}</button>
                  <div className="meta">
                    {action.customerId} · {action.jurisdiction} · balance {action.balance != null ? `$${action.balance}` : 'not recorded'} · {phrase(action.hardshipStatus, 'no hardship status')}
                    {action.sensitiveCustomer ? ' · sensitive' : ''}{action.pipelineHalted ? ' · pipeline halted' : ''}
                  </div>
                </span>
                <span className="num">{phrase(action.actionType)}<div className="meta">{action.policy}</div></span>
                <span>
                  <select aria-label={`Verdict for ${action.customer}`} value={verdict} onChange={(event) => setRow(action.actionId, { verdict: event.target.value })} disabled={!!outcome?.ok}>
                    {/* Value stays the API's constant; only the label is phrased. */}
                    {VERDICTS.map((option) => <option key={option} value={option}>{phrase(option)}</option>)}
                  </select>
                </span>
                <span>
                  {verdict === 'AGREED'
                    ? <span className="rv-notreq">Not required</span>
                    : <input
                        className={overrideReason.trim() ? '' : 'missing'}
                        aria-label={`Override reason for ${action.customer}`}
                        placeholder="Required reason"
                        value={overrideReason}
                        disabled={!!outcome?.ok}
                        onChange={(event) => setRow(action.actionId, { overrideReason: event.target.value })}
                      />}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </ReviewModal>
  );
}
