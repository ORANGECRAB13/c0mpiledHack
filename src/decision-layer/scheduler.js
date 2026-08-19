import { ledgerPool } from './db.js';
import { scheduleEvaluation, dueSchedules, markScheduleFired } from './repository.js';
import { evaluateCustomer } from './service.js';

export async function scheduleTemporalCrossings(customerId, asOf = new Date().toISOString()) {
  const customer = (await ledgerPool().query('SELECT current_state FROM customer WHERE id=$1', [customerId])).rows[0];
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  const age = Number(customer.current_state.oldestDebtDays || 0);
  const items = [];
  if (age < 90 && Number(customer.current_state.balance || 0) >= 1000) {
    const evaluateAt = new Date(new Date(asOf).getTime() + (90 - age) * 86400_000).toISOString();
    items.push(await scheduleEvaluation({ customerId, evaluateAt, reason: 'debt reaches 3 months', policyId: 'vic.hardship.best-offer' }));
  }
  if (customer.current_state.hardshipReviewDueAt) items.push(await scheduleEvaluation({ customerId, evaluateAt: customer.current_state.hardshipReviewDueAt, reason: 'hardship review due', policyId: 'vic.hardship.best-offer' }));
  return items;
}

export async function runSchedulerTick(at = new Date().toISOString()) {
  const due = await dueSchedules(at);
  const fired = [];
  for (const item of due) {
    // The schedule chooses WHEN to look, never WHAT is true. A crossing is
    // expressed as the date the customer reaches 90 days (set at scheduling
    // time); at fire time we re-read whatever Salesforce actually says. If the
    // customer paid down or the CRM was corrected, the evaluation must see
    // that rather than an asserted `oldestDebtDays: 90`.
    const result = await evaluateCustomer(item.customer_id, { evaluatedAt: at, policyId: item.policy_id || undefined, triggeredBy: { kind: 'SCHEDULE', ref: item.id } });
    await markScheduleFired(item.id);
    fired.push({ scheduleId: item.id, result });
  }
  return fired;
}
