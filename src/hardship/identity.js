import { searchPeople, stateName } from './crustdata.js';

/**
 * Identity resolution — deciding whether a public profile is actually this
 * customer.
 *
 * This is the step that makes external enrichment safe to use at all. A wrong
 * match here does not produce a slightly-off risk score; it attaches a stranger's
 * job loss to a real household's file. So the bar is deliberately high and the
 * failure mode is deliberately boring: when the evidence is thin or ambiguous,
 * return `resolved: false` and let the assessment run on internal ledger data
 * alone, which is what the system did before Crustdata existed.
 *
 * The decision is scored, not modelled, so the reason a match was accepted (or
 * refused) is reconstructable from the audit log months later.
 */

const ACCEPT_THRESHOLD = Number(process.env.HARDSHIP_IDENTITY_THRESHOLD || 0.75);

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Common-name guard: "James Smith" needs more corroboration than "Xiomara Beaulieu". */
function nameIsDistinctive(name) {
  const parts = norm(name).split(' ');
  const surname = parts[parts.length - 1] || '';
  const COMMON_SURNAMES = new Set([
    'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
    'rodriguez', 'martinez', 'hernandez', 'lopez', 'gonzalez', 'wilson', 'anderson',
    'thomas', 'taylor', 'moore', 'jackson', 'martin', 'lee', 'perez', 'thompson',
    'white', 'harris', 'sanchez', 'clark', 'ramirez', 'lewis', 'robinson', 'walker',
    'young', 'allen', 'king', 'wright', 'scott', 'torres', 'nguyen', 'hill', 'flores'
  ]);
  return !COMMON_SURNAMES.has(surname);
}

/**
 * Scores one candidate profile against what the utility knows.
 * Signals are additive and each is individually explainable.
 */
function scoreCandidate(profile, { name, state, city, employerHint }) {
  const reasons = [];
  let score = 0;

  const profileName = profile?.basic_profile?.name;
  if (norm(profileName) === norm(name)) {
    score += 0.45;
    reasons.push(`Full name matches exactly ("${profileName}").`);
  } else {
    // The phrase filter should make this unreachable, but a near-match must not
    // quietly earn full credit.
    score += 0.15;
    reasons.push(`Name is a partial match ("${profileName}" vs "${name}").`);
  }

  const loc = profile?.basic_profile?.location || {};
  const wantState = stateName(state);
  if (wantState && norm(loc.state) === norm(wantState)) {
    score += 0.2;
    reasons.push(`Profile state (${loc.state}) matches the service address state.`);
  }

  const raw = norm(loc.raw || loc.city);
  if (city && raw && raw.includes(norm(city))) {
    score += 0.2;
    reasons.push(`Profile location "${loc.raw || loc.city}" matches the service city (${city}).`);
  }

  if (employerHint) {
    const employers = [
      ...(profile?.experience?.employment_details?.current || []),
      ...(profile?.experience?.employment_details?.past || [])
    ].map((e) => norm(e?.name));
    if (employers.some((e) => e && (e.includes(norm(employerHint)) || norm(employerHint).includes(e)))) {
      score += 0.25;
      reasons.push(`Employment history includes the employer disclosed on the call ("${employerHint}").`);
    }
  }

  if (!nameIsDistinctive(name)) {
    score -= 0.15;
    reasons.push('Name is common, so name agreement alone carries less weight.');
  }

  // `score` stays unclamped so that separation between candidates survives —
  // clamping first would collapse a decisive employer match into a tie with a
  // name-and-state-only candidate. `confidence` is the clamped, reportable value.
  return { score: Math.max(0, score), confidence: Math.min(1, Math.max(0, score)), reasons };
}

/**
 * Resolves a customer record to at most one public profile.
 *
 * Returns `{ resolved, confidence, profile, reasons, candidatesConsidered }`.
 * Ambiguity is treated as failure: if two candidates score close together we
 * cannot tell them apart, so neither is used.
 */
export async function resolveIdentity({ name, state, city = null, employerHint = null } = {}) {
  const base = { resolved: false, confidence: 0, profile: null, reasons: [], candidatesConsidered: 0 };
  if (!name) return { ...base, reasons: ['No customer name on file.'] };

  const { profiles } = await searchPeople({ name, state, city });
  if (!profiles.length) {
    return {
      ...base,
      reasons: [`No public profile found for "${name}" in ${stateName(state) || state || 'the US'}.`]
    };
  }

  const scored = profiles
    .map((profile) => ({ profile, ...scoreCandidate(profile, { name, state, city, employerHint }) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  const ambiguous = runnerUp && best.score - runnerUp.score < 0.15;

  if (ambiguous) {
    return {
      ...base,
      candidatesConsidered: scored.length,
      confidence: Number(best.confidence.toFixed(2)),
      reasons: [
        `${scored.length} candidate profiles scored within 0.15 of each other — cannot distinguish them.`,
        ...best.reasons
      ]
    };
  }

  if (best.score < ACCEPT_THRESHOLD) {
    return {
      ...base,
      candidatesConsidered: scored.length,
      confidence: Number(best.confidence.toFixed(2)),
      reasons: [
        `Best candidate scored ${best.score.toFixed(2)}, below the ${ACCEPT_THRESHOLD} match threshold.`,
        ...best.reasons
      ]
    };
  }

  return {
    resolved: true,
    confidence: Number(best.confidence.toFixed(2)),
    profile: best.profile,
    reasons: best.reasons,
    candidatesConsidered: scored.length
  };
}
