import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import { Markdown } from '../lib/markdown.jsx';

/**
 * Financial Auditing Agent UI: run a financial audit, see deterministic check
 * results by severity, drill into offending records, and read the AI auditor's
 * prioritized opinion.
 */
export default function FinancialAuditPage() {
  const { user } = useApp();
  const [runs, setRuns] = useState([]);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({});

  const canRun = ['admin', 'accountant'].includes(user.role);

  async function loadRuns() {
    const data = await api.get('/api/audit-agent/runs').catch(() => ({ runs: [] }));
    setRuns(data.runs);
    if (data.runs[0] && !active) loadRun(data.runs[0].id);
  }
  async function loadRun(id) {
    setActive(await api.get(`/api/audit-agent/runs/${id}`).catch(() => null));
  }
  useEffect(() => {
    loadRuns();
  }, []);

  async function runAudit() {
    setBusy(true);
    try {
      const result = await api.post('/api/audit-agent/run', {});
      await loadRuns();
      await loadRun(result.id);
    } finally {
      setBusy(false);
    }
  }

  const sevColor = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    warn: 'bg-amber-100 text-amber-700 border-amber-200',
    info: 'bg-slate-100 text-slate-600 border-slate-200'
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Financial Audit</h1>
          <p className="text-sm text-slate-500">AI auditing agent — financial-integrity checks across documents, payments, and ledgers.</p>
        </div>
        {canRun && (
          <button
            onClick={runAudit}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Auditing…' : 'Run Audit'}
          </button>
        )}
      </div>

      {runs.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => loadRun(run.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                active?.id === run.id ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              #{run.id} · {new Date(run.started_at).toLocaleString()} · {run.total_findings} findings
              {run.critical_findings > 0 && <span className="ml-1 font-semibold text-red-600">({run.critical_findings} crit)</span>}
            </button>
          ))}
        </div>
      )}

      {!active ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          No audit runs yet. {canRun ? 'Click “Run Audit” to start.' : 'Ask an accountant to run an audit.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Checks</h2>
            {(active.checks || []).map((check) => (
              <div key={check.code} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [check.code]: !e[check.code] }))}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${sevColor[check.severity]}`}>
                      {check.severity}
                    </span>
                    <span className="text-sm text-slate-800">{check.title}</span>
                  </div>
                  <span className={`text-sm font-semibold ${check.count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {check.error ? 'error' : check.count === 0 ? 'pass' : check.count}
                  </span>
                </button>
                {expanded[check.code] && check.sample?.length > 0 && (
                  <div className="overflow-x-auto border-t border-slate-100 bg-slate-50 px-4 py-2">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          {Object.keys(check.sample[0]).map((col) => (
                            <th key={col} className="px-2 py-1">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {check.sample.map((row, index) => (
                          <tr key={index} className="border-t border-slate-200">
                            {Object.values(row).map((value, columnIndex) => (
                              <td key={columnIndex} className="px-2 py-1 text-slate-700">{String(value ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {check.count > check.sample.length && (
                      <p className="mt-1 text-xs text-slate-400">+ {check.count - check.sample.length} more…</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Auditor's Opinion</h2>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <Markdown text={active.opinion || ''} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
