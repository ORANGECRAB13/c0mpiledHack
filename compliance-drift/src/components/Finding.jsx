import React, { useState } from 'react';
import { Disclosure, phrase, toneForSeverity } from './ui.jsx';
import '../styles/evidence.css';

/* ============================================================================
 * Finding — the ONE rendering of a policy finding.
 *
 * Both surfaces that list findings render this: the case workspace's
 * "Why this was flagged" panel and the evidence overlay's decision trail. They
 * used to draw the same payload two ways and were already drifting; there is
 * now one component, so a change to how a finding reads happens once.
 *
 * P3 — progressive disclosure. A finding at rest is ONE LINE: its phrased
 * status and a short human rule title. Everything else — the explanation, the
 * rule's full technical name when it was shortened — sits behind that line's
 * own disclosure. Expanding a finding shows PLAIN ENGLISH ONLY: the
 * explanation sentence, as the policy wrote it. The regulatory reference —
 * clause, civil-penalty provision, threshold and its source, assessment basis,
 * age unit — sits one level deeper again, behind "Regulatory reference".
 *
 * P7 — honesty survives. Nothing above is dropped, only demoted: every clause
 * citation, civil-penalty provision, threshold source and insufficient-evidence
 * explanation is still reachable, and a finding with no explanation says so
 * rather than rendering blank. Blocking findings open to their explanation by
 * default; they are what the officer is here for.
 *
 * Display only: `status` and `severity` are still the backend's constants and
 * every branch below reads the raw value. `phrase()` touches presentation only.
 * ========================================================================== */

/* Short, human headers. The precise name is preserved inside the disclosure
   whenever it is shortened, so nothing is lost — the line just stops being a
   sentence. A rule not listed here keeps the name the policy gave it. */
const SHORT_TITLE = {
  'Disconnection threshold — none in force': 'Disconnection threshold',
  'Sensitive-customer recovery protection': 'Sensitive customer protection',
  'Arrears corroboration — billing system': 'Arrears match billing',
  'Automatic best offer — tailored assistance': 'Best offer — tailored assistance',
};

export function shortTitle(rule) {
  const name = rule || 'Unnamed rule';
  return SHORT_TITLE[name] || name;
}

/**
 * A finding's chip/dot tone. `severity` is the backend vocabulary
 * (BLOCKING / ATTENTION / PASS / INFO) and is authoritative when present; older
 * ledger rows carry only a status string, so we derive from that instead.
 */
export function findingTone(finding) {
  if (finding.severity) return toneForSeverity(finding.severity);
  const value = String(finding.status || '').toUpperCase();
  if (value === 'NOT_TRIGGERED') return 'pass';
  if (/TRIGGERED$|^BLOCK|BREACH|OVERDUE|PROHIBIT/.test(value)) return 'blocking';
  if (/INSUFFICIENT|UNVERIFIED|UNKNOWN|OPTED_OUT|SENSITIVE|CONFLICT/.test(value)) return 'attention';
  if (/CLEAR|MET|OK|PASS|NO_LOWER_OFFER|NO_MONETARY_FLOOR|MATCHED/.test(value)) return 'pass';
  return 'info';
}

/** Normalise a case's `rules` tuple into the evidence object shape. */
export function findingsOf(caseData) {
  if (!caseData) return [];
  const evidence = Array.isArray(caseData.evidence) ? caseData.evidence : [];
  if (evidence.length) return evidence;
  const rules = Array.isArray(caseData.rules) ? caseData.rules : [];
  return rules.map(([rule, status, , explanation, severity]) => {
    /* The tuple carries the clause appended to the explanation with " · ".
       Split it back out so the citation lands where it belongs rather than
       padding the summary line. */
    const text = String(explanation || '');
    const cut = text.lastIndexOf(' · ');
    const hasCitation = cut > 0 && /\bcl\b|ERCoP/i.test(text.slice(cut));
    return {
      rule,
      status,
      severity,
      explanation: hasCitation ? text.slice(0, cut) : (text || null),
      citation: hasCitation ? text.slice(cut + 3) : null,
    };
  });
}

/* -- one finding ----------------------------------------------------------- */

export function Finding({ finding, defaultOpen }) {
  const tone = findingTone(finding);
  /* A blocking finding leads and opens: its backing is the payload. */
  const [open, setOpen] = useState(defaultOpen === undefined ? tone === 'blocking' : Boolean(defaultOpen));
  const full = finding.rule || 'Unnamed rule';
  const title = shortTitle(full);

  /* The regulatory reference. It sits ONE LEVEL DEEPER than the explanation:
     an officer triaging cases never sees a clause number, and an officer
     writing a breach up reaches all of it in one more click. Retained in full
     (P7) — demoted, never deleted.
     The finding's raw status constant is deliberately NOT repeated here: the
     phrased status already leads the line, so the constant was duplication
     rather than evidence. */
  const backing = [
    finding.citation ? ['Clause', finding.citation, 'ev-cite'] : null,
    finding.penaltyProvision ? ['Civil penalty provision', finding.penaltyProvision, 'ev-penalty'] : null,
    typeof finding.thresholdValue === 'number'
      ? ['Threshold', finding.thresholdSource ? `${finding.thresholdValue} · ${finding.thresholdSource}` : String(finding.thresholdValue), '']
      : finding.thresholdSource ? ['Threshold', finding.thresholdSource, ''] : null,
    finding.thresholdSupersededByGuideline ? ['Guideline', String(finding.thresholdSupersededByGuideline), ''] : null,
    finding.assessmentBasis ? ['Assessed on', phrase(finding.assessmentBasis), ''] : null,
    finding.ageUnit ? ['Age measured in', phrase(finding.ageUnit), ''] : null,
    finding.delta !== null && finding.delta !== undefined ? ['Difference', String(finding.delta), ''] : null,
    title !== full ? ['Rule as written in the policy', full, ''] : null,
  ].filter(Boolean);

  return (
    <div className={`fi ${open ? 'is-open' : ''} fi-${tone}`}>
      <button type="button" className="fi-top" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <i className="u-caret" aria-hidden="true" />
        <span className={`fi-status ov-t-${tone}`}>{phrase(finding.status, 'No status recorded')}</span>
        <b className="fi-rule">{title}</b>
      </button>
      {open && (
        <div className="fi-body">
          {/* Plain English only. The explanation is rendered exactly as the
              policy wrote it — no labels, no metadata around it. */}
          {finding.explanation
            ? <p>{finding.explanation}</p>
            : <p className="fi-none">No explanation was recorded with this finding.</p>}
          {backing.length > 0 && (
            <Disclosure label="Regulatory reference" count={backing.length}>
              <div className="fi-backing">
                {backing.map(([key, value, className]) => (
                  <div key={key} className={className}><em>{key}</em> {value}</div>
                ))}
              </div>
            </Disclosure>
          )}
        </div>
      )}
    </div>
  );
}

/* -- the list -------------------------------------------------------------- */

/**
 * Findings that could change the officer's next move lead; everything that
 * merely passed or is informational collapses behind one counted disclosure.
 * Nothing is filtered away — the counts add up to the whole evaluated set.
 */
export function FindingList({ findings, idPrefix = 'f', quietLabel = 'Checks that passed or were informational', emptyNote = null }) {
  const all = Array.isArray(findings) ? findings : [];
  const live = all.filter((item) => ['blocking', 'attention'].includes(findingTone(item)));
  const quiet = all.filter((item) => !live.includes(item));

  return (
    <>
      {live.length > 0 && (
        <div className="fi-list">
          {live.map((item, index) => (
            <Finding key={`${idPrefix}-l-${item.rule || index}`} finding={item} />
          ))}
        </div>
      )}
      {!all.length && emptyNote}
      {!!all.length && !live.length && (
        <p className="ov-quiet">No rule raised a blocking or attention finding. Every evaluated check is listed below.</p>
      )}
      {quiet.length > 0 && (
        <Disclosure label={quietLabel} count={quiet.length}>
          <div className="fi-list fi-list-quiet">
            {quiet.map((item, index) => (
              <Finding key={`${idPrefix}-q-${item.rule || index}`} finding={item} defaultOpen={false} />
            ))}
          </div>
        </Disclosure>
      )}
    </>
  );
}

export default Finding;
