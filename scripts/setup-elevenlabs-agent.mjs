import { config } from 'dotenv';
config({ path: '.env.local' });

const key = process.env.NEW_ELEVENLABS_API_KEY;
const agentId = process.env.NEW_ELEVENLABS_AGENT;
const H = { 'xi-api-key': key, 'content-type': 'application/json' };

// The five client tools. The server bridge handles each client_tool_call by
// running the deterministic workflow (runVoiceTool) and returning the result.
const tools = [
  {
    type: 'client', name: 'resolve_benefit_stack', expects_response: true, response_timeout_secs: 20,
    description: "Re-resolve the customer's eligible benefits after they disclose new household or income information. Returns the benefits they qualify for and the sustainable monthly payment. Call this whenever the customer reveals household size, income, disability or dependents.",
    parameters: { type: 'object', required: ['householdSize', 'annualIncome'], properties: {
      householdSize: { type: 'number', description: 'Number of people in the household.' },
      annualIncome: { type: 'number', description: 'Approximate gross annual household income in dollars.' },
      disclosures: { type: 'string', description: 'Short summary of what the customer disclosed, e.g. "hours cut in April; daughter and two grandchildren moved in".' }
    } }
  },
  {
    type: 'client', name: 'flag_knowledge_gap', expects_response: true, response_timeout_secs: 15,
    description: 'Record that the customer mentioned a support program you do not have details for. Use this instead of guessing or promising anything.',
    parameters: { type: 'object', required: ['programMentioned', 'customerQuote'], properties: {
      programMentioned: { type: 'string', description: 'The program the customer named.' },
      customerQuote: { type: 'string', description: "The customer's own words, as close to verbatim as possible." }
    } }
  },
  {
    type: 'client', name: 'request_credit_approval', expects_response: true, response_timeout_secs: 30,
    description: 'Request authority to agree a monthly payment. If within your delegated authority it is approved immediately; if below the floor, the customer is placed on hold for a credit officer. Call once, then wait for the result.',
    parameters: { type: 'object', required: ['requestedAmount', 'summary'], properties: {
      requestedAmount: { type: 'number', description: 'The monthly amount the customer asked for, in dollars.' },
      summary: { type: 'string', description: "One or two sentences on the customer's situation for the officer." }
    } }
  },
  {
    type: 'client', name: 'transfer_to_human', expects_response: true, response_timeout_secs: 15,
    description: 'Immediately transfer the customer to a human agent. Use the moment they ask, with no retention attempt.',
    parameters: { type: 'object', required: ['reason'], properties: {
      reason: { type: 'string', description: 'Why the customer is being transferred.' }
    } }
  },
  {
    type: 'client', name: 'confirm_plan', expects_response: true, response_timeout_secs: 30,
    description: 'Confirm the agreed arrangement and submit the benefit applications. Only call after the customer has clearly agreed out loud.',
    parameters: { type: 'object', required: ['amount', 'customerConsent'], properties: {
      amount: { type: 'number', description: 'The agreed monthly amount in dollars.' },
      customerConsent: { type: 'boolean', description: 'True only if the customer explicitly agreed out loud.' }
    } }
  }
];

const systemPrompt = `You are Roberta, an outbound support agent calling on behalf of Meridian Energy, a US utility.

You are speaking with a customer who has fallen behind on their electricity bill in Illinois.

Your purpose is NOT to collect money. It is to enrol the customer in every benefit they are entitled to and to agree a payment they can actually sustain. Treat this as a benefits-enrolment call and a real-time compliance intake, not a collections call.

How to run the call:
1. Open warmly and confirm you're speaking to the right person. Make clear you are not chasing payment.
2. Tell them plainly that under Illinois rules they are protected from disconnection today and you are placing a hold on any shutoff of their service. This is an action you are taking.
3. Gently establish household size and household income — you need both to check eligibility. Also listen for disability, dependents or medical needs.
4. As soon as the customer reveals new household or income facts, call resolve_benefit_stack with the new household size and income so the engine re-checks eligibility. Then proactively explain what they qualify for — they should not have to know which program to ask for.
5. Ask what monthly amount is genuinely sustainable.
6. If the customer mentions a program you do not have details for, DO NOT guess or promise anything. Say you will confirm and follow up, and call flag_knowledge_gap.
7. When the customer names an amount, call request_credit_approval. If it needs a human, the system places the customer on hold; tell them warmly you are checking the lowest sustainable amount and to hold a moment. Wait for the decision, then explain the approved amount and benefits.
8. Only call confirm_plan after the customer has clearly agreed out loud.
9. If the customer asks for a human at any point, call transfer_to_human immediately.

Keep replies short and natural — this is a phone call. Never pressure the customer toward an amount they say they cannot afford. Never claim an account action succeeded before a tool returns success.`;

async function main() {
  // Fetch current config so we PATCH without clobbering other settings.
  const current = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: H }).then((r) => r.json());
  // The agent carries both legacy inline `tools` and newer `tool_ids` (references
  // to tools managed elsewhere in the ElevenLabs dashboard). The API rejects a
  // PATCH that sets both, and this script intentionally owns the inline list —
  // so drop tool_ids rather than let it silently fight with what we send.
  const { tool_ids, ...prompt } = current.conversation_config.agent.prompt;

  const body = {
    conversation_config: {
      agent: {
        prompt: {
          ...prompt,
          prompt: systemPrompt,
          tools
        }
      },
      // This agent has a REAL Twilio phone number attached in ElevenLabs
      // (+19382383852) as well as our own browser WebSocket bridge
      // (src/voice/elevenlabs.js). Audio format is a per-agent setting that
      // applies to BOTH channels — there is no way to set it per-channel.
      // PSTN telephony only carries G.711 μ-law at 8kHz; anything else
      // (e.g. pcm_16000) is inaudible static over a real phone call, and it
      // also breaks our own bridge, whose audio.js conversion helpers
      // (mulaw8kToPcm24k / pcm24kToMulaw8k) are written specifically for
      // μ-law 8kHz. Pin both directions here so a dashboard edit can't
      // silently regress this again.
      tts: { ...current.conversation_config?.tts, agent_output_audio_format: 'ulaw_8000' },
      asr: { ...current.conversation_config?.asr, user_input_audio_format: 'ulaw_8000' }
    }
  };

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(body)
  });
  const out = await res.json();
  if (out.detail) { console.log('PATCH failed:', JSON.stringify(out.detail).slice(0, 400)); process.exit(1); }

  const saved = out.conversation_config?.agent?.prompt?.tools || [];
  console.log('PATCH ok. tools now on agent:', saved.map((t) => t.name).join(', '));
  console.log('prompt updated:', (out.conversation_config?.agent?.prompt?.prompt || '').slice(0, 60), '…');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
