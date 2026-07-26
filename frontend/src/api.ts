// Real backend client. Every call hits the Express API on :5182 (proxied in dev).

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Bad response' }));
  if (!data.ok && data.error) throw new Error(data.error);
  return data;
}

const post = (path: string, body?: unknown) =>
  req(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

// The demo runs on one shared case so the mobile caller and the laptop operator
// see the same live conversation. Von's case id.
export const DEMO_CUSTOMER = 'CUS-77241';
export const DEMO_CASE = 'C-20481';

export const api = {
  health: () => req('/api/health'),
  customers: () => req('/api/customers'),
  discoveryStatus: () => req('/api/discovery/status'),
  resetDiscovery: () => post('/api/discovery/reset'),
  runDiscoveryAgent: (agentId: string, batchSize?: number) =>
    post(`/api/discovery/agents/${agentId}/run`, { batchSize }),
  startCase: (customerId: string) => post('/api/case/start', { customerId }),
  getCase: (caseId: string) => req(`/api/case/${caseId}`),
  beginCall: (caseId: string, mode = 'scripted') =>
    post(`/api/case/${caseId}/call/start`, { mode, sessionId: `sess_${Date.now()}` }),
  transcript: (caseId: string, speaker: string, text: string) =>
    post(`/api/case/${caseId}/transcript`, { speaker, text }),
  disclosure: (caseId: string, body: unknown) => post(`/api/case/${caseId}/disclosure`, body),
  flagGap: (caseId: string, body: unknown) => post(`/api/case/${caseId}/knowledge/gap`, body),
  requestApproval: (caseId: string, body: unknown) =>
    post(`/api/case/${caseId}/approval/request`, body),
  decideApproval: (caseId: string, body: unknown) =>
    post(`/api/case/${caseId}/approval/decide`, body),
  resume: (caseId: string) => post(`/api/case/${caseId}/resume`),
  handoff: (caseId: string, reason: string) => post(`/api/case/${caseId}/handoff`, { reason }),
  consent: (caseId: string, body: unknown) => post(`/api/case/${caseId}/consent`, body),
  execute: (caseId: string) => post(`/api/case/${caseId}/execute`),
  audit: (caseId: string) => req(`/api/case/${caseId}/audit`),
  gaps: () => req('/api/knowledge/gaps'),
  ratify: (gapId: string, body: unknown) => post(`/api/knowledge/gaps/${gapId}/ratify`, body),
  reset: () => post('/api/demo/reset'),

  // Ensure the shared demo case exists without resetting it if it already does.
  async ensureCase(): Promise<void> {
    try {
      const res = await fetch(`/api/case/${DEMO_CASE}`);
      if (res.ok) return;
    } catch {
      /* fall through to create */
    }
    await post('/api/case/start', { customerId: DEMO_CUSTOMER });
  }
};

// ── types (loose — only what the UI reads) ──────────────────────────

export type Money = number | null;

export interface BenefitEntry {
  id: string;
  kind: string;
  name: string;
  sourceId: string;
  citation?: string;
  estimatedValue?: Money;
  cappedMonthlyPayment?: Money;
  tierReason?: string;
  capDetail?: string;
  intakeVia?: { name: string };
}

export interface Stack {
  customerId: string;
  caseId: string;
  customerName: string;
  jurisdiction: {
    state: { code: string; name: string; regulatorAbbr: string };
    pucRule: { sourceId: string; citation: string };
    protectedFromDisconnection: boolean;
    protectionBasis: { sourceId: string; label: string; reason: string }[];
    moratoria: { sourceId: string; label: string; active: boolean; reason: string }[];
  };
  account: { arrears: number };
  household: { size: number; annualIncome: number; changedOnCall: boolean };
  eligible: BenefitEntry[];
  ineligible: { id: string; name: string; sourceId: string; failedOn: string[] }[];
  totals: {
    arrears: number;
    benefitsUnlocked: number;
    grantApplied: number;
    forgivenessAvailable: number;
    residualArrears: number;
    monthlyPayment: number;
  };
  boundaries: {
    authorityFloor: number;
    authoritySourceId: string;
    affordabilityCeiling: Money;
    requiresRole: string;
    requiresLevel: string;
  };
}

export interface CaseView {
  caseId: string;
  customerId: string;
  stage: string;
  stack: Stack;
  transcript: { speaker: string; text: string }[];
  traces: any[];
  approval: any;
  execution: any[];
}

export interface Customer {
  id: string;
  caseId: string;
  name: string;
  state: string;
  city: string;
  arrears: number;
  hasDisconnectionNotice: boolean;
  declaredHouseholdSize: number;
  declaredAnnualIncome: number;
  demoRole?: string;
}

export interface DiscoveryAgent {
  id: string;
  name: string;
  system: string;
  sources: string[];
  description: string;
  status: 'pending' | 'running' | 'complete';
  nodesAdded: number;
  relationshipsAdded: number;
  processedUnits: number;
  totalUnits: number;
  progress: number;
  completedAt: string | null;
}

export interface DiscoveryStatus {
  runId: string;
  status: 'empty' | 'running' | 'complete';
  startedAt: string | null;
  completedAt: string | null;
  currentAgent: string | null;
  version: number;
  counts: { nodes: number; relationships: number };
  agents: DiscoveryAgent[];
}
