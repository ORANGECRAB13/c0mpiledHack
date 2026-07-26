import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './lib/api.js';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EntityListPage from './pages/EntityListPage.jsx';
import EntityEditPage from './pages/EntityEditPage.jsx';
import AuditLogPage from './pages/AuditLogPage.jsx';
import DocumentsListPage from './pages/DocumentsListPage.jsx';
import DocumentEditorPage from './pages/DocumentEditorPage.jsx';
import AnomaliesPage from './pages/AnomaliesPage.jsx';
import JournalPage from './pages/JournalPage.jsx';
import LegacyDataPage from './pages/LegacyDataPage.jsx';
import FinancialAuditPage from './pages/FinancialAuditPage.jsx';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [user] = useState({ id: 1, displayName: 'Operations Demo', role: 'admin' });
  const [entities, setEntities] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [discovery, setDiscovery] = useState({ agentId: null, progress: 0, status: 'empty' });
  const location = useLocation();
  const navigate = useNavigate();
  const lastAgentRef = useRef(null);

  useEffect(() => {
    api.get('/api/registry/_meta').then((data) => setEntities(data.entities)).catch(() => {});
    api.get('/api/documents/_meta').then((data) => setDocTypes(data.docTypes)).catch(() => {});
  }, []);

  useEffect(() => {
    const routes = {
      regulatory: '/legacy',
      customer: '/entity/customers',
      benefits: '/anomalies',
      relationships: '/audit'
    };
    const onDiscovery = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'vocare:discovery') return;
      const next = {
        agentId: event.data.agentId || null,
        progress: Number(event.data.progress || 0),
        status: event.data.status || 'running'
      };
      setDiscovery(next);

      const route = routes[next.agentId];
      if (route && lastAgentRef.current !== next.agentId) {
        lastAgentRef.current = next.agentId;
        navigate(route);
      }
      window.setTimeout(() => {
        const scroller = document.getElementById('erp-main-scroll');
        if (!scroller) return;
        const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTo({ top: maximum * (next.progress / 100), behavior: 'smooth' });
      }, 140);
    };
    window.addEventListener('message', onDiscovery);
    return () => window.removeEventListener('message', onDiscovery);
  }, [navigate]);

  const agentLabels = {
    regulatory: 'Regulatory discovery agent',
    customer: 'Customer & account discovery agent',
    benefits: 'Program discovery agent',
    relationships: 'Relationship discovery agent'
  };

  return (
    <AppContext.Provider value={{ user, entities, docTypes, discovery }}>
      <div className="flex h-screen overflow-hidden" data-discovery-agent={discovery.agentId || 'none'}>
        <Sidebar />
        <main id="erp-main-scroll" className="relative flex-1 overflow-y-auto scroll-smooth">
          {discovery.agentId && (
            <div className="erp-discovery-banner">
              <div>
                <strong>{agentLabels[discovery.agentId]}</strong>
                <span>Reading this ERP module · {discovery.progress}%</span>
              </div>
              <div className="erp-discovery-progress"><i style={{ width: `${discovery.progress}%` }} /></div>
            </div>
          )}
          <button
            onClick={() => setChatOpen((current) => !current)}
            className="fixed bottom-6 right-6 z-20 rounded-full bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-indigo-700"
            style={{ display: chatOpen ? 'none' : undefined }}
          >
            ✦ Ask AI
          </button>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/entity/:entity" element={<EntityListPage />} />
            <Route path="/entity/:entity/new" element={<EntityEditPage />} />
            <Route path="/entity/:entity/:id" element={<EntityEditPage />} />
            <Route path="/documents/:docType" element={<DocumentsListPage docTypes={docTypes} />} />
            <Route path="/documents/:docType/new" element={<DocumentEditorPage docTypes={docTypes} />} />
            <Route path="/documents/:docType/:id" element={<DocumentEditorPage docTypes={docTypes} />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/legacy" element={<LegacyDataPage />} />
            <Route path="/anomalies" element={<AnomaliesPage />} />
            <Route path="/financial-audit" element={<FinancialAuditPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>
    </AppContext.Provider>
  );
}
