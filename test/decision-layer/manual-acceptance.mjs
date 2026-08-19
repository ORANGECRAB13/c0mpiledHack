import { ingestEvent, evaluateCustomer } from '../../src/decision-layer/service.js';
import { runPolicyImpact } from '../../src/decision-layer/impact.js';
import { queueSalesforceProjection, runSalesforceProjectionWorker } from '../../src/decision-layer/salesforce.js';
import { ledgerPool, closeLedger } from '../../src/decision-layer/db.js';

const same = await ingestEvent({ customerId: 'C-10482', type: 'SALESFORCE_ACCOUNT_UPDATED', origin: 'SALESFORCE', correlationId: '11111111-1111-4111-8111-111111111111', payload: { changes: { balance: 312 } }, occurredAt: '2026-10-02T01:00:00Z', receivedAt: '2026-10-02T01:00:00Z' });
await evaluateCustomer('C-10437', { evaluatedAt: '2026-09-20T00:00:00Z' });
const report = await runPolicyImpact({ policyId: 'vic.hardship.best-offer', oldVersion: '1.2.0', newVersion: '1.3.0', runAt: '2026-10-02T02:00:00Z' });
const records = Array.from({ length: 2000 }, (_, index) => ({ externalId: `SYN-${index}`, Hardship_Status__c: 'PAYMENT_DIFFICULTY' }));
await queueSalesforceProjection(records);
const projected = await runSalesforceProjectionWorker({ batchSize: 2000 });
const jobs = (await ledgerPool().query('SELECT status,count(*) FROM integration_job GROUP BY status')).rows;
console.log(JSON.stringify({ loopPrevention: same, impact: { total: report.total, policyChanged: report.policyChanged, operationalChanged: report.operationalChanged }, projected, jobs }, null, 2));
await closeLedger();
