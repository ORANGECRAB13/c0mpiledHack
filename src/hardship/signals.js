/**
 * Hardship signals.
 *
 * A signal is one observation, from one identified source, with a fixed weight.
 * Weights are constants in this file — not model output and not tunable at call
 * time — so two runs over the same facts always produce the same score, and the
 * reason a household was flagged can be reconstructed line by line.
 *
 * Two families, and the distinction is load-bearing:
 *
 *   INTERNAL  — the utility's own ledger: arrears, failed payments, extension
 *               requests, disconnection notices, contact-centre disclosures.
 *               Authoritative. These alone decide whether a case is flagged.
 *
 *   EXTERNAL  — publicly available information retrieved via Crustdata: an
 *               employment record that ended, an employer whose headcount is
 *               contracting, local layoff reporting. Corroborating only. These
 *               raise urgency and give the agent context to open with, but the
 *               cap in score.js prevents them from flagging a household that the
 *               ledger says is fine.
 *
 * The asymmetry is on purpose. Missing a bill is a fact about this customer;
 * a LinkedIn profile with no current role is an inference about a person who may
 * or may not be them, may be self-employed, or may simply not have updated it.
 */

import { companyHeadcount, identifyCompany, openingsForCompany, searchWeb, stateName } from './crustdata.js';

const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const monthsSince = (iso, asOf) => (iso ? daysBetween(asOf, iso) / 30.44 : null);

function signal(partial) {
  return {
    family: 'internal',
    weight: 0,
    ...partial
  };
}

// ── internal signals ─────────────────────────────────────────────────

/**
 * Derives hardship signals from the utility's own records.
 * `account` is the shape returned by dataset.accountFor().
 */
export function internalSignals(customer, account, { asOf = new Date() } = {}) {
  const out = [];
  const invoice = account?.invoice || null;
  const payment = account?.payment || null;
  const notes = account?.notes || [];
  const arrears = invoice?.outstandingBalance ?? customer.arrears ?? 0;

  if (invoice?.unpaidInvoices >= 2) {
    // Three or more consecutive unpaid cycles is the point at which a balance
    // stops looking like a missed cheque and starts looking like an inability to
    // pay, so the weight steps up rather than scaling smoothly.
    const severe = invoice.unpaidInvoices >= 3;
    out.push(
      signal({
        id: 'missed_payments',
        label: `${invoice.unpaidInvoices} unpaid invoices totalling $${arrears.toFixed(2)}`,
        weight: severe ? 30 : 18,
        sourceId: invoice.id,
        detail: invoice.text || null
      })
    );
  }

  if (invoice?.debtIncrease90Days >= 0.25) {
    out.push(
      signal({
        id: 'balance_accelerating',
        label: `Balance grew ${Math.round(invoice.debtIncrease90Days * 100)}% over 90 days`,
        weight: invoice.debtIncrease90Days >= 0.5 ? 14 : 8,
        sourceId: invoice.id,
        detail: 'A balance growing faster than the bill itself means nothing is being paid down.'
      })
    );
  }

  const arrearsAge = invoice?.oldestUnpaidDate ? monthsSince(invoice.oldestUnpaidDate, asOf) : null;
  if (arrearsAge !== null && arrearsAge >= 3) {
    out.push(
      signal({
        id: 'arrears_ageing',
        label: `Oldest unpaid invoice is ${Math.floor(arrearsAge)} months old`,
        weight: arrearsAge >= 6 ? 12 : 7,
        sourceId: invoice.id,
        detail: `Unpaid since ${invoice.oldestUnpaidDate}.`
      })
    );
  }

  if (payment?.failedAutoPayments >= 1) {
    // Failed direct debits are the strongest purely-internal proxy for a cash
    // shortfall: the customer intended to pay and the money was not there.
    out.push(
      signal({
        id: 'failed_autopay',
        label: `${payment.failedAutoPayments} failed automatic payment${payment.failedAutoPayments > 1 ? 's' : ''}`,
        weight: payment.failedAutoPayments >= 3 ? 22 : payment.failedAutoPayments === 2 ? 14 : 8,
        sourceId: payment.id,
        detail: payment.text || null
      })
    );
  }

  if (payment?.extensionRequests >= 1) {
    out.push(
      signal({
        id: 'extension_requests',
        label: `${payment.extensionRequests} payment extension request${payment.extensionRequests > 1 ? 's' : ''}`,
        weight: payment.extensionRequests >= 2 ? 12 : 6,
        sourceId: payment.id,
        detail: 'The customer has already asked for time, which is a self-reported hardship signal.'
      })
    );
  }

  const sinceLastPayment = payment?.lastSuccessfulPayment
    ? monthsSince(payment.lastSuccessfulPayment, asOf)
    : null;
  if (sinceLastPayment !== null && sinceLastPayment >= 2) {
    out.push(
      signal({
        id: 'no_recent_payment',
        label: `No successful payment for ${Math.floor(sinceLastPayment)} months`,
        weight: sinceLastPayment >= 4 ? 14 : 8,
        sourceId: payment.id,
        detail: `Last successful payment was $${payment.lastSuccessfulAmount} on ${payment.lastSuccessfulPayment}.`
      })
    );
  }

  if (customer.hasDisconnectionNotice) {
    out.push(
      signal({
        id: 'disconnection_notice',
        label: 'Disconnection notice issued',
        weight: 25,
        sourceId: customer.caseId,
        detail: customer.disconnectionNoticeDate
          ? `Notice dated ${customer.disconnectionNoticeDate}.`
          : null
      })
    );
  }

  // Contact-centre notes already carry structured signals; a disclosure of
  // reduced income made directly to an agent outranks anything inferred.
  const SIGNAL_WEIGHTS = {
    reduced_income_disclosure: 20,
    job_loss_disclosure: 26,
    medical_hardship_disclosure: 20,
    assistance_enquiry_unresolved: 10,
    extension_request: 0 // already counted from the payment summary
  };

  for (const note of notes) {
    for (const tag of note.signals || []) {
      const weight = SIGNAL_WEIGHTS[tag];
      if (!weight) continue;
      out.push(
        signal({
          id: `disclosure:${tag}`,
          label: tag.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
          weight,
          sourceId: note.id,
          detail: note.text,
          occurredAt: note.date
        })
      );
    }
  }

  // A record that has never been refreshed is not itself hardship, but it is the
  // reason a household in hardship can appear to qualify for nothing — worth
  // surfacing to the operator alongside the score.
  if (customer.declaredIncomeAsOf && monthsSince(customer.declaredIncomeAsOf, asOf) > 24) {
    out.push(
      signal({
        id: 'stale_income_record',
        label: `Declared income last captured ${customer.declaredIncomeAsOf}`,
        weight: 0,
        sourceId: customer.id,
        detail:
          'Eligibility is being computed from a stale income figure. Confirm household size and income on the call.'
      })
    );
  }

  return out;
}

// ── external signals ─────────────────────────────────────────────────

/** Most recent employment end date across current and past roles. */
function employmentPicture(profile, asOf) {
  const details = profile?.experience?.employment_details || {};
  const current = (details.current || []).filter((e) => !e.end_date);
  const past = [...(details.current || []).filter((e) => e.end_date), ...(details.past || [])];

  const mostRecentEnd = past
    .map((e) => e.end_date)
    .filter(Boolean)
    .sort()
    .pop();

  return {
    current,
    past,
    hasCurrentRole: current.length > 0,
    monthsSinceLastRoleEnded: mostRecentEnd ? monthsSince(mostRecentEnd, asOf) : null,
    lastRoleEnded: mostRecentEnd || null,
    lastEmployer: mostRecentEnd
      ? past.find((e) => e.end_date === mostRecentEnd)?.name || null
      : current[0]?.name || null
  };
}

/**
 * Turns a resolved public profile — plus employer and local-market lookups — into
 * corroborating signals. Every signal carries the URL or API path it came from.
 *
 * `identity.profile` must already have passed resolveIdentity(); this function
 * assumes the person is the customer and does not re-check.
 */
export async function externalSignals({ customer, identity, asOf = new Date(), employerHint = null }) {
  const out = [];
  const lookups = [];

  if (!identity?.resolved) return { signals: out, lookups, employment: null };

  const profile = identity.profile;
  const employment = employmentPicture(profile, asOf);
  const profileRef = `CRUST-PERSON-${profile?.crustdata_person_id || 'unknown'}`;

  lookups.push({
    kind: 'person_search',
    endpoint: '/person/search',
    ref: profileRef,
    matchConfidence: identity.confidence
  });

  // ── employment status ──
  if (!employment.hasCurrentRole && employment.monthsSinceLastRoleEnded !== null) {
    const months = employment.monthsSinceLastRoleEnded;
    // Recency matters: a role that ended last month is relevant to arrears that
    // started accruing this quarter. A role that ended three years ago is not.
    const weight = months <= 6 ? 18 : months <= 12 ? 10 : 4;
    out.push(
      signal({
        family: 'external',
        id: 'employment_ended',
        label: `No current employment on public record; last role${
          employment.lastEmployer ? ` at ${employment.lastEmployer}` : ''
        } ended ${employment.lastRoleEnded?.slice(0, 10)}`,
        weight,
        sourceId: profileRef,
        sourceUrl: null,
        detail:
          'Public employment records are self-maintained and can be out of date. Treat as a prompt to ask, not as a finding.',
        occurredAt: employment.lastRoleEnded
      })
    );
  } else if (employment.hasCurrentRole) {
    const startedRecently = employment.current
      .map((e) => monthsSince(e.start_date, asOf))
      .filter((m) => m !== null)
      .some((m) => m <= 3);
    if (startedRecently) {
      out.push(
        signal({
          family: 'external',
          id: 'recent_job_change',
          label: `Started a new role at ${employment.current[0]?.name} within the last 3 months`,
          weight: 6,
          sourceId: profileRef,
          detail: 'A recent job change often means a gap in income even where the new role is stable.'
        })
      );
    }
  }

  // ── employer distress ──
  const employerName = employment.current[0]?.name || employment.lastEmployer || employerHint;
  const employerDomain = employment.current[0]?.company_website || null;

  if (employerName) {
    try {
      const resolved = employerDomain
        ? { domain: new URL(employerDomain).hostname.replace(/^www\./, ''), name: employerName }
        : await identifyCompany(employerName);

      const company = resolved
        ? await companyHeadcount({ domain: resolved.domain, companyName: resolved.name || employerName })
        : null;

      if (company) {
        lookups.push({ kind: 'company_enrich', endpoint: '/company/enrich', ref: company.name });
        const sixMonth = company.growthPercent?.six_months ?? null;
        if (sixMonth !== null && sixMonth <= -5) {
          out.push(
            signal({
              family: 'external',
              id: 'employer_contracting',
              label: `${company.name} headcount down ${Math.abs(sixMonth).toFixed(1)}% over six months`,
              weight: sixMonth <= -15 ? 12 : 7,
              sourceId: `CRUST-COMPANY-${company.crustdataCompanyId}`,
              sourceUrl: company.website,
              detail: `Headcount ${company.headcount}; six-month change ${company.growthAbsolute?.six_months ?? '?'} roles.`
            })
          );
        }

        const jobs = await openingsForCompany({ companyName: company.name }).catch(() => null);
        if (jobs && jobs.openings === 0 && sixMonth !== null && sixMonth < 0) {
          lookups.push({ kind: 'job_search', endpoint: '/job/search', ref: company.name });
          out.push(
            signal({
              family: 'external',
              id: 'employer_hiring_freeze',
              label: `${company.name} has no open roles while headcount is falling`,
              weight: 4,
              sourceId: `CRUST-COMPANY-${company.crustdataCompanyId}`,
              detail: 'Suggests reductions are not being backfilled, so re-employment there is unlikely.'
            })
          );
        }
      }
    } catch {
      // Employer lookups are the most optional part of the picture; a plan limit
      // or a rate limit here must not cost us the employment signal above.
    }
  }

  // ── local labour-market reporting ──
  const region = [customer.city, stateName(customer.state) || customer.state].filter(Boolean).join(', ');
  const query = employerName
    ? `${employerName} layoffs OR job cuts OR closure ${stateName(customer.state) || ''}`.trim()
    : `${region} layoffs WARN notice`;

  try {
    const web = await searchWeb({ query, sources: ['news'], sinceDays: 180 });
    lookups.push({ kind: 'web_search', endpoint: '/web/search/live', ref: query, hits: web.results.length });

    const relevant = web.results.filter((r) =>
      /layoff|job cut|redundanc|plant closure|closing|WARN notice|furlough/i.test(
        `${r.title} ${r.snippet || ''}`
      )
    );

    if (relevant.length) {
      const top = relevant[0];
      out.push(
        signal({
          family: 'external',
          id: employerName ? 'employer_layoff_reporting' : 'local_layoff_reporting',
          label: employerName
            ? `Public reporting of job cuts connected to ${employerName}`
            : `Recent layoff reporting in ${region}`,
          // Area-level reporting is context, not evidence about this household,
          // so it is weighted near the floor and can never move a tier on its own.
          weight: employerName ? 8 : 3,
          sourceId: 'CRUST-WEB',
          sourceUrl: top.url,
          detail: `${top.title} — ${top.snippet || ''}`.trim(),
          corroboratingUrls: relevant.slice(0, 3).map((r) => r.url)
        })
      );
    }
  } catch {
    // Web search is rate-limited to 10 rpm; skipping it is acceptable.
  }

  return { signals: out, lookups, employment };
}
