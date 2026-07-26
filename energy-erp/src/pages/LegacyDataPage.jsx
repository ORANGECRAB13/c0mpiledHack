import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Browser for synthetic source-system datasets used by the utility demo.
 */
export default function LegacyDataPage() {
  const [systems, setSystems] = useState({});
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/api/legacy/datasets').then((res) => setSystems(res.systems)).catch(() => setSystems({}));
  }, []);

  useEffect(() => {
    if (!active) return;
    const query = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (q) query.set('q', q);
    api.get(`/api/legacy/datasets/${active}/records?${query}`).then(setData).catch(() => setData(null));
  }, [active, page, q]);

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Operational Data Lake</h2>
        <p className="mb-4 text-xs text-slate-500">Synthetic source-system snapshots for customer, meter, asset, and outage data.</p>
        {Object.entries(systems).map(([system, datasets]) => (
          <div key={system} className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{system}</p>
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                onClick={() => {
                  setActive(dataset.id);
                  setPage(1);
                  setQ('');
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm ${
                  active === dataset.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="truncate">{dataset.endpoint_path.replace(/^\//, '')}</span>
                <span className={`ml-2 shrink-0 text-xs ${active === dataset.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {dataset.row_count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!data ? (
          <div className="text-slate-400">Select a table from the left to browse its rows.</div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{data.dataset.endpoint_path}</h1>
                <p className="text-sm text-slate-500">
                  {data.dataset.system_name} · {data.total.toLocaleString()} rows · strategy: {data.dataset.strategy}
                </p>
              </div>
              <input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder="Search rows…"
                className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {(data.columns.length ? data.columns : Object.keys(data.rows[0]?.data || {})).map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-slate-600">
                        {col || '—'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      {(data.columns.length ? data.columns : Object.keys(row.data)).map((col) => (
                        <td key={col} className="px-3 py-1.5 text-slate-700">
                          {String(row.data[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <span>
                Page {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={page >= Math.ceil(data.total / data.pageSize)}
                  onClick={() => setPage(page + 1)}
                  className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
