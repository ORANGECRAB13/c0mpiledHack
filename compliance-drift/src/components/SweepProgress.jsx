import React, { useEffect, useState } from 'react';
import VocareStar from './VocareStar.jsx';
import { flagsOf, BATCH_LIMIT, BATCH_CONCURRENCY } from './HardshipSweepRunner.js';

/* ============================================================================
 * The live sweep status line.
 *
 * The rotating WORD is flavour. Every NUMBER is real: elapsed time is measured
 * from the run's own start, and the counts are the server's returned
 * `run.evaluated` / category tallies accumulated across batches. Nothing here
 * interpolates or predicts — if a batch is slow the counter simply sits still,
 * which is the truth.
 * ========================================================================== */

const WORDS = [
  'Reconciling billing',
  'Corroborating hardship notes',
  'Cross-checking arrangements',
  'Weighing eligibility limbs',
  'Assessing affordability',
  'Discombobulating ledgers',
  'Interrogating the CRM',
  'Auditing better-offer rules',
  'Tracing decision lineage',
];

export default function SweepProgress({ sweep }) {
  const [tick, setTick] = useState(0);

  // One timer drives both the elapsed seconds and the glyph/word rotation.
  useEffect(() => {
    if (sweep.phase !== 'running') return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [sweep.phase]);

  const elapsedMs = (sweep.finishedAt || Date.now()) - (sweep.startedAt || Date.now());
  const elapsed = Math.max(0, Math.round(elapsedMs / 1000));
  const word = WORDS[Math.floor(tick / 10) % WORDS.length];

  // The bar is a ratio of two real counts, so it can never run ahead of the work.
  const pct = sweep.total ? Math.min(100, (sweep.assessed / sweep.total) * 100) : 0;
  const recent = sweep.results.slice(-7).reverse();

  return (
    <div className="sw-run" role="status" aria-live="polite">
      <div className="sw-line">
        <VocareStar size={21} spinning={sweep.phase === 'running'} className="sw-glyph" />
        <span className="sw-word">{word}…</span>
        <span className="sw-facts">
          ({elapsed}s · <b>{sweep.assessed}</b> of <b>{sweep.total ?? '…'}</b> assessed
          {' · '}<b>{sweep.flagged}</b> flagged
          {sweep.failed ? <> · <b>{sweep.failed}</b> failed</> : null}
          {sweep.skipped ? <> · <b>{sweep.skipped}</b> skipped</> : null})
        </span>
      </div>

      <div className="sw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={sweep.total || 0} aria-valuenow={sweep.assessed}>
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="sw-meta">
        Batches of {BATCH_LIMIT} at concurrency {BATCH_CONCURRENCY}. Each batch writes its decisions to the ledger before the next one starts,
        so the count above is work already recorded — not an estimate.
      </div>

      {/* The single stack: results land here as they arrive, newest first. On
          completion this stack fans out into the three columns. */}
      <div className="sw-stack">
        {recent.map((row, index) => (
          <div className="sw-stack-row" key={`${row.customerId}-${index}`} style={{ '--i': index }}>
            <span className="nm">{row.name || row.customerId}</span>
            <span className="cat">{row.categoryLabel || row.category}</span>
            {flagsOf(row).slice(0, 2).map((flag) => (
              <span className="sw-flag" key={flag.key}>{flag.label}</span>
            ))}
          </div>
        ))}
        {!recent.length && <div className="sw-stack-row placeholder"><span className="nm">Opening the customer book…</span></div>}
      </div>
    </div>
  );
}
