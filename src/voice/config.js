/**
 * Azure AI Foundry realtime (gpt-realtime-2.1) connection config.
 *
 * The user added the endpoint/key under AZURE_NEW_* — we read those first and
 * fall back to the AZURE_REALTIME_* names the plan originally reserved.
 */
export function realtimeConfig() {
  const endpoint = process.env.AZURE_NEW_ENDPOINT || process.env.AZURE_REALTIME_ENDPOINT || '';
  const apiKey = process.env.AZURE_NEW_KEY || process.env.AZURE_REALTIME_API_KEY || '';
  const deployment =
    process.env.AZURE_NEW_DEPLOYMENT || process.env.AZURE_REALTIME_DEPLOYMENT || 'gpt-realtime-2.1';
  const apiVersion = process.env.AZURE_REALTIME_API_VERSION || '2025-04-01-preview';

  const configured = Boolean(endpoint && apiKey);
  let url = '';
  if (configured) {
    const host = new URL(endpoint).host;
    url = `wss://${host}/openai/realtime?api-version=${apiVersion}&deployment=${encodeURIComponent(deployment)}`;
  }

  return { configured, url, apiKey, deployment };
}

/** The agent's instructions. Guardrails live in the state machine, not here. */
export function systemPrompt(context) {
  const stack = context?.stack;
  const name = stack?.customerName || 'the customer';
  const state = stack?.jurisdiction?.state?.name || 'their state';

  return `You are Vocare, an outbound support agent calling on behalf of Meridian Energy, a US utility.

You are speaking with ${name}, who has fallen behind on their electricity bill in ${state}.

Your purpose is NOT to collect money. It is to enrol the customer in every benefit they are
entitled to and to agree a payment they can actually sustain. Treat this as a benefits-enrolment
call, not a collections call.

You are also acting as a real-time compliance officer. Every decision you help reach is checked
against the customer's state Public Utility Commission rules and produces an auditable record
mapped to the specific statute. You do not approve anything the rules do not allow.

How to run the call:
1. Open warmly. Make clear you are not chasing payment.
2. If the customer is protected from disconnection today, tell them plainly that you are placing a
   hold on any shutoff of their service under their state's rules — this is an action you are
   taking, not just information. It removes fear and it is the first compliance determination.
3. Conduct the intake: gently establish household size and household income — you need both to
   check eligibility. Also listen for disability, dependents, or medical needs.
4. When they disclose something that changes their situation, call resolve_benefit_stack with the
   new household size and income so the engine can re-check eligibility.
5. Proactively explain the benefits they qualify for. They should not have to know which program
   to ask for.
6. Ask what monthly amount is genuinely sustainable.
7. If the customer mentions a program you do not have details for, DO NOT guess or promise
   anything. Say you will confirm and follow up, and call flag_knowledge_gap.

Rules — these are enforced by the system regardless of what you say, but follow them anyway:
- Never pressure the customer toward an amount they say they cannot afford.
- Never claim an account action succeeded before a tool returns success.
- If the customer asks for an amount and you are unsure it is within your authority, call
  request_credit_approval. If it needs a human, the system will place the customer on hold; tell
  them warmly that you are checking the lowest sustainable amount and to hold a moment.
- After a decision comes back, explain the approved amount and the benefits plainly.
- Only call confirm_plan after the customer has clearly agreed, out loud.
- If the customer asks to speak to a human at any point, call transfer_to_human immediately with
  no attempt to keep them.
- Keep replies short and natural — this is a phone call, not an email.`;
}

/** The tool surface exposed to the model. Never direct CRM or payment access. */
export const TOOLS = [
  {
    type: 'function',
    name: 'resolve_benefit_stack',
    description:
      'Re-resolve the customer\'s eligible benefits after they disclose new household or income information. Returns the benefits they qualify for and the sustainable monthly payment.',
    parameters: {
      type: 'object',
      properties: {
        householdSize: { type: 'integer', description: 'Number of people in the household.' },
        annualIncome: { type: 'number', description: 'Approximate gross annual household income in dollars.' },
        disclosures: {
          type: 'array',
          items: { type: 'string' },
          description: 'Short phrases capturing what the customer disclosed, e.g. "hours cut in April".'
        }
      },
      required: ['householdSize', 'annualIncome']
    }
  },
  {
    type: 'function',
    name: 'flag_knowledge_gap',
    description:
      'Record that the customer mentioned a support program you do not have details for. Use this instead of guessing. Does not promise the customer anything.',
    parameters: {
      type: 'object',
      properties: {
        programMentioned: { type: 'string', description: 'The program the customer named.' },
        customerQuote: { type: 'string', description: 'The customer\'s own words, verbatim if possible.' }
      },
      required: ['programMentioned', 'customerQuote']
    }
  },
  {
    type: 'function',
    name: 'request_credit_approval',
    description:
      'Request authority to agree a monthly payment. If the amount is within your delegated authority it is approved immediately; if it is below the floor, the customer is placed on hold for a credit officer. Call this once, then wait.',
    parameters: {
      type: 'object',
      properties: {
        requestedAmount: { type: 'number', description: 'The monthly amount the customer asked for.' },
        summary: { type: 'string', description: 'One or two sentences on the customer\'s situation for the officer.' }
      },
      required: ['requestedAmount', 'summary']
    }
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: 'Immediately transfer the customer to a human agent. Use the moment they ask.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason']
    }
  },
  {
    type: 'function',
    name: 'confirm_plan',
    description:
      'Confirm the agreed arrangement and submit the benefit applications. Only call after the customer has clearly agreed out loud.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The agreed monthly amount.' },
        customerConsent: { type: 'boolean', description: 'True only if the customer explicitly agreed.' }
      },
      required: ['amount', 'customerConsent']
    }
  }
];
