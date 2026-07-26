import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '../../data/us-arrearage');

const STATES = ['ca', 'tx', 'il', 'ny'];

async function readJson(relativePath) {
  const raw = await readFile(path.join(DATA_DIR, relativePath), 'utf8');
  return JSON.parse(raw);
}

let cache = null;

/**
 * Loads every synthetic source document into one normalised dataset.
 * This is the single source of truth for both the Neo4j ingest and the
 * in-memory fallback resolver, so the two can never drift apart.
 */
export async function loadDataset({ reload = false } = {}) {
  if (cache && !reload) return cache;

  const [customersDoc, accounts, liheap, amps, pipps, stacking, gaps] = await Promise.all([
    readJson('customers.json'),
    readJson('accounts.json'),
    readJson('liheap.json'),
    readJson('amp-programs.json'),
    readJson('pipp-programs.json'),
    readJson('stacking-rules.json'),
    readJson('knowledge-gaps.json')
  ]);

  const jurisdictions = await Promise.all(
    STATES.map((code) => readJson(path.join('puc-rules', `${code}.json`)))
  );

  const programs = [
    ...liheap.programs,
    ...amps.programs,
    ...pipps.programs
  ];

  cache = {
    utility: customersDoc.utility,
    customers: customersDoc.customers,
    invoices: accounts.invoices,
    payments: accounts.payments,
    contactNotes: accounts.contactNotes,
    jurisdictions,
    programs,
    federalPovertyLevel: liheap.federalPovertyLevel,
    stateMedianIncome: liheap.stateMedianIncome,
    stackingRules: stacking.rules,
    fallbackArrangement: stacking.fallbackArrangement,
    knowledgeGaps: gaps.gaps,
    loadedAt: new Date().toISOString()
  };

  return cache;
}

export async function persistKnowledgeGaps(gapList) {
  const body = {
    _synthetic: true,
    _purpose:
      'Starts empty. The agent writes an entry here when it hits a program it does not know about; a human ratifies it, and the next call can use it.',
    gaps: gapList
  };
  await writeFile(path.join(DATA_DIR, 'knowledge-gaps.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  if (cache) cache.knowledgeGaps = gapList;
}

// ── lookups ──────────────────────────────────────────────────────────

export function findCustomer(dataset, customerId) {
  return dataset.customers.find((c) => c.id === customerId || c.caseId === customerId) || null;
}

export function findJurisdiction(dataset, stateCode) {
  return dataset.jurisdictions.find((j) => j.state.code === stateCode) || null;
}

export function programsForState(dataset, stateCode) {
  return dataset.programs.filter((p) => p.state === stateCode);
}

export function accountFor(dataset, customerId) {
  return {
    invoice: dataset.invoices.find((i) => i.customerId === customerId) || null,
    payment: dataset.payments.find((p) => p.customerId === customerId) || null,
    notes: dataset.contactNotes.filter((n) => n.customerId === customerId)
  };
}

/** Federal Poverty Level for a household size, from the loaded synthetic table. */
export function fplFor(dataset, householdSize) {
  const { base1Person, perAdditionalPerson } = dataset.federalPovertyLevel;
  return base1Person + perAdditionalPerson * Math.max(0, householdSize - 1);
}

/** State Median Income for a household size, from the loaded synthetic table. */
export function smiFor(dataset, stateCode, householdSize) {
  const table = dataset.stateMedianIncome;
  const base = table.base4Person[stateCode];
  if (!base) return null;

  const size = Math.max(1, householdSize);
  if (size <= 6) return Math.round(base * table.householdAdjustment[String(size)]);

  const above = table.householdAdjustment['6'] + table.perAdditionalPersonAbove6 * (size - 6);
  return Math.round(base * above);
}
