import React, { useState } from 'react';
import { COLUMN_OF, flagsOf, reasonOfResult } from './HardshipSweepRunner.js';

/* ============================================================================
 * The three columns the sweep separates into.
 *
 *   Needs a decision   ← ACTION_REQUIRED            (work)
 *   Blocked on evidence ← INSUFFICIENT_EVIDENCE     (work — says what is missing)
 *   Cleared            ← NO_CHANGE + SENSITIVE_CUSTOMER + OPTED_OUT +
 *                        ON_TAILORED_ASSISTANCE     (AUDIT ONLY — never work)
 *
 * Sensitive-customer and opted-out are FLAGS ON THE CARD, not tabs: the fact
 * survives, it just stops being a navigation axis.
 *
 * NOT_EVALUATED has no column. After a sweep it should be zero; if any remain
 * they are surfaced in their own honest strip by the page, not hidden here.
 * ========================================================================== */

const COLUMNS = [
  {
    key: 'needs',
    label: 'Needs a decision',
    tone: 'rust',
    note: 'A better hardship arrangement is available than the one in force. These are the cases waiting on an officer.',
  },
  {
    key: 'evidence',
    label: 'Blocked on evidence',
    tone: 'amber',
    note: 'Evaluated, but a limb of the eligibility test could not be proven, so no plan is proposed. Open a case to see which limb is unresolved.',
  },
  {
    key: 'cleared',
    label: 'Cleared',
    tone: 'green',
    audit: true,
    note: 'Evaluated and recorded for audit only. These customers never enter the operations queue and are not work.',
  },
];

const CLEARED_VISIBLE = 10;

export default function SweepColumns({ sweep, queue, openCase, animate }) {
  const [expanded, setExpanded] = useState({});

  const byId = new Map(queue.map((item) => [item.id, item]));
  const grouped = { needs: [], evidence: [], cleared: [] };
  sweep.results.forEach((row) => {
    const column = COLUMN_OF[row.category];
    if (column) grouped[column].push(row);
  });

  return (
    <div className={`sw-cols${animate ? ' is-entering' : ''}`}>
      {COLUMNS.map((column, columnIndex) => {
        const rows = grouped[column.key];
        const capped = column.key === 'cleared' && !expanded.cleared;
        const shown = capped ? rows.slice(0, CLEARED_VISIBLE) : rows;
        const hidden = rows.length - shown.length;

        return (
          <section className={`sw-col tone-${column.tone}`} key={column.key} style={{ '--c': columnIndex }}>
            <header className="sw-col-head">
              <h2>{column.label}</h2>
              <span className="n">{rows.length}</span>
            </header>
            {column.audit && <div className="sw-audit">Audit only</div>}
            <p className="sw-col-note">{column.note}</p>

            <div className="sw-col-body">
              {shown.map((row, index) => {
                const item = byId.get(row.customerId);
                const flags = flagsOf(row);
                return (
                  <button
                    type="button"
                    className="sw-card"
                    key={row.customerId}
                    style={{ '--i': Math.min(index, 12) }}
                    onClick={() => openCase(row.customerId)}
                  >
                    <span className="sw-card-top">
                      <b>{row.name || row.customerId}</b>
                      {item?.priority && <span className={`sw-prio p-${item.priority.toLowerCase()}`}>{item.priority}</span>}
                    </span>
                    <span className="sw-card-meta">
                      {row.customerId}
                      {item?.state ? ` · ${item.state}` : ''}
                      {item?.team ? ` · ${item.team}` : ''}
                    </span>
                    <span className="sw-card-reason">{reasonOfResult(row)}</span>
                    {(!!flags.length || item?.pipelineHalted) && (
                      <span className="sw-card-flags">
                        {flags.map((flag) => <span className="sw-flag" key={flag.key}>{flag.label}</span>)}
                        {item?.pipelineHalted && <span className="sw-flag bad">pipeline halted</span>}
                      </span>
                    )}
                  </button>
                );
              })}

              {!rows.length && (
                <div className="sw-col-empty">
                  {column.key === 'needs'
                    ? 'No customer needs a decision from this sweep.'
                    : column.key === 'evidence'
                      ? 'Every customer assessed had enough evidence to reach a verdict.'
                      : 'No customer was cleared in this sweep.'}
                </div>
              )}

              {hidden > 0 && (
                <button type="button" className="sw-more" onClick={() => setExpanded((current) => ({ ...current, cleared: true }))}>
                  +{hidden} more cleared
                </button>
              )}
              {column.key === 'cleared' && expanded.cleared && rows.length > CLEARED_VISIBLE && (
                <button type="button" className="sw-more" onClick={() => setExpanded((current) => ({ ...current, cleared: false }))}>
                  Show fewer
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
