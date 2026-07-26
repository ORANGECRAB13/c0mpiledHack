import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function AuditTrail({ entityType, entityId }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const query = new URLSearchParams({ entityType });
    if (entityId) query.set('entityId', entityId);
    api
      .get(`/api/audit?${query}`)
      .then((data) => setRows(data.rows))
      .catch(() => setRows([]));
  }, [entityType, entityId]);

  if (!rows.length) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Audit trail</h2>
      <ol className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <div className="flex items-center justify-between">
              <span>
                <ActionBadge action={row.action} />
                <span className="ml-2 font-medium text-slate-800">{row.actor_name}</span>
                {row.reason && <span className="ml-2 text-slate-500">— {row.reason}</span>}
              </span>
              <time className="text-xs text-slate-400">{new Date(row.at).toLocaleString()}</time>
            </div>
            {row.action === 'update' && row.old_data && row.new_data && (
              <ChangeSummary oldData={row.old_data} newData={row.new_data} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActionBadge({ action }) {
  const colors = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    post: 'bg-indigo-100 text-indigo-700',
    void: 'bg-orange-100 text-orange-700',
    reverse: 'bg-orange-100 text-orange-700',
    migrate: 'bg-slate-100 text-slate-600'
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[action] || 'bg-slate-100 text-slate-600'}`}>
      {action}
    </span>
  );
}

function ChangeSummary({ oldData, newData }) {
  const changes = Object.keys(newData).filter(
    (key) =>
      !['updated_at', 'updated_by', 'legacy_source'].includes(key) &&
      JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])
  );
  if (!changes.length) return null;

  return (
    <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
      {changes.map((key) => (
        <li key={key}>
          <span className="font-medium">{key}</span>: {formatValue(oldData[key])} → {formatValue(newData[key])}
        </li>
      ))}
    </ul>
  );
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
