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
