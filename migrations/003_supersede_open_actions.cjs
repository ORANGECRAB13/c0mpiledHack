/* eslint-disable camelcase */

// An action is a request to change something in the world. When the decision
// that justified it is superseded, that request is stale: approving it would
// execute a plan switch on evidence the system has already replaced.
//
// Actions are current state, not history — their status has always moved
// (AWAITING_APPROVAL -> PENDING/DONE/REJECTED), and the immutable record lives
// in `decision` and `approval`. Retiring a stale request is therefore a status
// transition, not a rewrite of history (invariant I5 holds).

exports.up = async (pgm) => {
  pgm.sql("ALTER TYPE action_status ADD VALUE IF NOT EXISTS 'SUPERSEDED'");
};

exports.down = async () => {
  // Postgres cannot drop a value from an enum in place, and rewriting the type
  // would mean rewriting rows that legitimately carry it. Left in place.
};
