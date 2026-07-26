/**
 * Authority and affordability rules.
 *
 * These are server-side clamps, not prompt instructions. The model cannot talk
 * its way past them, and a judge probing "what stops it pressuring someone?"
 * gets pointed here rather than at a system prompt.
 */

export const HOLD_MESSAGE =
  "Hmm, let me try to figure something out for you — one moment please.";

/**
 * Can the agent agree this amount on its own authority?
 *
 * Two boundaries, and they cut in opposite directions:
 *   floor    — below it, a credit officer must approve (protects the utility)
 *   ceiling  — above it, the agent must NOT go, because the engine computed
 *              this household's income cap (protects the customer)
 */
export function checkAuthority(stack, requestedAmount) {
  const { authorityFloor, affordabilityCeiling, authoritySourceId, requiresRole, requiresLevel } =
    stack.boundaries;

  if (affordabilityCeiling !== null && requestedAmount > affordabilityCeiling) {
    return {
      outcome: 'exceeds_affordability',
      allowed: false,
      requiresApproval: false,
      requestedAmount,
      ceiling: affordabilityCeiling,
      sourceId: stack.boundaries.affordabilitySourceId,
      reason: `$${requestedAmount} is above this household's computed affordability cap of $${affordabilityCeiling}. The agent may not agree it and may not propose it.`
    };
  }

  if (requestedAmount >= authorityFloor) {
    return {
      outcome: 'within_authority',
      allowed: true,
      requiresApproval: false,
      requestedAmount,
      floor: authorityFloor,
      sourceId: authoritySourceId,
      reason: `$${requestedAmount} is at or above the $${authorityFloor} delegated floor.`
    };
  }

  return {
    outcome: 'below_floor',
    allowed: false,
    requiresApproval: true,
    requestedAmount,
    floor: authorityFloor,
    sourceId: authoritySourceId,
    requiresRole,
    requiresLevel,
    reason: `$${requestedAmount} is below the $${authorityFloor} delegated floor and requires ${requiresRole} approval at ${requiresLevel} or above.`
  };
}

/** Is this officer permitted to make this decision? */
export function validateOfficerAuthority(officer, stack) {
  const required = stack.boundaries.requiresLevel || 'L2';
  const level = (n) => Number(String(n).replace(/[^0-9]/g, '')) || 0;

  const roleOk = (officer.role || 'credit_officer') === stack.boundaries.requiresRole;
  const levelOk = level(officer.authority) >= level(required);

  return {
    valid: roleOk && levelOk,
    roleOk,
    levelOk,
    required: { role: stack.boundaries.requiresRole, level: required },
    presented: { role: officer.role || 'credit_officer', level: officer.authority },
    reason: roleOk && levelOk
      ? `${officer.name} holds ${officer.authority} ${officer.role || 'credit_officer'} authority.`
      : `${officer.name} does not hold the required ${required} ${stack.boundaries.requiresRole} authority.`
  };
}

/**
 * The officer can go below the floor, but not above the affordability ceiling
 * either — the clamp protects the customer from everyone, including the human.
 */
export function clampApprovedAmount(stack, amount) {
  const ceiling = stack.boundaries.affordabilityCeiling;
  if (ceiling !== null && amount > ceiling) {
    return {
      amount: ceiling,
      clamped: true,
      reason: `Requested approval of $${amount} exceeds the household affordability cap of $${ceiling}; clamped to the cap.`
    };
  }
  return { amount, clamped: false, reason: null };
}

// ── decision traces (what the UI shows instead of chain-of-thought) ───

const usd = (n) =>
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2
  });

export function benefitTrace(stack) {
  const unlocked = stack.totals.benefitsUnlocked;
  return {
    title: unlocked > 0 ? 'Benefit package resolved' : 'No benefit eligibility resolved',
    conclusion:
      unlocked > 0
        ? `$${usd(unlocked)} in benefits is available to this household, against arrears of $${usd(stack.totals.arrears)}.`
        : `No state or federal program resolves for this household in ${stack.jurisdiction.state.name}.`,
    evidence: stack.eligible.map((e) => ({
      sourceId: e.sourceId,
      statement: `${e.name} — ${e.checks.map((c) => c.detail).join(' ')}`
    })),
    authority: {
      sourceId: stack.jurisdiction.pucRule.sourceId,
      rule: stack.jurisdiction.pucRule.citation
    },
    nextAction:
      unlocked > 0
        ? 'Offer the package and ask what monthly amount is sustainable.'
        : 'Offer the standard deferred payment arrangement.',
    confidence: 1
  };
}

export function jurisdictionTrace(jurisdiction) {
  return {
    title: 'Jurisdiction resolved',
    conclusion: `${jurisdiction.state.name} rules apply. Disconnection protection is ${
      jurisdiction.protectedFromDisconnection ? 'ACTIVE' : 'not active'
    } today.`,
    evidence: jurisdiction.moratoria.map((m) => ({
      sourceId: m.sourceId,
      statement: `${m.label}: ${m.reason}`
    })),
    authority: { sourceId: jurisdiction.pucRule.sourceId, rule: jurisdiction.pucRule.citation },
    nextAction: jurisdiction.protectedFromDisconnection
      ? 'Tell the customer they are protected from disconnection today before discussing payment.'
      : 'Proceed to benefit resolution.',
    confidence: 1
  };
}

export function authorityTrace(check, stack) {
  return {
    title: check.requiresApproval ? 'Human authority required' : 'Within delegated authority',
    conclusion: check.reason,
    evidence: [
      {
        sourceId: `CALL-${stack.caseId}`,
        statement: `Customer requested $${check.requestedAmount} per month.`
      }
    ],
    authority: {
      sourceId: check.sourceId,
      rule: check.requiresApproval
        ? `Amounts below $${check.floor} require ${check.requiresRole} approval at ${check.requiresLevel}.`
        : `Agent may agree amounts at or above $${check.floor}.`
    },
    nextAction: check.requiresApproval
      ? 'Place the customer on hold and request one consolidated approval.'
      : 'Confirm the arrangement with the customer.',
    confidence: 1
  };
}
