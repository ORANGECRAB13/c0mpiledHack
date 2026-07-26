# Vocare — Autonomous Hardship Intake for US Utilities: Project Overview

**Project root:** `/Users/vonners/DevProjects/HackSF`
**Companion doc:** `HANDOFF.md` (build status, task tracker, bug ledger — read that for current
progress; this doc is the stable "what is this and how does it work" reference)

---

## 1. Problem · Solution · Benefit

**The problem — a fragmented safety net meeting a worsening affordability crisis.**
US energy affordability is deteriorating: surging load from AI data centers, grid congestion, and
the capital cost of modernizing aging infrastructure are pushing bills up. Meanwhile the relief
system is a maze — federal LIHEAP money (>$4B for FY2026) administered through 50 different state
Public Utility Commission (PUC) regimes, with shutoff moratoria, arrearage-forgiveness programs
(AMP/PIPP), and income thresholds that all vary by state and by date. Utilities run expensive human
compliance teams just to verify income and avoid wrongful-shutoff penalties. A plain LLM is
disqualifying here: it is probabilistic, and a hallucinated policy approval is direct legal and
financial liability.

**The solution — a deterministic AI compliance engine that runs the intake by voice.**
Vocare is an outbound voice agent for a multi-state utility ("Meridian Energy") that acts as a
real-time compliance officer. It conducts a live interview with a distressed customer, collects the
facts it needs (household size, income, disconnection status), and matches them against a **rigid,
executable ruleset derived from state PUC regulations**. It approves payment plans, enrolls
benefits, and places holds on disconnections — escalating to a human only when a request falls below
the agent's delegated authority. A multi-agent system is strictly bound by a deterministic policy
graph; the LLM conducts the conversation but never decides eligibility.

**The benefit — eradicating headcount and regulatory risk at once.**
It replaces manual, spreadsheet-driven compliance workflows with scalable AI infrastructure, and —
because every decision is deterministic and maps to a specific statute — it produces a complete,
auditable paper trail. The output is not a transcript; it is a **governed customer outcome** with
every fact, decision, human intervention, and system action accounted for. That is what turns a
collections call into a benefits-enrolment call *and* eliminates the wrongful-shutoff exposure.

---

## 2. The core claim (the demo's money moment)

The compelling moment isn't a negotiation tactic — it's the context engine surfacing a benefit the
customer didn't know existed and no single system knew to offer, purely from a couple of sentences
the customer says out loud. Nothing changes but two disclosures, and $0 of eligibility becomes the
customer's entire balance covered.

---

## 3. Use-case walkthrough

### Call 1 — Von Viray, Chicago IL
Her CRM record is stale (2019): household of 2, income $52k → fails LIHEAP's 200% FPL threshold →
**eligible for nothing**, offered a flat $154/month plan. On the call she discloses her daughter and
two grandchildren moved in and her hours were cut: household of 5, income $34k. The engine
re-resolves live:
- LIHEAP crisis grant — **$1,200** (disconnection notice on file → crisis tier)
- Arrearage credit — **$642.60** (AMP-IL, gated on PIPP enrollment)
- PIPP payment cap — **$170/mo** (6% of monthly income)
- **Total unlocked: $1,842.60 — the entire balance**

She asks for $120/month; the IL authority floor is $150 → below what the agent may approve → the
call goes on hold → a credit officer decides in a separate panel → the call **resumes on the same
session**, no re-dial, no re-greeting. An officer who tries to approve $200 is clamped to the $170
affordability cap; an under-authority (L1) officer is rejected outright.

### Call 2 — Marcus Reyes, Rockford IL
Demonstrates the **knowledge loop**: after a human ratifies a program gap that Von's call
flagged, Marcus's call — no restart, no reload — offers that newly-ratified program unprompted.

### Contrast — Dana Whitfield, Houston TX
Same situation, but Texas has no AMP and no PIPP, so eligible = none, unlocked = $0. Makes the
state-by-state fragmentation the product compensates for visible in one screen.

### Date sensitivity
The same IL customer is unprotected on 24 July (heat-trigger moratorium keyed to a temperature
threshold — not active) but protected in winter (fixed Dec 1–Mar 31 window). Two independent,
date/forecast-driven rules evaluated live.

---

## 4. Ethical guardrails (enforced in code, not prompted)

This is an AI cold-calling financially distressed people, so these are server-side invariants:

1. **Objective is benefits captured, not dollars collected** — UI shows "$ unlocked," never a
   recovery figure.
2. **Affordability clamp** — the agent (and the human officer) can never approve above the PIPP
   income-cap the engine computed. Enforced in `policy.js`.
3. **Instant human handoff on request** — one `transfer_to_human` tool call, no retention attempt.
4. **Consent gate before any account write** — `confirm_plan` requires `customerConsent: true`; the
   state machine mechanically refuses execution without a logged consent event.

All data carries `_synthetic: true`; a disclaimer banner persists on every screen and in the audit.

---

## 5. Technical stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js + Express, static SPA | Mirrors a prior project (`Vocare_CompanyBrain`) so the graph layer ported verbatim; no build step |
| Context graph | Neo4j **or** in-memory (facade) | `src/graph/index.js` picks a live DB if configured, else an equivalent in-memory dataset; the *same resolver* runs over either, so they can't diverge |
| Voice | Azure AI Foundry `gpt-realtime-2.1` | Speech-to-speech, function calling, single-session hold/resume |
| Governance | Guild agents + integration | Two governed action types modelled as real cloud agents |
| Semantic retrieval | Actian VectorAI *(planned)* | Explanatory text only — never decides eligibility |
| Structured extraction | Pioneer *(planned)* | Typed case summaries + a v1→v2 extraction-quality diff |
| QA | Replay | End-to-end journey testing against the deployed app |
| Transport | WebSocket bridge (browser ⟷ server ⟷ Azure) | Browser never sees the Azure key |

Server runs on **port 5182**. Full file map is in `HANDOFF.md §3`.

---

## 6. What each tool is used for

- **Azure AI Foundry `gpt-realtime-2.1`** — the live conversation. Runs the intake interview,
  calls the workflow tools, and holds/resumes on one continuous session across the human approval so
  the customer is never re-dialled. The key is held server-side in `src/voice/bridge.js`.
- **Context graph (Neo4j / in-memory)** — the deterministic ruleset. Resolves jurisdiction, shutoff
  protection, and the full benefit stack. This is the "compliance engine" — not a chatbot.
- **Guild** — agent governance. Two agents carry the two governed action types:
  `arrearage-authority` (the approval gate + affordability clamp) and `arrearage-ratification`
  (the governed write that promotes a flagged knowledge gap into the live ruleset). Published as an
  integration (`vocare-arrearage-api`) so the agents call the workflow as typed tools.
- **Actian VectorAI** *(planned)* — semantic retrieval of *explanatory* policy text for a program
  the deterministic engine has already ruled eligible. **Cosine similarity never decides
  eligibility.** This is the line separating the project from a RAG demo.
- **Pioneer** *(planned)* — turns the finished call into a typed, structured case summary, and
  demonstrates extraction improving (v1 misses a compound disclosure like "I'm on disability and my
  daughter moved in with two kids"; v2 catches both) as an audit-view diff.
- **Replay** — drives the deployed app through the full journey for QA; the "completed QA, all bugs
  fixed" criterion is met with a visible bug ledger, not a claim of zero bugs.

*(Current wired/stubbed/planned status for each is tracked in `HANDOFF.md §2`.)*

---

## 7. The closed-loop system

Two self-correcting loops make the system improve without ever letting the model self-authorize.

### Loop A — the knowledge loop (human-ratified, governed)
1. Mid-call, the customer mentions a program the ruleset doesn't contain.
2. The agent **does not bluff** — it calls `flag_knowledge_gap`, which writes an *open* gap to
   `knowledge-gaps.json`. Verified property: **an open gap is invisible to the resolver.** The agent
   cannot offer knowledge a human hasn't approved.
3. A human reviews the flagged gap and ratifies it (via the operator card, or the Guild
   `arrearage-ratification` agent, which records ratifier identity + authority as a governed write).
4. On the **next call, with no restart or reload**, the resolver now includes the ratified program
   and the agent offers it unprompted.

This is human-in-the-loop knowledge acquisition with a governed write path — deliberately *not*
"self-learning AI." It closes the loop from "system doesn't know" → "human teaches it once" →
"system knows for everyone, auditable."

### Loop B — the extraction loop (Pioneer, planned)
The finished transcript feeds a structured extractor; a versioned improvement (v1 → v2) is shown as
a side-by-side diff in the audit view — evidence of the system getting better at reading compound
disclosures, rather than a live stage moment.

Both loops share the same principle as the whole system: **the LLM proposes, the deterministic layer
(and a human, where required) disposes.**

---

## 8. System architecture

```
Browser (customer mic)  ──WebSocket──►  src/voice/bridge.js  ──WebSocket──►  Azure gpt-realtime-2.1
        │                                      │  (session mgmt, tool dispatch,
        ▼                                      │   hold/resume on ONE session)
  public/ (operator console)                   ▼
        │                              src/workflow/  (state machine · policy · consent)
        ▼                                      │
  src/server.js (Express, 5182)  ◄─────────────┤
        │                                      ├── src/graph/    (the context engine — §9)
        │                                      ├── src/sandbox.js (simulated CRM / disconnection /
        │                                      │                   payment / LIHEAP-intake / email)
        │                                      └── src/audit.js   (audit doc from the event log alone)
        │
        └── Guild agents (arrearage-authority, arrearage-ratification) call back in via the
            published vocare-arrearage-api integration
```

---

## 9. The context engine (`src/graph/`)

- **`resolve.js`** — the engine. `resolveJurisdiction` + `resolveBenefitStack` are pure functions
  over the dataset: state, effective date, weather/date-triggered moratoria, income vs FPL/SMI
  tables, household size, and program prerequisites (AMP-IL requires PIPP first, etc.). All
  eligibility is decided by hard predicates.
- **`dataset.js`** — loads every JSON source (customers, accounts, per-state PUC rules, LIHEAP,
  AMP/PIPP, stacking rules) into one normalized shape used by both the Neo4j ingest and the
  in-memory resolver, so the backends can't drift.
- **`index.js`** — the facade (Neo4j-or-memory) and the knowledge-gap CRUD.
- Confirmed jurisdictions: **CA, TX, IL, NY** (IL drives the knowledge-gap demo).

## 10. Workflow / state machine (`src/workflow/`)

The state machine — not the model — owns hold, approval, resume, execution, and completion:

```
ready → assembling_context → calling → benefits_resolved
     → customer_on_hold → awaiting_credit_officer → resuming_call
     → customer_accepted → executing → complete    (or → failed at any gate)
```

- **`policy.js`** — authority floor (min the agent may self-approve) *and* the affordability ceiling
  (never above the PIPP cap). Numeric application-layer checks, independent of any LLM output.
- **`types.js`** — zod schemas; `confirm_plan` requires `customerConsent === true`.
- **`events.js`** — every transition is an appended, citable event feeding the audit and the UI.

## 11. Voice layer (`src/voice/`)

- Azure `gpt-realtime-2.1`; key held server-side, browser never sees it. Customer's phone mic
  stands in for a call; **no PSTN/Twilio**.
- **Hold/resume on one continuous session** — on escalation the bridge cancels the in-flight
  response, plays a hold message, suppresses turn detection; on approval it injects the officer
  decision and triggers a new response. No re-dial, no re-greet.
- Tool surface (narrow — never direct CRM/payment access): `resolve_benefit_stack`,
  `flag_knowledge_gap`, `request_credit_approval`, `transfer_to_human`, `confirm_plan`.
- A **scripted-customer fallback** shares every downstream path with the live-mic path — one code
  path, swappable input, so the demo never depends on a separate "fake" mode.

## 12. Compliance determinations & audit (`src/audit.js`)

The audit document is assembled purely from the deterministic event log. Its headline is a list of
**compliance determinations**, each binding an outcome to the statute that authorizes it:

```
Disconnection prohibited        → Shutoff hold placed on account   [ICC-280-HEAT]
Benefit approved: IL LIHEAP     → $1,200 toward arrears            [LIHEAP-IL-2026]
Benefit approved: PIPP          → Monthly bill capped at $170      [PIPP-IL-2026]
Payment arrangement authorised  → $170/month                      [SOP-IL-14.2-V6.4]
```

Disconnection protection is an **executed action**, not a note — the agent places an actual shutoff
hold (`disconnection-sandbox`) when the customer is protected. The rest of the audit carries the
transcript reference, every cited graph source ID, the Guild governed actions, officer identity, the
resolved stack, the consent event, and the execution events.

---

## 13. Prize framing

- **Best use of agents in Guild** — won by carrying *two* distinct governed action types (approval
  gate + knowledge-graph write), where most demos show one.
- **Best SaaS app with completed QA (Replay)** — won by a hard feature freeze followed by a visible
  bug ledger with every item closed.

## 14. One-paragraph pitch

> A rep at a multi-state utility cannot hold 50 states of shutoff rules, LIHEAP tiers, and
> arrearage-forgiveness schedules in their head — so eligible customers don't get offered money
> they're already entitled to, and utilities carry the wrongful-shutoff risk of getting it wrong.
> Vocare resolves jurisdiction and benefit stacking in a deterministic context graph, calls the
> customer, and turns the collections process into a benefits-enrolment process. Every decision maps
> to a statute. Every action crosses a governed authority boundary. And when the agent hits
> something it doesn't know, it says so, a human ratifies the answer, and the next call already
> has it.

---

*For current build status, task-by-task progress, known issues, and the bug ledger, see
`HANDOFF.md` in this same directory.*
