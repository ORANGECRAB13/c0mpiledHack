import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import AuditTrail from '../components/AuditTrail.jsx';
import RefSelect from '../components/RefSelect.jsx';

export default function DocumentEditorPage({ docTypes }) {
  const { docType, id } = useParams();
  const meta = docTypes.find((candidate) => candidate.name === docType);
  const { user } = useApp();
  const navigate = useNavigate();
  const isNew = !id;

  const [doc, setDoc] = useState(null);
  const [header, setHeader] = useState({ doc_date: new Date().toISOString().slice(0, 10), party_id: null, branch_id: null, notes: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (isNew) return;
    api.get(`/api/documents/${docType}/${id}`).then((data) => {
      setDoc(data);
      setHeader({
        doc_date: String(data.doc_date).slice(0, 10),
        party_id: data.party_id,
        branch_id: data.branch_id,
        notes: data.notes || ''
      });
      setLines(
        data.lines.length
          ? data.lines.map((line) => ({
              product_id: line.product_id,
              description: line.description || '',
              qty: Number(line.qty),
              unit_price: Number(line.unit_price),
              line_total: Number(line.line_total)
            }))
          : [emptyLine()]
      );
    });
  }, [docType, id, isNew]);

  useEffect(reload, [reload]);

  if (!meta) return <div className="p-8 text-slate-400">Unknown document type</div>;

  const editable = isNew || doc?.status === 'draft';
  const canPost = ['accountant', 'admin'].includes(user.role);
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.line_total) || 0), 0);

  function setLine(index, patch) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };
        if ('qty' in patch || 'unit_price' in patch) {
          next.line_total = round2(Number(next.qty) * Number(next.unit_price));
        }
        return next;
      })
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      ...header,
      lines: lines.filter((line) => line.description || line.product_id || Number(line.qty))
    };
    try {
      if (isNew) {
        const created = await api.post(`/api/documents/${docType}`, payload);
        navigate(`/documents/${docType}/${created.id}`, { replace: true });
      } else {
        await api.put(`/api/documents/${docType}/${id}`, payload);
        reload();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function transition(action) {
    setBusy(true);
    setError(null);
    try {
      let body;
      if (action === 'void') {
        const reason = window.prompt('Void reason (required, recorded in the audit log):');
        if (!reason) {
          setBusy(false);
          return;
        }
        body = { reason };
      }
      await api.post(`/api/documents/${docType}/${id}/${action}`, body);
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500';

  return (
    <div className="p-8">
      <button onClick={() => navigate(`/documents/${docType}`)} className="mb-4 text-sm text-indigo-600 hover:underline">
        ← Back to {meta.label}
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{isNew ? `New ${meta.label.replace(/s$/, '')}` : doc?.doc_no}</h1>
          {doc && <StatusBadge status={doc.status} />}
          {doc?.legacy_id && <span className="text-xs text-slate-400">migrated from legacy</span>}
        </div>
        <div className="flex gap-2">
          {editable && (
            <button onClick={save} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              Save
            </button>
          )}
          {!isNew && doc?.status === 'draft' && canPost && (
            <button onClick={() => transition('post')} disabled={busy} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              Post
            </button>
          )}
          {!isNew && doc?.status === 'posted' && canPost && (
            <button onClick={() => transition('void')} disabled={busy} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
              Void…
            </button>
          )}
        </div>
      </div>

      {doc?.anomalies?.length > 0 && (
        <div className="mb-6 space-y-2">
          {doc.anomalies.map((flag) => (
            <div key={flag.id} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={flag.severity} />
                <span className="font-medium text-slate-800">{flag.rule_code}</span>
                <StatusBadge status={flag.status} />
              </div>
              <p className="mt-1 text-slate-700">{flag.message}</p>
              {flag.ai_review && (
                <p className="mt-1 text-xs text-slate-500">
                  AI review: <span className="font-medium">{flag.ai_review.verdict}</span> — {flag.ai_review.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid max-w-3xl grid-cols-2 gap-4 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
          <input type="date" value={header.doc_date} disabled={!editable} onChange={(event) => setHeader({ ...header, doc_date: event.target.value })} className={inputClass} />
        </div>
        {meta.partyType !== 'none' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{meta.partyType === 'customer' ? 'Customer' : 'Supplier'}</label>
            <RefSelect entity={meta.partyType === 'customer' ? 'customers' : 'suppliers'} value={header.party_id} disabled={!editable} onChange={(value) => setHeader({ ...header, party_id: value })} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Branch</label>
          <RefSelect entity="branches" value={header.branch_id} disabled={!editable} onChange={(value) => setHeader({ ...header, branch_id: value })} />
        </div>
        <div className="col-span-2 lg:col-span-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
          <input value={header.notes} disabled={!editable} onChange={(event) => setHeader({ ...header, notes: event.target.value })} className={inputClass} />
        </div>
      </div>

      {meta.hasLines && (
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-medium text-slate-600">#</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Product / Description</th>
                <th className="w-28 px-3 py-2 text-right font-medium text-slate-600">Qty</th>
                <th className="w-32 px-3 py-2 text-right font-medium text-slate-600">Unit Price</th>
                <th className="w-32 px-3 py-2 text-right font-medium text-slate-600">Line Total</th>
                {editable && <th className="w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => (
                <tr key={index}>
                  <td className="px-3 py-1.5 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-1.5">
                    <input value={line.description} disabled={!editable} placeholder="Description" onChange={(event) => setLine(index, { description: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" value={line.qty} disabled={!editable} onChange={(event) => setLine(index, { qty: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm disabled:border-transparent disabled:bg-transparent" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" step="0.0001" value={line.unit_price} disabled={!editable} onChange={(event) => setLine(index, { unit_price: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm disabled:border-transparent disabled:bg-transparent" />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(line.line_total)}</td>
                  {editable && (
                    <td className="px-2">
                      <button onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))} className="text-slate-300 hover:text-red-500">
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <BreakdownRows subtotal={subtotal} doc={doc} colSpan={4} extraCol={editable} />
            </tfoot>
          </table>
          {editable && (
            <button onClick={() => setLines([...lines, emptyLine()])} className="w-full border-t border-slate-200 py-2 text-sm text-indigo-600 hover:bg-indigo-50">
              + Add line
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 max-w-3xl whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>
      )}

      {!isNew && (
        <div className="max-w-3xl">
          <AuditTrail entityType="documents" entityId={id} />
        </div>
      )}
    </div>
  );
}

/**
 * Totals footer matching the legacy View page breakdown: Gross / Additional /
 * Less / VAT / Net Total. For a saved doc it reads the stored figures; while
 * drafting it shows the live line sum.
 */
function BreakdownRows({ subtotal, doc, colSpan, extraCol }) {
  const attrs = doc?.attrs || {};
  const additional = Number(attrs.additional || 0);
  const less = Number(attrs.less || 0);
  const vat = Number(doc?.tax_amount || 0);
  const embeddedVat = attrs.vatInclusive ? Number(attrs.vatAmount || 0) : 0;
  const net = doc ? Number(doc.total) : subtotal;

  const row = (label, value, opts = {}) => (
    <tr className={opts.bold ? 'font-semibold' : ''}>
      <td colSpan={colSpan} className="px-3 py-1 text-right text-slate-600">
        {label}
      </td>
      <td className={`px-3 py-1 text-right tabular-nums ${opts.bold ? 'text-slate-900' : 'text-slate-700'}`}>{formatMoney(value)}</td>
      {extraCol && <td />}
    </tr>
  );

  // Drafting a new doc: just the running line total
  if (!doc) return row('Total', subtotal, { bold: true });

  return (
    <>
      {row('Gross Amount', subtotal)}
      {additional ? row('Additional', additional) : null}
      {less ? row('Less', less) : null}
      {attrs.vatInclusive
        ? embeddedVat
          ? row(`VAT (${attrs.vatPercent || 12}%, inclusive)`, embeddedVat)
          : null
        : vat
          ? row(`VAT (${attrs.vatPercent || 12}%)`, vat)
          : null}
      {row('Net Total', net, { bold: true })}
    </>
  );
}

function emptyLine() {
  return { product_id: null, description: '', qty: 0, unit_price: 0, line_total: 0 };
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
