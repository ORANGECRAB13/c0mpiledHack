import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function DocumentsListPage({ docTypes }) {
  const { docType } = useParams();
  const meta = docTypes.find((candidate) => candidate.name === docType);
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const pageSize = 25;

  useEffect(() => {
    setPage(1);
    setQ('');
    setStatus('');
  }, [docType]);

  useEffect(() => {
    if (!meta) return;
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) query.set('q', q);
    if (status) query.set('status', status);
    api
      .get(`/api/documents/${docType}?${query}`)
      .then((data) => {
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {});
  }, [docType, meta, page, q, status]);

  if (!meta) return <div className="p-8 text-slate-400">Unknown document type</div>;

  const columns = [
    { key: 'doc_no', label: 'Number' },
    { key: 'doc_date', label: 'Date', render: (row) => String(row.doc_date).slice(0, 10) },
    { key: 'party_name', label: meta.partyType === 'customer' ? 'Customer' : meta.partyType === 'supplier' ? 'Supplier' : 'Party' },
    { key: 'branch_name', label: 'Branch' },
    { key: 'total', label: 'Total', render: (row) => formatMoney(row.total) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> }
  ];

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{meta.label}</h1>
        <button
          onClick={() => navigate(`/documents/${docType}/new`)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Search number, party, notes…"
          className="w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/documents/${docType}/${row.id}`)}
      />
    </div>
  );
}

function formatMoney(value) {
  const amount = Number(value);
  if (!amount) return '—';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
