import { common } from './meta.js';
import { evaluateBestOffer } from './evaluate.js';

export const metadata = Object.freeze({ ...common, version: '1.2.0', effectiveFrom: '2025-01-01T00:00:00.000Z', effectiveTo: '2026-10-01T00:00:00.000+10:00' });
export const evaluate = (snapshot) => evaluateBestOffer(snapshot, { disconnectionFloor: 300, version: 'v1.2' });
