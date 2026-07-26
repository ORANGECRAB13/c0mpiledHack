import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import EntityForm from '../components/EntityForm.jsx';
import AuditTrail from '../components/AuditTrail.jsx';

export default function EntityEditPage() {
  const { entity, id } = useParams();
  const { entities, user } = useApp();
  const meta = entities.find((candidate) => candidate.name === entity);
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isNew = !id;

  useEffect(() => {
    if (isNew || !meta) return;
    api
      .get(`/api/registry/${entity}/${id}`)
      .then(setRecord)
      .catch((err) => setError(err));
  }, [entity, id, isNew, meta]);

  if (!meta) return <div className="p-8 text-slate-400">Unknown entity</div>;
  if (!isNew && !record && !error) return <div className="p-8 text-slate-400">Loading…</div>;

  async function save(payload) {
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.post(`/api/registry/${entity}`, payload);
        navigate(`/entity/${entity}/${created.id}`);
      } else {
        const updated = await api.put(`/api/registry/${entity}/${id}`, payload);
        setRecord(updated);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const readOnly = user.role === 'viewer' || meta.readOnly;

  return (
    <div className="p-8">
      <button onClick={() => navigate(`/entity/${entity}`)} className="mb-4 text-sm text-indigo-600 hover:underline">
        ← Back to {meta.label}
      </button>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">
        {isNew ? `New ${meta.label.replace(/s$/, '')}` : record?.name || record?.code || `#${id}`}
      </h1>

      {readOnly ? (
        <pre className="max-w-2xl rounded-lg bg-white p-4 text-sm shadow">{JSON.stringify(record, null, 2)}</pre>
      ) : (
        <EntityForm meta={meta} initial={record} onSubmit={save} busy={busy} error={error} />
      )}

      {!isNew && (
        <div className="mt-10 max-w-3xl">
          <AuditTrail entityType={entity} entityId={id} />
        </div>
      )}
    </div>
  );
}
