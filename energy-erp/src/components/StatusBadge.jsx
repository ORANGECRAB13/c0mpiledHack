export default function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-slate-100 text-slate-600',
    submitted: 'bg-blue-100 text-blue-700',
    posted: 'bg-green-100 text-green-700',
    voided: 'bg-orange-100 text-orange-700',
    open: 'bg-amber-100 text-amber-700',
    acknowledged: 'bg-blue-100 text-blue-700',
    resolved: 'bg-green-100 text-green-700',
    info: 'bg-slate-100 text-slate-600',
    warn: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700'
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
