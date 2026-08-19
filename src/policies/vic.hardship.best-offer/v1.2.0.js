import { common, ARREARS_THRESHOLD, ARREARS_AGE } from './meta.js';
import { evaluateBestOffer } from './evaluate.js';

// Pre-reform position (ERCoP v6). Clause 187 as it stood contains NO monetary
// floor on disconnection for arrears — cl 187(2) is newly INSERTED by the 2025
// amendment. The change is therefore "no floor -> $1,000", not "$300 -> $1,000".
//
// The widely quoted $300 figure comes from the ESC's own reform summary (and
// prior retailer practice / the national framework), NOT from any clause of the
// Code. It could not be sourced from the instruments in data/au-regulations/,
// so it is carried here as a non-binding reference figure with its own
// provenance and is deliberately NOT used to gate any conclusion. Claiming it
// as ERCoP would be a fabricated citation.
export const referenceFigures = Object.freeze({
  disconnectionPracticeFloor: Object.freeze({
    value: 300,
    source: 'ESC Energy Consumer Reforms summary / prior retailer practice — NOT an ERCoP clause',
    binding: false
  })
});

export const metadata = Object.freeze({
  ...common,
  version: '1.2.0',
  effectiveFrom: '2025-01-01T00:00:00.000Z',
  effectiveTo: '2026-10-01T00:00:00.000+10:00',
  referenceFigures
});

export const evaluate = (snapshot) => evaluateBestOffer(snapshot, {
  arrearsThreshold: ARREARS_THRESHOLD,
  arrearsAge: ARREARS_AGE,
  disconnectionFloor: null, // no monetary floor in force under ERCoP v6 cl 187
  noFloorCitation: 'ERCoP v6 cl 187 (no monetary floor; cl 187(2) not yet inserted)',
  version: 'ERCoP v6'
});
