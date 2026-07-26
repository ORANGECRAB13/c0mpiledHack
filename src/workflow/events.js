import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * One event format across the whole application. This log drives the UI
 * timeline, the audit document, the execution status, and the Replay
 * assertions — and the audit must be reconstructable from it alone, with no
 * model-generated summary.
 */

const log = new Map(); // caseId → events[]
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function appendEvent(caseId, type, { actor, payload = {}, sourceIds, authorityIds } = {}) {
  const event = {
    id: `evt_${crypto.randomBytes(6).toString('hex')}`,
    caseId,
    type,
    actor: actor || { type: 'system', id: 'vocare' },
    timestamp: new Date().toISOString(),
    payload,
    ...(sourceIds?.length ? { sourceIds } : {}),
    ...(authorityIds?.length ? { authorityIds } : {})
  };

  if (!log.has(caseId)) log.set(caseId, []);
  log.get(caseId).push(event);
  bus.emit('event', event);
  bus.emit(`case:${caseId}`, event);

  return event;
}

export function eventsFor(caseId) {
  return log.get(caseId) || [];
}

export function allEvents() {
  return [...log.values()].flat().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function clearCase(caseId) {
  log.delete(caseId);
}

export function clearAll() {
  log.clear();
}

/** Source and authority IDs cited anywhere in the case — used by the audit document. */
export function citedIds(caseId) {
  const events = eventsFor(caseId);
  return {
    sourceIds: [...new Set(events.flatMap((e) => e.sourceIds || []))],
    authorityIds: [...new Set(events.flatMap((e) => e.authorityIds || []))]
  };
}
