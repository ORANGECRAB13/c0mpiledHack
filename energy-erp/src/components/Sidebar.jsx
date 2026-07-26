import { NavLink } from 'react-router-dom';
import { useApp } from '../App.jsx';

const MODULE_ORDER = ['Customer Operations', 'Billing & Revenue', 'Grid Operations', 'Grid & Assets', 'Field Service', 'Inventory', 'Procurement', 'Workforce', 'Accounting', 'System'];

export default function Sidebar() {
  const { user, entities, docTypes, discovery } = useApp();

  // group: module -> { docs: [], entities: [] }
  const groups = new Map();
  const ensure = (module) => {
    if (!groups.has(module)) groups.set(module, { docs: [], entities: [] });
    return groups.get(module);
  };
  for (const docType of docTypes) ensure(docType.module).docs.push(docType);
  for (const entity of entities) {
    if (entity.adminOnly && user.role !== 'admin') continue;
    ensure(entity.module).entities.push(entity);
  }

  const orderedModules = [...groups.keys()].sort((a, b) => {
    const indexA = MODULE_ORDER.indexOf(a);
    const indexB = MODULE_ORDER.indexOf(b);
    return (indexA < 0 ? 99 : indexA) - (indexB < 0 ? 99 : indexB) || a.localeCompare(b);
  });

  const linkClass = ({ isActive }) =>
    `block rounded-md px-3 py-1.5 text-sm ${
      isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;
  const focusTargets = {
    regulatory: ['Operational Data Lake', 'Grid Operations', 'Grid & Assets', 'System'],
    customer: ['Customer Operations', 'Billing & Revenue', 'Customers', 'Service Accounts', 'Utility Bills', 'Customer Payments'],
    benefits: ['Anomalies', 'Customer Operations', 'Billing & Revenue', 'Rate Plans'],
    relationships: ['Audit Log', 'Financial Audit', 'Accounting', 'Journal']
  };
  const isFocused = (...labels) =>
    (focusTargets[discovery?.agentId] || []).some((target) => labels.includes(target));
  const navClass = (...labels) => (args) =>
    `${linkClass(args)} ${isFocused(...labels) ? 'erp-discovery-focus' : ''}`;

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-lg font-bold text-white">⚡</div>
        <h1 className="text-lg font-semibold text-white">California Grid ERP</h1>
        <p className="text-xs text-slate-400">Synthetic utility operations demo</p>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div>
          <NavLink to="/" end className={navClass('Dashboard')}>
            Dashboard
          </NavLink>
          <NavLink to="/journal" className={navClass('Journal')}>
            Journal
          </NavLink>
          <NavLink to="/anomalies" className={navClass('Anomalies')}>
            Anomalies
          </NavLink>
          <NavLink to="/financial-audit" className={navClass('Financial Audit')}>
            Financial Audit
          </NavLink>
          <NavLink to="/audit" className={navClass('Audit Log')}>
            Audit Log
          </NavLink>
          <NavLink to="/legacy" className={navClass('Operational Data Lake')}>
            Operational Data Lake
          </NavLink>
        </div>

        {orderedModules.map((module) => {
          const group = groups.get(module);
          return (
            <div key={module}>
              <p className={`mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${isFocused(module) ? 'erp-discovery-focus-label' : ''}`}>{module}</p>
              {group.docs.map((docType) => (
                <NavLink key={docType.name} to={`/documents/${docType.name}`} className={navClass(module, docType.label)}>
                  {docType.label}
                </NavLink>
              ))}
              {group.entities.map((entity) => (
                <NavLink key={entity.name} to={`/entity/${entity.name}`} className={navClass(module, entity.label)}>
                  {entity.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-3">
        <p className="text-sm text-white">{user.displayName}</p>
        <p className="text-xs text-slate-400">Full-access synthetic environment</p>
      </div>
    </aside>
  );
}
