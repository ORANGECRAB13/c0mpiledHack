const config = {
  azureEndpoint: process.env['AZURE-PROJECT-ENDPOINT'] || process.env.AZURE_PROJECT_ENDPOINT || '',
  azureApiKey: process.env['AZURE-OPENAI-API-KEY'] || process.env.AZURE_OPENAI_API_KEY || '',
  azureModel: process.env['AZURE-MODEL'] || process.env.AZURE_MODEL || 'gpt-4o',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openAiHost: process.env.OPENAI_API_HOST || 'https://api.openai.com'
};

export function getAiConfig() {
  const provider = config.azureApiKey && config.azureEndpoint ? 'azure-openai' : config.openAiApiKey ? 'openai' : 'none';
  return {
    provider,
    enabled: provider !== 'none',
    model: provider === 'azure-openai' ? config.azureModel : config.openAiModel
  };
}

async function askAzureOpenAI(prompt) {
  if (!config.azureApiKey || !config.azureEndpoint) {
    throw new Error('AZURE-PROJECT-ENDPOINT and AZURE-OPENAI-API-KEY are required to use Azure OpenAI features.');
  }

  const resourceName = new URL(config.azureEndpoint).hostname.split('.')[0];
  const url = `https://${resourceName}.openai.azure.com/openai/deployments/${encodeURIComponent(config.azureModel)}/chat/completions?api-version=2025-01-01-preview`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': config.azureApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are an AI assistant for the Vocare company brain.' },
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 700,
      temperature: 0.25
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Azure OpenAI request failed ${response.status}: ${text.slice(0, 1000)}`);
  }

  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function askOpenAI(prompt) {
  if (!config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required to use AI features.');
  }

  const response = await fetch(`${config.openAiHost}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.openAiModel,
      messages: [
        { role: 'system', content: 'You are an AI assistant for the Vocare company brain.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 700,
      temperature: 0.25
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function askAi(prompt) {
  if (config.azureApiKey && config.azureEndpoint) {
    return askAzureOpenAI(prompt);
  }
  return askOpenAI(prompt);
}
