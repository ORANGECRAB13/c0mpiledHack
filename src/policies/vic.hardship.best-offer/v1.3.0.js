import { common } from './meta.js';
import { evaluateBestOffer } from './evaluate.js';

export const metadata = Object.freeze({ ...common, version: '1.3.0', effectiveFrom: '2026-10-01T00:00:00.000+10:00', effectiveTo: null });
export const evaluate = (snapshot) => evaluateBestOffer(snapshot, { disconnectionFloor: 1000, version: 'v1.3' });
