import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Chrome.jsx';
import { AssistantProvider } from './product/AssistantContext.jsx';
import ManagementSystem from './pages/ManagementSystem.jsx';
import Assistant from './pages/Assistant.jsx';
import OpsQueue from './pages/OpsQueue.jsx';
import CaseWorkspace from './pages/CaseWorkspace.jsx';
import Monitoring from './pages/Monitoring.jsx';
import AuditHistory from './pages/AuditHistory.jsx';
import Analytics from './pages/Analytics.jsx';
import Home from './pages/Home.jsx';
import Customers from './pages/Customers.jsx';
import Systems from './pages/Systems.jsx';
import { CASES, MONITORING, QUEUE } from './data/ops.js';

const DECISIONS_KEY = 'vocare:case-decisions';
const MONITORING_KEY = 'vocare:monitoring-decisions';
const loadDecisions = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DECISIONS_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .filter(([caseId]) => CASES[caseId])
      .map(([caseId, decision]) => {
        const caseData = CASES[caseId];
        const record = decision?.record ? {
          ...decision.record,
          case: `${caseData.id} · ${caseData.customer}`,
          workflow: caseData.workflow,
          outcome: caseData.outcome,
          policy: caseData.policyVersion,
          evidence: caseData.sources.length,
          rules: caseData.rules.length,
          trigger: caseData.switchTrace?.trigger || caseData.action,
        } : null;
        return [caseId, { ...decision, record }];
      }));
  } catch {
    return {};
  }
};

// Five screens, three sidebar variants (per the reference):
// frameworks/attention/assistant → expanded workspace sidebar
// mgmt → collapsed icon rail · routines → project sidebar
export default function App() {
  const [page, setPage] = useState('home');
  const [queueFilters, setQueueFilters] = useState({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' });
  const [assistantNotice, setAssistantNotice] = useState(null);
  const [evidenceRequest, setEvidenceRequest] = useState(null);
  const [askRequest, setAskRequest] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(QUEUE[0].id);
  const [decisions, setDecisions] = useState(loadDecisions);
  const [monitoringDecisions, setMonitoringDecisions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MONITORING_KEY) || '{}'); } catch { return {}; }
  });
  const [monitoringFocus, setMonitoringFocus] = useState(null);
  const [customersQuery, setCustomersQuery] = useState('');
  const [latestDecision, setLatestDecision] = useState(null);
  const go = setPage;
  const selectedCase = CASES[selectedCaseId] || CASES[QUEUE[0].id];
  const selectedDecision = decisions[selectedCaseId] || { sourceVerified: false, approved: false, record: null };

  useEffect(() => {
    localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions));
  }, [decisions]);

  useEffect(() => {
    localStorage.setItem(MONITORING_KEY, JSON.stringify(monitoringDecisions));
  }, [monitoringDecisions]);

  useEffect(() => {
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [page, selectedCaseId]);

  useEffect(() => {
    const focusCommand = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('[aria-label="Ask or command the product"]')?.focus();
      }
    };
    window.addEventListener('keydown', focusCommand);
    return () => window.removeEventListener('keydown', focusCommand);
  }, []);

  const announceAction = (message, action = 'navigation') => {
    setAssistantNotice({ id: Date.now(), message, action });
  };

  const navigate = (target, message) => {
    setPage(target);
    announceAction(message);
  };

  const openCase = (caseId, message) => {
    const target = CASES[caseId] || CASES[QUEUE[0].id];
    setSelectedCaseId(target.id);
    setPage('case');
    if (message) announceAction(message);
  };

  const runProductCommand = (raw) => {
    const text = String(raw || '').trim();
    const command = text.toLowerCase().replace(/[?.!,]/g, ' ');
    if (!command) return { handled: false };

    const normalise = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const commandCase = QUEUE.find((item) => {
      const name = normalise(item.customer.split('—')[0]);
      const tokens = name.split(' ').filter((token) => token.length >= 4);
      const id = normalise(item.id);
      return command.includes(id) || command.includes(item.id.toLowerCase()) || tokens.some((token) => command.includes(token));
    });
    const commandMonitoring = MONITORING.find((item) => {
      const tokens = normalise(item.customer).split(' ').filter((token) => token.length >= 4);
      return command.includes(normalise(item.id)) || tokens.some((token) => command.includes(token));
    });

    if (commandMonitoring && /(?:monitor|reassess|continuous|support review)/.test(command)) {
      setMonitoringFocus(commandMonitoring.id);
      navigate('monitoring', `Opened the monitoring review for ${commandMonitoring.customer}.`);
      return { handled: true };
    }

    const wantsSource = /(?:open|show|view|find|check).*(?:source|evidence|clause|policy|threshold|instrument)/.test(command);
    if (wantsSource && (commandCase || /(?:312|disconnect|five hundred|500)/.test(command))) {
      const target = commandCase ? CASES[commandCase.id] : selectedCase;
      setSelectedCaseId(target.id);
      setPage('case');
      setEvidenceRequest({ id: Date.now(), caseId: target.id, query: target.sourceQuery });
      announceAction(`Opened ${target.customer} and the policy evidence for this review.`, 'evidence');
      return { handled: true };
    }

    // Compound commands: "open Amelia Hart's case and analyze whether we can
    // disconnect her based on regulation" — navigate to the case, then hand the
    // analysis half to the compliance agent in the same (persistent) chat.
    const wantsAnalysis = /analy[sz]e|assess|evaluate|cross[- ]?referen|regulation|complian|disconnect|eligib|can we|should we|whether|is it (?:legal|allowed|permitted)/.test(command);
    if (commandCase && wantsAnalysis) {
      const target = CASES[commandCase.id];
      setSelectedCaseId(target.id);
      setPage('case');
      setAskRequest({ id: Date.now(), query: text });
      announceAction(`Opened ${target.customer} · ${target.id} and asked the compliance agent to analyse it against the regulations.`, 'analysis');
      return { handled: true };
    }

    if (commandCase && /(?:open|show|find|review|go to)/.test(command)) {
      openCase(commandCase.id, `Opened ${commandCase.customer} · ${commandCase.id}.`);
      return { handled: true };
    }

    if (/(?:approve|authorise|authorize|submit|execute).*(?:decision|case|recommendation|customer|account)/.test(command)) {
      if (commandCase) setSelectedCaseId(commandCase.id);
      setPage('case');
      announceAction('Approval requires you to review the evidence and use the Approve button.', 'confirmation');
      return { handled: true };
    }

    const filterIntent = /(?:show|filter|find|list|only)/.test(command);
    if (filterIntent && /(?:priority|hardship|vulnerable|payment difficulty|best offer|switch|data quality|reconciliation|bad data|conflict|ready for review|case)/.test(command)) {
      const priority = /high/.test(command) ? 'High' : /medium/.test(command) ? 'Medium' : /low/.test(command) ? 'Low' : 'All';
      const workflow = /hardship|vulnerable|payment difficulty|best offer|switch|1 october/.test(command)
        ? 'Hardship & Best Offer'
        : /data quality|reconciliation|bad data|conflict/.test(command)
          ? 'Data Quality & Reconciliation'
          : 'All';
      setQueueFilters((current) => ({ ...current, priority, workflow }));
      setPage('queue');
      const description = [priority !== 'All' ? `${priority.toLowerCase()} priority` : null, workflow !== 'All' ? workflow.toLowerCase() : null].filter(Boolean).join(' ');
      announceAction(`Filtered the decision queue${description ? ` to ${description} cases` : ''}.`, 'filter');
      return { handled: true };
    }

    const routes = [
      { test: /home|dashboard|my work/, page: 'home', message: 'Opened Home.' },
      { test: /customers|customer directory|accounts/, page: 'customers', message: 'Opened Customers.' },
      { test: /management system|document library|company documents/, page: 'mgmt', message: 'Opened Management system.' },
      { test: /decision audit|audit history|audit record/, page: 'audit', message: 'Opened Decision audit.' },
      { test: /continuous monitoring|monitoring|supported accounts|reassessment/, page: 'monitoring', message: 'Opened continuous hardship monitoring.' },
      { test: /outcomes|analytics|reporting/, page: 'analytics', message: 'Opened Outcomes.' },
      { test: /compliance assistant|document assistant|assistant page/, page: 'assistant', message: 'Opened Compliance assistant.' },
      { test: /operational reviews|decision queue|operational queue|work queue|open cases/, page: 'queue', message: 'Opened Operational reviews.' },
      { test: /connected systems|integrations|systems page|crm|billing systems|system map/, page: 'systems', message: 'Opened Connected systems.' },
    ];
    // A navigation verb makes intent explicit, but a spoken instruction that
    // simply names a page ("continuous monitoring please") should still land there.
    const route = routes.find((candidate) => candidate.test.test(command));
    if (route) {
      navigate(route.page, route.message);
      return { handled: true };
    }

    if (/clear|reset/.test(command) && /filter/.test(command)) {
      setQueueFilters({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' });
      setPage('queue');
      announceAction('Cleared the decision queue filters.', 'filter');
      return { handled: true };
    }

    return { handled: false };
  };

  const verifySource = (caseId = selectedCaseId) => {
    setDecisions((current) => ({
      ...current,
      [caseId]: { ...(current[caseId] || {}), sourceVerified: true, approved: current[caseId]?.approved || false, record: current[caseId]?.record || null },
    }));
  };

  const approveDecision = (caseId = selectedCaseId) => {
    const caseData = CASES[caseId];
    const record = {
      id: `DEC-2026-${String(8847 + Object.values(decisions).filter((item) => item.approved).length).padStart(5, '0')}`,
      case: `${caseData.id} · ${caseData.customer}`,
      workflow: caseData.workflow,
      outcome: caseData.outcome,
      officer: 'Priya N.',
      ts: '2026-08-08 10:42',
      policy: caseData.policyVersion,
      evidence: caseData.sources.length,
      rules: caseData.rules.length,
      trigger: caseData.switchTrace?.trigger || caseData.action,
    };
    setDecisions((current) => ({
      ...current,
      [caseId]: { ...(current[caseId] || {}), sourceVerified: true, approved: true, record },
    }));
    setLatestDecision(record);
  };

  const recordMonitoringDecision = (account, outcome) => {
    const record = {
      id: `MON-2026-${String(9100 + Object.keys(monitoringDecisions).length).padStart(5, '0')}`,
      case: `${account.id} · ${account.customer}`,
      workflow: 'Continuous monitoring',
      outcome,
      officer: 'Priya N.',
      ts: '2026-08-08 11:06',
      policy: 'PDF v4.2',
      evidence: account.evidence.length,
      rules: 3,
      trigger: account.trigger,
    };
    const decision = { outcome, officer: 'Priya N.', record };
    setMonitoringDecisions((current) => ({ ...current, [account.id]: decision }));
    setLatestDecision(record);
  };

  // Tools the live voice copilot can run against the UI. Each returns a short
  // string the model can speak from. Approval deliberately has no tool.
  const executeVoiceTool = (name, args = {}) => {
    const findCase = (ref) => {
      const norm = String(ref || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return QUEUE.find((item) =>
        item.id.toLowerCase() === norm.replace(' ', '-') ||
        norm.includes(item.id.toLowerCase()) ||
        item.customer.toLowerCase().includes(norm) ||
        norm.split(' ').some((token) => token.length >= 4 && item.customer.toLowerCase().includes(token)));
    };

    switch (name) {
      case 'navigate': {
        const result = runProductCommand(`open ${args.target || ''}`);
        return result.handled ? `Opened ${args.target}.` : `No page called "${args.target}" — valid pages: home, customers, operational reviews, continuous monitoring, decision audit, management system, compliance assistant, connected systems, outcomes.`;
      }
      case 'open_case': {
        const target = findCase(args.customer);
        if (!target) return `No case found for "${args.customer}".`;
        openCase(target.id, `Opened ${target.customer} · ${target.id}.`);
        const caseData = CASES[target.id];
        return `Opened ${target.customer} (${target.id}) — ${target.workflow}, ${target.status}. ${caseData?.snapshot?.[0]?.[1] ? `Balance: ${caseData.snapshot[0][1]}.` : ''}`;
      }
      case 'filter_queue': {
        setQueueFilters((current) => ({
          ...current,
          priority: args.priority || 'All',
          workflow: args.workflow || 'All',
        }));
        setPage('queue');
        announceAction('Filtered the decision queue by voice.', 'filter');
        return `Queue filtered to ${args.priority || 'all'} priority, ${args.workflow || 'all workflows'}.`;
      }
      case 'ask_compliance': {
        const target = args.customer ? findCase(args.customer) : null;
        if (target) {
          setSelectedCaseId(target.id);
          setPage('case');
        }
        setAskRequest({ id: Date.now(), query: args.question });
        return `The compliance agent is answering on screen with citations${target ? ` on ${target.customer}'s case` : ''}. Tell the officer the answer is coming up.`;
      }
      case 'start_reassessment': {
        const account = MONITORING.find((item) =>
          item.customer.toLowerCase().includes(String(args.customer || '').toLowerCase()));
        if (!account) return `No monitored account matches "${args.customer}".`;
        recordMonitoringDecision(account, 'Human reassessment opened');
        if (account.caseId) openCase(account.caseId);
        else { setCustomersQuery(account.customer); go('customers'); }
        return `Reassessment recorded for ${account.customer}; their profile is open.`;
      }
      default:
        return `Unknown tool ${name}.`;
    }
  };

  const assistantValue = {
    executeVoiceTool,
    page,
    queueFilters,
    setQueueFilters,
    runProductCommand,
    assistantNotice,
    dismissNotice: () => setAssistantNotice(null),
    askRequest,
    clearAskRequest: () => setAskRequest(null),
  };

  return (
    <AssistantProvider value={assistantValue}>
      <div className="app">
      <Sidebar page={page} go={go} />

      <div className="main">
        {page === 'home' && (
          <Home
            openCase={(caseId) => openCase(caseId)}
            goQueue={() => go('queue')}
            goWorkflow={(workflow) => { setQueueFilters((current) => ({ ...current, workflow })); go('queue'); }}
            goMonitoring={() => go('monitoring')}
            decisions={decisions}
          />
        )}
        {page === 'customers' && <Customers key={customersQuery} openCase={(caseId) => openCase(caseId)} decisions={decisions} initialQuery={customersQuery} />}
        {page === 'systems' && <Systems />}
        {page === 'mgmt' && <ManagementSystem />}
        {page === 'assistant' && <Assistant />}
        {page === 'queue' && <OpsQueue openCase={(caseId) => openCase(caseId)} decisions={decisions} filters={queueFilters} setFilters={setQueueFilters} />}
        {page === 'case' && (
          <CaseWorkspace
            caseData={selectedCase}
            back={() => go('queue')}
            sourceVerified={selectedDecision.sourceVerified}
            approved={selectedDecision.approved}
            decisionRecord={selectedDecision.record}
            onVerifySource={() => verifySource(selectedCaseId)}
            onApprove={() => approveDecision(selectedCaseId)}
            viewAudit={() => go('audit')}
            evidenceRequest={evidenceRequest}
            onEvidenceRequestHandled={() => setEvidenceRequest(null)}
          />
        )}
        {page === 'monitoring' && (
          <Monitoring
            decisions={monitoringDecisions}
            onDecision={recordMonitoringDecision}
            openCase={(caseId) => openCase(caseId)}
            openCustomer={(name) => { setCustomersQuery(name); go('customers'); }}
            focusId={monitoringFocus}
          />
        )}
        {page === 'audit' && (
          <AuditHistory
            latestDecision={latestDecision}
            sessionDecisions={[
              ...Object.values(decisions).map((item) => item.record).filter(Boolean),
              ...Object.values(monitoringDecisions).map((item) => item.record).filter(Boolean),
            ]}
          />
        )}
        {page === 'analytics' && <Analytics />}
      </div>
      </div>
    </AssistantProvider>
  );
}
