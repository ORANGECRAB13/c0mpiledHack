// Vocare — Arrearage Authority Agent
//
// Governed action type 1 of 2: approving a hardship payment amount.
//
// A voice agent negotiating with a customer in arrears may only agree amounts
// at or above a state-specific delegated floor. Below that floor, a credit
// officer must decide. This agent is the gate.
//
// It deliberately does NOT recompute eligibility or policy. The deterministic
// resolver lives in the Vocare context engine and is the single source of
// truth; duplicating it here would let the two copies disagree on stage.
// This agent's job is authority: who may decide what, and on what evidence.

"use agent";

import { type Task, agent, consoleTools, pick } from "@guildai/agents-sdk";
import { VocareArrearageApiTools } from "@guildai-services/orangecrab13~vocare-arrearage-api";
import { z } from "zod";

const inputSchema = z.object({
  caseId: z.string().describe("The Vocare case under negotiation, e.g. C-20481."),
  requestedAmount: z
    .number()
    .positive()
    .describe("The monthly amount the customer asked for, in dollars."),
  officer: z
    .object({
      id: z.string().describe("Officer identifier."),
      name: z.string().describe("Officer full name."),
      role: z
        .string()
        .default("credit_officer")
        .describe("Officer role. Must match the role the policy requires."),
      authority: z.string().describe("Officer authority level, e.g. L1, L2, L3."),
    })
    .describe("The human who is making this decision."),
  approvedAmount: z
    .number()
    .positive()
    .optional()
    .describe("The amount the officer wishes to approve. Defaults to the requested amount."),
  instruction: z
    .string()
    .optional()
    .describe("Instruction to pass back to the voice agent on resume."),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  outcome: z
    .enum([
      "within_authority",
      "approved",
      "rejected_officer_authority",
      "exceeds_affordability",
      "not_pending",
    ])
    .describe("What happened."),
  approvedAmount: z
    .number()
    .nullable()
    .describe("The amount finally recorded, after any affordability clamp."),
  clamped: z
    .boolean()
    .describe("True when the approved amount was reduced to the household affordability cap."),
  authorityFloor: z.number().nullable(),
  affordabilityCeiling: z.number().nullable(),
  reason: z.string().describe("Human-readable explanation of the outcome."),
  citations: z.array(z.string()).describe("Source identifiers backing this decision."),
});

type Output = z.infer<typeof outputSchema>;

const tools = {
  ...pick(VocareArrearageApiTools, [
    "vocare_arrearage_api_case_get",
    "vocare_arrearage_api_approval_decide",
  ]),
  ...consoleTools,
};

type Tools = typeof tools;

/** Pure and synchronous — stays off the state machine and is unit-testable. */
function describeBoundaries(
  floor: number | null,
  ceiling: number | null,
  requested: number,
): string {
  const parts: string[] = [`Customer requested $${requested}/month.`];
  if (floor !== null) parts.push(`Delegated floor is $${floor}.`);
  if (ceiling !== null) parts.push(`Affordability cap is $${ceiling}.`);
  return parts.join(" ");
}

async function run(
  { caseId, requestedAmount, officer, approvedAmount, instruction }: Input,
  task: Task<Tools>,
): Promise<Output> {
  const caseResult = await task.tools.vocare_arrearage_api_case_get({ caseId });
  const kase = caseResult?.case;

  if (!kase) {
    return {
      outcome: "not_pending",
      approvedAmount: null,
      clamped: false,
      authorityFloor: null,
      affordabilityCeiling: null,
      reason: `No case found for ${caseId}.`,
      citations: [],
    };
  }

  const boundaries = kase.stack?.boundaries;
  const floor = boundaries?.authorityFloor ?? null;
  const ceiling = boundaries?.affordabilityCeiling ?? null;
  const citations = [boundaries?.authoritySourceId, boundaries?.affordabilitySourceId].filter(
    (id): id is string => typeof id === "string",
  );

  await task.console.log(
    `Case ${caseId} at stage ${kase.stage}. ${describeBoundaries(floor, ceiling, requestedAmount)}`,
  );

  // The agent could have agreed this itself — no human decision is warranted.
  if (floor !== null && requestedAmount >= floor) {
    return {
      outcome: "within_authority",
      approvedAmount: requestedAmount,
      clamped: false,
      authorityFloor: floor,
      affordabilityCeiling: ceiling,
      reason: `$${requestedAmount} is at or above the $${floor} delegated floor. No credit-officer decision is required.`,
      citations,
    };
  }

  const intended = approvedAmount ?? requestedAmount;

  // The affordability cap binds the human too. Refuse before writing anything.
  if (ceiling !== null && intended > ceiling) {
    return {
      outcome: "exceeds_affordability",
      approvedAmount: null,
      clamped: false,
      authorityFloor: floor,
      affordabilityCeiling: ceiling,
      reason: `$${intended} is above this household's computed affordability cap of $${ceiling}. It cannot be approved by anyone, at any authority level.`,
      citations,
    };
  }

  const decision = await task.tools.vocare_arrearage_api_approval_decide({
    caseId,
    decision: "approved",
    approvedAmount: intended,
    instruction: instruction ?? `Offer $${intended} with the full benefit package.`,
    officer: {
      id: officer.id,
      name: officer.name,
      role: officer.role,
      authority: officer.authority,
    },
  });

  if (decision?.ok === false) {
    return {
      outcome: "not_pending",
      approvedAmount: null,
      clamped: false,
      authorityFloor: floor,
      affordabilityCeiling: ceiling,
      reason: decision.error ?? "The case is not awaiting a credit-officer decision.",
      citations,
    };
  }

  if (decision?.accepted === false) {
    return {
      outcome: "rejected_officer_authority",
      approvedAmount: null,
      clamped: false,
      authorityFloor: floor,
      affordabilityCeiling: ceiling,
      reason:
        decision.validation?.reason ??
        `${officer.name} does not hold the authority required to decide this case.`,
      citations,
    };
  }

  const finalAmount = decision?.approval?.approvedAmount ?? null;
  const clamped = decision?.approval?.clamped ?? false;

  await task.console.log(
    `Recorded: $${finalAmount} approved by ${officer.name} (${officer.authority})${clamped ? " — clamped to the affordability cap" : ""}.`,
  );

  return {
    outcome: "approved",
    approvedAmount: finalAmount,
    clamped,
    authorityFloor: floor,
    affordabilityCeiling: ceiling,
    reason: `${officer.name} (${officer.authority}) approved $${finalAmount}/month for case ${caseId}${clamped ? ", clamped to the household affordability cap" : ""}.`,
    citations,
  };
}

export default agent({
  inputSchema,
  outputSchema,
  tools,
  run,
});
