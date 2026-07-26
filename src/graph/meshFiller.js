/**
 * Purely additive, visualization-only synthetic density filler.
 *
 * The real dataset (dataset.js) is small on purpose — three demo customers, four
 * states, a handful of programs — because that's what the deterministic resolver
 * needs and no more. But the "Assemble" step's mesh view wants to read like an
 * actual populated context graph, not four dots. This module generates a large,
 * clearly-synthetic set of extra Customer/AccountRecord/LocalAgency nodes scoped
 * to the four real states, with FILLER- prefixed ids so they can never collide
 * with or be mistaken for the three canonical demo customers.
 *
 * Nothing here is read by resolve.js, dataset.js, or any workflow code — it is
 * merged into the /api/graph/visualization response only, never into the
 * resolver's dataset. Deterministic seed so the mesh looks the same across
 * restarts rather than reshuffling every reload.
 */

const STATES = ['CA', 'TX', 'IL', 'NY'];
const FIRST = ['Maria', 'James', 'Linda', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel'];
const LAST = ['Garcia', 'Nguyen', 'Smith', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Rodriguez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'White', 'Harris', 'Clark'];
const CITY_BY_STATE = {
  CA: ['Fresno', 'Bakersfield', 'Sacramento', 'Long Beach', 'Oakland'],
  TX: ['El Paso', 'Arlington', 'Corpus Christi', 'Lubbock', 'Laredo'],
  IL: ['Rockford', 'Peoria', 'Springfield', 'Aurora', 'Joliet'],
  NY: ['Buffalo', 'Rochester', 'Syracuse', 'Albany', 'Yonkers']
};
const NOTE_TEMPLATES = [
  'Called about due date extension.',
  'Confirmed mailing address on file.',
  'Requested paperless billing.',
  'Asked about budget billing enrollment.',
  'Reported a billing discrepancy, referred to review.',
  'Left voicemail regarding past-due balance.',
  'Customer disputed a late fee.',
  'Confirmed receipt of disconnection notice.'
];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached = null;

/** count controls roughly how many filler customers to generate (default 300). */
export function generateFillerMesh({ count = 300 } = {}) {
  if (cached && cached.count === count) return cached.graph;

  const rand = mulberry32(20260724);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const nodes = [];
  const links = [];

  for (let i = 0; i < count; i++) {
    const state = pick(STATES);
    const id = `FILLER-CUS-${1000 + i}`;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const city = pick(CITY_BY_STATE[state]);
    const arrears = Math.round(80 + rand() * 2400);

    nodes.push({
      id, primaryLabel: 'Customer', labels: ['Customer'], label: name,
      properties: { id, name, state, city, arrears, _synthetic: true, _filler: true }
    });
    links.push({ id: `${id}->${state}:SERVED_IN`, source: id, target: state, type: 'SERVED_IN' });

    const invoiceCount = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < invoiceCount; k++) {
      const invId = `${id}-INV-${k}`;
      const amount = Math.round(40 + rand() * 260);
      nodes.push({
        id: invId, primaryLabel: 'AccountRecord', labels: ['AccountRecord'], label: `Invoice $${amount}`,
        properties: { id: invId, kind: 'invoice', amount, _synthetic: true, _filler: true }
      });
      links.push({ id: `${id}->${invId}:HAS_INVOICE`, source: id, target: invId, type: 'HAS_INVOICE' });
    }

    if (rand() > 0.35) {
      const payId = `${id}-PAY`;
      const amount = Math.round(30 + rand() * 220);
      nodes.push({
        id: payId, primaryLabel: 'AccountRecord', labels: ['AccountRecord'], label: `Payment $${amount}`,
        properties: { id: payId, kind: 'payment', amount, _synthetic: true, _filler: true }
      });
      links.push({ id: `${id}->${payId}:HAS_PAYMENT`, source: id, target: payId, type: 'HAS_PAYMENT' });
    }

    const noteCount = Math.floor(rand() * 3);
    for (let k = 0; k < noteCount; k++) {
      const noteId = `${id}-NOTE-${k}`;
      const text = pick(NOTE_TEMPLATES);
      nodes.push({
        id: noteId, primaryLabel: 'AccountRecord', labels: ['AccountRecord'], label: text,
        properties: { id: noteId, kind: 'contact_note', text, _synthetic: true, _filler: true }
      });
      links.push({ id: `${id}->${noteId}:HAS_NOTE`, source: id, target: noteId, type: 'HAS_NOTE' });
    }
  }

  // A spread of extra local intake agencies per state — plausible, not exhaustive.
  const AGENCY_SUFFIXES = ['Community Action Partnership', 'Family Services Council', 'Neighborhood Energy Fund', 'County Assistance Office', 'Regional Weatherization Program'];
  for (const state of STATES) {
    for (let i = 0; i < 5; i++) {
      const id = `FILLER-AGENCY-${state}-${i}`;
      const name = `${state} ${AGENCY_SUFFIXES[i]}`;
      nodes.push({
        id, primaryLabel: 'LocalAgency', labels: ['LocalAgency'], label: name,
        properties: { id, name, state, _synthetic: true, _filler: true }
      });
      links.push({ id: `${state}->${id}:INTAKE_VIA`, source: state, target: id, type: 'INTAKE_VIA' });
    }
  }

  const graph = { nodes, links };
  cached = { count, graph };
  return graph;
}
