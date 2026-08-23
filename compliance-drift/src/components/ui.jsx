import React, { useId, useState } from 'react';
import { Icon } from '../icons.jsx';
import '../styles/ui.css';

/* ============================================================================
 * ui.jsx — the shared presentation primitives.
 *
 * One section header, one field row, one chip, one disclosure, one honest
 * "missing" state. Everything else in the app composes these; if a surface
 * needs a seventh font size or a fourth accent, the layout is wrong, not the
 * primitive set.
 *
 *   <Section title meta actions>…</Section>
 *   <FieldRow label value emphasis="decision|default|muted" system />
 *   <Chip tone="blocking|attention|pass|info|neutral">…</Chip>
 *   <Disclosure label count defaultOpen>…</Disclosure>
 *
 * HONESTY CONTRACT (P7). `FieldRow` owns the missing case itself: a value of
 * null / undefined / '' / NOT_SET renders "Not recorded in <system>" in the
 * muted-italic missing style. No caller can accidentally emit a fabricated
 * "$0" or an em-dash that reads as zero, because callers never format the
 * absent case at all.
 * ========================================================================== */

/* -- formatters (single source of truth; never coerce null → 0) ------------ */

export const NOT_SET = Symbol('not-set');
const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export function money(dollars, currency) {
  if (typeof dollars !== 'number' || Number.isNaN(dollars)) return NOT_SET;
  if (!currency || currency.toUpperCase() === 'AUD') return AUD.format(dollars);
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(dollars);
}
export function aud(dollars) { return AUD.format(dollars); }
export function count(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? String(value) : NOT_SET;
}
export function days(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? `${value} days` : NOT_SET;
}
export function isoDate(value) {
  if (!value) return NOT_SET;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function stamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function plain(value) {
  if (value === null || value === undefined || value === '') return NOT_SET;
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/* -- phrase(): the ONE place a backend constant becomes English -------------
 *
 * The API speaks in constants (ACTION_REQUIRED, TAILORED_ASSISTANCE,
 * NO_MONETARY_FLOOR…). Officers and regulators do not. `phrase` is the single
 * translation layer: every render site that shows a backend enum runs it
 * through here, and nowhere else keeps its own lookup table.
 *
 * CONTRACT
 *  - Curated first. Several constants do not read well from a mechanical
 *    transform ("CONFLICT_MATERIAL" is "Systems disagree", not "Conflict
 *    material"), so known values get a written phrase.
 *  - Unknown values DEGRADE, never disappear: SOME_NEW_STATE → "Some new
 *    state". A constant the backend adds tomorrow renders readably today.
 *  - Display only. The underlying value is untouched — every comparison,
 *    filter and request in this app still branches on the raw constant.
 *  - Non-constant input (prose, ids, clause citations) is returned unchanged,
 *    so it is safe to call on a field that may already be human text.
 */

/* Constant-shaped: SCREAMING_SNAKE, or a single all-caps word. */
const CONSTANT = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
/* Words that must not be sentence-cased into nonsense by the fallback. */
const KEEP_UPPER = new Set(['GST', 'CRM', 'VIC', 'NSW', 'QLD', 'SA', 'WA', 'NT', 'ACT', 'TAS', 'AUD', 'ID', 'API', 'ERCoP'.toUpperCase()]);

const PHRASES = {
  /* outcomes / categories */
  ACTION_REQUIRED: 'Action required',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  NO_CHANGE: 'No change',
  NOT_EVALUATED: 'Not evaluated',
  ESCALATION_REQUIRED: 'Escalation required',
  PREVIOUS_DECISION_SUPERSEDED: 'Replaces an earlier decision',
  SUPERSEDED_BY_POLICY_CHANGE: 'Superseded by a policy change',
  SENSITIVE_CUSTOMER: 'Sensitive customer',
  OPTED_OUT: 'Opted out',
  ON_TAILORED_ASSISTANCE: 'On tailored assistance',

  /* hardship status (Salesforce) */
  TAILORED_ASSISTANCE: 'Tailored assistance',
  PAYMENT_DIFFICULTY: 'Payment difficulty',
  NONE: 'None',

  /* finding statuses */
  UNVERIFIED: 'Unverified',
  APPLIES: 'Applies',
  AVAILABLE: 'Available',
  NOT_AVAILABLE: 'Not available',
  NOT_TRIGGERED: 'Not triggered',
  NO_MONETARY_FLOOR: 'No monetary floor',
  NO_LOWER_OFFER: 'No cheaper offer',
  CONFLICT_MATERIAL: 'Systems disagree',
  CONFLICT_IMMATERIAL: 'Systems differ slightly',
  MATCHED: 'Systems agree',
  CLEAR: 'Clear',
  BLOCKED: 'Blocked',
  MISSING: 'Missing',
  REVIEW: 'Needs review',

  /* threshold / assessment provenance */
  FUEL_SPLIT_UNKNOWN: 'Fuel split unknown',
  AGGREGATE_CONCLUSIVE: 'Conclusive on the aggregate balance',
  GST_INCLUSIVE: 'GST inclusive',
  GST_EXCLUSIVE: 'GST exclusive',
  CALENDAR_MONTHS: 'Calendar months',

  /* severities */
  BLOCKING: 'Blocking',
  ATTENTION: 'Needs attention',
  PASS: 'Passed',
  INFO: 'Informational',

  /* actions, verdicts, action status */
  REQUEST_PLAN_SWITCH: 'Request plan switch',
  APPROVAL_REQUIRED: 'Approval required',
  AWAITING_APPROVAL: 'Awaiting approval',
  SUPERSEDED: 'Superseded',
  REJECTED: 'Rejected',
  DONE: 'Done',
  AGREED: 'Agreed',
  OVERRIDDEN: 'Overridden',
  DISAGREED: 'Disagreed',

  /* systems */
  SALESFORCE: 'Salesforce',
  STRIPE: 'Stripe',
};

/** Sentence-case a constant, preserving acronyms. The never-blank fallback. */
function sentenceCase(token) {
  const words = token.split('_').filter(Boolean);
  if (!words.length) return token;
  return words
    .map((word, index) => {
      if (KEEP_UPPER.has(word)) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/**
 * A backend constant as English. Unknown constants degrade to sentence case;
 * anything that is not constant-shaped comes back untouched.
 * @param {*} value    the raw value from the API
 * @param {*} fallback returned for null / undefined / '' (default null)
 */
export function phrase(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const key = raw.toUpperCase();
  if (PHRASES[key]) return PHRASES[key];
  if (!CONSTANT.test(raw)) return raw;      // already prose / an identifier
  if (KEEP_UPPER.has(raw)) return raw;      // a bare acronym stays an acronym
  return sentenceCase(raw);
}

/** phrase(), lower-cased for mid-sentence use — acronym-safe. */
export function phraseInline(value, fallback = null) {
  const text = phrase(value, fallback);
  if (!text || typeof text !== 'string') return text;
  const [first, ...rest] = text.split(' ');
  return KEEP_UPPER.has(first.toUpperCase()) ? text : [first.toLowerCase(), ...rest].join(' ');
}

/* The ledger's own summary line arrives as developer prose — "Latest
 * deterministic outcome: ACTION_REQUIRED." Rewrite it into a sentence an
 * officer can read. Same fact, same outcome vocabulary underneath. */
const OUTCOME_SENTENCES = {
  ACTION_REQUIRED: 'The last policy check found something that needs an officer decision.',
  INSUFFICIENT_EVIDENCE: 'The last policy check could not reach a conclusion — evidence is missing.',
  NO_CHANGE: 'The last policy check found nothing that needs to change.',
  NOT_EVALUATED: 'This customer has not been checked against the policy yet.',
  ESCALATION_REQUIRED: 'The last policy check needs escalation beyond this queue.',
  PREVIOUS_DECISION_SUPERSEDED: 'This check replaces an earlier decision for this customer.',
  SUPERSEDED_BY_POLICY_CHANGE: 'A policy change has superseded the earlier decision for this customer.',
};

/** Plain-English sentence for an outcome constant. Never blank, never a crash. */
export function outcomeSentence(value) {
  if (value === null || value === undefined || value === '') return null;
  const key = String(value).trim().toUpperCase();
  return OUTCOME_SENTENCES[key] || `The last policy check returned ${phraseInline(value)}.`;
}

/**
 * Free text from the API, made readable: the known developer sentence is
 * rewritten outright, and any bare constant left inside prose is phrased.
 */
export function humanSummary(text) {
  if (text === null || text === undefined || text === '') return null;
  const value = String(text);
  const known = value.match(/^\s*latest deterministic outcome:\s*([A-Za-z0-9_]+)\.?\s*$/i);
  if (known) return outcomeSentence(known[1]);
  return value.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (token) => phrase(token, token));
}

export function isMissing(value) {
  return value === NOT_SET || value === null || value === undefined || value === '';
}

/* -- Section --------------------------------------------------------------- */

/** The one section header treatment. `meta` sits right-aligned and quiet. */
export function Section({ title, meta, actions, children, className = '' }) {
  return (
    <section className={`u-section ${className}`}>
      {(title || meta || actions) && (
        <div className="u-section-h">
          {title && <h3>{title}</h3>}
          {meta && <span className="u-section-meta">{meta}</span>}
          {actions && <span className="u-section-actions">{actions}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/* -- FieldRow -------------------------------------------------------------- */

/**
 * emphasis: "decision" — the value moves a regulatory threshold
 *           "default"  — supporting fact
 *           "muted"    — identifier / provenance, present but not read
 * `system` names the system of record so the missing state can be specific.
 */
export function FieldRow({ label, value, emphasis = 'default', system = 'the source system' }) {
  const missing = isMissing(value);
  return (
    <div className={`u-field u-field-${emphasis}`}>
      <span className="u-field-k">{label}</span>
      <span className={`u-field-v ${missing ? 'u-field-missing' : ''}`}>
        {missing ? `Not recorded in ${system}` : value}
      </span>
    </div>
  );
}

/** Grid wrapper for FieldRows. `cols` 1 or 2. */
export function Fields({ children, cols = 2 }) {
  return <div className={`u-fields u-fields-${cols}`}>{children}</div>;
}

/* -- Chip ------------------------------------------------------------------ */

const TONES = new Set(['blocking', 'attention', 'pass', 'info', 'neutral']);

/** Backend severity vocabulary (rules[4] / evidence.severity) → chip tone. */
export function toneForSeverity(severity) {
  const value = String(severity || '').toUpperCase();
  if (value === 'BLOCKING') return 'blocking';
  if (value === 'ATTENTION') return 'attention';
  if (value === 'PASS') return 'pass';
  if (value === 'INFO') return 'info';
  return 'neutral';
}

export function Chip({ tone = 'neutral', children, title }) {
  const t = TONES.has(tone) ? tone : 'neutral';
  return <span className={`u-chip u-chip-${t}`} title={title}>{children}</span>;
}

/* -- Disclosure ------------------------------------------------------------ */

/** Collapsed by default. This is where demoted detail lives. */
export function Disclosure({ label, count: n, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`u-disc ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="u-disc-b"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <i className="u-caret" aria-hidden="true" />
        <span>{label}</span>
        {typeof n === 'number' && <em>{n}</em>}
      </button>
      {open && <div className="u-disc-body" id={id}>{children}</div>}
    </div>
  );
}

/* -- states ---------------------------------------------------------------- */

/** The one "something is wrong upstream" treatment. Never hidden, never removed. */
export function StateNote({ tone = 'quiet', children }) {
  return (
    <div className={`u-state u-state-${tone}`}>
      {tone === 'error' && <Icon name="warn" size={13} />}
      <span>{children}</span>
    </div>
  );
}
