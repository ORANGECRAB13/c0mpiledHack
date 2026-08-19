import 'dotenv/config';
import { seedDecisionLayer, syntheticSeedAllowed } from './seed.js';
import { closeLedger } from './db.js';

try {
  if (!syntheticSeedAllowed()) {
    console.error('Synthetic seeding is disabled. Re-run with ALLOW_SYNTHETIC_SEED=1 if you really want fabricated customers in this ledger.');
    process.exitCode = 1;
  } else {
    const rows = await seedDecisionLayer();
    console.log(`Seeded ${rows.length} SYNTHETIC customers (ids prefixed SYNTH-, names prefixed [SYNTHETIC]).`);
  }
} finally {
  await closeLedger();
}
