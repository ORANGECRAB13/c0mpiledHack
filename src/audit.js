import crypto from 'node:crypto';

/**
 * The audit document.
 *
 * Built from the deterministic event log alone. A model-generated summary is
 * attached when Pioneer is available, but the record must be complete and
 * defensible without it.
 */
export async function buildAudit(state, events, cited) {
  const stack = state.stack;
  // Only the individual actions — 'execution.started' is a lifecycle marker, not an action.
  const executionEvents = events.filter(
    (e) => e.type === 'execution.action_succeeded' || e.type === 'execution.action_failed'
  );

  const audit = {
    header: {
      auditId: `AUD-${state.caseId}-${crypto.randomBytes(3).toString('hex')}`,
      caseId: state.caseId,
      customer: stack?.customerName || state.customerId,
      customerId: state.customerId,
      utility: 'Meridian Energy',
      state: stack?.jurisdiction.state.name || null,
      generatedAt: new Date().toISOString(),
      synthetic: true,
      syntheticNotice: 'Synthetic data. No real customer, account, or regulatory determination is represented.'
    },

    jurisdiction: stack
      ? {
          state: stack.jurisdiction.state,
          pucRule: {
            sourceId: stack.jurisdiction.pucRule.sourceId,
            citation: stack.jurisdiction.pucRule.citation
          },
          protectedFromDisconnection: stack.jurisdiction.protectedFromDisconnection,
          protectionBasis: stack.jurisdiction.protectionBasis,
          moratoriaEvaluated: stack.jurisdiction.moratoria.map((m) => ({
            sourceId: m.sourceId,
            label: m.label,
            active: m.active,
            reason: m.reason
          }))
        }
      : null,

    customerContext: stack
      ? {
          arrears: stack.account.arrears,
          declaredHousehold: {
            size: stack.household.declaredSize,
            annualIncome: stack.household.declaredAnnualIncome
          },
          confirmedHousehold: {
            size: stack.household.size,
            annualIncome: stack.household.annualIncome,
            changedOnCall: stack.household.changedOnCall
          },
          disclosures: stack.household.disclosures,
          records: [
            stack.account.invoice?.id,
            stack.account.payment?.id,
            ...(stack.account.notes || []).map((n) => n.id)
          ].filter(Boolean)
        }
      : null,

    benefitPackage: stack
      ? {
          eligible: stack.eligible.map((e) => ({
            id: e.id,
            kind: e.kind,
            name: e.name,
            sourceId: e.sourceId,
            citation: e.citation,
            intake: e.intakeVia?.name || null,
            estimatedValue: e.estimatedValue ?? null,
            cappedMonthlyPayment: e.cappedMonthlyPayment ?? null,
            ratified: e.ratified ?? true,
            criteriaEvaluated: e.checks
          })),
          notEligible: stack.ineligible.map((e) => ({
            id: e.id,
            name: e.name,
            sourceId: e.sourceId,
            failedOn: e.failedOn
          })),
          totals: stack.totals
        }
      : null,

    conversation: {
      mode: state.mode || null,
      sessionId: state.sessionId || null,
      turns: state.transcript.length,
      transcript: state.transcript
    },

    decisions: state.traces.map((t) => ({
      title: t.title,
      conclusion: t.conclusion,
      authority: t.authority || null,
      evidence: t.evidence,
      at: t.at
    })),

    authorityBoundary: stack
      ? {
          floorAmount: stack.boundaries.authorityFloor,
          sourceId: stack.boundaries.authoritySourceId,
          requiresRole: stack.boundaries.requiresRole,
          requiresLevel: stack.boundaries.requiresLevel,
          affordabilityCeiling: stack.boundaries.affordabilityCeiling,
          affordabilitySourceId: stack.boundaries.affordabilitySourceId
        }
      : null,

    approval: state.approval
      ? {
          requestedAmount: state.approval.requestedAmount,
          recommendedAmount: state.approval.recommendedAmount,
          approvedAmount: state.approval.approvedAmount ?? null,
          clamped: state.approval.clamped ?? false,
          status: state.approval.status,
          officer: state.approval.officer || null,
          authorityValidation: state.approval.validation || null,
          delivery: state.approval.delivery || null,
          requestedAt: state.approval.requestedAt,
          decidedAt: state.approval.decidedAt || null
        }
      : null,

    knowledgeActions: events
      .filter((e) => e.type.startsWith('knowledge.'))
      .map((e) => ({ type: e.type, at: e.timestamp, actor: e.actor, ...e.payload })),

    // Explicit, statute-cited determinations — the compliance paper trail. Every
    // line maps an outcome to the specific rule that authorises it.
    complianceDeterminations: buildDeterminations(state, events),

    consent: {
      captured: events.some((e) => e.type === 'customer.consented'),
      agreedAmount: state.agreed?.amount ?? null,
      benefitIds: state.agreed?.benefitIds ?? [],
      at: events.find((e) => e.type === 'customer.consented')?.timestamp || null
    },

    execution: executionEvents.map((e) => ({
      eventId: e.payload.eventId,
      system: e.payload.system,
      action: e.payload.action,
      status: e.payload.status,
      simulated: true,
      timestamp: e.timestamp
    })),

    integrity: {
      eventCount: events.length,
      firstEventAt: events[0]?.timestamp || null,
      lastEventAt: events[events.length - 1]?.timestamp || null,
      sourceIds: cited.sourceIds,
      authorityIds: cited.authorityIds,
      checksum: crypto.createHash('sha256').update(JSON.stringify(events)).digest('hex').slice(0, 32)
    },

    events
  };

  return audit;
}

/**
 * Reduces the case to a list of legal determinations, each bound to a statute.
 * This is what makes the decision auditable rather than probabilistic.
 */
function buildDeterminations(state, events) {
  const stack = state.stack;
  if (!stack) return [];
  const determinations = [];

  if (stack.jurisdiction.protectedFromDisconnection) {
    for (const basis of stack.jurisdiction.protectionBasis) {
      determinations.push({
        determination: 'Disconnection prohibited',
        outcome: events.some((e) => e.payload?.action === 'shutoff_hold_placed')
          ? 'Shutoff hold placed on account'
          : 'Protection applies',
        basis: basis.reason,
        statute: basis.sourceId
      });
    }
  }

  for (const program of stack.eligible) {
    determinations.push({
      determination: `Benefit approved: ${program.name}`,
      outcome:
        program.kind === 'PIPP'
          ? `Monthly bill capped at $${program.cappedMonthlyPayment}`
          : `$${Number(program.estimatedValue || 0).toLocaleString()} toward arrears`,
      basis: `Household of ${stack.household.size}, income $${Number(stack.household.annualIncome).toLocaleString()} — eligibility criteria met`,
      statute: program.sourceId
    });
  }

  if (state.approval?.status === 'approved') {
    determinations.push({
      determination: 'Payment arrangement authorised',
      outcome: `$${state.approval.approvedAmount}/month${state.approval.clamped ? ' (clamped to affordability cap)' : ''}`,
      basis: `${state.approval.officer?.name} (${state.approval.officer?.authority}) — authority validated`,
      statute: stack.boundaries.authoritySourceId
    });
  }

  return determinations;
}
