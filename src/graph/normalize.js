import crypto from 'node:crypto';

export function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function compactKey(value) {
  return normalizeKey(value).replace(/\s+/g, '-');
}

export function hashText(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}
