import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function JournalPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [trialBalance, setTrialBalance] = useState(null);

  useEffect(() => {
    api
      .get(`/api/journal?page=${page}&pageSize=25`)
      .then((data) => {
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {});
  }, [page]);

  async function openEntry(row) {
    setSelected(await api.get(`/api/journal/${row.id}`));
  }

  async function loadTrialBalance() {
    const data = await api.get('/api/journal/reports/trial-balance');
    setTrialBalance(data.accounts);
  }

  const columns = [
    { key: 'entry_no', label: 'Entry' },
    { key: 'entry_date', label: 'Date', render: (row) => String(row.entry_date).slice(0, 10) },
    { key: 'memo', label: 'Memo' },
    { key: 'total_debit', label: 'Debits', render: (row) => formatMoney(row.total_debit) },
    { key: 'total_credit', label: 'Credits', render: (row) => formatMoney(row.total_credit) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> }
  ];

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">General Journal</h1>
        <button onClick={loadTrialBalance} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Trial Balance
        </button>
      </div>

      {trialBalance && (
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Account</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Debits</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Credits</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trialBalance.map((account) => (
                <tr key={account.code}>
                  <td className="px-4 py-1.5">{account.code} — {account.name}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{formatMoney(account.total_debit)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{formatMoney(account.total_credit)}</td>
                  <td className="px-4 py-1.5 text-right font-medium tabular-nums">{formatMoney(account.balance)}</td>
                </tr>
              ))}
              {!trialBalance.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No posted journal entries yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <DataTable columns={columns} rows={rows} page={page} pageSize={25} total={total} onPageChange={setPage} onRowClick={openEntry} />

      {selected && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-[42rem] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selected.entry_no}</h2>
              <StatusBadge status={selected.status} />
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {String(selected.entry_date).slice(0, 10)} — {selected.memo}
            </p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-1">Account</th>
                  <th className="py-1 text-right">Debit</th>
                  <th className="py-1 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => (
                  <tr key={line.id} className="border-b border-slate-100">
                    <td className="py-1">{line.account_code} — {line.account_name}</td>
                    <td className="py-1 text-right tabular-nums">{Number(line.debit) ? formatMoney(line.debit) : ''}</td>
                    <td className="py-1 text-right tabular-nums">{Number(line.credit) ? formatMoney(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
