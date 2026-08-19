const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5182').replace(/\/$/, '');

async function request(path, options) {
  const response = await fetch(`${API_BASE}/api/decision-layer${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `Decision-layer request failed (${response.status})`);
  return body;
}

export const decisionLayerApi = {
  loadProduct: async () => {
    const [customers, cases, audit, policies] = await Promise.all([request('/customers'), request('/cases'), request('/audit'), request('/policies')]);
    return { queue: customers.customers, cases: Object.fromEntries(cases.cases.map((item) => [item.id, item])), audit: audit.records, policies: policies.policies };
  },
  evaluate: (customerId) => request(`/customers/${encodeURIComponent(customerId)}/evaluate`, { method: 'POST', body: '{}' }),
  approve: (actionId, body) => request(`/actions/${encodeURIComponent(actionId)}/approval`, { method: 'POST', body: JSON.stringify(body) }),
};
