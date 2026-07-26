# Vocare — US Arrearage Agent — Build Handoff

**Last updated:** 24 July 2026
**Project root:** `/Users/vonners/DevProjects/HackSF`
**Full plan:** `/Users/vonners/.claude/plans/unified-honking-flamingo.md`
**Original (superseded) guide:** `~/Downloads/message (2).txt` — the Australian AER version. Kept for reference only.

---

## 1. What this is

An outbound voice agent for a fictional multi-state US utility ("Meridian Energy") that calls
customers in arrears and turns a collections call into a benefits-enrolment call.

The US has no federal hardship rule. Protections are per-state PUC, moratoria are weather- and
date-triggered, LIHEAP is federal money with state and local intake, and AMPs and PIPPs exist in
some states and not others. No human rep can hold that in their head — which is what makes a
context engine load-bearing rather than decorative.

**The money moment is not the negotiation.** It is the engine surfacing a benefit the customer
did not know existed and no single system knew to offer.

**Prizes being targeted:**
- *Best use of agents in Guild* — won by carrying **two** governed action types: the approval gate
  and the knowledge write. Most teams will show one.
- *Best SaaS app with completed QA (Replay)* — won by the hard feature freeze at T+3:00 and a
  visible bug ledger with every item closed.

### Ethical guardrails (implemented server-side, not prompted)

This is an AI cold-calling financially distressed people about debt. A judge will probe it.

1. Objective is **benefits captured, not dollars collected** — the on-screen counter shows
   "$ unlocked" where a collections dashboard would show recovery.
2. **Affordability clamp** — the agent may never push above the PIPP income-cap figure the engine
   computed. Server-side, not a prompt instruction.
3. **Instant human handoff** on request — one tool call, no retention attempt.
4. **Consent before any account write** — `confirm_plan` requires `customerConsent: true` and the
   state machine refuses to execute without a consent event in the log.

Synthetic-data banner stays visible on every screen including the audit document.

---

## 2. Status

| # | Task | Status |
|---|---|---|
| 1 | Scaffold from `Vocare_CompanyBrain` | ✅ Done |
| 2 | US arrearage context graph — data, schema, resolvers | ✅ Done, verified |
| 3 | Azure Foundry `gpt-realtime-2.1` voice session | 🟨 **Bridge built and proven against real Azure** — session configures, agent opens the call using case context, audio + transcription stream back (87 chunks in a 12s probe). Tool dispatch reuses the tested workflow; hold/resume wired to the approval route. **Live mic conversation itself needs a human voice to fully exercise** — can't drive a real mic headless. Scripted path remains the reliable fallback.
| 4 | Workflow state machine + escalation | 🟨 State machine, policy clamps, escalation flow all done and tested. **Guild and Band SDK calls are still stubbed** — the channel is chosen by env-var presence and falls back to the local officer UI. |
| 5 | Knowledge loop (gap → ratify → reuse) | ✅ Done — verified end to end **in the browser**: gap flagged mid-call, ratified from the operator UI, second Illinois customer resolves 4 eligible including the ratified program, no restart. |
| 6 | Sandbox adapters, Pioneer summary, audit document | 🟨 Sandbox adapters and the audit document are done. **Pioneer summary and the v1/v2 diff panel are not started.** |
| 7 | Deploy, Replay QA, close every bug | 🟨 Both UIs driven end to end in Chrome. Not yet deployed; Replay not yet run. |
| 8 | React frontend (sf_hack visual language) | ✅ Done. `frontend/` Vite+React+framer-motion, US-themed, wired to the REAL backend, one-focal-moment-per-stage. `npm run build` → `frontend-dist`, served by Express at `/`. Full flow verified in Chrome incl. the $200→$170 clamp and audit doc. |
| 9 | Voice provider switchable | ✅ Done. `src/voice/actions.js` = provider-agnostic tool dispatch; `bridge.js` = Azure adapter; `VOICE_PROVIDER` env selects. ElevenLabs = a sibling adapter reusing runVoiceTool(). |
| — | **Guild agents** | ✅ Two agents saved as DRAFTS on `orangecrab13`: `arrearage-authority`, `arrearage-ratification`. Integration `vocare-arrearage-api` published v1.1.0. **Server does not yet route through them.** |

**Server runs on port 5182** (`http://localhost:5182`). 5177 is CompanyBrain and 5180/5181 were
already taken by other local projects — note that `.env.local` line 1 still carries CompanyBrain's
`PORT=5177`, now commented out, because dotenv takes the *first* occurrence of a key.

**The whole workflow is verified end to end without any external provider.**
Run `node scripts/check-workflow.js`.

---

## 3. What exists on disk

```
HackSF/
  package.json              Express + neo4j-driver + ws + zod. `npm run dev` → src/server.js (NOT YET WRITTEN)
  .env.local                Azure OpenAI + Neo4j creds carried over from CompanyBrain; the rest are empty
  .gitignore
  HANDOFF.md                this file

  src/
    ai.js                   PORTED VERBATIM from CompanyBrain. askAi() routes Azure-first, OpenAI fallback.
    graph/
      neo4j.js              PORTED VERBATIM. isGraphConfigured, getDriver, withGraphSession, READ/WRITE
      normalize.js          PORTED VERBATIM. normalizeKey, compactKey, hashText, uniqueStrings
      dataset.js            Loads every JSON source into one normalised dataset. Single source of truth
                            for BOTH the Neo4j ingest and the in-memory resolver, so they cannot drift.
                            Also: persistKnowledgeGaps, findCustomer, fplFor, smiFor, accountFor
      resolve.js            ★ THE ENGINE. resolveJurisdiction + resolveBenefitStack. Pure functions
                            over the dataset shape. All deterministic predicates.
      schema.js             Neo4j constraints + indexes for the arrearage label set
      ingest.js             Cypher MERGE of the whole dataset into Neo4j
      queries.js            getGraphCounts, getLabelCounts, getGraphVisualization, searchPolicyText
      index.js              ★ FACADE. Picks Neo4j or in-memory, exposes engineStatus/syncGraph/
                            visualization/jurisdictionFor/benefitStackFor/knowledge-gap CRUD
    server.js               Express API + SSE event stream. Port 5182.
    sandbox.js              CRM / payment-plan / benefit-intake / email adapters. All labelled simulated.
    audit.js                buildAudit() — assembled from the deterministic event log alone
    voice/
      config.js             realtimeConfig() (reads AZURE_NEW_*), systemPrompt(), TOOLS surface
      bridge.js             ★ browser↔server↔Azure WS bridge. Tool calls run the workflow;
                            hold/resume + a session registry so the approval route resumes a live call
    workflow/
      types.js              CASE_STAGES, EVENT_TYPES, zod schemas. planConfirmation requires
                            customerConsent === true, so consent cannot be skipped.
      events.js             appendEvent/eventsFor/citedIds + an EventEmitter bus feeding SSE
      policy.js             ★ checkAuthority (floor AND affordability ceiling), validateOfficerAuthority,
                            clampApprovedAmount, and the decision-trace builders
      state-machine.js      ★ Legal transitions, case lifecycle, disclosure re-resolution,
                            knowledge-gap flag/ratify, escalation, consent gate, execution

  frontend/                 ★ NEW primary UI — Vite + React + framer-motion (sf_hack visual language)
    src/App.tsx             the 5-stage flow (ready→detecting→calling→hold→complete), REAL API-driven
    src/api.ts              typed client for the Express backend
    src/scripted.ts         US scripted-customer conversation (drives the same real endpoints)
    src/voice.ts            mic capture / playback / WS to the bridge
    src/styles.css          ported + re-themed sf_hack visual system
    (build: `cd frontend && npm run build` → ../frontend-dist, served by Express at /)

  src/voice/actions.js      provider-agnostic voice tool dispatch (shared by any provider)

  public/                   LEGACY vanilla console (fallback; frontend-dist wins when built)
    index.html              operator console: queue, jurisdiction, benefit package, transcript,
                            knowledge-gap card, credit-approval panel, decision trace, audit dialog
    app.js                  drives the SAME endpoints the voice agent uses. Polls (see bug ledger).
    styles.css              purpose-built; keeps CompanyBrain's token names

  guild-agents/
    arrearage-authority/    Guild agent — approval gate + affordability clamp
    arrearage-ratification/ Guild agent — governed write to ground truth
    vocare-api.openapi.json spec kept for reference; the CLI's --openapi import does NOT work

  data/us-arrearage/
    customers.json          3 synthetic customers (see §5)
    accounts.json           invoices, payments, contact-centre notes
    puc-rules/{ca,tx,il,ny}.json
    liheap.json             4 state programs + FPL table + SMI table
    amp-programs.json       IL and NY only — CA/TX absent deliberately
    pipp-programs.json      IL and NY only — CA/TX absent deliberately
    stacking-rules.json     STACKS_WITH / REQUIRES / EXCLUDES + the fallback DPA
    knowledge-gaps.json     starts empty; the loop writes here

  scripts/
    check-resolver.js       prints the four demo scenarios — run this first to confirm nothing broke
    check-workflow.js       ★ full journey: context → disclosure → gap → escalation → clamp →
                            resume → consent gate → execution → audit → ratify → call 2
    reset-demo.js           clears knowledge-gaps.json so the demo starts with the agent not knowing
```

Every data file carries `_synthetic: true` and a disclaimer that figures approximate real program
structure and must not be relied on operationally.

---

## 4. Architecture decisions already made — do not relitigate

- **Express + static SPA, not Next.js.** Mirrors `~/DevProjects/Vocare_CompanyBrain` so the graph
  layer ports verbatim. That choice saved roughly 40 minutes.
- **Resolution is deterministic; retrieval is semantic.** `resolveBenefitStack` uses hard
  predicates on state, effective date, income, household size and prerequisites. Actian vectors
  will only ever fetch explanatory text for a program *already* resolved as eligible.
  **Cosine similarity never decides eligibility** — say this on stage, it is the line that
  separates this from a RAG demo.
- **One resolver, two backends.** `resolve.js` runs over the dataset shape regardless of whether
  the nodes came from Neo4j or local JSON, so the fallback cannot give a different answer.
- **The state machine, not the model, owns** hold state, approval permission, resume permission,
  execution permission and completion.
- **The knowledge loop is human-in-the-loop knowledge acquisition with a governed write path** —
  do not pitch it as "self-learning AI".
- **Extraction loop (Pioneer v1 vs v2) is a diff panel in the audit view, not a second live
  moment.** Reads as evidence rather than theatre, and costs 15 minutes instead of 45.

---

## 5. The demo scenarios (verified working)

Run `node scripts/check-resolver.js` to reproduce all four.

### Call 1 — Von Viray, Chicago IL (`CUS-77241`, case `C-20481`)

Her CRM record is from account opening in **2019** and was never refreshed: household of 2,
income $52,000. Arrears $1,842.60, disconnection notice dated 18 July 2026.

**Before the call, on the stale record:**
```
Eligible: none  (fails 200% FPL — threshold $42,300, income $52,000)
Benefits unlocked: $0
Offer: $154/month for 12 months (standard deferred payment arrangement)
```

**She discloses on the call** — daughter and two grandchildren moved in, hours cut at the clinic.
Household of 5, income $34,000:
```
LIHEAP crisis grant      $1,200      (crisis tier — disconnection notice on file)
Arrearage credit           $642.60   (AMP-IL, requires PIPP enrolment first)
PIPP cap                   $170/mo   (6% of monthly income)
Benefits unlocked        $1,842.60   — the entire balance
```

Nothing changed but two sentences from the customer. This is a real computation, not a scripted
reveal. **Authority floor is $150/month.** She asks for **$120** → below the floor → escalate →
officer approves ~$130 → resume.

### Call 2 — Marcus Reyes, Rockford IL (`CUS-77302`, case `C-20492`)

Household 3, income $31,200, arrears $970.40. Used for the **knowledge loop** — after
ratification he is offered the newly ratified township program that Von's call surfaced.

### Contrast — Dana Whitfield, Houston TX (`CUS-64118`)

Identical situation, materially thinner package, because Texas has no AMP and no PIPP:
```
Eligible: none.  Benefits unlocked $0.  $227/month.  Authority floor $165.
```
This is the fragmentation argument in one slide.

### Date sensitivity

The same Illinois customer is **unprotected on 24 July** (heat trigger at 96°F against a 95°F
threshold — actually active) but protected in January by the 1 Dec – 31 Mar window. Two separate
rules evaluated against date *and* forecast.

---

## 6. What still needs doing

### Task 3 — Azure Foundry `gpt-realtime-2.1` voice (biggest risk, do first)

**Blocked on credentials:** `AZURE_REALTIME_ENDPOINT`, `AZURE_REALTIME_API_KEY` in `.env.local`.
`AZURE_REALTIME_DEPLOYMENT` defaults to `gpt-realtime-2.1`.

- Server mints an **ephemeral** session credential — the browser must never see the API key.
- WebRTC preferred (best venue-noise behaviour), WebSocket as fallback. Browser mic = the
  customer's phone. No PSTN/Twilio — explicitly out of scope.
- Server-side VAD, output transcription on, both sides rendered to the transcript pane.
- **Hold/resume on ONE session**: on escalation, cancel the response, play a hold message,
  suppress turn detection. On approval, inject the decision as a system item and trigger a new
  response. The customer is never re-dialled or re-greeted — that continuity is the thing to
  point at on stage.
- **Build the scripted-customer fallback at the same time**, sharing every downstream path. One
  code path, swappable input. Never build a separate fake demo path.

Tool surface (small; never direct CRM or payment access):
```ts
get_case_context(caseId)                    // pre-warmed before the call
resolve_benefit_stack(caseId, householdSize, incomeBand, disclosures)
flag_knowledge_gap(caseId, state, programMentioned, customerQuote)
request_credit_approval(caseId, customerRequestedAmount, recommendedAmount, benefitStack, summary)
transfer_to_human(caseId, reason)
confirm_plan(caseId, planId, amount, benefitIds, customerConsent)
```

### Task 4 — Guild + Band escalation and state machine

`src/workflow/{state-machine,events,policy,types}.js`.

```ts
type CaseStage =
  | 'ready' | 'assembling_context' | 'calling' | 'benefits_resolved'
  | 'customer_on_hold' | 'awaiting_credit_officer' | 'resuming_call'
  | 'customer_accepted' | 'executing' | 'complete' | 'failed';
```

`policy.js` holds the authority floor check **and** the server-side affordability clamp.
Guild governs the approval; Band carries the request to the officer UI and the decision back.
If Guild policy configuration drags, register the action through Guild, record officer identity
through Guild, and keep the numeric floor in the application.

### Task 5 — Knowledge loop UI (engine side already done)

Already working and tested in `src/graph/index.js`: `recordKnowledgeGap`, `ratifyKnowledgeGap`,
and `ratifiedGapPrograms` filtering. **Verified that an `open` gap is invisible to the resolver
and only becomes usable after ratification** — the agent genuinely cannot use knowledge a human
has not signed off.

Still needed: the `flag_knowledge_gap` tool wiring, the operator ratification card, and the Guild
call that records who ratified it under what authority.

The on-stage script: Von mentions a township program the graph doesn't have → agent does not
bluff, flags the gap, tells her honestly it will confirm and follow up → human ratifies live →
Marcus's call (same state, no restart, no reload) offers it unprompted.

### Task 6 — Sandbox adapters, Pioneer, audit

Sandbox CRM / payment-plan / LIHEAP-intake / email adapters, each emitting an event. Pioneer typed
case summary via `ai.js`. Pioneer v1-vs-v2 extraction diff panel. Audit document containing the
call, graph source IDs, **both** Guild actions, Band room and message IDs, officer identity,
benefit stack, consent, and execution events.

### Task 7 — Deploy + Replay QA

**Freeze features at T+3:00.** Everything after is QA — this split is the Replay prize.
Log every defect including cosmetic ones into a visible bug ledger and close all of them;
"all bugs fixed" is the literal judging criterion, and having the ledger to show is worth as much
as having no bugs.

### Also outstanding

- **`src/server.js` does not exist yet** — `npm run dev` will fail until it is written.
- **`public/index.html` and `public/app.js` do not exist yet** — only `styles.css` was ported.
- **Voice env**: the realtime creds are under `AZURE_NEW_ENDPOINT` / `AZURE_NEW_KEY` / `AZURE_NEW_DEPLOYMENT`
  (lines 92-94), NOT the `AZURE_REALTIME_*` names. `src/voice/config.js` reads `AZURE_NEW_*` first.
  Working URL: `wss://<host>/openai/realtime?api-version=2025-04-01-preview&deployment=gpt-realtime-2.1`.
  `AZURE-MODEL` was changed to `gpt-5.1` (text side, src/ai.js) — flagged to user, unverified.
- **`src/graph/vectors.js` (Actian) not written** — needs credentials, and the plan treats it as
  optional since it only fetches explanatory text.

---

## 7. Known issues and environment gaps

| Item | Detail |
|---|---|
| **Neo4j not running** | `.env.local` has `NEO4J_URI=bolt://localhost:7688` but nothing is listening, and no Docker daemon is up. Everything currently runs on the **in-memory backend**. The Neo4j path is written but **untested against a live database**. Graph visualization currently comes from the memory renderer (51 nodes, 56 edges). |
| **Azure realtime untested** | The single highest-risk unknown. Confirm the deployment exists and the region supports WebRTC before the sprint. |
| **Empty credentials** | Actian, Guild, Band, Pioneer slots in `.env.local` are all blank. |
| **Four states confirmed** | CA, TX, IL, NY. IL is the knowledge-gap state. |

### Bug ledger — Replay evidence

**UI bugs found by driving the app in Chrome (all fixed):**

1. **`alert()` on error froze the page and the automation harness.** Any failed fetch opened a
   modal dialog, which blocks the document and every subsequent tool call. Replaced with an
   inline `#error-bar`. NEVER reintroduce a modal dialog in this app.
2. **The SSE `EventSource` kept the document permanently non-idle.** Automated browsers waiting
   on `document_idle` timed out at 45s on every action, even after deferring the connection past
   the `load` event. Replaced with a 4s poll — every action already refreshes explicitly, so the
   poll only catches out-of-band changes. `/api/stream` still exists server-side but nothing
   consumes it.
3. **`$('unlocked')` matched no element** — the id was on the child spans, not the container.
   Threw on every benefit render.
4. **Currency rendered as `$1,842.6`** in the client (`maximumFractionDigits` with no minimum).
5. **Same bug server-side** in `policy.js benefitTrace` — `toLocaleString()` with no options.

### Bugs found and fixed during task 2 (do not reintroduce)

1. Multiple grants on one account only counted the first — `find` should have been `filter` + sum.
   Matters as soon as a ratified local supplement stacks on top of state LIHEAP.
2. Grants weren't capped at the amount actually owed — a $1,200 grant against a $970.40 balance
   reported $1,200 unlocked.
3. Cypher operator precedence in `getGraphVisualization` — the label `OR` chain needed parentheses
   before the `AND` on the state filter.

---

## 8. Verification

```bash
cd /Users/vonners/DevProjects/HackSF
node scripts/check-resolver.js      # four demo scenarios — run this first after any change
node scripts/reset-demo.js          # clear knowledge gaps so the demo starts clean
```

Once the server exists:
- `npm run dev` → `/api/health` green per provider
- `POST /api/graph/schema` then `POST /api/graph/sync` → `GET /api/graph/status` shows expected
  node counts per label
- `GET /api/context/resolve?caseId=…` returns a benefit stack with a `sourceId` on every element;
  spot-check one against the loaded JSON by hand
- Speak into the mic → transcript renders both sides; request below floor → stage moves to
  `customer_on_hold`; approve a *different* amount → the spoken figure matches it
- Flag a gap → ratify → run call 2 → the program appears. Confirm Guild logged **two** distinct
  governed actions
- Run the full journey three times without a restart

---

## 9. Pitch

> A rep at a multi-state utility cannot hold 50 states of shutoff rules, LIHEAP tiers, and
> arrearage-forgiveness schedules in their head — so eligible customers don't get offered money
> they're already entitled to. Vocare resolves jurisdiction and benefit stacking in a context
> graph, calls the customer, and turns the collections process into a benefits-enrolment process.
> Every fact is cited. Every action crosses a governed authority boundary. And when the agent
> hits something it doesn't know, it says so, a human ratifies the answer, and the next call
> already has it.

Close on the audit document: *the transcript is not the output — the output is a governed
customer outcome with every fact, decision, human intervention and system action accounted for.*

### Presentation navigation (slide-style)
The React frontend advances **manually**, not on timers — for presenting at your own pace:
- **Next button** (bottom-right pill), **→ / Space / Enter** advance; **← / ‹** go back.
- Each step only lets you advance once its content is ready (`canAdvance`); the pill shows the
  next action ("Begin the call", "See the outcome", etc.).
- The credit-approval modal still appears **reactively** when the agent escalates (derived from
  `case.stage === 'awaiting_credit_officer'`), independent of the slide.
- Implemented in `frontend/src/App.tsx` (goNext/goBack + keydown). The outer AnimatePresence was
  removed — each stage fades in on mount and unmounts instantly, so a re-render mid-transition
  can't deadlock (an earlier mode="wait" version could).

### ⚠️ Running the server for a demo
`node src/server.js` started from a short-lived shell gets SIGTERM'd when that shell ends, which
breaks the UI mid-flow (a hung fetch leaves the frontend's busy-guard stuck). Start it detached:
`nohup node src/server.js > /tmp/vocare-server.log 2>&1 & disown`
