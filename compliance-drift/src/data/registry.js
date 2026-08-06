// Synthetic obligation register + source watcher state for the AU energy
// compliance-drift demo. All internal artifacts belong to a mock retailer
// ("Aurora Retail Energy"); regulatory instruments reference real AU sources
// but versions/values are staged for the demo scenario.

export const ACCENTS = {
  green: '#8FE0B8',   // engine / cleared
  mint: '#7FE0B8',    // verify
  deepGreen: '#3AA76D',
  periwinkle: '#8AA6FF', // fetch / source watchers
  softBlue: '#9AAEF5',   // reconcile
  lavender: '#B79BFF',   // unify / policy graph
  cyan: '#6FD3E0',       // reason
  amber: '#F5B979',      // govern / pending review
  coral: '#F0736B',      // warning / drift
  red: '#C0453F',        // failure / stale
};

// ── source watchers ──────────────────────────────────────────────────
// Watchers poll instrument landing pages, not PDFs. `bump` marks the one
// that flips during the scene.
export const SOURCES = [
  {
    id: 'aemc-nerr',
    name: 'AEMC — National Energy Retail Rules',
    short: 'NERR',
    url: 'energy-rules.aemc.gov.au',
    version: 'v51',
    nextVersion: 'v52',
    jurisdiction: 'National',
    lastPoll: '04:12',
    note: 'opaque version IDs — diffed by clause hash',
  },
  {
    id: 'aer-retail-law',
    name: 'AER — Retail Law notice (min. disconnection amount)',
    short: 'AER (Retail Law)',
    url: 'aer.gov.au/industry/registers',
    version: '2024 instrument',
    nextVersion: '2026 instrument',
    jurisdiction: 'National',
    lastPoll: '04:12',
    bump: true, // ← the scene: $300 → $500 effective 1 Jul 2026
    note: 'PDF w/ version in filename, no machine-readable date',
  },
  {
    id: 'esc-ercop',
    name: 'ESC — Energy Retail Code of Practice',
    short: 'ESC ERCoP',
    url: 'esc.vic.gov.au',
    version: 'v3',
    nextVersion: 'v4 (not yet commenced)',
    jurisdiction: 'VIC',
    lastPoll: '04:11',
    note: 'publishes future-dated versions alongside current',
  },
  {
    id: 'aer-hardship',
    name: 'AER — Customer Hardship Policy Guideline',
    short: 'AER Hardship',
    url: 'aer.gov.au',
    version: 'v2.1',
    jurisdiction: 'National',
    lastPoll: '04:10',
    note: 'merges into single AER guideline Sep 2026 — clause refs will break',
  },
  {
    id: 'nsw-ipart',
    name: 'energy.nsw.gov.au — Social programs register',
    short: 'NSW',
    version: '2026-07',
    jurisdiction: 'NSW',
    lastPoll: '04:09',
  },
  {
    id: 'qld-conc',
    name: 'qld.gov.au — Concessions & rebates',
    short: 'QLD',
    version: '2026-06',
    jurisdiction: 'QLD',
    lastPoll: '04:09',
  },
];

// ── obligation register ──────────────────────────────────────────────
// Structured rows, not chunks. LLM drafts, a named person approves, the
// row is immutable once approved. This is the asset.
export const OBLIGATIONS = [
  {
    id: 'OBL-014',
    instrument: 'AER (Retail Law) instrument',
    clause: 's 111 · min. disconnection amount',
    jurisdiction: 'National',
    version: '2024 instrument',
    effectiveFrom: '2024-07-01',
    party: 'Retailer',
    trigger: 'arrears below threshold',
    action: 'must not disconnect',
    value: '$300',
    newValue: '$500',
    penalty: 'Tier 1 civil penalty',
    verifiedBy: 'M. Okafor',
    verifiedAt: '2025-10-14',
    drift: true, // ← flips in the scene
  },
  {
    id: 'OBL-007',
    instrument: 'NERR v51',
    clause: 'r 111(2) · disconnection warning notice',
    jurisdiction: 'National',
    version: 'v51',
    effectiveFrom: '2025-02-20',
    party: 'Retailer',
    trigger: 'intent to de-energise',
    action: '5 business days written warning',
    value: '5 bus. days',
    penalty: 'Tier 2 civil penalty',
    verifiedBy: 'M. Okafor',
    verifiedAt: '2025-10-14',
  },
  {
    id: 'OBL-021',
    instrument: 'ESC ERCoP v3',
    clause: 'cl 129 · payment difficulty entitlements',
    jurisdiction: 'VIC',
    version: 'v3',
    effectiveFrom: '2023-01-01',
    party: 'Retailer',
    trigger: 'arrears > $55 or self-identified',
    action: 'offer tailored assistance',
    value: '$55',
    penalty: 'ESC penalty notice',
    verifiedBy: 'J. Tran',
    verifiedAt: '2025-11-02',
  },
  {
    id: 'OBL-009',
    instrument: 'AER Hardship Guideline v2.1',
    clause: 'cl 4.3 · hardship program entry',
    jurisdiction: 'National',
    version: 'v2.1',
    effectiveFrom: '2019-04-01',
    party: 'Retailer',
    trigger: 'customer indicates hardship',
    action: 'no disconnection while compliant',
    value: 'program hold',
    penalty: 'Tier 1 civil penalty',
    verifiedBy: 'J. Tran',
    verifiedAt: '2025-11-02',
  },
  {
    id: 'OBL-032',
    instrument: 'NERR v51',
    clause: 'r 116 · life support de-energisation ban',
    jurisdiction: 'National',
    version: 'v51',
    effectiveFrom: '2025-02-20',
    party: 'Retailer + DNSP',
    trigger: 'registered life support premises',
    action: 'must not de-energise',
    value: 'absolute',
    penalty: 'Tier 1 civil penalty',
    verifiedBy: 'M. Okafor',
    verifiedAt: '2025-10-14',
  },
];

export const OBLIGATIONS_OVERFLOW = '+ 17 more rows · NSW, VIC, QLD credit & collections corpus (22 instruments)';

// ── downstream artifacts mapped to OBL-014 ───────────────────────────
export const ARTIFACTS = [
  {
    id: 'WI-4.2',
    name: 'Credit & Collections Work Instruction v11 · §4.2',
    kind: 'work instruction',
    detail: 'cites $300 minimum — stale',
    severity: 'critical',
  },
  {
    id: 'EL-018',
    name: 'Disconnection warning letter template EL-018',
    kind: 'letter template',
    detail: 'threshold in body copy — stale',
    severity: 'critical',
  },
  {
    id: 'TRN-M6',
    name: 'Agent training deck · module 6',
    kind: 'training',
    detail: 'slide 14 quotes old amount',
    severity: 'high',
  },
  {
    id: 'R-22',
    name: 'Breach register rule R-22',
    kind: 'control',
    detail: 'auto-flag threshold outdated',
    severity: 'high',
  },
];

// policy graph nodes reading OBL-014
export const GRAPH_NODES = [
  { id: 'eligibility.disconnect_floor', label: 'disconnect_floor', reads: 'OBL-014' },
  { id: 'eligibility.warn_notice', label: 'warn_notice', reads: 'OBL-007' },
  { id: 'eligibility.vic_assist', label: 'vic_assist', reads: 'OBL-021' },
  { id: 'eligibility.hardship_hold', label: 'hardship_hold', reads: 'OBL-009' },
  { id: 'eligibility.life_support', label: 'life_support', reads: 'OBL-032' },
];

// decisions made under the old version — stay valid, versioned not overwritten
export const DECISIONS = [
  { id: 'D-88121', customer: 'ACC-40233', date: '2026-06-14', outcome: 'disconnection blocked', basis: 'OBL-014 @ 2024 instrument ($300)' },
  { id: 'D-88474', customer: 'ACC-51902', date: '2026-06-29', outcome: 'proceed to warning notice', basis: 'OBL-014 @ 2024 instrument ($300)' },
  { id: 'D-89006', customer: 'ACC-51902', date: '2026-07-08', outcome: 'disconnection blocked', basis: 'OBL-014 @ 2026 instrument ($500)', post: true },
];

// ── ambient ticker events ────────────────────────────────────────────
export const TICKER_POOL = [
  { t: 'poll', text: 'GET esc.vic.gov.au/retail-code · 200 · no change' },
  { t: 'poll', text: 'GET energy-rules.aemc.gov.au · 200 · clause hash stable' },
  { t: 'verify', text: 'OBL-019 approved · J. Tran · row frozen' },
  { t: 'poll', text: 'GET aer.gov.au/registers · 200 · etag match' },
  { t: 'map', text: 'WI-7.1 mapped → OBL-027 · asserted by M. Okafor' },
  { t: 'poll', text: 'GET energy.nsw.gov.au · 200 · no change' },
  { t: 'extract', text: 'draft row OBL-041 extracted · awaiting human verify' },
  { t: 'poll', text: 'GET qld.gov.au/concessions · 200 · no change' },
];

export const DRIFT_TICKER = [
  { t: 'drift', text: 'AER (Retail Law) instrument · version bump detected' },
  { t: 'drift', text: 'OBL-014 diff: $300 → $500 · effective 2026-07-01' },
  { t: 'drift', text: '4 downstream artifacts flagged · 1 graph node pending review' },
];
