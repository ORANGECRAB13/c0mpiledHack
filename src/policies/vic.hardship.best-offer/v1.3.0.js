import { common, ARREARS_THRESHOLD, ARREARS_AGE, CLAUSES } from './meta.js';
import { evaluateBestOffer } from './evaluate.js';

// Post-reform position: cl 187(2), inserted by the Energy Consumer Reforms
// Amendment 2025, bars disconnection for arrears below $1,000 assessed
// inclusive of GST. Value and provenance live here, not as a literal in the
// rule body, so a change of figure is a config change the drift engine can see.
export const disconnectionFloor = Object.freeze({
  value: 1000,
  currency: 'AUD',
  citation: CLAUSES.disconnectionThreshold,
  source: 'ERCoP cl 187(2)',
  gstInclusive: true,
  supersededByGuideline: false
});

export const metadata = Object.freeze({
  ...common,
  version: '1.3.0',
  effectiveFrom: '2026-10-01T00:00:00.000+10:00',
  effectiveTo: null,
  disconnectionFloor
});

export const evaluate = (snapshot) => evaluateBestOffer(snapshot, {
  arrearsThreshold: ARREARS_THRESHOLD,
  arrearsAge: ARREARS_AGE,
  disconnectionFloor,
  version: 'ERCoP v7'
});
