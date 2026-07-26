import 'dotenv/config';
import { config } from 'dotenv';

// Same precedence as the server: .env for shared config, .env.local overriding.
config({ path: '.env.local', override: true });

/**
 * Hardship flagging check.
 *
 * Two things are being demonstrated, and the second matters more than the first:
 *
 *   1. Internal ledger scoring ranks the book correctly and cites a record for
 *      every signal it counts.
 *   2. Crustdata can only ever *corroborate*. It cannot flag a household on its
 *      own, it cannot move a case more than one tier, and when identity cannot
 *      be resolved the assessment falls back to internal-only rather than
 *      guessing at a stranger's profile.
 *
 * Run: node scripts/check-hardship.js
 */

const { assessAll, assessHardship, applyExternal, tierFor, EXTERNAL_CAP, hardshipEngineStatus } =
  await import('../src/hardship/index.js');
const { resolveIdentity } = await import('../src/hardship/identity.js');

const step = (n) => console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 62 - n.length))}`);
const pass = (label, condition) => {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) process.exitCode = 1;
};

// ═══ 1. provider reachability ═══════════════════════════════════════
step('Crustdata provider');
const status = await hardshipEngineStatus();
console.log(
  `  configured: ${status.configured}   enrichment enabled: ${status.enrichmentEnabled}   reachable: ${status.reachable}`
);
if (status.endpoints) console.log(`  endpoints available: ${status.endpoints.length}`);

// ═══ 2. internal ledger scoring ═════════════════════════════════════
step('Internal ledger scoring (no network)');
const worklist = await assessAll();
for (const a of worklist) {
  console.log(`  ${a.customerName.padEnd(16)} ${a.tier.padEnd(9)} ${String(a.score).padStart(3)}  ${a.recommendedAction}`);
  for (const s of a.internal.signals) console.log(`      +${String(s.weight).padStart(2)}  ${s.label}  [${s.sourceId}]`);
  for (const c of a.internal.context) console.log(`       ·   ${c.label}  [${c.sourceId}]`);
}

pass('worklist is ranked by score', worklist.every((a, i) => i === 0 || worklist[i - 1].score >= a.score));
pass(
  'every counted signal cites a source record',
  worklist.every((a) => a.internal.signals.every((s) => Boolean(s.sourceId)))
);
pass(
  'a disconnection notice always reaches at least the elevated tier',
  worklist.filter((a) => a.internal.signals.some((s) => s.id === 'disconnection_notice')).every((a) => a.score >= 45)
);

// ═══ 3. the external cap ════════════════════════════════════════════
step('External evidence is bounded');

const none = tierFor(0);
pass(
  'maximum external evidence cannot flag a household the ledger says is fine',
  applyExternal(none, EXTERNAL_CAP).tier.tier === 'none'
);

const watch = tierFor(25);
const escalated = applyExternal(watch, EXTERNAL_CAP);
pass('substantial external evidence escalates a flagged household by one tier', escalated.tier.tier === 'elevated');
pass('…and by no more than one tier', escalated.tier.tier !== 'priority');

pass(
  'weak external evidence changes nothing',
  applyExternal(watch, EXTERNAL_CAP / 2 - 1).tier.tier === 'watch'
);

// ═══ 4. identity resolution refuses to guess ════════════════════════
step('Identity resolution');
if (!status.configured) {
  console.log('  skipped — no Crustdata key configured');
} else {
  // Synthetic customers have no public footprint, which is exactly the case that
  // must degrade quietly rather than latch onto the nearest similar name.
  const unknown = await resolveIdentity({ name: 'Von Viray', state: 'IL', city: 'Chicago' });
  console.log(`  unmatched customer → resolved: ${unknown.resolved} — ${unknown.reasons[0]}`);
  pass('a customer with no public footprint is not matched', unknown.resolved === false);

  // A common name with several plausible candidates must also be refused.
  const ambiguous = await resolveIdentity({ name: 'David Hsu', state: 'CA', city: 'San Francisco' });
  console.log(
    `  ambiguous name → resolved: ${ambiguous.resolved}, ${ambiguous.candidatesConsidered} candidates — ${ambiguous.reasons[0]}`
  );
  pass('an ambiguous match is refused rather than guessed', ambiguous.resolved === false);
}

// ═══ 5. full assessment degrades to internal-only ═══════════════════
step('Full assessment with enrichment attempted');
const full = await assessHardship({ customerId: 'CUS-77241', external: true, requestedBy: 'check-script' });
console.log(`  ${full.customerName}: ${full.tier} (${full.score})`);
for (const line of full.rationale) console.log(`    ${line}`);
pass('tier is unchanged when no external evidence could be attached', full.tier === full.internal.tier);
pass('assessment succeeds regardless of enrichment outcome', typeof full.score === 'number');

console.log(`\n${process.exitCode ? 'FAILURES ABOVE' : 'All checks passed.'}\n`);
