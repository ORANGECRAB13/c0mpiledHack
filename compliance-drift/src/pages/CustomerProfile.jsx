import React, { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { decisionLayerApi } from '../api/decisionLayerApi.js';
import SystemsOfRecord from '../components/SystemsOfRecord.jsx';
import { StateNote } from '../components/ui.jsx';

/* ============================================================================
 * CustomerProfile — the detail panel opened from Monitoring.
 *
 * This file used to render 27 labelled fields at flat, equal weight across two
 * hand-built blocks. It now does one job: fetch the profile and hand it to
 * <SystemsOfRecord/>, which is the single rendering of Salesforce + Stripe
 * shared with EvidenceOverlay (P6). Field selection, emphasis, progressive
 * disclosure and the honest-missing states all live there.
 *
 * Contract published by DataWiring (unchanged — this was a presentation-only
 * change; no request, no field, no data shape was touched):
 *   GET /api/decision-layer/customers/:externalCustomerId/profile
 *   → { ok: true, profile: { externalCustomerId, name, jurisdiction,
 *        salesforce: { available, error, ... },
 *        stripe:     { available, error, ..., invoices[], trend[] },
 *        reconciliation: { salesforceArrears, stripeOpenAmount, delta, matched } } }
 *
 * All money fields are DOLLARS (numbers), not cents. Currency AUD.
 *
 * `reference` MUST be the External_Customer_Id__c ("1002"), never the
 * MON-prefixed display id the table shows. A wrong reference does not 404 —
 * the server answers 200 with available:false, which is why nothing here
 * infers success from HTTP status; every section branches on its own
 * `available` flag instead.
 * ========================================================================== */

export default function CustomerProfile({ account, onClose, onOpenCase }) {
  const [state, setState] = useState({ loading: true, error: null, profile: null });

  // Accept either the External_Customer_Id__c or the ledger customer id.
  const lookupId = account?.externalCustomerId || account?.caseId || null;

  useEffect(() => {
    if (!account || !lookupId) {
      setState({ loading: false, error: account ? 'No customer identifier on this record — cannot reconcile Salesforce or Stripe.' : null, profile: null });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, error: null, profile: null });
    decisionLayerApi.loadCustomerProfile(lookupId)
      .then((profile) => { if (!cancelled) setState({ loading: false, error: null, profile }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: error.message, profile: null }); });
    return () => { cancelled = true; };
  }, [lookupId]);

  if (!account) return null;
  const { loading, error, profile } = state;

  return (
    <aside className="cp-panel" aria-label={`Customer profile for ${account.customer}`}>
      <div className="cp-head">
        <div>
          <div className="cp-eyebrow">Customer profile</div>
          <h2>{profile?.name || account.customer}</h2>
          <div className="cp-meta">
            {[profile?.externalCustomerId || account.externalCustomerId, profile?.jurisdiction, account.id].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="cp-head-actions">
          {account.caseId && <button className="text-button primary" onClick={() => onOpenCase?.(account.caseId)}>Open case</button>}
          <button className="cp-close" onClick={onClose} aria-label="Close profile"><Icon name="x" size={13} /></button>
        </div>
      </div>

      <div className="cp-block">
        {loading && <StateNote>Reading Salesforce and Stripe…</StateNote>}
        {!loading && error && <StateNote tone="error">Profile unavailable — {error}</StateNote>}
        {!loading && profile && <SystemsOfRecord profile={profile} />}
      </div>
    </aside>
  );
}
