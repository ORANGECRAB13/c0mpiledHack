import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function EntityForm({ meta, initial, onSubmit, busy, error }) {
  const [values, setValues] = useState(() => initialValues(meta, initial));
  const [refOptions, setRefOptions] = useState({});

  useEffect(() => {
    setValues(initialValues(meta, initial));
  }, [meta, initial]);

  useEffect(() => {
    const refs = meta.fields.filter((field) => field.type === 'ref');
    refs.forEach((field) => {
      api
        .get(`/api/registry/${field.ref}?pageSize=200`)
        .then((data) =>
          setRefOptions((current) => ({
            ...current,
            [field.name]: data.rows.map((row) => ({ id: row.id, label: row.name || row.code || `#${row.id}` }))
          }))
        )
        .catch(() => {});
    });
  }, [meta]);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const payload = {};
    for (const field of meta.fields) {
      if (field.readOnly) continue;
      let value = values[field.name];
      if (value === '' || value === undefined) value = null;
      if (field.type === 'ref' && value !== null) value = Number(value);
      if ((field.type === 'number' || field.type === 'money') && value !== null) value = Number(value);
      payload[field.name] = value;
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      {meta.fields.map((field) => (
        <div key={field.name}>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </label>
          <FieldInput field={field} value={values[field.name]} options={refOptions[field.name]} onChange={setField} />
        </div>
      ))}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}
          {error.issues?.map((issue) => (
            <div key={issue.path}>
              {issue.path}: {issue.message}
            </div>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function FieldInput({ field, value, options, onChange }) {
  const base =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';

  if (field.readOnly) {
    return <input value={value ?? ''} disabled className={`${base} bg-slate-100 text-slate-500`} />;
  }

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(field.name, event.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
    );
  }

  if (field.enum) {
    return (
      <select value={value ?? ''} onChange={(event) => onChange(field.name, event.target.value)} className={base}>
        <option value="">—</option>
        {field.enum.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'ref') {
    return (
      <select value={value ?? ''} onChange={(event) => onChange(field.name, event.target.value)} className={base}>
        <option value="">—</option>
        {(options || []).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(field.name, event.target.value)}
        className={base}
      />
    );
  }

  if (field.type === 'number' || field.type === 'money') {
    return (
      <input
        type="number"
        step={field.type === 'money' ? '0.01' : 'any'}
        value={value ?? ''}
        onChange={(event) => onChange(field.name, event.target.value)}
        className={base}
      />
    );
  }

  return (
    <input value={value ?? ''} onChange={(event) => onChange(field.name, event.target.value)} className={base} />
  );
}

function initialValues(meta, initial) {
  const values = {};
  for (const field of meta.fields) {
    const existing = initial?.[field.name];
    if (field.type === 'boolean') values[field.name] = existing ?? true;
    else if (field.type === 'date' && existing) values[field.name] = String(existing).slice(0, 10);
    else values[field.name] = existing ?? '';
  }
  return values;
}
