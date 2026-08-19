# Build Prompt — Vocare Operational Decision Layer (v1)

You are implementing the first real backend for Vocare on the `voice-officer-mode` branch.
Read this whole document before writing code. It is the specification; where it conflicts
with anything in `OVERVIEW.md` or `HANDOFF.md`, this document wins (those describe a
superseded US voice demo).

---

## 0. The thesis you are building

> Vocare is a **temporal decision layer** over existing retailer systems. It maintains
> customer operational state, evaluates it against **versioned policy**, records defensible
> decisions, and automatically re-evaluates those decisions when **either the customer or
> the policy changes**.

First domain: **Victorian hardship + best offer.**
First integrations: **Salesforce (real) + billing / payments / pricing (adapter-backed mocks).**

Two symmetric loops. Both must work:

```
customer state changes ──┐
                         ├──> Evaluation ──> Decision ──> Action ──> Event ──┐
policy version changes ──┘                                                    │
        ▲                                                                     │
        └─────────────────────────────────────────────────────────────────────┘
```

The second loop — a regulation changes and Vocare determines which existing decisions are
affected — is the differentiated capability. It is not a phase-3 nice-to-have. It is in scope.

---

## 1. Ground truth about this repo

Verify each of these yourself before relying on it; they were true at the time of writing.

**Branch:** `voice-officer-mode`. It is a strict superset of `operational-decision-layer`.

**The AU frontend already exists** — `compliance-drift/` (Vite + React):
- `src/pages/` — `OpsQueue`, `CaseWorkspace`, `PolicyLibrary`, `AuditHistory`, `Monitoring`,
  `RequiresAttention`, `Customers`, `Systems`, `Routines`, `Frameworks`, `Analytics`, `Home`.
- **All of its domain data is static mock**: `src/data/ops.js`, `src/data/registry.js`,
  `src/data/platform.js`. The only live backend calls in the entire frontend are
  `/api/assistant/status`, `/api/assistant/ask`, `/api/assistant/transcribe`, and the
  `/api/voice/officer` websocket.

**`src/data/ops.js` is your schema specification, not just fixtures.** `AMELIA_CASE` already
models the exact object you must produce for real: `snapshot` (field/value/flag),
`events` (dated), `sources` (per-source provenance), `context`, and `rules` (each with
status + clause-level citation). Lift that shape. Do not invent a competing one. When the
backend is real, `ops.js` should be deleted and the pages should read the API.

**`src/data/registry.js` + `src/data/platform.js`** model the regulatory drift engine:
instrument watchers (AEMC NERR, AER, ESC), an obligation register, a version bump with an
effective date, and propagation to affected artifacts. That is loop two's UI, already designed.

**Salesforce metadata already exists** under `salesforce/force-app/` — custom Account fields:
`Hardship_Status__c`, `Hardship_Review_Due_At__c`, `Hardship_Entered_At__c`,
`Financial_Stress_Signal__c`, `Financial_Stress_Reason__c`, `Partial_Payments_90d__c`,
`Missed_Payments_90d__c`, `Oldest_Debt_Days__c`, `Best_Offer_Opt_Out__c`, `Current_Plan__c`,
`External_Customer_Id__c`; plus a `Vocare_Compliance` permission set and
`scripts/salesforce-seed.mjs` / `scripts/salesforce-setup.sh`.

> **These Salesforce fields are a PROJECTION of Vocare state, never the source of truth for
> Vocare's reasoning.** Flat Account fields carry no `source`, no `last_updated`, no
> `confidence`, and no history. They cannot answer "what did we know on 1 August". Vocare
> owns the temporal record; Salesforce shows the latest value to humans who live in Salesforce.

**Persistence today:** `neo4j-driver` is the only datastore dependency, and
`src/graph/schema.js` is the *US* arrearage graph (PucRule, BenefitProgram, Moratorium).
It is the wrong shape for the decision ledger. See §3.

---

## 2. Non-negotiable invariants

These exist because getting them wrong is expensive to reverse. Do not "simplify" them away.
If you believe one is wrong, say so in your final report — do not silently deviate.

**I1 — Evaluation is a pure function of `(snapshot, policyVersion)`.**
No clock reads, no network calls, no database reads inside a policy's `evaluate()`. Everything
it needs is in the snapshot. This is what makes replay, attribution, and testing possible.
Any policy needing "today's date" receives it as a snapshot field (`asOf`).

**I2 — Snapshots are created BY evaluation, not by ingestion.**
Ingestion mutates current state and appends to the event log. When an evaluation is triggered,
*it* captures and persists the immutable snapshot it read. Consequence: snapshot count ==
evaluation count, and every stored snapshot is one a decision actually depended on. Do not
write a full-state row for every CDC event.

**I3 — Two hashes, not one.**
- `snapshotHash` — over the full snapshot. Integrity: proves what was evaluated.
- `inputHash` — over *only* the fields the policy declares it reads (`readFields`).
  Skip-logic: if `inputHash` is unchanged since the last evaluation of this
  `(decisionKey, policyVersion)`, record a cheap `NO_CHANGE` and stop.

`readFields` is declared on the policy and doubles as the affected-population index for loop two.

**I4 — Every evaluation produces a persisted result**, one of:
`ACTION_REQUIRED` · `NO_CHANGE` · `PREVIOUS_DECISION_SUPERSEDED` ·
`SUPERSEDED_BY_POLICY_CHANGE` · `INSUFFICIENT_EVIDENCE` · `ESCALATION_REQUIRED`.

`NO_CHANGE` never enters the operations queue. It is stored **thin** — `decisionKey`,
`policyVersion`, `inputHash`, `evaluatedAt`, no payload — and **consecutive identical
`NO_CHANGE` runs collapse into one interval row** (`firstAt`, `lastAt`, `count`). Without the
rollup this table becomes the largest thing in the system inside a year.

**I5 — History is never mutated.**
A decision made correctly under policy v1.2 does not become wrong when v1.3 takes effect. It was
right then. New versions produce *new* evaluations dated now. Nothing is updated in place, ever.
`SUPERSEDED_BY_POLICY_CHANGE` ("the law changed") is a distinct outcome from
`PREVIOUS_DECISION_SUPERSEDED` ("the customer changed") — a regulator asks different questions
about each.

**I6 — Policy selection is by evaluation date, not snapshot date.**
The version in force at `evaluatedAt` applies, unless the caller explicitly pins a version
(replay, backfill, attribution runs). Write this rule down in code as a single resolver
function; do not let two call sites implement it two ways.

**I7 — Loop prevention converges on STATE, not on event origin.**
Origin tagging (`origin: SALESFORCE | BILLING | PAYMENTS | PRICING | VOCARE | USER`) plus
`correlationId` / `causationId` is the cheap fast path. The robust rule underneath it:
**drop any inbound event whose normalized result equals current known state**, regardless of
origin. This catches the case where Vocare's write triggers a Salesforce flow that touches a
related record and arrives back legitimately tagged `origin=SALESFORCE`.
Also implement a **circuit breaker**: cap evaluations per customer per hour, log loudly and
halt that customer's pipeline when tripped. You will trip it in development. That is the point.

**I8 — Regulatory impact is measured with TWO runs.**
Re-running affected decisions against the *latest* snapshot conflates "the policy changed" with
"the customer changed since we last looked". To attribute impact to a regulation you need:

```
policy delta   =  (old snapshot × new policy)  vs  (old snapshot × old policy)
operational    =  (new snapshot × new policy)
```

Report both as separate columns. The gap between them is itself a product insight
("of 601 invalidated, 418 are the code change, 183 would have flipped anyway"). A single-run
diff produces a number that is wrong in an unfalsifiable way — do not ship one.

---

## 3. Persistence

Two stores. Do not try to do the ledger in Neo4j.

**Postgres — the decision ledger.** Append-only, high row count, hash-equality lookups:
`Customer`, `Event`, `CustomerStateSnapshot`, `Evaluation`, `Decision`, `Action`, `Approval`,
`ScheduledEvaluation`. Use a real migration tool. Run it in Docker locally; commit a
`docker-compose.yml`.

**Neo4j — the policy / obligation graph.** Instruments, clauses, obligations, policy versions,
internal artifacts, and drift propagation edges. This is where `registry.js` and `platform.js`
become real. The existing US schema in `src/graph/schema.js` is not reusable — add AU labels
alongside it or namespace a new schema module; do not delete the US graph.

**Join key between the two stores: `policyId@version`** (e.g. `vic.hardship.best-offer@1.2.0`).
That string is the only coupling. Keep it that way.

---

## 4. Object model

Implement these shapes. Names are load-bearing — the frontend and later phases assume them.

```ts
Event {
  id
  customerId
  type            // SALESFORCE_ACCOUNT_UPDATED | PAYMENT_RECEIVED | PAYMENT_MISSED
                  // | BILL_ISSUED | HARDSHIP_STATUS_CHANGED | OPT_OUT_CHANGED
                  // | PLAN_CHANGED | PRICING_UPDATED | POLICY_VERSION_EFFECTIVE
  origin          // SALESFORCE | BILLING | PAYMENTS | PRICING | VOCARE | USER
  correlationId
  causationId     // the Decision or Event that caused this one
  payload
  receivedAt
  occurredAt
}

CustomerStateSnapshot {
  id
  customerId
  capturedAt
  asOf                      // the evaluation clock, injected — see I1
  state {
    balance
    oldestDebtDays
    hardshipStatus
    hardshipReviewDueAt
    financialStressSignals[]
    missedPayments90d
    partialPayments90d
    currentPlan
    bestOfferOptOut
  }
  sources: [{ field, value, source, lastUpdated, confidence, extractionMethod }]
  snapshotHash
}

PolicyVersion {
  id                        // "vic.hardship.best-offer"
  version                   // "1.2.0"
  effectiveFrom
  effectiveTo               // null while current
  jurisdiction              // "VIC"
  owner                     // "Compliance"
  readFields[]              // drives inputHash AND affected-population queries
  evidenceRequirements[]
  citations[]               // clause-level, e.g. ERCoP v7 cl 76-79
}

Evaluation {
  id
  customerId
  decisionKey               // "eligibility:cust_123:best_offer" — stable lineage key
  policyId
  policyVersion
  snapshotId
  snapshotHash
  inputHash
  outcome                   // see I4
  reasons[]                 // each: { rule, status, citation, explanation }
  evaluatedAt
  triggeredBy               // { kind: EVENT | SCHEDULE | POLICY_CHANGE | MANUAL, ref }
}

Decision {
  id
  decisionKey
  customerId
  policyId
  policyVersion
  snapshotId
  snapshotHash
  outcome
  evidence[]
  supersedesDecisionId
  supersededByDecisionId    // set once, on the superseding write; never re-set
  createdAt
}

Action {
  id
  decisionId
  type                      // CREATE_SF_CASE | UPDATE_SF_FIELDS | QUEUE_FOR_REVIEW
                            // | REQUEST_PLAN_SWITCH | NOTIFY_OPERATOR | SCHEDULE_REASSESSMENT
  executionMode             // AUTOMATIC | APPROVAL_REQUIRED | MANUAL
  status                    // PENDING | AWAITING_APPROVAL | EXECUTING | DONE | FAILED
  result
}

Approval {
  id
  actionId
  actorId
  decidedAt
  verdict                   // AGREED | OVERRIDDEN | REJECTED
  overrideReason            // REQUIRED when verdict != AGREED
}

ScheduledEvaluation {
  id
  customerId
  evaluateAt
  reason                    // "debt reaches 3 months" | "hardship review due" | ...
  policyId                  // null = all applicable
  status                    // PENDING | FIRED | CANCELLED
}
```

`Approval.overrideReason` is not bureaucracy. It is the only signal telling you whether the
policy thresholds are calibrated, and it is a dataset nobody can buy. Make it required.

`decisionKey` must NOT embed the policy version — lineage survives version changes. It should
also survive a policy being renamed; document what happens if a policy splits in two.

---

## 5. Policies — code, not a DSL

```
src/policies/
  index.js                       // registry + resolveVersionAt(policyId, date)  ← I6 lives here
  vic.hardship.best-offer/
    v1.2.0.js
    v1.3.0.js
    meta.js
```

Each version exports its metadata envelope and a pure `evaluate(snapshot) -> { outcome, reasons }`.

**Do not build a rule DSL, a policy editor, or a visual rule builder.** Not in v1, not "just a
small one". You do not yet know where retailer variation actually lives; guessing produces an
abstraction you will have to support forever. Versioned code plus a metadata envelope gives you
determinism and audit today.

**First policy to implement — Victorian hardship / best offer.** Ground it in what `ops.js`
already encodes (`AMELIA_CASE.rules`), which reflects real ERCoP v7 detail:
- Disconnection floor rising **$300 → $1,000**, effective **1 Oct 2026**.
- Automatic best-offer switch is engaged by **entry into tailored assistance**, not solely by
  the arrears threshold.
- The `$1,000 AND ≥3 months in arrears` trigger makes the switch mandatory regardless of
  assistance status.
- Sensitive-customer marker blocks disconnection as a recovery step.

Ship **v1.2.0 and v1.3.0 of this policy** (pre- and post-1-Oct thresholds). You need two real
versions to build and demonstrate loop two — a synthetic version bump would prove nothing.

---

## 6. Build order

Each step has an acceptance criterion. Do not proceed until it passes. Commit per step.

| # | Step | Acceptance |
|---|------|-----------|
| 1 | Postgres + migrations + docker-compose | `npm run db:migrate` creates every table in §4 from clean |
| 2 | Salesforce read → normalized state | One synthetic AU customer pulled; Salesforce objects never appear downstream of the normalizer |
| 3 | Snapshot capture w/ provenance + `snapshotHash` | Snapshot persists with per-field `source` / `lastUpdated`; identical input → identical hash |
| 4 | Policy registry + `resolveVersionAt` + VIC policy v1.2.0 | Unit tests: same snapshot + same version → byte-identical result, 100 runs |
| 5 | Evaluation pipeline w/ `inputHash` skip + thin `NO_CHANGE` + interval rollup | Re-running with unchanged inputs writes no new snapshot and extends an interval row |
| 6 | **Scheduler** — `ScheduledEvaluation` + tick | 89-day-old debt schedules tomorrow; tick fires it; day-90 crossing produces `ACTION_REQUIRED` with **no hand-edited data** |
| 7 | Decision persistence + `decisionKey` lineage + supersede | Re-evaluation supersedes rather than duplicating; `supersedesDecisionId` chain is walkable |
| 8 | Best-offer provider interface + mock backend | Vocare never computes a price; swapping the mock for a real provider touches one file |
| 9 | Action + Approval, incl. `APPROVAL_REQUIRED` + required `overrideReason` | An override without a reason is rejected at the API boundary, not the UI |
| 10 | Salesforce projection — Case + field write-back, **batched via Bulk API behind a work queue** | 2,000 simulated writes complete without hitting an API limit |
| 11 | CDC ingestion + loop prevention (I7) + circuit breaker | Vocare's own write does not re-trigger evaluation; a forced loop trips the breaker and halts |
| 12 | Real state change end-to-end | Payment received → new snapshot → re-evaluate → superseding decision, fully traceable |
| 13 | **Loop two** — policy v1.3.0 effective → affected population via `readFields` → dual-run attribution (I8) | Report shows policy-delta and operational columns **separately**, with correct counts |
| 14 | Wire `compliance-drift` pages to the API; delete `ops.js` | OpsQueue / CaseWorkspace / AuditHistory render live data; no static domain fixtures remain |

Step 6 is deliberately early. The flagship VIC policy's primary trigger is *time* — without the
scheduler you cannot demonstrate the day-90 crossing without faking data, which is the exact
"hardcoded prototype" failure mode this build exists to escape.

---

## 7. Working rules

- **Verify by running.** Every step gets a test or a reproducible command in the commit message.
  Do not report a step complete because the code looks right.
- **No silent fallbacks.** If Salesforce is unreachable, fail loudly with the real error. Never
  substitute mock data for a failed live call — the existing `assistantApi.js` already gets this
  right ("surface backend failures honestly; no canned response is substituted"). Match it.
- **Synthetic data only.** Every customer is fictional; keep the synthetic-data banner on any
  surface that renders one.
- **Do not touch `salesforce/` or `scripts/`** without checking first — another session owns that
  work and may have uncommitted changes there.
- **Do not** rewrite the `compliance-drift` visual design, delete the US graph in `src/graph/`,
  add a rule DSL, or build new frontend pages. The UI surface is sufficient; make it real.
- Keep `src/voice/` and `/api/assistant/*` working — they are the only live paths today.

## 8. Report back

State plainly, per step: what passes, what does not, what you skipped and why. If you deviated
from an invariant in §2, say which one and give your reasoning. If a step is half-done, say
half-done — a truthful ledger of what works is worth more than a claim that everything does.

## 9. Done means

A regulator-grade question is answerable from the database alone, with no reconstruction:

> *"On 4 February 2027 you moved Amelia Hart to the best-offer tariff. What did you know at that
> moment, which version of which clause required it, what evidence supported it, who approved it,
> what did you check between then and now, and when the code changed on 1 October, how many
> customers were affected by the regulation itself as opposed to by their own circumstances?"*

If the answer is a SQL query and a graph traversal, the platform is real.
