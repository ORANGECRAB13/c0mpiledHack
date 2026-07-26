import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function AnomaliesPage() {
  const { user } = useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);

  const reload = useCallback(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status) query.set('status', status);
    api
      .get(`/api/anomalies?${query}`)
      .then((data) => {
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {});
  }, [status, page]);

  useEffect(reload, [reload]);

  async function resolve(flag) {
    const note = window.prompt(`Resolution note for ${flag.rule_code} (required):`);
    if (!note) return;
    await api.post(`/api/anomalies/${flag.id}/resolve`, { note });
    reload();
  }

  const canResolve = ['accountant', 'admin'].includes(user.role);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Anomalies</h1>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <p className="mb-4 text-sm text-slate-500">{total} flag{total === 1 ? '' : 's'}</p>

      <div className="space-y-3">
        {rows.map((flag) => (
          <div key={flag.id} className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={flag.severity} />
                <span className="font-medium text-slate-800">{flag.rule_code}</span>
                <StatusBadge status={flag.status} />
                <span className="text-xs text-slate-400">
                  {flag.entity_type} · {new Date(flag.created_at).toLocaleDateString()}
                </span>
              </div>
              {canResolve && flag.status !== 'resolved' && (
                <button onClick={() => resolve(flag)} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
                  Resolve…
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-700">{flag.message}</p>
            {flag.ai_review && (
              <p className="mt-1 text-xs text-slate-500">
                AI review: <span className="font-medium">{flag.ai_review.verdict}</span> — {flag.ai_review.explanation}
              </p>
            )}
            {flag.resolution_note && (
              <p className="mt-1 text-xs text-green-700">Resolved: {flag.resolution_note}</p>
            )}
          </div>
        ))}
        {!rows.length && <p className="py-12 text-center text-slate-400">No anomaly flags</p>}
      </div>
    </div>
  );
}
