// OFFLINE FALLBACK ONLY. The workspace's real customer book comes from the
// Salesforce org via syncFromSalesforce() (src/decision-layer/sync.js) — twelve
// invented names below are here so the decision layer can be exercised with no
// org connection, and must not be loaded into a demo that has one. Prefer:
//   npm run sync:salesforce   (or POST /api/decision-layer/salesforce/sync)
import { upsertCustomer } from './repository.js';
import { ledgerPool } from './db.js';
import { listPolicies } from '../policies/index.js';

const CUSTOMERS = [
  ['C-10482','AU-48291','Amelia Hart','VIC',312,45,'PAYMENT_DIFFICULTY','Standard Flexi',false,true],
  ['C-10496','AU-48296','Daniel Okonkwo','VIC',0,0,'NONE','Home Saver',false,false],
  ['C-10471','AU-48271','Priya Raman','NSW',684.2,62,'PAYMENT_DIFFICULTY','Everyday Energy',false,false],
  ['C-10455','AU-48255','Marcus Webb','NSW',1146.8,15,'NONE','Residential Flex',false,false],
  ['C-10502','AU-48302','Unknown occupant — 14 Merri Pde','VIC',428.1,42,'NONE','Deemed Supply',false,false],
  ['C-10444','AU-48244','Sofia Nguyen','VIC',0,0,'TAILORED_ASSISTANCE','Assisted Essentials',false,false],
  ['C-10510','AU-48310','Northbrook Cafe Pty Ltd','QLD',238.7,0,'NONE','SME Flex',false,false],
  ['C-10437','AU-48237','Grace Muller','VIC',1248.1,126,'NONE','Standard Flexi',false,false],
  ['C-10489','AU-48289','Tom Castellano','SA',2408.55,20,'NONE','Home Time-of-Use',false,false],
  ['C-10521','AU-48321','Leila Haddad','NSW',527.3,38,'PAYMENT_DIFFICULTY','Basic Home',false,false],
  ['C-10466','AU-48266','Ravi Patel','QLD',119.8,0,'NONE','Residential Saver',false,false],
  ['C-10515','AU-48315','Jia Chen','VIC',73.2,0,'NONE','Evening Plus',false,false]
];

export const SYNTHETIC_MARKER = 'SYNTHETIC_SEED';
export const syntheticSeedAllowed = () => process.env.ALLOW_SYNTHETIC_SEED === '1';

export async function seedDecisionLayer(at = '2026-10-02T00:00:00.000Z') {
  // Hard opt-in. Synthetic rows and Salesforce-synced rows share one ledger, and
  // a decision taken on an invented customer is indistinguishable from a real
  // one once it is in the audit trail. Requires ALLOW_SYNTHETIC_SEED=1.
  if (!syntheticSeedAllowed()) {
    throw new Error('Refusing to seed synthetic customers: set ALLOW_SYNTHETIC_SEED=1 to allow fabricated data into this ledger.');
  }
  for (const policy of listPolicies()) {
    await ledgerPool().query(`INSERT INTO policy_version (id,version,effective_from,effective_to,jurisdiction,owner,read_fields,evidence_requirements,citations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id,version) DO NOTHING`, [policy.id, policy.version, policy.effectiveFrom, policy.effectiveTo, policy.jurisdiction, policy.owner, JSON.stringify(policy.readFields), JSON.stringify(policy.evidenceRequirements), JSON.stringify(policy.citations)]);
  }
  const rows = [];
  for (const [id, externalCustomerId, name, jurisdiction, balance, oldestDebtDays, hardshipStatus, currentPlan, bestOfferOptOut, sensitiveCustomer] of CUSTOMERS) {
    const state = { balance, oldestDebtDays, hardshipStatus, hardshipReviewDueAt: hardshipStatus !== 'NONE' ? '2027-01-02T00:00:00.000Z' : null, financialStressSignals: balance > 300 ? ['ARREARS_GROWTH'] : [], missedPayments90d: oldestDebtDays ? Math.ceil(oldestDebtDays / 30) : 0, partialPayments90d: id === 'C-10482' ? 2 : 0, currentPlan, bestOfferOptOut, sensitiveCustomer };
    state.synthetic = true;
    state.dataOrigin = SYNTHETIC_MARKER;
    const sources = Object.entries(state).map(([field, value]) => ({ field, value, source: SYNTHETIC_MARKER, lastUpdated: at, confidence: 0, extractionMethod: SYNTHETIC_MARKER }));
    rows.push(await upsertCustomer({
      id: `SYNTH-${id}`,
      externalCustomerId: `SYNTH-${externalCustomerId}`,
      name: `[SYNTHETIC] ${name}`,
      jurisdiction, state, sources,
    }));
  }
  return rows;
}
