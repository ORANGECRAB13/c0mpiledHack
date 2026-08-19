import { upsertCustomer } from './repository.js';
import { ledgerPool } from './db.js';
import { listSalesforceCustomers } from './salesforce-read.js';
import { listPolicies } from '../policies/index.js';
import { evaluateCustomer } from './service.js';

// Loads the real customer book out of Salesforce and into the decision ledger.
// This is the replacement for seed.js's twelve invented names: every customer
// the workspace shows is an Account that actually exists in the org, carrying
// the CRM's own field values and provenance.

async function ensurePolicyVersions() {
  for (const policy of listPolicies()) {
    await ledgerPool().query(
      `INSERT INTO policy_version (id,version,effective_from,effective_to,jurisdiction,owner,read_fields,evidence_requirements,citations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id,version) DO NOTHING`,
      [policy.id, policy.version, policy.effectiveFrom, policy.effectiveTo, policy.jurisdiction, policy.owner,
        JSON.stringify(policy.readFields), JSON.stringify(policy.evidenceRequirements), JSON.stringify(policy.citations)],
    );
  }
}

/**
 * @param {object}  options
 * @param {number?} options.limit    cap the book (useful for a fast smoke run)
 * @param {boolean} options.evaluate run the policy over each customer after loading
 */
export async function syncFromSalesforce({ limit = null, evaluate = true } = {}) {
  await ensurePolicyVersions();
  const book = await listSalesforceCustomers({ limit });

  const loaded = [];
  for (const { normalized } of book) {
    // The CRM's external id is the customer's identity everywhere: it is what
    // joins Salesforce to Stripe, so the ledger uses it as the primary key too.
    const customerId = String(normalized.customerId);
    await upsertCustomer({
      id: customerId,
      externalCustomerId: customerId,
      name: normalized.name,
      jurisdiction: normalized.jurisdiction,
      state: normalized.state,
      sources: normalized.sources,
    });
    loaded.push(customerId);
  }

  let evaluated = 0;
  const failures = [];
  if (evaluate) {
    for (const customerId of loaded) {
      try {
        await evaluateCustomer(customerId, { triggeredBy: { kind: 'SALESFORCE_SYNC', ref: customerId } });
        evaluated += 1;
      } catch (error) {
        failures.push({ customerId, error: error.message });
      }
    }
  }

  return { loaded: loaded.length, evaluated, failures };
}
