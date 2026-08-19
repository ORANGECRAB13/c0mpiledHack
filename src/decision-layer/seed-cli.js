import 'dotenv/config';
import { seedDecisionLayer } from './seed.js';
import { closeLedger } from './db.js';

try {
  const rows = await seedDecisionLayer();
  console.log(`Seeded ${rows.length} synthetic customers.`);
} finally {
  await closeLedger();
}
