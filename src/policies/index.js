import * as v120 from './vic.hardship.best-offer/v1.2.0.js';
import * as v130 from './vic.hardship.best-offer/v1.3.0.js';

const versions = new Map([
  [`${v120.metadata.id}@${v120.metadata.version}`, v120],
  [`${v130.metadata.id}@${v130.metadata.version}`, v130]
]);

export function policyVersions(policyId) {
  return [...versions.values()].filter((entry) => entry.metadata.id === policyId);
}

export function resolveVersionAt(policyId, evaluatedAt, pinnedVersion = null) {
  if (pinnedVersion) {
    const pinned = versions.get(`${policyId}@${pinnedVersion}`);
    if (!pinned) throw new Error(`Unknown policy ${policyId}@${pinnedVersion}`);
    return pinned;
  }
  const at = new Date(evaluatedAt).getTime();
  const match = policyVersions(policyId).find(({ metadata }) => {
    const from = new Date(metadata.effectiveFrom).getTime();
    const to = metadata.effectiveTo ? new Date(metadata.effectiveTo).getTime() : Infinity;
    return at >= from && at < to;
  });
  if (!match) throw new Error(`No ${policyId} version in force at ${new Date(evaluatedAt).toISOString()}`);
  return match;
}

export function getPolicy(policyId, version) {
  return resolveVersionAt(policyId, new Date(0), version);
}

export function listPolicies() {
  return [...versions.values()].map(({ metadata }) => metadata);
}
