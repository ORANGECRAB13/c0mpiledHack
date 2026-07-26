import { accountFor, findCustomer, findJurisdiction, fplFor, programsForState, smiFor } from './dataset.js';

/**
 * Deterministic resolution over the context graph.
 *
 * Every decision here is a hard predicate on state, effective date, income,
 * household size and program prerequisites. Semantic search (Neo4j context engine) is only
 * ever used to fetch explanatory text for a program that has ALREADY been
 * resolved as eligible — it never decides eligibility.
 */

// ── date + weather helpers ───────────────────────────────────────────

function withinDateWindow(asOf, windowStart, windowEnd) {
  const md = `${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;
  // Windows that wrap the new year (e.g. 12-01 → 03-31) are inclusive on both sides.
  return windowStart <= windowEnd
    ? md >= windowStart && md <= windowEnd
    : md >= windowStart || md <= windowEnd;
}

function isEffective(asOf, effectiveFrom, effectiveTo) {
  const iso = asOf.toISOString().slice(0, 10);
  if (effectiveFrom && iso < effectiveFrom) return false;
  if (effectiveTo && iso > effectiveTo) return false;
  return true;
}

function evaluateMoratorium(moratorium, asOf, forecast, customer) {
  const base = {
    sourceId: moratorium.sourceId,
    label: moratorium.label,
    kind: moratorium.kind,
    citation: moratorium.citation
  };

  if (moratorium.trigger === 'date_window') {
    const active = withinDateWindow(asOf, moratorium.windowStart, moratorium.windowEnd);
    return {
      ...base,
      active,
      reason: active
        ? `Today falls inside the ${moratorium.windowStart} to ${moratorium.windowEnd} protection window.`
        : `Today falls outside the ${moratorium.windowStart} to ${moratorium.windowEnd} protection window.`
    };
  }

  if (moratorium.trigger === 'household_flag') {
    const flags = moratorium.flags || [];
    const matched = flags.filter((flag) => customer?.householdFlags?.includes(flag));
    return {
      ...base,
      active: matched.length > 0,
      matchedFlags: matched,
      reason: matched.length
        ? `Household meets a special-protections category: ${matched.join(', ')}.`
        : 'No special-protections category recorded for this household.'
    };
  }

  // Weather triggers.
  const readings = {
    temperature_max_f: forecast?.highF,
    temperature_min_f: forecast?.lowF,
    heat_index_f: forecast?.heatIndexF ?? forecast?.highF
  };
  const reading = readings[moratorium.trigger];

  if (reading === undefined || reading === null) {
    return { ...base, active: false, reason: 'No forecast reading available for this trigger.' };
  }

  const active =
    moratorium.comparator === 'lte' ? reading <= moratorium.thresholdF : reading >= moratorium.thresholdF;

  return {
    ...base,
    active,
    reading,
    thresholdF: moratorium.thresholdF,
    reason: `Forecast ${moratorium.trigger.replace(/_/g, ' ')} of ${reading}°F is ${
      active ? 'at or beyond' : 'short of'
    } the ${moratorium.thresholdF}°F threshold.`
  };
}

// ── jurisdiction ─────────────────────────────────────────────────────

/**
 * Resolves which rules govern this customer today: state → PUC rule set →
 * moratorium status given the date and the forecast → delegated authority floor.
 */
export function resolveJurisdiction(dataset, { customerId, asOf = new Date(), forecast = null } = {}) {
  const customer = findCustomer(dataset, customerId);
  if (!customer) throw new Error(`Unknown customer: ${customerId}`);

  const jurisdiction = findJurisdiction(dataset, customer.state);
  if (!jurisdiction) throw new Error(`No loaded rules for state: ${customer.state}`);

  const moratoria = jurisdiction.moratoria.map((m) => evaluateMoratorium(m, asOf, forecast, customer));
  const activeMoratoria = moratoria.filter((m) => m.active);

  return {
    customerId: customer.id,
    caseId: customer.caseId,
    asOf: asOf.toISOString(),
    forecast,
    state: jurisdiction.state,
    pucRule: jurisdiction.pucRule,
    moratoria,
    protectedFromDisconnection: activeMoratoria.length > 0,
    protectionBasis: activeMoratoria.map((m) => ({ sourceId: m.sourceId, label: m.label, reason: m.reason })),
    authorityRule: jurisdiction.authorityRule
  };
}

// ── eligibility ──────────────────────────────────────────────────────

function evaluateCriterion(criterion, ctx) {
  const { dataset, customer, householdSize, annualIncome, arrears, enrolledIds } = ctx;

  switch (criterion.kind) {
    case 'income_percent_fpl': {
      const threshold = Math.round(fplFor(dataset, householdSize) * (criterion.value / 100));
      const pass = annualIncome <= threshold;
      return {
        id: criterion.id,
        pass,
        text: criterion.text,
        detail: `Household of ${householdSize} at ${criterion.value}% FPL is $${threshold.toLocaleString()}; income is $${annualIncome.toLocaleString()}.`
      };
    }
    case 'income_percent_smi': {
      const smi = smiFor(dataset, customer.state, householdSize);
      const threshold = smi === null ? null : Math.round(smi * (criterion.value / 100));
      const pass = threshold !== null && annualIncome <= threshold;
      return {
        id: criterion.id,
        pass,
        text: criterion.text,
        detail:
          threshold === null
            ? 'No State Median Income figure loaded for this state.'
            : `Household of ${householdSize} at ${criterion.value}% SMI is $${threshold.toLocaleString()}; income is $${annualIncome.toLocaleString()}.`
      };
    }
    case 'arrears_minimum': {
      const pass = arrears >= criterion.value;
      return {
        id: criterion.id,
        pass,
        text: criterion.text,
        detail: `Arrears of $${arrears.toFixed(2)} against a $${criterion.value} minimum.`
      };
    }
    case 'requires_program': {
      const pass = enrolledIds.has(criterion.value);
      return {
        id: criterion.id,
        pass,
        text: criterion.text,
        detail: pass
          ? `Prerequisite ${criterion.value} is satisfied within this package.`
          : `Prerequisite ${criterion.value} is not held or resolvable.`
      };
    }
    case 'bill_responsibility':
      return { id: criterion.id, pass: true, text: criterion.text, detail: 'Account holder is the bill payer.' };
    case 'program_capacity': {
      const pass = criterion.value === 'open';
      return { id: criterion.id, pass, text: criterion.text, detail: `Program enrolment is ${criterion.value}.` };
    }
    default:
      return { id: criterion.id, pass: false, text: criterion.text, detail: 'Unrecognised criterion kind.' };
  }
}

function crisisTierApplies(tier, customer) {
  const requires = tier.requires || [];
  if (!requires.length) return { applies: true, met: [] };
  const met = requires.filter((r) => {
    if (r === 'disconnection_notice') return Boolean(customer.hasDisconnectionNotice);
    if (r === 'already_disconnected') return Boolean(customer.disconnected);
    if (r === 'weather_emergency') return Boolean(customer.weatherEmergency);
    if (r === 'less_than_25_percent_fuel_remaining') return Boolean(customer.lowFuel);
    return false;
  });
  return { applies: met.length > 0, met };
}

// ── benefit stack ────────────────────────────────────────────────────

/**
 * Resolves the full package for a customer: which programs they qualify for,
 * in what order they must be enrolled, what stacks, what is excluded, and what
 * residual payment remains after the benefits are applied.
 */
export function resolveBenefitStack(
  dataset,
  {
    customerId,
    householdSize = null,
    annualIncome = null,
    disclosures = [],
    asOf = new Date(),
    forecast = null,
    extraPrograms = []
  } = {}
) {
  const customer = findCustomer(dataset, customerId);
  if (!customer) throw new Error(`Unknown customer: ${customerId}`);

  const jurisdiction = resolveJurisdiction(dataset, { customerId, asOf, forecast });
  const account = accountFor(dataset, customer.id);
  const arrears = account.invoice?.outstandingBalance ?? customer.arrears ?? 0;

  // Disclosures made on the call override what the CRM believed.
  const effectiveHousehold = householdSize ?? customer.declaredHouseholdSize;
  const effectiveIncome = annualIncome ?? customer.declaredAnnualIncome;

  const candidates = [...programsForState(dataset, customer.state), ...extraPrograms].filter((p) =>
    isEffective(asOf, p.effectiveFrom, p.effectiveTo)
  );

  const stackingRules = dataset.stackingRules.filter((r) => r.state === customer.state);
  const requires = new Map();
  for (const rule of stackingRules) {
    if (rule.relation === 'REQUIRES') requires.set(rule.from, rule.to);
  }

  // Order candidates so prerequisites resolve before dependants.
  const ordered = [...candidates].sort((a, b) => {
    if (requires.get(a.id) === b.id) return 1;
    if (requires.get(b.id) === a.id) return -1;
    return 0;
  });

  const enrolledIds = new Set(customer.enrolledPrograms || []);
  const eligible = [];
  const ineligible = [];

  for (const program of ordered) {
    const ctx = { dataset, customer, householdSize: effectiveHousehold, annualIncome: effectiveIncome, arrears, enrolledIds };
    const checks = (program.criteria || []).map((c) => evaluateCriterion(c, ctx));
    const passed = checks.every((c) => c.pass);

    const entry = {
      id: program.id,
      kind: program.kind,
      name: program.name,
      sourceId: program.sourceId,
      citation: program.citation,
      intakeVia: program.intakeVia,
      checks,
      prerequisite: requires.get(program.id) || null
    };

    if (!passed) {
      ineligible.push({ ...entry, failedOn: checks.filter((c) => !c.pass).map((c) => c.id) });
      continue;
    }

    enrolledIds.add(program.id);

    if (program.kind === 'LIHEAP') {
      const regular = program.tiers.find((t) => t.kind === 'regular');
      const crisis = program.tiers.find((t) => t.kind === 'crisis');
      const crisisCheck = crisis ? crisisTierApplies(crisis, customer) : { applies: false, met: [] };
      entry.tier = crisisCheck.applies ? crisis : regular;
      entry.tierReason = crisisCheck.applies
        ? `Crisis tier applies — ${crisisCheck.met.join(', ')}.`
        : 'Regular tier — no crisis condition recorded.';
      entry.estimatedValue = entry.tier.maxBenefit;
    }

    if (program.kind === 'AMP') {
      entry.forgiveness = program.forgiveness;
      entry.estimatedValue = Math.min(program.forgiveness.totalForgivenessMax, arrears);
    }

    if (program.kind === 'PIPP') {
      const monthlyIncome = effectiveIncome / 12;
      const capped = Math.max(
        program.incomeCap.minMonthlyPayment,
        Math.round((monthlyIncome * program.incomeCap.percentOfMonthlyIncome) / 100)
      );
      entry.incomeCap = program.incomeCap;
      entry.cappedMonthlyPayment = capped;
      entry.estimatedValue = null;
      entry.capDetail = `${program.incomeCap.percentOfMonthlyIncome}% of $${Math.round(
        monthlyIncome
      ).toLocaleString()} monthly income = $${capped}/month.`;
    }

    eligible.push(entry);
  }

  const excludes = stackingRules
    .filter((r) => r.relation === 'EXCLUDES' && enrolledIds.has(r.from))
    .map((r) => ({ excluded: r.to, because: r.from, sourceId: r.sourceId, text: r.text }));

  const excludedIds = new Set(excludes.map((e) => e.excluded));
  const dpa = dataset.fallbackArrangement;
  const dpaAvailable = !excludedIds.has(dpa.id);

  // Money model:
  //   LIHEAP is a grant applied to the account now, so it reduces arrears immediately.
  //   AMP forgives the remainder over its term, but only while the customer pays on
  //   time — so it is offered as available forgiveness, never netted off up front.
  //   The monthly figure under negotiation is the ongoing payment: the PIPP cap where
  //   a PIPP exists, otherwise the residual amortized over the state's DPA term.
  const pipp = eligible.find((e) => e.kind === 'PIPP');
  const amp = eligible.find((e) => e.kind === 'AMP');

  // A household can hold more than one grant — a state LIHEAP benefit and a
  // locally administered supplement, for instance — so sum them, then cap the
  // total at what is actually owed.
  const grants = eligible.filter((e) => e.kind === 'LIHEAP' || e.kind === 'GRANT');
  const liheapValue = Math.min(
    arrears,
    grants.reduce((sum, g) => sum + (g.estimatedValue ?? 0), 0)
  );

  const arrearsAfterGrant = Math.max(0, arrears - liheapValue);
  const forgivenessAvailable = amp ? Math.min(amp.forgiveness.totalForgivenessMax, arrearsAfterGrant) : 0;
  if (amp) amp.estimatedValue = forgivenessAvailable;

  const residualArrears = Math.max(0, arrearsAfterGrant - forgivenessAvailable);
  const dpaMonths = jurisdiction.pucRule.deferredPaymentArrangement?.maxTermMonths || 12;

  const monthlyPayment = pipp
    ? pipp.cappedMonthlyPayment
    : dpaAvailable && arrearsAfterGrant > 0
      ? Math.ceil(arrearsAfterGrant / dpaMonths)
      : 0;

  const affordabilityCeiling = pipp ? pipp.cappedMonthlyPayment : null;
  const authorityFloor = jurisdiction.authorityRule.floorAmount;

  return {
    customerId: customer.id,
    caseId: customer.caseId,
    customerName: customer.name,
    asOf: asOf.toISOString(),
    jurisdiction,
    account: { arrears, ...account },
    household: {
      size: effectiveHousehold,
      declaredSize: customer.declaredHouseholdSize,
      annualIncome: effectiveIncome,
      declaredAnnualIncome: customer.declaredAnnualIncome,
      changedOnCall:
        effectiveHousehold !== customer.declaredHouseholdSize ||
        effectiveIncome !== customer.declaredAnnualIncome,
      disclosures
    },
    eligible,
    ineligible,
    excludes,
    deferredArrangement: dpaAvailable
      ? { ...dpa, ...jurisdiction.pucRule.deferredPaymentArrangement, monthlyAmount: monthlyPayment }
      : null,
    totals: {
      arrears,
      grantApplied: liheapValue,
      arrearsAfterGrant,
      forgivenessAvailable,
      benefitsUnlocked: liheapValue + forgivenessAvailable,
      residualArrears,
      monthlyPayment,
      monthlyBasis: pipp ? 'pipp_income_cap' : 'deferred_payment_arrangement',
      cappedMonthlyPayment: affordabilityCeiling
    },
    boundaries: {
      authorityFloor,
      authoritySourceId: jurisdiction.authorityRule.sourceId,
      requiresRole: jurisdiction.authorityRule.requiresRole,
      requiresLevel: jurisdiction.authorityRule.requiresLevel,
      affordabilityCeiling,
      affordabilitySourceId: pipp?.sourceId || null
    }
  };
}
