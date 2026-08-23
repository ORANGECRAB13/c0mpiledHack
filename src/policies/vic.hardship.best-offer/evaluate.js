import { CLAUSES, PENALTY_PROVISIONS } from './meta.js';

// A reason is the unit of evidence written to the ledger. `penaltyProvision` is
// the Schedule 1 civil-penalty provision the finding sits against, or null when
// the obligation carries no penalty. It is always present so downstream code
// can rely on the shape.
function reason(rule, status, citation, explanation, penaltyProvision = null, extra = null) {
  const base = { rule, status, citation, explanation, penaltyProvision };
  return extra ? { ...base, ...extra } : base;
}

function money(value) {
  return `$${Number(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Calendar-month arithmetic. cl 132B(2)(b) says "three months or more"; that is
// calendar months, not 90 days. February makes the difference real: a debt
// starting 1 December is three calendar months old on 1 March (90 days) but a
// debt starting 1 January is three calendar months old on 1 April (91 days).
//
// All date maths is done from snapshot fields only — never the system clock
// (invariant I1).
// ---------------------------------------------------------------------------
function addCalendarMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  // Clamp for short months: 31 Dec + 2 months => 28/29 Feb, not 2/3 March.
  const lastDayOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTarget));
  return target;
}

function debtStartOf(state) {
  // Preferred: an actual recorded start date.
  if (state.oldestDebtSince) return { at: new Date(state.oldestDebtSince), derived: false };
  // Fallback: derive from the day count we do have. Flagged as derived so the
  // reason text never implies we hold a date we do not hold.
  const days = Number(state.oldestDebtDays);
  if (!Number.isFinite(days)) return { at: null, derived: true };
  const asOf = new Date(state.asOf);
  return { at: new Date(asOf.getTime() - days * 86400000), derived: true };
}

function isAtLeastThreeCalendarMonths(state) {
  const { at, derived } = debtStartOf(state);
  if (!at || Number.isNaN(at.getTime())) return { met: null, derived };
  const asOf = new Date(state.asOf);
  if (Number.isNaN(asOf.getTime())) return { met: null, derived };
  return { met: addCalendarMonths(at.toISOString(), 3).getTime() <= asOf.getTime(), derived, at };
}

// ---------------------------------------------------------------------------
// Per-fuel arrears (cl 132B(3): $1,000 electricity AND $1,000 gas, assessed
// SEPARATELY). The snapshot normally carries one aggregate `balance`, so a
// dual-fuel customer at $600 electricity + $600 gas would look eligible on the
// aggregate when they are not. We never silently assume single fuel.
// ---------------------------------------------------------------------------
function assessArrearsAmount(state, threshold) {
  const breakdown = state.fuelArrears;
  if (breakdown && typeof breakdown === 'object') {
    const fuels = Object.entries(breakdown).filter(([, v]) => v !== null && v !== undefined);
    if (fuels.length) {
      const over = fuels.filter(([, v]) => Number(v) >= threshold.value).map(([fuel]) => fuel);
      return {
        met: over.length > 0,
        basis: 'PER_FUEL',
        detail: over.length
          ? `Per-fuel arrears meet the threshold for: ${over.join(', ')}.`
          : `No single fuel reaches ${money(threshold.value)} (${fuels.map(([f, v]) => `${f} ${money(v)}`).join(', ')}).`
      };
    }
  }

  const fuels = Array.isArray(state.fuels) ? state.fuels.filter(Boolean) : null;
  const total = Number(state.balance);

  // Single-fuel account: the aggregate balance IS the per-fuel balance.
  if (fuels && fuels.length === 1) {
    return {
      met: total >= threshold.value,
      basis: 'SINGLE_FUEL',
      detail: `Account is ${fuels[0]}-only, so the ${money(total)} balance is the per-fuel figure.`
    };
  }

  // Aggregate below the threshold is conclusive either way: if the total is
  // under $1,000 then no individual fuel can reach $1,000. Only the "at or
  // over" case is ambiguous without a split.
  if (total < threshold.value) {
    return {
      met: false,
      basis: 'AGGREGATE_CONCLUSIVE',
      detail: `Aggregate arrears of ${money(total)} are below ${money(threshold.value)}, so no individual fuel can meet the per-fuel threshold.`
    };
  }

  return {
    met: null,
    basis: 'FUEL_SPLIT_UNKNOWN',
    detail: `Arrears of ${money(total)} pass the ${money(threshold.value)} mark, but the threshold applies to electricity and gas separately and no split is recorded${fuels && fuels.length > 1 ? ` for this ${fuels.join('/')} account` : ''}. Eligibility cannot be confirmed either way.`
  };
}

// ---------------------------------------------------------------------------
// CRM vs billing reconciliation. The arrears figure drives a threshold that
// carries a civil penalty, so a disagreement between the systems of record is
// itself a compliance finding: the input is not trustworthy.
//
// Judgement call: a disagreement forces INSUFFICIENT_EVIDENCE only when it is
// DECISION-RELEVANT — i.e. the two figures fall on opposite sides of a
// threshold the policy is about to apply. A $3 rounding delta on a $180 balance
// is recorded but does not blind the evaluation; blinding on every delta would
// flood the queue with INSUFFICIENT_EVIDENCE and train operators to ignore it.
// ---------------------------------------------------------------------------
function assessReconciliation(state, thresholds) {
  const billing = state.billing;
  const recon = state.reconciliation;

  if (!billing || billing.available !== true) {
    return {
      decisive: false,
      reason: reason('Arrears corroboration — billing system', 'UNVERIFIED', CLAUSES.requiredEvidence,
        billing && billing.available === false
          ? 'The billing system is unavailable, so the CRM arrears figure driving the threshold is uncorroborated.'
          : 'No billing figure was available, so the CRM arrears figure is uncorroborated.',
        PENALTY_PROVISIONS.requiredEvidence)
    };
  }

  if (!recon || recon.matched === null || recon.matched === undefined) {
    return {
      decisive: false,
      reason: reason('Arrears corroboration — billing system', 'UNVERIFIED', CLAUSES.requiredEvidence,
        'Billing data is present but no reconciliation result was recorded against the CRM arrears figure.',
        PENALTY_PROVISIONS.requiredEvidence)
    };
  }

  if (recon.matched === true) {
    return {
      decisive: false,
      reason: reason('Arrears corroboration — billing system', 'MATCHED', CLAUSES.requiredEvidence,
        'CRM and billing agree on the outstanding amount; the threshold input is corroborated.',
        PENALTY_PROVISIONS.requiredEvidence)
    };
  }

  const crm = Number(recon.crmArrears ?? state.balance);
  const bill = Number(recon.billingOpenAmount ?? billing.openAmount);
  const delta = Number.isFinite(Number(recon.delta)) ? Number(recon.delta) : crm - bill;
  const straddles = thresholds.some((t) =>
    Number.isFinite(crm) && Number.isFinite(bill) && (crm >= t) !== (bill >= t));

  return {
    decisive: straddles,
    reason: reason('Arrears corroboration — billing system', straddles ? 'CONFLICT_MATERIAL' : 'CONFLICT',
      CLAUSES.requiredEvidence,
      `CRM records ${money(crm)} and billing records ${money(bill)} (delta ${money(delta)}). ` +
      (straddles
        ? 'The two systems fall on opposite sides of a regulatory threshold, so the arrears figure cannot support an eligibility conclusion.'
        : 'The disagreement does not straddle a threshold applied here, but the record is inconsistent and must be resolved.'),
      PENALTY_PROVISIONS.requiredEvidence, { delta })
  };
}

/**
 * Pure evaluation (invariant I1): no clock, no network, no DB. Every input,
 * including `asOf`, arrives in the snapshot.
 *
 * @param snapshot           the evaluation snapshot
 * @param config.arrearsThreshold  { value, source, supersededByGuideline, ... } from policy config
 * @param config.arrearsAge        { months, source }
 * @param config.disconnectionFloor `{ value, citation, ... }` or null when the
 *        version in force imposes no monetary floor.
 */
export function evaluateBestOffer(snapshot, config) {
  const { arrearsThreshold, arrearsAge, disconnectionFloor, version } = config;
  const state = snapshot.state || snapshot;
  const missing = ['asOf', 'balance', 'oldestDebtDays', 'hardshipStatus', 'currentPlan', 'bestOfferOptOut']
    .filter((field) => state[field] === undefined || state[field] === null);
  if (missing.length) {
    return {
      outcome: 'INSUFFICIENT_EVIDENCE',
      reasons: [reason('Required evidence', 'MISSING', CLAUSES.requiredEvidence,
        `Missing: ${missing.join(', ')}`, PENALTY_PROVISIONS.requiredEvidence)]
    };
  }

  const balance = Number(state.balance);
  const tailored = ['TAILORED_ASSISTANCE', 'PAYMENT_DIFFICULTY'].includes(state.hardshipStatus);
  const optedOut = Boolean(state.bestOfferOptOut);
  const sensitive = Boolean(state.sensitiveCustomer);

  const amount = assessArrearsAmount(state, arrearsThreshold);
  const age = isAtLeastThreeCalendarMonths(state);

  // Tri-state: true / false / null (cannot be determined). Only `true`
  // triggers; `null` must never be read as either answer.
  const highDebt = amount.met === null || age.met === null
    ? null
    : (amount.met && age.met);

  const cheaperOffer = Boolean(state.bestOffer && state.bestOffer.planId !== state.currentPlan
    && Number(state.bestOffer.annualSaving || 0) > 0);

  const thresholdsInPlay = [arrearsThreshold.value, ...(disconnectionFloor ? [disconnectionFloor.value] : [])];
  const recon = assessReconciliation(state, thresholdsInPlay);

  // ---- Disconnection gate (cl 187(2) + cl 132F) --------------------------
  // This genuinely gates the conclusion; it is not narrative. Where the version
  // in force imposes no monetary floor, the amount limb simply does not block.
  const belowFloor = disconnectionFloor ? balance < disconnectionFloor.value : false;
  const disconnectionBlocked = belowFloor || sensitive;
  const gstUnknown = state.balanceIncludesGst === undefined || state.balanceIncludesGst === null;

  const reasons = [];

  reasons.push(reason(
    disconnectionFloor
      ? `${money(disconnectionFloor.value)} disconnection threshold`
      : 'Disconnection threshold — none in force',
    disconnectionFloor ? (belowFloor ? 'BLOCKED' : 'THRESHOLD_MET') : 'NO_MONETARY_FLOOR',
    disconnectionFloor ? disconnectionFloor.citation : (config.noFloorCitation || CLAUSES.disconnectionThreshold),
    disconnectionFloor
      ? (belowFloor
        ? `Arrears of ${money(balance)} are below the ${money(disconnectionFloor.value)} floor, so disconnection for arrears is not available.`
        : `Arrears of ${money(balance)} are at or above the ${money(disconnectionFloor.value)} floor; every other protection still applies.`)
      : `The version of the Code in force (${version}) sets no minimum arrears for disconnection, so no amount blocks it here.`,
    disconnectionFloor ? PENALTY_PROVISIONS.disconnectionThreshold : null,
    { thresholdValue: disconnectionFloor ? disconnectionFloor.value : null, thresholdSource: disconnectionFloor ? disconnectionFloor.source : null }
  ));

  // GST (cl 187(2): arrears are assessed "inclusive of GST"). Nothing in the
  // snapshot states the GST basis of `balance`, so we surface it rather than
  // assume it. Reported whenever a monetary threshold is actually applied.
  reasons.push(reason('GST basis of arrears', gstUnknown ? 'UNVERIFIED' : (state.balanceIncludesGst ? 'GST_INCLUSIVE' : 'GST_EXCLUSIVE'),
      CLAUSES.disconnectionThreshold,
      gstUnknown
        ? 'Arrears are assessed including GST, but the records do not say whether this balance includes it. A balance close to the threshold could be out by up to 10%.'
        : (state.balanceIncludesGst
          ? 'The balance is recorded as including GST, which is the basis the rule requires.'
          : 'The balance is recorded as excluding GST, so GST must be added before the threshold is applied.'),
    PENALTY_PROVISIONS.disconnectionThreshold));

  reasons.push(reason('Automatic best offer — tailored assistance',
    tailored ? 'APPLIES' : 'NOT_TRIGGERED', CLAUSES.tailoredAssistance,
    tailored ? 'Customer is receiving tailored assistance.' : 'Tailored assistance is not active.',
    PENALTY_PROVISIONS.tailoredAssistance));

  reasons.push(reason('Automatic best offer — high debt',
    highDebt === true ? 'APPLIES' : highDebt === false ? 'NOT_TRIGGERED' : 'INSUFFICIENT_EVIDENCE',
    CLAUSES.highDebt,
    [
      amount.detail,
      age.met === null
        ? 'The age of the debt could not be established from the records available.'
        : `The oldest debt is ${age.met ? 'at least' : 'less than'} ${arrearsAge.months} calendar months old${age.derived ? ', worked out from its age in days rather than a recorded start date' : ''}.`
    ].join(' '),
    PENALTY_PROVISIONS.highDebt,
    {
      thresholdValue: arrearsThreshold.value,
      thresholdSource: arrearsThreshold.source,
      thresholdSupersededByGuideline: arrearsThreshold.supersededByGuideline,
      assessmentBasis: amount.basis,
      ageUnit: arrearsAge.unit
    }));

  reasons.push(reason('Best available offer', cheaperOffer ? 'AVAILABLE' : 'NO_LOWER_OFFER',
    CLAUSES.bestAvailableOffer,
    cheaperOffer
      ? `${state.bestOffer.planId} saves ${money(state.bestOffer.annualSaving)} annually.`
      : 'No cheaper eligible plan was found. A customer must still be told when a check finds nothing better.',
    PENALTY_PROVISIONS.bestAvailableOffer));

  reasons.push(reason('Customer opt-out', optedOut ? 'OPTED_OUT' : 'CLEAR', CLAUSES.optOut,
    optedOut
      // Opt-out suppresses the switch but NOT the obligation: cl 132C(1)(b)
      // keeps running at 12-monthly intervals instead of 6.
      ? 'A recorded opt-out prevents automatic switching. The best-offer check still runs, every 12 months instead of every 6.'
      : 'No opt-out is recorded.',
    PENALTY_PROVISIONS.optOut));

  reasons.push(reason('Sensitive-customer recovery protection', sensitive ? 'BLOCKED' : 'CLEAR',
    CLAUSES.sensitiveCustomer,
    sensitive ? 'Disconnection cannot be used as a recovery step for this customer.' : 'No sensitive-customer marker is present.',
    PENALTY_PROVISIONS.sensitiveCustomer));

  reasons.push(reason('Disconnection for arrears', disconnectionBlocked ? 'NOT_AVAILABLE' : 'AVAILABLE',
    CLAUSES.disconnectionThreshold,
    disconnectionBlocked
      ? `Disconnection as a debt-recovery step is not available: ${[
        belowFloor ? 'arrears are below the monetary floor' : null,
        sensitive ? 'a sensitive-customer marker is present' : null
      ].filter(Boolean).join('; ')}.`
      : 'No modelled protection blocks disconnection for arrears; procedural steps in Part 6 still apply.',
    PENALTY_PROVISIONS.disconnectionThreshold));

  reasons.push(recon.reason);

  const switchRequired = (tailored || highDebt === true) && !optedOut && cheaperOffer;

  // Cannot rule eligibility in or out: the high-debt limb is undetermined and
  // nothing else has already triggered. Reporting NO_CHANGE here would assert
  // an answer we do not have.
  const blindOnHighDebt = highDebt === null && !tailored;

  // A material (threshold-straddling) reconciliation conflict only blinds the
  // evaluation where the arrears figure is load-bearing. If tailored assistance
  // independently triggers the obligation, the disputed amount does not change
  // the answer and we should still act.
  const arrearsIsLoadBearing = !tailored;

  let outcome;
  if (switchRequired && !(recon.decisive && arrearsIsLoadBearing)) outcome = 'ACTION_REQUIRED';
  else if (blindOnHighDebt || recon.decisive) outcome = 'INSUFFICIENT_EVIDENCE';
  else outcome = 'NO_CHANGE';

  return { outcome, reasons, disconnectionPermitted: !disconnectionBlocked };
}
