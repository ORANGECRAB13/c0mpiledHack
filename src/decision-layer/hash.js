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

export function inputFor(state, readFields) {
  return Object.fromEntries(readFields.map((field) => [field, state[field] ?? null]));
}
