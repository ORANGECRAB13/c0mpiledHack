// Vocare — Knowledge Ratification Agent
//
// Governed action type 2 of 2: writing to ground truth.
//
// In a fifty-state regulatory landscape no knowledge base is ever complete.
// When the voice agent hears a customer mention a program it does not know
// about, it does not bluff — it flags a gap and says it will confirm and follow
// up. This agent is the governed write path that turns that gap into knowledge
// the resolver may use.
//
// The critical property: an OPEN gap is invisible to the resolver. Only after a
// human ratifies it, under a recorded authority, can the agent offer it to the
// next customer. That is the difference between human-in-the-loop knowledge
// acquisition and a system that teaches itself things nobody checked.

"use agent";

import { type Task, agent, consoleTools, pick } from "@guildai/agents-sdk";
import { VocareArrearageApiTools } from "@guildai-services/orangecrab13~vocare-arrearage-api";
import { z } from "zod";

const inputSchema = z.object({
  gapId: z
    .string()
    .optional()
    .describe(
      "The knowledge gap to ratify. If omitted, the single open gap is used, and the agent refuses when there is more than one.",
    ),
  ratifiedBy: z
    .string()
    .describe("Identity of the human ratifying this entry. Recorded permanently."),
  authority: z
    .string()
    .describe("The authority under which they are ratifying, e.g. 'L2 credit officer'."),
  caseId: z
    .string()
    .optional()
    .describe("The case on which the gap was raised, for the audit trail."),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Review the proposed entry without writing it."),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  outcome: z
    .enum(["ratified", "reviewed", "no_open_gaps", "ambiguous", "rejected_incomplete", "failed"])
    .describe("What happened."),
  gapId: z.string().nullable(),
  programId: z.string().nullable(),
  programName: z.string().nullable(),
  state: z.string().nullable(),
  customerQuote: z
    .string()
    .nullable()
    .describe("The customer's own words that raised this gap — the provenance of the entry."),
  ratifiedBy: z.string().nullable(),
  authority: z.string().nullable(),
  reason: z.string(),
});

type Output = z.infer<typeof outputSchema>;

const tools = {
  ...pick(VocareArrearageApiTools, [
    "vocare_arrearage_api_knowledge_gaps_list",
    "vocare_arrearage_api_knowledge_gap_ratify",
  ]),
  ...consoleTools,
};

type Tools = typeof tools;

type Gap = {
  id?: string;
  status?: string;
  state?: string;
  caseId?: string;
  programMentioned?: string;
  customerQuote?: string;
  proposedBy?: string;
  program?: { id?: string; name?: string; kind?: string; state?: string; sourceId?: string; citation?: string };
};

/**
 * A proposal is only ratifiable if it carries enough to be a real ground-truth
 * entry: an identity, a jurisdiction, a citation, and the customer's own words
 * as provenance. Pure and synchronous, so it stays off the state machine.
 */
function checkProposal(gap: Gap): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!gap.program?.id) missing.push("program id");
  if (!gap.program?.name) missing.push("program name");
  if (!gap.program?.state && !gap.state) missing.push("jurisdiction");
  if (!gap.program?.citation) missing.push("citation");
  if (!gap.customerQuote) missing.push("customer quote (provenance)");
  return { complete: missing.length === 0, missing };
}

async function run(
  { gapId, ratifiedBy, authority, caseId, dryRun }: Input,
  task: Task<Tools>,
): Promise<Output> {
  const empty = {
    gapId: null,
    programId: null,
    programName: null,
    state: null,
    customerQuote: null,
    ratifiedBy: null,
    authority: null,
  };

  const listed = await task.tools.vocare_arrearage_api_knowledge_gaps_list({ status: "open" });
  const open: Gap[] = (listed?.gaps ?? []) as Gap[];

  if (open.length === 0) {
    return { outcome: "no_open_gaps", ...empty, reason: "There are no open knowledge gaps to ratify." };
  }

  let gap: Gap | undefined;
  if (gapId) {
    gap = open.find((g) => g.id === gapId);
    if (!gap) {
      return {
        outcome: "no_open_gaps",
        ...empty,
        reason: `No open knowledge gap with id ${gapId}.`,
      };
    }
  } else if (open.length > 1) {
    return {
      outcome: "ambiguous",
      ...empty,
      reason: `${open.length} gaps are open. Specify which one to ratify: ${open.map((g) => g.id).join(", ")}.`,
    };
  } else {
    gap = open[0];
  }

  const resolvedState = gap.program?.state ?? gap.state ?? null;
  const details = {
    gapId: gap.id ?? null,
    programId: gap.program?.id ?? null,
    programName: gap.program?.name ?? null,
    state: resolvedState,
    customerQuote: gap.customerQuote ?? null,
  };

  await task.console.log(
    `Reviewing gap ${gap.id}: "${gap.programMentioned}" in ${resolvedState}, raised by ${gap.proposedBy}.`,
  );

  const check = checkProposal(gap);
  if (!check.complete) {
    return {
      outcome: "rejected_incomplete",
      ...details,
      ratifiedBy: null,
      authority: null,
      reason: `The proposed entry cannot be ratified — it is missing: ${check.missing.join(", ")}. Ground truth requires a citable, jurisdiction-scoped definition.`,
    };
  }

  if (dryRun) {
    return {
      outcome: "reviewed",
      ...details,
      ratifiedBy: null,
      authority: null,
      reason: `Proposal is complete and ready for ratification: ${gap.program?.name} (${gap.program?.citation}). Nothing was written.`,
    };
  }

  const result = await task.tools.vocare_arrearage_api_knowledge_gap_ratify({
    gapId: gap.id as string,
    ratifiedBy,
    authority,
    caseId: caseId ?? gap.caseId,
  });

  if (result?.ok === false) {
    return {
      outcome: "failed",
      ...details,
      ratifiedBy: null,
      authority: null,
      reason: result.error ?? "The ratification write failed.",
    };
  }

  await task.console.log(
    `Ratified by ${ratifiedBy} (${authority}). ${gap.program?.name} is now resolvable for ${resolvedState}.`,
  );

  return {
    outcome: "ratified",
    ...details,
    ratifiedBy,
    authority,
    reason: `${gap.program?.name} was ratified by ${ratifiedBy} under ${authority} and is now available to the resolver for ${resolvedState}. The next customer in that state will be offered it.`,
  };
}

export default agent({
  inputSchema,
  outputSchema,
  tools,
  run,
});
