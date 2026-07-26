import crypto from 'node:crypto';

/**
 * Sandbox execution adapters.
 *
 * These are explicitly labelled simulations, never presented as production
 * integrations. Each returns an event that lands in the audit record.
 */

const SYSTEMS = {
  crm: { system: 'crm-sandbox', label: 'CRM Sandbox' },
  disconnect: { system: 'disconnection-sandbox', label: 'Disconnection Control Sandbox' },
  paymentPlan: { system: 'payment-plan-sandbox', label: 'Payment Arrangement Sandbox' },
  benefitIntake: { system: 'benefit-intake-sandbox', label: 'Benefit Intake Sandbox' },
  email: { system: 'email-sandbox', label: 'Email Sandbox' }
};

function event(kind, action, detail) {
  return {
    eventId: `evt_${crypto.randomBytes(5).toString('hex')}`,
    system: SYSTEMS[kind].system,
    label: SYSTEMS[kind].label,
    action,
    status: 'success',
    simulated: true,
    detail,
    timestamp: new Date().toISOString()
  };
}

export async function updateCrm({ customerId, householdSize, annualIncome, hardshipCase }) {
  return event('crm', 'customer_context_updated', {
    customerId,
    householdSize,
    annualIncome,
    activeHardshipCase: hardshipCase
  });
}

export async function placeDisconnectionHold({ customerId, basis }) {
  return event('disconnect', 'shutoff_hold_placed', {
    customerId,
    // The statute the hold rests on — this is the compliance paper trail.
    statuteSourceIds: basis.map((b) => b.sourceId),
    reason: basis.map((b) => b.reason).join(' '),
    holdActive: true
  });
}

export async function createPaymentPlan({ customerId, amount, frequency = 'monthly', termMonths }) {
  return event('paymentPlan', 'payment_arrangement_created', {
    customerId,
    amount,
    frequency,
    termMonths,
    collectionsPaused: true,
    lateFeesWaived: true
  });
}

export async function submitBenefitIntake({ customerId, program }) {
  return event('benefitIntake', 'benefit_application_submitted', {
    customerId,
    programId: program.id,
    programName: program.name,
    agency: program.intakeVia?.name || null,
    channel: program.intakeVia?.channel || null,
    estimatedValue: program.estimatedValue ?? null
  });
}

export async function sendEmail({ customerId, subject, benefits, amount }) {
  return event('email', 'confirmation_email_sent', {
    customerId,
    subject,
    amount,
    benefitsIncluded: benefits
  });
}

/** Runs the full execution sequence for an agreed package. */
export async function executePackage({ stack, amount }) {
  const results = [];

  results.push(
    await updateCrm({
      customerId: stack.customerId,
      householdSize: stack.household.size,
      annualIncome: stack.household.annualIncome,
      hardshipCase: true
    })
  );

  // Compliance determination: if the customer is protected from disconnection
  // under the applicable PUC rule today, place an actual hold — do not merely
  // note it. This is the enforceable side of the deterministic policy graph.
  if (stack.jurisdiction.protectedFromDisconnection && stack.jurisdiction.protectionBasis.length) {
    results.push(
      await placeDisconnectionHold({
        customerId: stack.customerId,
        basis: stack.jurisdiction.protectionBasis
      })
    );
  }

  for (const program of stack.eligible) {
    results.push(await submitBenefitIntake({ customerId: stack.customerId, program }));
  }

  results.push(
    await createPaymentPlan({
      customerId: stack.customerId,
      amount,
      termMonths: stack.deferredArrangement?.maxTermMonths ?? 12
    })
  );

  results.push(
    await sendEmail({
      customerId: stack.customerId,
      subject: 'Your payment arrangement and benefit applications',
      benefits: stack.eligible.map((e) => e.name),
      amount
    })
  );

  return results;
}
