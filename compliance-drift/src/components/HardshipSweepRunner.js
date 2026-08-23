/* ============================================================================
 * Hardship sweep runner.
 *
 * Drives POST /api/decision-layer/review-all across the whole customer book in
 * bounded batches and publishes REAL progress: every number this store exposes
 * is a count the server returned, never an estimate and never a timer pretending
 * to be work.
 *
 *   total     ← run.page.total          (the size of the book, from the server)
 *   assessed  ← Σ run.evaluated         (customers the server actually evaluated)
 *   failed    ← Σ run.failed            (evaluation errors)
 *   skipped   ← Σ run.skipped           (halted / excluded, reported by the server)
 *   flagged   ← Σ actionable categories (ACTION_REQUIRED + INSUFFICIENT_EVIDENCE)
 *
 * The run is a module-level singleton with an external store, so navigating away
 * from Detection and back neither cancels the sweep nor re-runs it: the page
 * re-subscribes to whatever the run has reached, or to the last finished result.
 *
 * This endpoint WRITES to the ledger. It is only ever called from the explicit
 * "Run the hardship sweep" control — nothing here runs on mount.
 * ========================================================================== */

import { decisionLayerApi } from '../api/decisionLayerApi.js';
import { phraseInline } from './ui.jsx';

/* Batch size is a compromise between the two things the officer can see:
   - small enough that the counter moves often (a 12-customer batch lands every
     ~2–4s, so "47 of 151" advances visibly rather than in two silent jumps);
   - large enough that per-request overhead does not dominate 151 customers.
   Concurrency 4 is the value the existing book review already uses against this
   backend, so the sweep puts no more load on the upstreams than that did. */
export const BATCH_LIMIT = 12;
export const BATCH_CONCURRENCY = 4;

const ACTIONABLE = new Set(['ACTION_REQUIRED', 'INSUFFICIENT_EVIDENCE']);

const EMPTY = {
  phase: 'idle',        // idle | running | done | failed
  total: null,          // run.page.total — unknown until the first batch answers
  assessed: 0,
  failed: 0,
  skipped: 0,
  flagged: 0,
  batches: 0,
  categories: {},
  results: [],
  failures: [],
  skips: [],
  breaker: { tripped: [], autoResumed: [], stillHalted: [], resumedBeforeRun: [] },
  startedAt: null,
  finishedAt: null,
  error: null,
  stoppedShort: false,  // true when we stopped mid-book (failure or abort)
  stopReason: null,
};

let state = EMPTY;
const listeners = new Set();
let running = false;
let runToken = 0;

function publish(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

export function subscribeSweep(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSweepState() {
  return state;
}

export function resetSweep() {
  if (running) runToken += 1;   // orphan the in-flight loop
  running = false;
  publish({ ...EMPTY });
}

function mergeCategories(base, next) {
  const merged = { ...base };
  Object.entries(next || {}).forEach(([key, value]) => {
    merged[key] = (merged[key] || 0) + (value || 0);
  });
  return merged;
}

function countFlagged(results) {
  return results.reduce((total, row) => total + (ACTIONABLE.has(row.category) ? 1 : 0), 0);
}

/**
 * Sweep the whole book. Resolves when the run stops — completed, aborted by the
 * server, or halted by a batch failure. Never throws to the caller; the failure
 * is published as state so the UI can show what DID complete.
 */
export async function runHardshipSweep({ actorId, onLedgerChanged } = {}) {
  if (running) return state;
  running = true;
  runToken += 1;
  const token = runToken;

  publish({ ...EMPTY, phase: 'running', startedAt: Date.now() });

  let offset = 0;
  let guard = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      guard += 1;
      if (guard > 400) {                       // paranoia: never loop forever
        publish({ stoppedShort: true, stopReason: 'The sweep exceeded its batch limit and was stopped.' });
        break;
      }

      const body = await decisionLayerApi.reviewAll({
        limit: BATCH_LIMIT,
        offset,
        concurrency: BATCH_CONCURRENCY,
        actorId,
      });
      if (token !== runToken) return state;    // superseded by a newer run

      const run = body.run || {};
      const page = run.page || {};
      const results = [...state.results, ...(body.results || [])];

      publish({
        total: page.total ?? state.total,
        assessed: state.assessed + (run.evaluated || 0),
        failed: state.failed + (run.failed || 0),
        skipped: state.skipped + (run.skipped || 0),
        batches: state.batches + 1,
        categories: mergeCategories(state.categories, body.categories),
        results,
        flagged: countFlagged(results),
        failures: [...state.failures, ...(body.failures || [])],
        skips: [...state.skips, ...(body.skipped || [])],
        breaker: {
          tripped: [...state.breaker.tripped, ...(body.circuitBreaker?.tripped || [])],
          autoResumed: [...state.breaker.autoResumed, ...(body.circuitBreaker?.autoResumed || [])],
          stillHalted: [...state.breaker.stillHalted, ...(body.circuitBreaker?.stillHalted || [])],
          resumedBeforeRun: [...state.breaker.resumedBeforeRun, ...(body.circuitBreaker?.resumedBeforeRun || [])],
        },
      });

      if (run.aborted) {
        publish({ stoppedShort: true, stopReason: run.abortReason || 'The server aborted the run.' });
        break;
      }

      // Advance by the page window, not by the evaluated count: a customer the
      // server skipped still occupies a slot in the page, so stepping by
      // `evaluated` would re-request the same slice forever.
      const step = page.limit || BATCH_LIMIT;
      offset += step;
      const total = page.total ?? state.total;
      if (total == null || offset >= total) break;
    }

    publish({ phase: 'done', finishedAt: Date.now() });
  } catch (error) {
    // A mid-sweep failure stops the sweep. What completed stays on screen and is
    // labelled partial — the remainder is never reported as succeeded.
    publish({
      phase: state.assessed > 0 ? 'done' : 'failed',
      finishedAt: Date.now(),
      error: error.message || String(error),
      stoppedShort: true,
      stopReason: error.message || String(error),
    });
  } finally {
    if (token === runToken) running = false;
  }

  onLedgerChanged?.();
  return state;
}

/* --- category → column ---------------------------------------------------- */

export const COLUMN_OF = {
  ACTION_REQUIRED: 'needs',
  INSUFFICIENT_EVIDENCE: 'evidence',
  NO_CHANGE: 'cleared',
  SENSITIVE_CUSTOMER: 'cleared',
  OPTED_OUT: 'cleared',
  ON_TAILORED_ASSISTANCE: 'cleared',
};

/** Flag chips carried ON the card instead of being their own navigation axis. */
const FLAG_LABEL = {
  SENSITIVE_CUSTOMER: 'sensitive customer',
  OPTED_OUT: 'opted out',
  ON_TAILORED_ASSISTANCE: 'on tailored assistance',
};

export function flagsOf(result) {
  const keys = new Set(result.flags || []);
  if (FLAG_LABEL[result.category]) keys.add(result.category);
  return [...keys].map((key) => ({ key, label: FLAG_LABEL[key] || phraseInline(key, key) }));
}

