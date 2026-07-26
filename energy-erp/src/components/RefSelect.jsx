import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/** Typeahead select over a registry entity (server-side search). */
export default function RefSelect({ entity, value, onChange, disabled }) {
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!value) {
      setLabel('');
      return;
    }
    api
      .get(`/api/registry/${entity}/${value}`)
      .then((row) => setLabel(row.name || row.code || `#${value}`))
      .catch(() => setLabel(`#${value}`));
  }, [entity, value]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pageSize: '15' });
      if (query) params.set('q', query);
      api
        .get(`/api/registry/${entity}?${params}`)
        .then((data) => setOptions(data.rows))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [entity, query, open]);

  useEffect(() => {
    function onClick(event) {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={box} className="relative">
      <input
        value={open ? query : label}
        disabled={disabled}
        placeholder="Search…"
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
      />
      {open && !disabled && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <li
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-50"
            onMouseDown={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            — none —
          </li>
          {options.map((option) => (
            <li
              key={option.id}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-indigo-50"
              onMouseDown={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              {option.name || option.code || `#${option.id}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
