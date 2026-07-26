import {
  anomalies, auditRows, auditRun, docTypes, documents, entities, entityRows,
  journal, legacyDataset, legacySystems
} from './syntheticData.js';

const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 80));
const paramsFor = (path) => new URL(path, window.location.origin).searchParams;
const partsFor = (path) => new URL(path, window.location.origin).pathname.split('/').filter(Boolean);

function paged(rows, params) {
  const page = Number(params.get('page') || 1);
  const pageSize = Number(params.get('pageSize') || 25);
  const q = (params.get('q') || '').toLowerCase();
  const status = params.get('status');
  const filtered = rows.filter((row) => {
    if (status && row.status !== status) return false;
    return !q || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q));
  });
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
}

function findEntity(name) {
  return entities.find((entity) => entity.name === name);
}

function auditFor(entityType, entityId) {
  return auditRows.filter((row) => (!entityType || row.entity_type === entityType) && (!entityId || String(row.entity_id) === String(entityId)));
}

async function get(path) {
  const parts = partsFor(path);
  const params = paramsFor(path);

  if (path.startsWith('/api/registry/_meta')) return delay({ entities });
  if (parts[1] === 'registry') {
    const name = parts[2];
    const rows = entityRows[name] || [];
    if (parts[3]) return delay(rows.find((row) => String(row.id) === parts[3]) || {});
    return delay(paged(rows, params));
  }
  if (path.startsWith('/api/documents/_meta')) return delay({ docTypes });
  if (parts[1] === 'documents') {
    const type = parts[2];
    const rows = documents[type] || [];
    if (parts[3]) return delay(rows.find((row) => String(row.id) === parts[3]) || {});
    return delay(paged(rows, params));
  }
  if (path.startsWith('/api/journal/reports/trial-balance')) {
    const accounts = entityRows.chart_of_accounts.slice(0, 12).map((account, index) => ({
      ...account, total_debit: 1800000 + index * 427000, total_credit: 1400000 + index * 389000,
      balance: index < 5 ? 400000 + index * 38000 : -(400000 + index * 38000)
    }));
    return delay({ accounts });
  }
  if (parts[1] === 'journal') {
    if (parts[2]) return delay(journal.find((row) => String(row.id) === parts[2]));
    return delay(paged(journal, params));
  }
  if (parts[1] === 'anomalies') return delay(paged(anomalies, params));
  if (parts[1] === 'audit' && parts[2] !== 'agent') {
    const entityType = params.get('entityType');
    const entityId = params.get('entityId');
    return delay({ rows: auditFor(entityType, entityId).slice(0, Number(params.get('limit') || 100)) });
  }
  if (path === '/api/audit-agent/runs') return delay({ runs: [auditRun] });
  if (parts[1] === 'audit-agent' && parts[2] === 'runs' && parts[3]) return delay(auditRun);
  if (path === '/api/legacy/datasets') return delay({ systems: legacySystems });
  if (parts[1] === 'legacy' && parts[2] === 'datasets' && parts[4] === 'records') {
    const result = legacyDataset(parts[3]);
    const page = Number(params.get('page') || 1);
    const pageSize = Number(params.get('pageSize') || 50);
    return delay({ ...result, rows: result.rows.slice((page - 1) * pageSize, page * pageSize), total: result.dataset.row_count, page, pageSize });
  }
  throw new Error(`Synthetic API route not found: ${path}`);
}

async function mutate(path, body = {}) {
  const parts = partsFor(path);
  if (parts[1] === 'registry') {
    const rows = entityRows[parts[2]] || [];
    if (parts[3]) {
      const index = rows.findIndex((row) => String(row.id) === parts[3]);
      if (index >= 0) rows[index] = { ...rows[index], ...body };
      return delay(rows[index]);
    }
    const created = { id: Math.max(0, ...rows.map((row) => row.id)) + 1, ...body };
    rows.unshift(created);
    return delay(created);
  }
  if (parts[1] === 'documents') {
    const rows = documents[parts[2]] || [];
    const id = parts[3];
    const row = rows.find((item) => String(item.id) === id);
    const action = parts[4];
    if (row && action) {
      row.status = action === 'post' ? 'posted' : action === 'void' ? 'voided' : action;
      return delay(row);
    }
    if (row) {
      Object.assign(row, body);
      row.total = body.lines?.reduce((sum, line) => sum + Number(line.line_total || 0), 0) ?? row.total;
      return delay(row);
    }
    const meta = docTypes.find((item) => item.name === parts[2]);
    const created = {
      id: rows.length + 1, doc_no: `${meta.name.toUpperCase().slice(0, 4)}-NEW-${rows.length + 1}`,
      status: 'draft', party_name: 'New synthetic record', branch_name: 'Bay Area Electric Operations', total: 0,
      tax_amount: 0, attrs: {}, anomalies: [], ...body
    };
    rows.unshift(created);
    return delay(created);
  }
  if (parts[1] === 'anomalies' && parts[3] === 'resolve') {
    const row = anomalies.find((item) => String(item.id) === parts[2]);
    if (row) Object.assign(row, { status: 'resolved', resolution_note: body.note });
    return delay(row);
  }
  if (path === '/api/audit-agent/run') return delay(auditRun);
  if (path === '/api/agent/chat') {
    return delay({
      answer: `This standalone demo contains **2,400 synthetic customer accounts**, 2,100 smart meters, 1,850 bills, 460 work orders, and 86 outage events.\n\nFor “${body.message}”, I would examine customer, meter, billing, outage, asset-health, and audit records together. This response is generated locally from the demo context; no real customer information is present.`,
      toolTrace: [{ tool: 'synthetic_context_search', summary: 'Searched utility demo datasets in browser memory' }]
    });
  }
  return delay({ ok: true });
}

export const api = {
  get,
  post: mutate,
  put: mutate,
  delete: mutate
};
