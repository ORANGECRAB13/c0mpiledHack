import 'dotenv/config';
import { config } from 'dotenv';
import { syncFromSalesforce } from './sync.js';
import { closeLedger } from './db.js';

config({ path: '.env.local', override: true });

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : null;

try {
  const result = await syncFromSalesforce({ limit, evaluate: !args.includes('--no-evaluate') });
  console.log(`Loaded ${result.loaded} Salesforce accounts into the decision ledger; evaluated ${result.evaluated}.`);
  for (const failure of result.failures) console.error(` - ${failure.customerId}: ${failure.error}`);
  if (result.failures.length) process.exitCode = 1;
} finally {
  await closeLedger();
}
