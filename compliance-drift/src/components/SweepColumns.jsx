import React, { useState } from 'react';
import { COLUMN_OF, flagsOf } from './HardshipSweepRunner.js';

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

/* What differs between two cards in the same column: how much is owed and for
   how long. The column header already states the verdict, so repeating it on
   every card added a line of text and no information. Missing values are simply
   omitted — never rendered as a zero. */
function exposureOf(item) {
  if (!item) return null;
  const parts = [];
  const balance = Number(item.balance);
  if (Number.isFinite(balance) && balance > 0) {
    parts.push(balance.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }));
  }
  const days = Number(item.oldestDebtDays);
  if (Number.isFinite(days) && days > 0) parts.push(`${days} days`);
  return parts.length ? parts.join(' · ') : null;
}

const COLUMNS = [
  {
    key: 'needs',
    label: 'Needs a decision',
    tone: 'rust',
  },
  {
    key: 'evidence',
    label: 'Blocked on evidence',
    tone: 'amber',
  },
  {
    key: 'cleared',
    label: 'Cleared',
    tone: 'green',
    audit: true,
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
                      <span className="sw-card-id">{row.customerId}</span>
                    </span>
                    {exposureOf(item) && <span className="sw-card-exposure">{exposureOf(item)}</span>}
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
