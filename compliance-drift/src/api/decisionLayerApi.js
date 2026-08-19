const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5182').replace(/\/$/, '');

async function request(path, options) {
  const response = await fetch(`${API_BASE}/api/decision-layer${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const error = new Error(body.error || `Decision-layer request failed (${response.status})`);
    // Keep the server's detail (per-item approval violations, rolledBack, …) so
    // callers can show exactly what was rejected rather than a generic message.
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export const decisionLayerApi = {
  loadProduct: async () => {
    const [customers, cases, audit, policies] = await Promise.all([request('/customers'), request('/cases'), request('/audit'), request('/policies')]);
    return { queue: customers.customers, cases: Object.fromEntries(cases.cases.map((item) => [item.id, item])), audit: audit.records, policies: policies.policies };
  },
  evaluate: (customerId) => request(`/customers/${encodeURIComponent(customerId)}/evaluate`, { method: 'POST', body: '{}' }),
  approve: (actionId, body) => request(`/actions/${encodeURIComponent(actionId)}/approval`, { method: 'POST', body: JSON.stringify(body) }),

  // Salesforce (CRM) + Stripe (billing) for one customer, plus whether the two
  // systems agree about the debt. Accepts a ledger id or External_Customer_Id__c.
  // `profile.salesforce.available` / `profile.stripe.available` say whether each
  // upstream answered — render "unavailable" rather than a fabricated zero.
  loadCustomerProfile: async (reference) => (await request(`/customers/${encodeURIComponent(reference)}/profile`)).profile,
  loadCustomerBilling: async (reference) => (await request(`/customers/${encodeURIComponent(reference)}/billing`)).billing,

  // Which upstream systems this deployment can actually read.
  loadIntegrations: async () => (await request('/integrations')).integrations,

  // Reload the ledger from the live Salesforce book.
  syncSalesforce: (body = {}) => request('/salesforce/sync', { method: 'POST', body: JSON.stringify(body) }),

  // --- Review workflows -------------------------------------------------
  // Re-evaluates customers and MUTATES the ledger. Passing `customerIds`
  // overrides paging, so a single-customer review is reviewAll({customerIds:[id]}).
  // Returns { run, categories, actionableCount, results, failures, skipped, circuitBreaker }.
  reviewAll: (body = {}) => request('/review-all', { method: 'POST', body: JSON.stringify(body) }),

  // Read-only tab counts + per-customer categories. No re-evaluation, so this is
  // what the summary screen renders from.
  loadReviewSummary: ({ limit = 200, offset = 0, includeCustomers = true } = {}) =>
    request(`/review-summary?limit=${limit}&offset=${offset}&includeCustomers=${includeCustomers ? 'true' : 'false'}`),

  loadCase: async (customerId) => (await request(`/cases/${encodeURIComponent(customerId)}`)).case,

  loadAwaitingApproval: ({ limit = 50, offset = 0 } = {}) =>
    request(`/actions/awaiting-approval?limit=${limit}&offset=${offset}`),

  // Bulk approval. `overrideReason` is REQUIRED on any item whose verdict is not
  // AGREED — the API rejects the whole batch otherwise and writes nothing.
  submitApprovals: (body) => request('/actions/approvals', { method: 'POST', body: JSON.stringify(body) }),

  loadHaltedCustomers: async () => (await request('/customers/halted')).customers,
  resumeCustomer: (customerId, body) => request(`/customers/${encodeURIComponent(customerId)}/resume`, { method: 'POST', body: JSON.stringify(body) }),
};
