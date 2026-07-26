/**
 * Crustdata adapter — public-record lookup for hardship flagging.
 *
 * Scope is deliberately narrow. This module fetches and normalises; it makes no
 * judgement about a customer. Everything it returns is raw observation with a
 * URL or an API path attached, so that every external signal that later appears
 * on a case can be traced back to a retrievable source (see signals.js).
 *
 * Endpoint paths, request bodies and response shapes are from
 * https://docs.crustdata.com (API version 2025-11-01) and were verified against
 * the live API with this deployment's key. The key's plan currently enables:
 *   /person/search, /person/enrich, /person/identify,
 *   /company/search, /company/identify, /company/enrich,
 *   /job/search, /web/search/live, /web/enrich/live
 * The live professional-network endpoints are NOT enabled, so nothing here
 * depends on them. `GET /account/endpoints` is free and reports what a key can
 * actually reach — `endpointPermissions()` below exposes it for diagnostics.
 *
 * Every call fails soft. A missing key, a 403 from a plan change, a rate limit
 * or a timeout must degrade the hardship assessment to internal-ledger-only,
 * never throw into the workflow.
 */

const BASE = process.env.CRUSTDATA_BASE_URL || 'https://api.crustdata.com';
const API_VERSION = process.env.CRUSTDATA_API_VERSION || '2025-11-01';
const TIMEOUT_MS = Number(process.env.CRUSTDATA_TIMEOUT_MS || 25000);

// The dashboard variable is CRUSTDATA_API in this deployment's .env; accept the
// more conventional name too so a fresh environment doesn't silently no-op.
const apiKey = () => process.env.CRUSTDATA_API_KEY || process.env.CRUSTDATA_API || null;

export function crustdataConfigured() {
  return Boolean(apiKey());
}

// ── response cache ───────────────────────────────────────────────────
// Hardship assessment is re-run every time an operator opens a case, and the
// underlying facts (someone's employment, an employer's headcount trend) move on
// the order of weeks. Caching keeps a demo off the 10 rpm web-search limit and
// keeps credit spend proportional to real questions asked.

const TTL_MS = Number(process.env.CRUSTDATA_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const cache = new Map(); // key → { at, value }
const inflight = new Map(); // key → Promise (collapses concurrent identical calls)

function cached(key, produce) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
  if (inflight.has(key)) return inflight.get(key);

  const promise = produce()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export function clearCrustdataCache() {
  cache.clear();
}

// ── transport ────────────────────────────────────────────────────────

class CrustdataError extends Error {
  constructor(message, { status = null, path = null } = {}) {
    super(message);
    this.name = 'CrustdataError';
    this.status = status;
    this.path = path;
  }
}

async function call(path, body, { method = 'POST' } = {}) {
  const key = apiKey();
  if (!key) throw new CrustdataError('CRUSTDATA_API_KEY is not set', { path });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'x-api-version': API_VERSION
      },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
      signal: controller.signal
    });
  } catch (err) {
    throw new CrustdataError(
      err.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS}ms` : err.message,
      { path }
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    // Crustdata reports the detail as `description` on most APIs, `reason` on the
    // Person API, and as a nested `error.message` on validation failures.
    const detail =
      parsed?.description ||
      parsed?.reason ||
      parsed?.error?.message ||
      parsed?.detail ||
      text.slice(0, 200);
    throw new CrustdataError(`${path} → ${res.status}: ${detail}`, { status: res.status, path });
  }

  return parsed;
}

/** What this API key can actually reach. Free endpoint; used by /api/health. */
export async function endpointPermissions() {
  const body = await call('/account/endpoints', null, { method: 'GET' });
  const enabled = (body?.endpoints || [])
    .filter((e) => e.status === 'enabled')
    .map((e) => ({ path: e.path, rpm: e.effective_rate_limit_rpm }));
  return { apiVersion: body?.api_version || API_VERSION, enabled };
}

// ── person ───────────────────────────────────────────────────────────

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
};

export const stateName = (code) => STATE_NAMES[String(code || '').toUpperCase()] || null;

const PERSON_FIELDS = [
  'crustdata_person_id',
  'basic_profile.name',
  // first_name/last_name are gated on this plan (403 "Access denied to fields"),
  // and full name plus location is enough for the match scoring in identity.js.
  'basic_profile.headline',
  'basic_profile.location',
  'experience.employment_details'
];

/**
 * Candidate profiles for a name in a state. Returns candidates, not a match —
 * deciding whether any of them is actually this customer is identity resolution,
 * and it happens in identity.js where the decision can be recorded and audited.
 *
 * `[.]` is Crustdata's phrase operator, so "Marcus Reyes" matches the full name
 * rather than every Marcus and every Reyes.
 */
export async function searchPeople({ name, state, city = null, limit = 5 }) {
  if (!name) return { profiles: [], totalCount: 0 };

  const conditions = [{ field: 'basic_profile.name', type: '[.]', value: name }];
  const stateFull = stateName(state);
  if (stateFull) conditions.push({ field: 'basic_profile.location.state', type: '=', value: stateFull });

  const body = {
    filters: { op: 'and', conditions },
    limit,
    fields: PERSON_FIELDS
  };

  const key = `person:${name}|${stateFull || ''}|${city || ''}|${limit}`;
  const res = await cached(key, () => call('/person/search', body));

  return {
    profiles: res?.profiles || [],
    totalCount: res?.total_count ?? (res?.profiles || []).length,
    // A city filter would be too brittle (Crustdata often carries a metro area
    // such as "San Francisco Bay Area" with an empty city), so city is used as a
    // scoring hint during identity resolution rather than as a hard filter.
    cityHint: city || null
  };
}

// ── company ──────────────────────────────────────────────────────────

/**
 * Headcount trend for an employer. `growth_percent` carries mom/qoq/six_months/
 * yoy deltas, which is the only part of the payload hardship scoring reads: a
 * double-digit six-month contraction at the customer's employer corroborates a
 * reduced-hours or job-loss disclosure without needing any news article.
 */
export async function companyHeadcount({ domain = null, companyName = null }) {
  if (!domain && !companyName) return null;

  const body = domain ? { domains: [domain] } : { company_names: [companyName] };
  body.fields = ['headcount.total', 'headcount.growth_percent', 'headcount.growth_absolute', 'basic_info'];

  const key = `company:${domain || companyName}`;
  const res = await cached(key, () => call('/company/enrich', body));

  const match = (Array.isArray(res) ? res : [])[0]?.matches?.[0];
  const data = match?.company_data;
  if (!data) return null;

  return {
    crustdataCompanyId: data.crustdata_company_id ?? null,
    name: data.basic_info?.company_name || companyName || domain,
    website: data.basic_info?.company_website || (domain ? `https://${domain}` : null),
    headcount: data.headcount?.total ?? null,
    growthPercent: data.headcount?.growth_percent || null,
    growthAbsolute: data.headcount?.growth_absolute || null,
    confidence: match?.confidence_score ?? null
  };
}

/** Resolves a free-text employer name (e.g. taken from a call disclosure) to a domain. */
export async function identifyCompany(nameOrUrl) {
  if (!nameOrUrl) return null;
  const looksLikeUrl = /^(https?:\/\/|www\.)|\.[a-z]{2,}$/i.test(nameOrUrl);
  const body = looksLikeUrl ? { domains: [nameOrUrl.replace(/^https?:\/\//, '')] } : { names: [nameOrUrl] };

  const res = await cached(`identify:${nameOrUrl}`, () => call('/company/identify', body));
  const match = (Array.isArray(res) ? res : res?.results || [])[0];
  const company = match?.matches?.[0]?.company_data || match?.matches?.[0] || null;
  if (!company) return null;

  return {
    name: company.company_name || company.basic_info?.company_name || nameOrUrl,
    domain: company.company_website_domain || company.basic_info?.company_website_domain || null,
    crustdataCompanyId: company.crustdata_company_id ?? null
  };
}

// ── web ──────────────────────────────────────────────────────────────

/**
 * Public news/web search. One credit per query and a 10 rpm ceiling, so callers
 * should issue few, specific queries — see buildQueries() in signals.js.
 */
export async function searchWeb({ query, sources = ['news'], location = 'US', sinceDays = null }) {
  if (!query) return { results: [] };

  const body = { query, sources, location };
  if (sinceDays) body.start_date = Math.floor((Date.now() - sinceDays * 86400000) / 1000);

  const key = `web:${query}|${sources.join(',')}|${location}|${sinceDays || ''}`;
  const res = await cached(key, () => call('/web/search/live', body));

  return {
    query,
    results: (res?.results || []).map((r) => ({
      source: r.source,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      position: r.position ?? null,
      date: r.date || null
    }))
  };
}

/**
 * Local job-market context: how many openings an employer currently has. A
 * hiring freeze alongside a contracting headcount is a stronger corroboration
 * than either reading alone.
 */
export async function openingsForCompany({ companyName, limit = 1 }) {
  if (!companyName) return null;
  const body = {
    filters: {
      op: 'and',
      conditions: [{ field: 'company_name', type: '(.)', value: companyName }]
    },
    limit
  };
  const res = await cached(`jobs:${companyName}`, () => call('/job/search', body));
  return { companyName, openings: res?.total_count ?? (res?.jobs || res?.results || []).length };
}

export { CrustdataError };
