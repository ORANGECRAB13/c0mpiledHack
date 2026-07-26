import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';

const ENTITY_KPIS = [
  { entity: 'customers', label: 'Customer Accounts' },
  { entity: 'meters', label: 'Smart Meters' },
  { entity: 'transformers', label: 'Transformers' },
  { entity: 'employees', label: 'Employees' }
];

const DOC_KPIS = [
  { docType: 'utility_bill', label: 'Utility Bills' },
  { docType: 'payment', label: 'Payments' },
  { docType: 'work_order', label: 'Work Orders' },
  { docType: 'outage_event', label: 'Outage Events' },
  { docType: 'purchase_order', label: 'Purchase Orders' },
];

export default function Dashboard() {
  const { user } = useApp();
  const [counts, setCounts] = useState({});
  const [docCounts, setDocCounts] = useState({});
  const [openAnomalies, setOpenAnomalies] = useState(null);

  useEffect(() => {
    ENTITY_KPIS.forEach(({ entity }) => {
      api.get(`/api/registry/${entity}?pageSize=1`).then((data) => setCounts((c) => ({ ...c, [entity]: data.total }))).catch(() => {});
    });
    DOC_KPIS.forEach(({ docType }) => {
      api.get(`/api/documents/${docType}?pageSize=1`).then((data) => setDocCounts((c) => ({ ...c, [docType]: data.total }))).catch(() => {});
    });
    api.get('/api/anomalies?status=open&pageSize=1').then((data) => setOpenAnomalies(data.total)).catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-slate-900">Utility Operations Overview</h1>
          <p className="text-sm text-slate-500">Synthetic PG&amp;E-style electric utility data · refreshed July 25, 2026</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">● All systems operational</span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Customers energized', '2,376', '+0.8% this month'],
          ['Energy delivered', '18.4 GWh', 'Today'],
          ['Active outages', '6', '1,284 customers'],
          ['Revenue collected', '$42.8M', 'Current period']
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-emerald-600">{note}</p>
          </div>
        ))}
      </div>

      <Link
        to="/anomalies"
        className={`mb-8 block rounded-xl border p-5 shadow-sm transition hover:shadow ${
          openAnomalies ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
        }`}
      >
        <p className="text-sm text-slate-500">Open anomaly flags</p>
        <p className={`mt-1 text-3xl font-semibold ${openAnomalies ? 'text-amber-700' : 'text-slate-900'}`}>
          {openAnomalies !== null ? openAnomalies : '—'}
        </p>
        {openAnomalies > 0 && (
          <p className="mt-1 text-xs text-amber-700">Operational, billing, asset-health, and financial exceptions awaiting review.</p>
        )}
      </Link>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {DOC_KPIS.map(({ docType, label }) => (
          <Link key={docType} to={`/documents/${docType}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{docCounts[docType]?.toLocaleString() ?? '—'}</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Utility master data</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ENTITY_KPIS.map(({ entity, label }) => (
          <Link key={entity} to={`/entity/${entity}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{counts[entity]?.toLocaleString() ?? '—'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
