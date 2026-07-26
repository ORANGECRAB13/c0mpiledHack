import { z } from 'zod';

/** The stages a case moves through. The state machine owns this, never the model. */
export const CASE_STAGES = [
  'ready',
  'assembling_context',
  'calling',
  'benefits_resolved',
  'customer_on_hold',
  'awaiting_credit_officer',
  'resuming_call',
  'customer_accepted',
  'executing',
  'complete',
  'failed'
];

export const EVENT_TYPES = [
  'case.started',
  'context.source_resolved',
  'context.semantic_retrieved',
  'context.assembled',
  'call.started',
  'call.transcript_received',
  'context.fact_confirmed',
  'benefits.resolved',
  'knowledge.gap_flagged',
  'knowledge.gap_ratified',
  'approval.requested',
  'approval.delivered',
  'approval.decided',
  'approval.validated',
  'call.held',
  'call.resumed',
  'customer.consented',
  'handoff.requested',
  'execution.started',
  'execution.action_succeeded',
  'execution.action_failed',
  'audit.generated',
  'case.completed',
  'case.failed'
];

export const vocareEvent = z.object({
  id: z.string(),
  caseId: z.string(),
  type: z.enum(EVENT_TYPES),
  actor: z.object({
    type: z.enum(['customer', 'agent', 'human', 'system']),
    id: z.string()
  }),
  timestamp: z.string(),
  payload: z.record(z.unknown()).default({}),
  sourceIds: z.array(z.string()).optional(),
  authorityIds: z.array(z.string()).optional()
});

/** What the UI renders instead of raw chain-of-thought. */
export const decisionTrace = z.object({
  title: z.string(),
  conclusion: z.string(),
  evidence: z.array(z.object({ sourceId: z.string(), statement: z.string() })),
  authority: z.object({ sourceId: z.string(), rule: z.string() }).optional(),
  nextAction: z.string(),
  confidence: z.number().min(0).max(1)
});

export const approvalRequest = z.object({
  caseId: z.string(),
  customerRequestedAmount: z.number().positive(),
  recommendedAmount: z.number().positive(),
  summary: z.string(),
  benefitStack: z.unknown().optional()
});

export const approvalDecision = z.object({
  caseId: z.string(),
  decision: z.enum(['approved', 'declined']),
  approvedAmount: z.number().positive().optional(),
  instruction: z.string().optional(),
  officer: z.object({
    id: z.string(),
    name: z.string(),
    role: z.string().default('credit_officer'),
    authority: z.string()
  })
});

export const planConfirmation = z.object({
  caseId: z.string(),
  amount: z.number().positive(),
  benefitIds: z.array(z.string()).default([]),
  customerConsent: z.literal(true, {
    errorMap: () => ({ message: 'Explicit customer consent is required before any account change.' })
  })
});
