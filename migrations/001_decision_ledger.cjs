/* eslint-disable camelcase */
exports.up = (pgm) => {
  pgm.createType('evaluation_outcome', ['ACTION_REQUIRED', 'NO_CHANGE', 'PREVIOUS_DECISION_SUPERSEDED', 'SUPERSEDED_BY_POLICY_CHANGE', 'INSUFFICIENT_EVIDENCE', 'ESCALATION_REQUIRED']);
  pgm.createType('action_mode', ['AUTOMATIC', 'APPROVAL_REQUIRED', 'MANUAL']);
  pgm.createType('action_status', ['PENDING', 'AWAITING_APPROVAL', 'EXECUTING', 'DONE', 'FAILED']);
  pgm.createType('approval_verdict', ['AGREED', 'OVERRIDDEN', 'REJECTED']);
  pgm.createType('schedule_status', ['PENDING', 'FIRED', 'CANCELLED']);

  pgm.createTable('customer', {
    id: { type: 'text', primaryKey: true },
    external_customer_id: { type: 'text', unique: true },
    name: { type: 'text', notNull: true },
    jurisdiction: { type: 'text', notNull: true },
    current_state: { type: 'jsonb', notNull: true, default: '{}' },
    current_sources: { type: 'jsonb', notNull: true, default: '[]' },
    pipeline_halted: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('event', {
    id: { type: 'uuid', primaryKey: true }, customer_id: { type: 'text', notNull: true, references: 'customer', onDelete: 'CASCADE' },
    type: { type: 'text', notNull: true }, origin: { type: 'text', notNull: true }, correlation_id: { type: 'uuid', notNull: true },
    causation_id: { type: 'text' }, payload: { type: 'jsonb', notNull: true }, received_at: { type: 'timestamptz', notNull: true }, occurred_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createTable('customer_state_snapshot', {
    id: { type: 'uuid', primaryKey: true }, customer_id: { type: 'text', notNull: true, references: 'customer' }, captured_at: { type: 'timestamptz', notNull: true },
    as_of: { type: 'timestamptz', notNull: true }, state: { type: 'jsonb', notNull: true }, sources: { type: 'jsonb', notNull: true }, snapshot_hash: { type: 'text', notNull: true },
  });
  pgm.createTable('policy_version', {
    id: { type: 'text', notNull: true }, version: { type: 'text', notNull: true }, effective_from: { type: 'timestamptz', notNull: true },
    effective_to: { type: 'timestamptz' }, jurisdiction: { type: 'text', notNull: true }, owner: { type: 'text', notNull: true },
    read_fields: { type: 'jsonb', notNull: true }, evidence_requirements: { type: 'jsonb', notNull: true }, citations: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('policy_version', 'policy_version_pk', { primaryKey: ['id', 'version'] });
  pgm.createTable('evaluation', {
    id: { type: 'uuid', primaryKey: true }, customer_id: { type: 'text', notNull: true, references: 'customer' }, decision_key: { type: 'text', notNull: true },
    policy_id: { type: 'text', notNull: true }, policy_version: { type: 'text', notNull: true }, snapshot_id: { type: 'uuid', references: 'customer_state_snapshot' },
    snapshot_hash: { type: 'text' }, input_hash: { type: 'text', notNull: true }, outcome: { type: 'evaluation_outcome', notNull: true }, reasons: { type: 'jsonb' },
    evaluated_at: { type: 'timestamptz', notNull: true }, triggered_by: { type: 'jsonb', notNull: true },
  });
  pgm.createTable('no_change_interval', {
    id: { type: 'uuid', primaryKey: true }, customer_id: { type: 'text', notNull: true, references: 'customer' }, decision_key: { type: 'text', notNull: true },
    policy_id: { type: 'text', notNull: true }, policy_version: { type: 'text', notNull: true }, input_hash: { type: 'text', notNull: true },
    first_at: { type: 'timestamptz', notNull: true }, last_at: { type: 'timestamptz', notNull: true }, count: { type: 'integer', notNull: true, default: 1 },
  });
  pgm.addConstraint('no_change_interval', 'no_change_rollup_key', { unique: ['customer_id', 'decision_key', 'policy_id', 'policy_version', 'input_hash'] });
  pgm.createTable('decision', {
    id: { type: 'uuid', primaryKey: true }, decision_key: { type: 'text', notNull: true }, customer_id: { type: 'text', notNull: true, references: 'customer' },
    policy_id: { type: 'text', notNull: true }, policy_version: { type: 'text', notNull: true }, snapshot_id: { type: 'uuid', notNull: true, references: 'customer_state_snapshot' },
    snapshot_hash: { type: 'text', notNull: true }, outcome: { type: 'evaluation_outcome', notNull: true }, evidence: { type: 'jsonb', notNull: true },
    supersedes_decision_id: { type: 'uuid', references: 'decision' }, superseded_by_decision_id: { type: 'uuid', references: 'decision' }, created_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createTable('action', {
    id: { type: 'uuid', primaryKey: true }, decision_id: { type: 'uuid', notNull: true, references: 'decision' }, type: { type: 'text', notNull: true },
    execution_mode: { type: 'action_mode', notNull: true }, status: { type: 'action_status', notNull: true }, result: { type: 'jsonb' }, created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('approval', {
    id: { type: 'uuid', primaryKey: true }, action_id: { type: 'uuid', notNull: true, references: 'action' }, actor_id: { type: 'text', notNull: true },
    decided_at: { type: 'timestamptz', notNull: true }, verdict: { type: 'approval_verdict', notNull: true }, override_reason: { type: 'text' },
  });
  pgm.addConstraint('approval', 'override_reason_required', { check: "verdict = 'AGREED' OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)" });
  pgm.createTable('scheduled_evaluation', {
    id: { type: 'uuid', primaryKey: true }, customer_id: { type: 'text', notNull: true, references: 'customer' }, evaluate_at: { type: 'timestamptz', notNull: true },
    reason: { type: 'text', notNull: true }, policy_id: { type: 'text' }, status: { type: 'schedule_status', notNull: true, default: 'PENDING' }, created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('integration_job', {
    id: { type: 'uuid', primaryKey: true }, provider: { type: 'text', notNull: true }, operation: { type: 'text', notNull: true }, payload: { type: 'jsonb', notNull: true },
    status: { type: 'text', notNull: true, default: 'PENDING' }, attempts: { type: 'integer', notNull: true, default: 0 }, result: { type: 'jsonb' }, created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }, updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('policy_impact_run', {
    id: { type: 'uuid', primaryKey: true }, policy_id: { type: 'text', notNull: true }, old_version: { type: 'text', notNull: true }, new_version: { type: 'text', notNull: true },
    run_at: { type: 'timestamptz', notNull: true }, customer_id: { type: 'text', notNull: true, references: 'customer' }, decision_key: { type: 'text', notNull: true },
    policy_delta: { type: 'jsonb', notNull: true }, operational_delta: { type: 'jsonb', notNull: true },
  });
  pgm.createIndex('event', ['customer_id', 'occurred_at']);
  pgm.createIndex('evaluation', ['decision_key', 'policy_version', 'evaluated_at']);
  pgm.createIndex('decision', ['decision_key', 'created_at']);
  pgm.createIndex('scheduled_evaluation', ['status', 'evaluate_at']);
};

exports.down = (pgm) => {
  ['policy_impact_run', 'integration_job', 'scheduled_evaluation', 'approval', 'action', 'decision', 'no_change_interval', 'evaluation', 'policy_version', 'customer_state_snapshot', 'event', 'customer'].forEach((table) => pgm.dropTable(table, { cascade: true }));
  ['schedule_status', 'approval_verdict', 'action_status', 'action_mode', 'evaluation_outcome'].forEach((type) => pgm.dropType(type));
};
