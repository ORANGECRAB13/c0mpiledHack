import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';

export default function EntityListPage() {
  const { entity } = useParams();
  const { entities, user } = useApp();
  const meta = entities.find((candidate) => candidate.name === entity);
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loadError, setLoadError] = useState('');
  const pageSize = 25;

  useEffect(() => {
    setPage(1);
    setQ('');
  }, [entity]);

  useEffect(() => {
    if (!meta) return;
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) query.set('q', q);
    api
      .get(`/api/registry/${entity}?${query}`)
      .then((data) => {
        setRows(data.rows);
        setTotal(data.total);
        setLoadError('');
      })
      .catch((error) => setLoadError(error.message));
  }, [entity, meta, page, q]);

  const columns = useMemo(() => {
    if (!meta) return [];
    return meta.fields
      .filter((field) => field.type !== 'ref' || field.searchable)
      .slice(0, 6)
      .map((field) => ({ key: field.name, label: field.label }));
  }, [meta]);

  if (!meta) return <div className="p-8 text-slate-400">Unknown entity</div>;

  const canCreate = user.role !== 'viewer' && !meta.readOnly;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{meta.label}</h1>
        {canCreate && (
          <button
            onClick={() => navigate(`/entity/${entity}/new`)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New {meta.label.replace(/s$/, '')}
          </button>
        )}
      </div>

      <input
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          setPage(1);
        }}
        placeholder="Search…"
        className="mb-4 w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />

      {loadError && <p className="mb-4 text-sm text-red-600">{loadError}</p>}

      <DataTable
        columns={columns}
        rows={rows}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/entity/${entity}/${row.id}`)}
      />
    </div>
  );
}
