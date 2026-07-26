import { api } from './api';

// The scripted customer for the reliable demo path. Every line drives the SAME
// real backend the live-mic path uses — only the audio input is replaced.

type Say = (speaker: 'agent' | 'customer', text: string, pauseMs?: number) => Promise<void>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Phase 1: greeting → disclosure (benefits unlock) → knowledge gap → ask below
 * floor → hold. Stops with the customer on hold for the officer.
 */
export async function runPhase1(caseId: string, say: Say, refresh: () => Promise<void>) {
  await say(
    'agent',
    "Hi Von, this is Vocare calling for Meridian Energy. I'm not chasing payment — I'm calling because you may qualify for support you haven't been offered. Is now okay?"
  );
  await say('customer', "I suppose so. I've been dreading this call.");
  await say(
    'agent',
    "I understand. First — under Illinois rules you're protected from disconnection today, so I'm placing a hold on any shutoff of your service. Nothing happens while we talk. Can I ask what changed?"
  );
  await say('customer', 'My hours at the clinic were cut back in April.');
  await say('customer', 'And my daughter moved in with me, with her two kids.');

  const result = await api.disclosure(caseId, {
    householdSize: 5,
    annualIncome: 34000,
    disclosures: ['hours cut at the clinic in April', 'daughter and two grandchildren moved in']
  });
  await refresh();
  await wait(1400);

  const unlocked = `$${Number(result.after.benefitsUnlocked).toLocaleString()}`;
  await say(
    'agent',
    `That changes everything. Our records still had you as a household of two. With five people and your income, you qualify for ${unlocked} in support — a crisis grant that clears most of the balance now, and a credit for the rest.`
  );
  await say(
    'customer',
    "I had no idea. My neighbour got something from the township office, not the state — is that the same?"
  );

  await api.flagGap(caseId, {
    programMentioned: 'Township General Assistance energy supplement',
    customerQuote: 'My neighbour got something from the township office, not the state.',
    program: {
      id: 'TOWNSHIP-GA-IL',
      kind: 'GRANT',
      state: 'IL',
      name: 'Illinois Township General Assistance energy supplement',
      sourceId: 'TOWNSHIP-GA-IL-2026',
      citation: 'Illinois Township Code — General Assistance emergency energy aid',
      administeredBy: 'Township supervisor',
      intakeVia: {
        agencyId: 'AGENCY-IL-TOWNSHIP',
        name: 'Township supervisor office',
        channel: 'township_general_assistance'
      },
      effectiveFrom: '2025-10-01',
      criteria: [
        { id: 'IL-TGA-INCOME', kind: 'income_percent_fpl', comparator: 'lte', value: 200, text: 'Household income at or below 200% FPL.' }
      ],
      tiers: [
        { id: 'TGA-REGULAR', kind: 'regular', name: 'Emergency energy supplement', maxBenefit: 400, text: 'One-time township aid.' }
      ]
    }
  });
  await refresh();
  await say(
    'agent',
    "That's a different program and I don't have the details in front of me — I won't guess. I've flagged it for a specialist to confirm, and we'll follow up. Let's get the ones I'm certain about moving."
  );
  await say('agent', 'Your monthly payment would be capped at $170 — six percent of your income. Does that work?');
  await say('customer', "That's still more than I've got. I could manage a hundred and twenty. I don't want to agree to something I'll miss again.");

  const approval = await api.requestApproval(caseId, {
    requestedAmount: 120,
    summary:
      'Household of five on reduced income. Benefits cover the full arrears. Customer states $120/month is sustainable and is explicit about not over-committing.'
  });
  if (approval.held) {
    await say('agent', approval.holdMessage, 500);
    await refresh();
  }
  return approval;
}

/** Phase 2: after the officer decides, resume on the same session and close. */
export async function runPhase2(
  caseId: string,
  approvedAmount: number,
  benefitNames: string[],
  benefitIds: string[],
  unlocked: number,
  say: Say,
  refresh: () => Promise<void>
) {
  await say(
    'agent',
    `Thanks for holding. I've had that approved — we can do $${approvedAmount} a month. And the $${unlocked.toLocaleString()} in support still applies: collections paused, late fees waived, and I'll submit the applications for you.`
  );
  await say('customer', `$${approvedAmount} I can actually manage. Yes, let's do that.`);

  await api.consent(caseId, { amount: approvedAmount, benefitIds, customerConsent: true });
  await refresh();
  await api.execute(caseId);
  await refresh();

  await say(
    'agent',
    `All set. ${benefitNames.join(', ')} are submitted, and you'll get written confirmation today. Nothing more for you to do.`
  );
}

export { wait };
