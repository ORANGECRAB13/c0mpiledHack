import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function AuditLogPage() {
  const [rows, setRows] = useState([]);
  const [entityType, setEntityType] = useState('');

  useEffect(() => {
    const query = new URLSearchParams({ limit: '100' });
    if (entityType) query.set('entityType', entityType);
    api
      .get(`/api/audit?${query}`)
      .then((data) => setRows(data.rows))
      .catch(() => setRows([]));
  }, [entityType]);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Audit Log</h1>

      <input
        value={entityType}
        onChange={(event) => setEntityType(event.target.value)}
        placeholder="Filter by entity type…"
        className="mb-4 w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">When</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Actor</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Action</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Entity</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2 text-slate-500">{new Date(row.at).toLocaleString()}</td>
                <td className="px-4 py-2 text-slate-800">{row.actor_name}</td>
                <td className="px-4 py-2">{row.action}</td>
                <td className="px-4 py-2 text-slate-800">
                  {row.entity_type} #{row.entity_id}
                </td>
                <td className="px-4 py-2 text-slate-500">{row.reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
