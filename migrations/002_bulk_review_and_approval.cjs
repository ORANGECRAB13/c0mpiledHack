/* eslint-disable camelcase */

/**
 * Bulk review + bulk approval support.
 *
 * 1. `action_status` gains a real REJECTED terminal state. Before this,
 *    repository.recordApproval mapped every non-AGREED verdict to DONE, so a
 *    REJECTED regulatory decision was indistinguishable from a completed one.
 *    Bulk approval multiplies that error across the whole book, so the enum
 *    grows a value rather than the mapping getting quietly reused.
 *
 *    SEMANTIC CHANGE: from this migration on, verdict REJECTED sets the action
 *    to REJECTED, not DONE. OVERRIDDEN keeps its previous meaning (DONE — the
 *    officer closed the action without executing it). Existing DONE rows are
 *    left untouched: I5, history is never rewritten.
 *
 * 2. Indexes the bulk endpoints depend on: the awaiting-approval worklist is a
 *    status scan over `action`, and the review-all summary joins the latest
 *    decision/approval per customer.
 */
exports.up = (pgm) => {
  pgm.addTypeValue('action_status', 'REJECTED', { ifNotExists: true });

  pgm.createIndex('action', ['status', 'created_at'], { ifNotExists: true, name: 'action_status_created_at_idx' });
  pgm.createIndex('action', ['decision_id'], { ifNotExists: true, name: 'action_decision_id_idx' });
  pgm.createIndex('approval', ['action_id', 'decided_at'], { ifNotExists: true, name: 'approval_action_id_decided_at_idx' });
  pgm.createIndex('decision', ['customer_id', 'created_at'], { ifNotExists: true, name: 'decision_customer_id_created_at_idx' });
  pgm.createIndex('evaluation', ['customer_id', 'evaluated_at'], { ifNotExists: true, name: 'evaluation_customer_id_evaluated_at_idx' });
};

exports.down = (pgm) => {
  // Postgres cannot drop a single enum value; the added REJECTED state stays.
  ['action_status_created_at_idx', 'action_decision_id_idx', 'approval_action_id_decided_at_idx',
    'decision_customer_id_created_at_idx', 'evaluation_customer_id_evaluated_at_idx']
    .forEach((name) => pgm.dropIndex('', [], { name, ifExists: true }));
};
