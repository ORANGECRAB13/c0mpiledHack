import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Chrome.jsx';
import { AssistantProvider } from './product/AssistantContext.jsx';
import OpsQueue from './pages/OpsQueue.jsx';
import CaseWorkspace from './pages/CaseWorkspace.jsx';
import Monitoring from './pages/Monitoring.jsx';
import AuditHistory from './pages/AuditHistory.jsx';
import Home from './pages/Home.jsx';
import Customers from './pages/Customers.jsx';
import { decisionLayerApi } from './api/decisionLayerApi.js';

const DECISIONS_KEY = 'vocare:case-decisions';
const MONITORING_KEY = 'vocare:monitoring-decisions';
const loadDecisions = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DECISIONS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

// Three top-level tabs: Dashboard (home), Detection (queue), Monitoring.
// 'case' (case workspace), 'customers' (customer profile) and 'audit' stay as
// drill-in routes reachable from those tabs, but are not sidebar entries.
export default function App() {
  const [queue, setQueue] = useState([]);
  const [actionableCount, setActionableCount] = useState(undefined);
  const [cases, setCases] = useState({});
  const [auditRecords, setAuditRecords] = useState([]);
  const [monitoringAccounts, setMonitoringAccounts] = useState([]);
  const [dataError, setDataError] = useState(null);
  const [page, setPage] = useState('home');
  const [queueFilters, setQueueFilters] = useState({ priority: 'All', workflow: 'All', status: 'All', team: 'All', query: '' });
  const [assistantNotice, setAssistantNotice] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [decisions, setDecisions] = useState(loadDecisions);
  const [monitoringDecisions, setMonitoringDecisions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MONITORING_KEY) || '{}'); } catch { return {}; }
  });
  const [monitoringFocus, setMonitoringFocus] = useState(null);
  const [customersQuery, setCustomersQuery] = useState('');
  const [latestDecision, setLatestDecision] = useState(null);
  const go = setPage;
  const selectedCase = cases[selectedCaseId] || cases[queue[0]?.id] || null;
  const selectedDecision = decisions[selectedCaseId] || { sourceVerified: false, approved: false, record: null };

  const refreshProduct = async () => {
    try {
      // The nav badge must agree with the screens behind it. actionableCount is
      // the same figure Detection headlines and Oversight leads with, so all
      // three come from one source rather than three local tallies.
      decisionLayerApi.loadReviewSummary({ limit: 500, includeCustomers: false })
        .then((result) => setActionableCount(result.summary.actionableCount))
        // Undefined hides the badge. A stale count is worse than none.
        .catch(() => setActionableCount(undefined));

      const product = await decisionLayerApi.loadProduct();
      setQueue(product.queue);
      setCases(product.cases);
      setAuditRecords(product.audit);
      // Monitoring rows need the Salesforce/Stripe external id to query those
      // systems without a second fetch. /customers and /cases both expose it as a
      // real field; keep it explicit rather than assuming it equals the ledger id.
      const externalIds = new Map(product.queue.map((row) => [row.id, row.externalCustomerId]));
      setMonitoringAccounts(Object.values(product.cases).filter((item) => item.snapshot.some(([field, value]) => field === 'hardshipStatus' && value !== 'NONE')).map((item) => ({
        id: `MON-${item.id}`, caseId: item.id, customer: item.customer,
        externalCustomerId: externalIds.get(item.id) || item.externalCustomerId || null, next: item.snapshot.find(([field]) => field === 'hardshipReviewDueAt')?.[1] || 'not scheduled',
        status: item.actionStatus === 'AWAITING_APPROVAL' ? 'At risk' : 'Watch', hot: item.actionStatus === 'AWAITING_APPROVAL',
        pay: item.snapshot.find(([field]) => field === 'partialPayments90d')?.[1] || '0', debt: item.snapshot.find(([field]) => field === 'balance')?.[1] || '$0', last: item.events[0]?.[0] || 'No event',
        trigger: item.recommendation, rec: item.recommendationSummary, nextAction: item.action, evidence: item.sources,
      })));
      setSelectedCaseId((current) => current && product.cases[current] ? current : product.queue[0]?.id || null);
      setDataError(null);
    } catch (error) {
      setDataError(error.message);
    }
  };

  useEffect(() => { refreshProduct(); }, []);

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

  // A summary row hands us a real customerId; only fall back to the first case
  // when no id was supplied at all, so we never open the wrong customer.
  const openCase = (caseId, message) => {
    const target = cases[caseId] || (caseId ? null : cases[queue[0]?.id]);
    if (!target) {
      setDataError(`No case record is loaded for ${caseId}. Reload the ledger and try again.`);
      return;
    }
    setSelectedCaseId(target.id);
    setPage('case');
    if (message) announceAction(message);
  };

  const runProductCommand = (raw) => {
    const text = String(raw || '').trim();
    const command = text.toLowerCase().replace(/[?.!,]/g, ' ');
    if (!command) return { handled: false };

    const normalise = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const commandCase = queue.find((item) => {
      const name = normalise(item.customer.split('—')[0]);
      const tokens = name.split(' ').filter((token) => token.length >= 4);
      const id = normalise(item.id);
      return command.includes(id) || command.includes(item.id.toLowerCase()) || tokens.some((token) => command.includes(token));
    });
    const commandMonitoring = monitoringAccounts.find((item) => {
      const tokens = normalise(item.customer).split(' ').filter((token) => token.length >= 4);
      return command.includes(normalise(item.id)) || tokens.some((token) => command.includes(token));
    });

    if (commandMonitoring && /(?:monitor|reassess|continuous|support review)/.test(command)) {
      setMonitoringFocus(commandMonitoring.id);
      navigate('monitoring', `Opened the monitoring review for ${commandMonitoring.customer}.`);
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
      { test: /home|dashboard|my work/, page: 'home', message: 'Opened the dashboard.' },
      { test: /customers|customer directory|accounts/, page: 'customers', message: 'Opened Customers.' },
      { test: /decision audit|audit history|audit record/, page: 'audit', message: 'Opened Decision audit.' },
      { test: /continuous monitoring|monitoring|supported accounts|reassessment/, page: 'monitoring', message: 'Opened Monitoring.' },
      { test: /detection|operational reviews|decision queue|operational queue|work queue|open cases/, page: 'queue', message: 'Opened Detection.' },
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

  const approveDecision = async (caseId = selectedCaseId) => {
    const caseData = cases[caseId];
    if (!caseData?.actionId) {
      setDataError('This case has no approval-gated action. Run its evaluation first.');
      return;
    }
    try {
      const response = await decisionLayerApi.approve(caseData.actionId, { actorId: 'Priya N.', verdict: 'AGREED' });
      const record = {
        id: caseData.decisionId,
        case: `${caseData.id} · ${caseData.customer}`,
        workflow: caseData.workflow,
        outcome: caseData.outcome,
        officer: response.approval.actor_id,
        ts: new Date(response.approval.decided_at).toLocaleString('en-AU'),
        // The raw instant as well as the display string: the audit timeline
        // groups by day, and parsing a localised string back into a date is
        // brittle enough that those rows fell into a "this session" bucket.
        at: response.approval.decided_at,
        policy: caseData.policyVersion,
        evidence: caseData.sources.length,
        rules: caseData.rules.length,
        trigger: caseData.action,
      };
      setDecisions((current) => ({
        ...current,
        [caseId]: { ...(current[caseId] || {}), sourceVerified: true, approved: true, record },
      }));
      setLatestDecision(record);
      setDataError(null);
      await refreshProduct();
    } catch (error) {
      setDataError(error.message);
    }
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
      return queue.find((item) =>
        item.id.toLowerCase() === norm.replace(' ', '-') ||
        norm.includes(item.id.toLowerCase()) ||
        item.customer.toLowerCase().includes(norm) ||
        norm.split(' ').some((token) => token.length >= 4 && item.customer.toLowerCase().includes(token)));
    };

    switch (name) {
      case 'navigate': {
        const result = runProductCommand(`open ${args.target || ''}`);
        return result.handled ? `Opened ${args.target}.` : `No page called "${args.target}" — valid pages: dashboard, detection, monitoring.`;
      }
      case 'open_case': {
        const target = findCase(args.customer);
        if (!target) return `No case found for "${args.customer}".`;
        openCase(target.id, `Opened ${target.customer} · ${target.id}.`);
        const caseData = cases[target.id];
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
      case 'start_reassessment': {
        const account = monitoringAccounts.find((item) =>
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
    announceAction,
  };

  return (
    <AssistantProvider value={assistantValue}>
      <div className="app">
      {/* `counts` decorates the nav. Detection's badge is deliberately left
          unset until it can be sourced from the same figure the Detection
          screen itself shows — a nav count that disagreed with the screen
          behind it would be worse than no count at all. */}
      <Sidebar page={page} go={go} counts={{ detection: actionableCount }} />

      <div className="main">
        {dataError && <div className="okbanner compact-banner" style={{ margin: 20, borderColor: '#D64545' }}><span>Decision ledger unavailable: {dataError}</span><button onClick={refreshProduct}>Retry</button></div>}
        {page === 'home' && (
          <Home
            openCase={(caseId) => openCase(caseId)}
            goQueue={() => go('queue')}
            goAudit={() => go('audit')}
            goWorkflow={(workflow) => { setQueueFilters((current) => ({ ...current, workflow })); go('queue'); }}
            goMonitoring={() => go('monitoring')}
            decisions={decisions}
            queue={queue}
            cases={cases}
            auditRecords={auditRecords}
          />
        )}
        {page === 'customers' && <Customers key={customersQuery} openCase={(caseId) => openCase(caseId)} decisions={decisions} initialQuery={customersQuery} queue={queue} />}
        {page === 'queue' && <OpsQueue openCase={(caseId) => openCase(caseId)} decisions={decisions} filters={queueFilters} setFilters={setQueueFilters} queue={queue} actorId="Priya N." onLedgerChanged={refreshProduct} />}
        {page === 'case' && selectedCase && (
          <CaseWorkspace
            caseData={selectedCase}
            back={() => go('queue')}
            approved={selectedDecision.approved}
            decisionRecord={selectedDecision.record}
            onApprove={() => approveDecision(selectedCaseId)}
            viewAudit={() => go('audit')}
          />
        )}
        {page === 'monitoring' && (
          <Monitoring
            monitoring={monitoringAccounts}
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
            records={auditRecords}
            sessionDecisions={[
              ...Object.values(decisions).map((item) => item.record).filter(Boolean),
              ...Object.values(monitoringDecisions).map((item) => item.record).filter(Boolean),
            ]}
          />
        )}
      </div>
      </div>
    </AssistantProvider>
  );
}
