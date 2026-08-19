import { ledgerPool } from './db.js';
import { id } from './repository.js';

export class SalesforceProjectionProvider {
  async writeBatch(_records) { throw new Error('SalesforceProjectionProvider.writeBatch must be implemented'); }
}

export class MockSalesforceProjectionProvider extends SalesforceProjectionProvider {
  async writeBatch(records) { return records.map((record) => ({ externalId: record.externalId, success: true })); }
}

export function salesforceProjectionProvider() {
  const kind = (process.env.SALESFORCE_PROVIDER || '').toLowerCase();
  if (kind === 'mock') return new MockSalesforceProjectionProvider();
  throw new Error('Live Salesforce projection is not configured. Set SALESFORCE_PROVIDER=mock only for an explicit synthetic run, or configure the live adapter.');
}

export async function queueSalesforceProjection(records) {
  const values = [];
  for (const record of records) {
    const row = (await ledgerPool().query(`INSERT INTO integration_job (id,provider,operation,payload,status)
      VALUES ($1,'SALESFORCE','PROJECT_ACCOUNT',$2,'PENDING') RETURNING *`, [id(), JSON.stringify(record)])).rows[0];
    values.push(row);
  }
  return values;
}

export async function runSalesforceProjectionWorker({ batchSize = 200 } = {}) {
  const provider = salesforceProjectionProvider();
  const jobs = (await ledgerPool().query(`SELECT * FROM integration_job WHERE provider='SALESFORCE' AND status='PENDING' ORDER BY created_at LIMIT $1`, [batchSize])).rows;
  if (!jobs.length) return { attempted: 0, completed: 0 };
  await ledgerPool().query("UPDATE integration_job SET status='EXECUTING',attempts=attempts+1,updated_at=now() WHERE id = ANY($1::uuid[])", [jobs.map((job) => job.id)]);
  try {
    const results = await provider.writeBatch(jobs.map((job) => job.payload));
    for (let index = 0; index < jobs.length; index += 1) await ledgerPool().query("UPDATE integration_job SET status='DONE',result=$2,updated_at=now() WHERE id=$1", [jobs[index].id, JSON.stringify(results[index] || { success: true })]);
    return { attempted: jobs.length, completed: jobs.length };
  } catch (error) {
    await ledgerPool().query("UPDATE integration_job SET status='FAILED',result=$2,updated_at=now() WHERE id = ANY($1::uuid[])", [jobs.map((job) => job.id), JSON.stringify({ error: error.message })]);
    throw error;
  }
}
