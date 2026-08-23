import { createHash } from 'node:crypto';

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

/**
 * Provenance keys that record WHEN something was observed rather than WHAT was
 * observed. They must never reach the input hash.
 *
 * `bestOffer.checkedAt` is a wall-clock stamp written on every pricing call. It
 * sits inside `bestOffer`, which the policy declares in readFields, so every
 * evaluation produced a fresh inputHash, the I3 skip check never matched, and a
 * NO_CHANGE evaluation wrote a full decision instead of a thin rollup. One
 * customer accumulated 28 decisions that all reached the same outcome, and the
 * case trail read as a wall of duplicates. Across the ledger: 3,346 evaluations
 * produced 1,466 decisions and only 7 no-change intervals.
 *
 * The value stays in the snapshot — it is real provenance and snapshotHash
 * still covers it. It simply stops deciding whether the inputs changed.
 */
const VOLATILE_KEYS = new Set(['checkedAt', 'observedAt', 'fetchedAt', 'retrievedAt', 'generatedAt']);

function withoutVolatile(value) {
  if (Array.isArray(value)) return value.map(withoutVolatile);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .map(([key, inner]) => [key, withoutVolatile(inner)]),
    );
  }
  return value;
}

/**
 * The fields a policy declares it reads, stripped of observation timestamps.
 * Two evaluations of an unchanged customer must produce the same hash.
 */
export function inputFor(state, readFields) {
  return Object.fromEntries(readFields.map((field) => [field, withoutVolatile(state[field] ?? null)]));
}
