// Data for the four-surface platform UI: Live Map, Walkthrough, Live Console,
// Retrospective. Use case: AI-native compliance operations for AU energy
// retailers — the drift engine workflows over the mock retailer
// "Aurora Retail Energy".

// ── live console: the active change case ─────────────────────────────
export const ACTIVE_CASE = {
  initials: 'AR',
  title: 'AER (Retail Law) instrument',
  ref: 'OBL-014 · s 111 · National',
  idleChip: 'Monitoring',
  runChip: 'drift detected · propagating',
};

export const CASE_STATE = [
  { label: 'Threshold', key: 'threshold', idle: '—', done: '$300 → $500', accent: true },
  { label: 'Effective', key: 'effective', idle: '—', done: '2026-07-01' },
  { label: 'Register row', key: 'row', idle: 'OBL-014 · approved', done: 'OBL-014 · re-verify' },
  { label: 'Artifacts affected', key: 'artifacts', idle: '—', done: '4 flagged' },
  { label: 'Graph node', key: 'node', idle: 'disconnect_floor · ok', done: 'pending review' },
];

export const QUEUE = [
  { initials: 'ES', name: 'ESC ERCoP v4', sub: 'VIC · commences 2026-09-01', dot: '#3D5AFE' },
  { initials: 'AG', name: 'AER guideline merge', sub: 'clause re-map · Sep 2026', dot: '#C4C4CA' },
  { initials: 'NE', name: 'NERR v52 watch', sub: 'AEMC · monitoring', dot: '#6A6A72' },
];

// six agents, run in order; each contributes timeline events
export const AGENTS = [
  {
    id: 'watcher',
    name: 'Watcher Agent',
    sub: 'Instrument registers',
    color: '#3D5AFE',
    grad: ['#3D5AFE', '#6B7CFF'],
    icon: 'pulse',
    events: [
      { t: '09:24:12', text: 'Polling aer.gov.au registers — etag changed', state: 'dim' },
      { t: '09:24:14', text: 'Version bump: 2024 instrument → 2026 instrument', state: 'flag' },
    ],
  },
  {
    id: 'extract',
    name: 'Extraction Agent',
    sub: 'Draft register rows',
    color: '#9A9AA2',
    grad: ['#9A9AA2', '#B4B4BC'],
    icon: 'layers',
    events: [
      { t: '09:24:16', text: 'Parsing s 111 — min. disconnection amount', state: 'dim' },
      { t: '09:24:18', text: 'Draft row: $500, effective 2026-07-01', state: 'flag' },
    ],
  },
  {
    id: 'diff',
    name: 'Diff Agent',
    sub: 'Obligation register',
    color: '#6E6E76',
    grad: ['#6E6E76', '#8A8A92'],
    icon: 'diff',
    events: [
      { t: '09:24:20', text: 'OBL-014 diff: $300 → $500', state: 'flag' },
      { t: '09:24:21', text: 'Row marked re-verify · sent to M. Okafor', state: 'dim' },
    ],
  },
  {
    id: 'mapping',
    name: 'Mapping Agent',
    sub: 'Internal artifacts',
    color: '#C4C4CA',
    grad: ['#C4C4CA', '#D6D6DC'],
    icon: 'map',
    events: [
      { t: '09:24:23', text: '4 downstream artifacts flagged', state: 'flag' },
      { t: '09:24:24', text: 'WI-4.2 · EL-018 · TRN-M6 · R-22', state: 'dim' },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance Agent',
    sub: 'Eligibility graph',
    color: '#4E4E56',
    grad: ['#4E4E56', '#6A6A72'],
    icon: 'shield',
    events: [
      { t: '09:24:26', text: 'disconnect_floor → pending review', state: 'flag' },
      { t: '09:24:27', text: 'Prior decisions stay valid — versioned', state: 'dim' },
    ],
  },
  {
    id: 'outreach',
    name: 'Propagation Agent',
    sub: 'Owners & registers',
    color: '#D64545',
    grad: ['#D64545', '#E88A84'],
    icon: 'send',
    events: [
      { t: '09:24:29', text: 'Change notices → 4 artifact owners', state: 'dim' },
      { t: '09:24:30', text: 'Breach register rule R-22 queued for update', state: 'flag' },
    ],
  },
];

// ── the document being scanned in the right panel ────────────────────
export const DOC = {
  title: 'AER (Retail Law) Instrument 2026',
  sub: 'Minimum disconnection amount · s 111',
  pages: 14,
  sections: [
    {
      id: '3',
      heading: '3 · Application',
      paras: [
        { text: '3.1 This instrument applies to retailers under the National Energy Retail Law in participating jurisdictions.' },
        { text: '3.2 It supersedes the amount specified in the 2024 instrument from the commencement date.' },
      ],
    },
    {
      id: '4',
      heading: '4 · Minimum disconnection amount',
      paras: [
        {
          text: '4.1 A retailer must not arrange de-energisation of premises for a customer whose arrears are below the minimum disconnection amount.',
          highlight: true,
          chip: 'de-energisation floor',
        },
        {
          text: '4.2 The minimum disconnection amount is $500 (GST inclusive).',
          highlight: true,
          chip: 'threshold change · was $300',
        },
      ],
    },
    {
      id: '5',
      heading: '5 · Commencement',
      paras: [
        {
          text: '5.1 This instrument commences on 1 July 2026.',
          highlight: true,
          chip: 'effective date',
        },
        { text: '5.2 Decisions made before commencement are assessed under the instrument in force at the time.' },
      ],
    },
  ],
};

export const SYSTEMS = [
  { name: 'AEMC energy-rules', status: 'Connected' },
  { name: 'AER registers', status: 'Connected' },
  { name: 'ESC code of practice', status: 'Connected' },
  { name: 'Policy repo (WI / EL)', status: 'Connected' },
  { name: 'Breach register', status: 'Pending' },
];

// ── live map ─────────────────────────────────────────────────────────
export const MAP_STATS = [
  { n: '6', cap: 'agents active' },
  { n: '6', den: '/6', cap: 'systems linked' },
  { n: '1,286', cap: 'checks today', accent: true },
];

// nodes around the engine: regulatory sources (left) and internal
// systems (right); label + role
export const MAP_NODES = [
  { id: 'aemc', label: 'AEMC NERR', role: 'Watcher agent', chip: 'Watch', x: 168, y: 300, dot: '#3D5AFE' },
  { id: 'aer', label: 'AER registers', role: 'Extraction agent', chip: 'Extract', x: 152, y: 408, dot: '#6B7CFF' },
  { id: 'esc', label: 'ESC ERCoP', role: 'Watcher agent', chip: 'History', x: 168, y: 512, dot: '#9A9AA2' },
  { id: 'register', label: 'Obligation register', role: 'Diff agent', chip: 'Diff', x: 838, y: 300, dot: '#6E6E76' },
  { id: 'policy', label: 'Policy repo', role: 'Mapping agent', chip: 'Propagate', x: 852, y: 408, dot: '#C4C4CA' },
  { id: 'graph', label: 'Eligibility graph', role: 'Compliance agent', chip: 'Verify', x: 838, y: 512, dot: '#4E4E56' },
];

// ── walkthrough slides ───────────────────────────────────────────────
export const SLIDES = [
  {
    kind: 'problem',
    micro: 'the problem',
    title: 'Today, regulatory change is caught far too late.',
    sub: 'Your documents quietly go stale…',
    points: [
      ['Reactive, not proactive', 'A rule moves; the work instruction is found stale months later, on a discovery call.', 'clock'],
      ['Fragmented corpus', '22 instruments across AEMC, AER, ESC and three states — no machine-readable versions.', 'nodes'],
      ['Civil penalty exposure', 'Letters and thresholds derived from superseded instruments are Tier 1 territory.', 'warn'],
    ],
    cta: 'See how Vocare changes this →',
  },
  {
    kind: 'step', n: 1, title: 'Source Watch',
    icon: 'pulse', color: ['#3D5AFE', '#6B7CFF'],
    engineSub: 'Watching the instrument registers',
    inside: ['Poll landing pages, not PDFs', 'Detect version bumps & effective dates', 'Diff NERR by clause hash'],
  },
  {
    kind: 'step', n: 2, title: 'Obligation Extraction',
    icon: 'layers', color: ['#9A9AA2', '#B4B4BC'],
    engineSub: 'Drafting structured register rows',
    inside: ['Instrument · clause · jurisdiction · version', 'Trigger, action, penalty tier', 'LLM drafts — never decides'],
  },
  {
    kind: 'step', n: 3, title: 'Human Verification',
    icon: 'shield', color: ['#6E6E76', '#8A8A92'],
    engineSub: 'A named person approves every row',
    inside: ['Verified-by and when, recorded', 'Row immutable once approved', 'Engine reads approved rows only'],
  },
  {
    kind: 'step', n: 4, title: 'Change Propagation',
    icon: 'send', color: ['#C4C4CA', '#D6D6DC'],
    engineSub: 'Everything mapped downstream lights up',
    inside: ['Register diffs with severity', 'Work instructions, letters, training, controls', 'Graph nodes flag pending review'],
  },
  {
    kind: 'outcome',
    micro: 'the outcome',
    title: 'Compliance drift, caught the day it happens.',
    stats: [['~4 min', 'vs months', '#3D5AFE'], ['0', 'stale artifacts', '#C4C4CA'], ['100%', 'decisions versioned', '#4E4E56']],
    cards: [
      ['Proactive, not reactive', 'Version bumps surface within a poll cycle — not on a discovery call.', 'pulse', ['#3D5AFE', '#6B7CFF']],
      ['One obligation register', 'A database of verified rows — not an index of chunks.', 'layers', ['#9A9AA2', '#B4B4BC']],
      ['Deterministic by design', 'No model output reaches a customer decision — a person approved every row.', 'shield', ['#6E6E76', '#8A8A92']],
      ['Propagation, automatic', 'Every mapped artifact and graph node flags the moment its source moves.', 'send', ['#C4C4CA', '#D6D6DC']],
      ['Provenance built in', 'Every eligibility node cites its clause, with an instrument version.', 'map', ['#4E4E56', '#6A6A72']],
      ['History stays valid', 'Decisions are versioned, never overwritten — both outcomes correct for their date.', 'check', ['#6A6A72', '#9A9AA2']],
    ],
  },
];

// ── retrospective ────────────────────────────────────────────────────
export const RETRO = {
  micro: 'retrospective analysis',
  title: 'Which documents should have been flagged earlier?',
  sub: "We ran Vocare across this retailer's credit & collections corpus and internal policy repo for the first half of 2026.",
  stats: [
    ['INSTRUMENTS TRACKED', '22'],
    ['ARTIFACTS MAPPED', '34'],
  ],
  missed: 12,
  openCase: { id: 'OBL-014', sub: 'min. disconnection amount · s 111' },
  window: 'Jan – Jun 2026',
  findings: [
    { id: 'WI-4.2', name: 'Credit & Collections Work Instruction v11 · §4.2', detail: 'cited $300 for 36 days after commencement', sev: 'critical' },
    { id: 'EL-018', name: 'Disconnection warning letter template', detail: 'stale threshold in body copy · 4,102 letters sent', sev: 'critical' },
    { id: 'TRN-M6', name: 'Agent training deck · module 6', detail: 'old amount quoted on slide 14', sev: 'high' },
    { id: 'R-22', name: 'Breach register rule', detail: 'auto-flag threshold outdated · 9 false passes', sev: 'high' },
    { id: 'FAQ-3', name: 'Website hardship FAQ', detail: 'superseded ESC entitlement text', sev: 'medium' },
  ],
};
