// Vocare — Azure AI Foundry client for the proprietary agent tier.
//
// The two governed agents (authority, ratification) and the reflection agent
// all run on gpt-oss-120b hosted in Azure AI Foundry. Foundry's model-inference
// surface is NOT the classic `/openai/deployments/{name}` Azure OpenAI path —
// it is `{endpoint}/models/chat/completions`, with the model named in the body.
// That distinction matters: the deployments path 404s for this model.
//
// gpt-oss-120b is a reasoning model. It emits its chain of thought in a
// separate `reasoning_content` field and only then fills `content`. Two
// consequences we handle here:
//   1. token budgets must be generous, or the answer is spent on reasoning and
//      `finish_reason` comes back "length" with an empty `content`;
//   2. `reasoning_content` is never returned to callers — it is deliberation,
//      not output, and letting it reach an audit record would misrepresent it
//      as a finding.

const API_VERSION = '2024-05-01-preview';

const config = {
  endpoint: (process.env.AZURE_NEW_ENDPOINT || '').replace(/\/+$/, ''),
  apiKey: process.env.AZURE_NEW_KEY || '',
  model: process.env.AZURE_NEW_AGENT_DEPLOYMENT || 'gpt-oss-120b'
};

function chatCompletionsUrl() {
  // Foundry supplies a project endpoint such as
  // https://resource.services.ai.azure.com/api/projects/project-name. Model
  // inference lives at the resource root, not beneath the project path.
  const url = new URL('/models/chat/completions', config.endpoint);
  url.searchParams.set('api-version', API_VERSION);
  return url.toString();
}

export function agentModelConfigured() {
  return Boolean(config.endpoint && config.apiKey);
}

export function agentModelStatus() {
  return {
    configured: agentModelConfigured(),
    provider: 'azure-ai-foundry',
    model: config.model,
    endpoint: config.endpoint ? new URL(config.endpoint).hostname : null
  };
}

/**
 * One chat completion against gpt-oss-120b.
 * Returns the assistant text with reasoning stripped.
 */
export async function complete(messages, { maxTokens = 1600, temperature = 0.2, signal } = {}) {
  if (!agentModelConfigured()) {
    throw new Error('AZURE_NEW_ENDPOINT and AZURE_NEW_KEY are required for the proprietary agent tier.');
  }

  const response = await fetch(chatCompletionsUrl(), {
    method: 'POST',
    headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature
    }),
    signal
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`gpt-oss-120b request failed ${response.status}: ${text.slice(0, 600)}`);
  }

  const data = JSON.parse(text);
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim() || '';

  if (!content && choice?.finish_reason === 'length') {
    throw new Error('gpt-oss-120b exhausted its token budget on reasoning before producing an answer.');
  }

  return content;
}

/**
 * Strips the ```json fences reasoning models habitually add, then parses.
 * Falls back to the outermost {...} span so one stray sentence of preamble
 * does not cost us the whole result.
 */
function parseJsonish(raw) {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`Model did not return JSON: ${raw.slice(0, 300)}`);
  }
}

/**
 * A completion constrained to a JSON object shape.
 *
 * `shape` is a plain-language description of the fields, not a JSON Schema —
 * Foundry's response_format support varies by model, so the contract is stated
 * in the prompt and enforced on parse. Callers must still validate what they
 * get: this guarantees well-formed JSON, never correct JSON.
 */
export async function completeJson(system, user, shape, options = {}) {
  const raw = await complete(
    [
      {
        role: 'system',
        content: `${system}\n\nReply with a single JSON object and nothing else. No prose, no code fences. Shape:\n${shape}`
      },
      { role: 'user', content: user }
    ],
    { temperature: 0.15, ...options }
  );
  return parseJsonish(raw);
}
