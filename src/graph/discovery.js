import { accountFor, loadDataset } from './dataset.js';

const AGENT_DEFINITIONS = [
  {
    id: 'regulatory',
    name: 'Regulatory discovery',
    system: 'Policy repository',
    sources: ['puc-rules/ca.json', 'puc-rules/tx.json', 'puc-rules/il.json', 'puc-rules/ny.json'],
    description: 'Maps service territories, PUC rules, moratoria and delegated authority.'
  },
  {
    id: 'customer',
    name: 'Customer & account discovery',
    system: 'ERP + billing',
    sources: ['customers.json', 'accounts.json'],
    description: 'Joins customer masters to invoices, payments and contact-centre records.'
  },
  {
    id: 'benefits',
    name: 'Program discovery',
    system: 'Benefits catalogue',
    sources: ['liheap.json', 'amp-programs.json', 'pipp-programs.json'],
    description: 'Extracts benefit programs, eligibility criteria and intake agencies.'
  },
  {
    id: 'relationships',
    name: 'Relationship discovery',
    system: 'Rules engine',
    sources: ['stacking-rules.json'],
    description: 'Connects programs with stacking, prerequisite and exclusion rules.'
  }
];

function freshState() {
  return {
    runId: `DISC-${Date.now()}`,
    status: 'empty',
    startedAt: null,
    completedAt: null,
    currentAgent: null,
    version: 0,
    nodes: new Map(),
    links: new Map(),
    agents: AGENT_DEFINITIONS.map((agent) => ({
      ...agent,
      status: 'pending',
      nodesAdded: 0,
      relationshipsAdded: 0,
      processedUnits: 0,
      totalUnits: 0,
      progress: 0,
      completedAt: null
    }))
  };
}

let state = freshState();

const graphNode = (id, primaryLabel, label, properties = {}, provenance = {}) => ({
  id,
  labels: [primaryLabel],
  primaryLabel,
  label,
  properties: { ...properties, ...provenance }
});

const graphLink = (source, target, type, properties = {}) => ({
  id: `${source}->${target}:${type}`,
  source,
  target,
  type,
  properties
});

function regulatoryBatch(dataset, agent) {
  const nodes = [];
  const links = [];
  for (const jurisdiction of dataset.jurisdictions) {
    const sourceFile = `puc-rules/${jurisdiction.state.code.toLowerCase()}.json`;
    const provenance = { discoveredBy: agent.id, sourceSystem: agent.system, sourceFile };
    nodes.push(graphNode(
      jurisdiction.state.code,
      'State',
      jurisdiction.state.name,
      jurisdiction.state,
      provenance
    ));
    nodes.push(graphNode(
      jurisdiction.pucRule.sourceId,
      'PucRule',
      jurisdiction.pucRule.title,
      jurisdiction.pucRule,
      provenance
    ));
    links.push(graphLink(jurisdiction.state.code, jurisdiction.pucRule.sourceId, 'GOVERNED_BY'));

    for (const moratorium of jurisdiction.moratoria) {
      nodes.push(graphNode(
        moratorium.sourceId,
        'Moratorium',
        moratorium.label,
        moratorium,
        provenance
      ));
      links.push(graphLink(jurisdiction.pucRule.sourceId, moratorium.sourceId, 'DEFINES'));
    }

    nodes.push(graphNode(
      jurisdiction.authorityRule.sourceId,
      'AuthorityRule',
      jurisdiction.authorityRule.title,
      jurisdiction.authorityRule,
      provenance
    ));
    links.push(graphLink(jurisdiction.state.code, jurisdiction.authorityRule.sourceId, 'DELEGATES'));
  }
  return { nodes, links };
}

function customerBatch(dataset, agent) {
  const nodes = [];
  const links = [];
  for (const customer of dataset.customers) {
    nodes.push(graphNode(customer.id, 'Customer', customer.name, customer, {
      discoveredBy: agent.id,
      sourceSystem: agent.system,
      sourceFile: 'customers.json'
    }));
    links.push(graphLink(customer.id, customer.state, 'SERVED_IN'));

    const account = accountFor(dataset, customer.id);
    const records = [account.invoice, account.payment, ...account.notes].filter(Boolean);
    for (const record of records) {
      nodes.push(graphNode(
        record.id,
        'AccountRecord',
        record.type === 'invoice_summary'
          ? `Invoice summary · ${customer.name}`
          : record.type === 'payment_summary'
            ? `Payment history · ${customer.name}`
            : `Contact note · ${customer.name}`,
        record,
        { discoveredBy: agent.id, sourceSystem: agent.system, sourceFile: 'accounts.json' }
      ));
      links.push(graphLink(customer.id, record.id, 'HAS_RECORD'));
    }
  }
  return { nodes, links };
}

function benefitBatch(dataset, agent) {
  const nodes = [];
  const links = [];
  for (const program of dataset.programs) {
    const sourceFile = program.kind === 'LIHEAP'
      ? 'liheap.json'
      : program.kind === 'AMP'
        ? 'amp-programs.json'
        : 'pipp-programs.json';
    const provenance = { discoveredBy: agent.id, sourceSystem: agent.system, sourceFile };
    nodes.push(graphNode(program.id, 'BenefitProgram', program.name, program, provenance));
    links.push(graphLink(program.state, program.id, 'ADMINISTERS'));

    if (program.intakeVia) {
      nodes.push(graphNode(
        program.intakeVia.agencyId,
        'LocalAgency',
        program.intakeVia.name,
        program.intakeVia,
        provenance
      ));
      links.push(graphLink(program.id, program.intakeVia.agencyId, 'INTAKE_VIA'));
    }

    for (const criterion of program.criteria || []) {
      nodes.push(graphNode(
        criterion.id,
        'EligibilityCriterion',
        criterion.text,
        criterion,
        provenance
      ));
      links.push(graphLink(program.id, criterion.id, 'HAS_CRITERION'));
    }
  }

  const fallback = dataset.fallbackArrangement;
  nodes.push(graphNode(
    fallback.id,
    'BenefitProgram',
    fallback.name,
    fallback,
    {
      discoveredBy: agent.id,
      sourceSystem: agent.system,
      sourceFile: 'stacking-rules.json'
    }
  ));
  for (const jurisdiction of dataset.jurisdictions) {
    links.push(graphLink(jurisdiction.state.code, fallback.id, 'OFFERS'));
  }
  return { nodes, links };
}

function relationshipBatch(dataset) {
  return {
    nodes: [],
    links: dataset.stackingRules.map((rule) =>
      graphLink(rule.from, rule.to, rule.relation, {
        sourceId: rule.sourceId,
        state: rule.state,
        text: rule.text
      })
    )
  };
}

function batchFor(agent, dataset) {
  if (agent.id === 'regulatory') return regulatoryBatch(dataset, agent);
  if (agent.id === 'customer') return customerBatch(dataset, agent);
  if (agent.id === 'benefits') return benefitBatch(dataset, agent);
  return relationshipBatch(dataset);
}

export function resetDiscovery() {
  state = freshState();
  return discoveryStatus();
}

export function discoveryStatus() {
  return {
    runId: state.runId,
    status: state.status,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    currentAgent: state.currentAgent,
    version: state.version,
    counts: {
      nodes: state.nodes.size,
      relationships: state.links.size
    },
    agents: state.agents.map((agent) => ({ ...agent }))
  };
}

export function discoveryVisualization() {
  return {
    nodes: [...state.nodes.values()],
    links: [...state.links.values()],
    summary: {
      nodeCount: state.nodes.size,
      relationshipCount: state.links.size,
      backend: 'discovery',
      discoveryStatus: state.status,
      version: state.version
    }
  };
}

export async function runDiscoveryAgent(agentId, { batchSize = Number.POSITIVE_INFINITY } = {}) {
  const index = state.agents.findIndex((agent) => agent.id === agentId);
  if (index < 0) throw new Error(`Unknown discovery agent: ${agentId}`);
  const agent = state.agents[index];
  if (agent.status === 'complete') return discoveryStatus();

  const earlierIncomplete = state.agents.slice(0, index).find((candidate) => candidate.status !== 'complete');
  if (earlierIncomplete) {
    throw new Error(`${earlierIncomplete.name} must complete before ${agent.name}`);
  }

  const now = new Date().toISOString();
  if (!state.startedAt) state.startedAt = now;
  state.status = 'running';
  state.currentAgent = agent.id;
  agent.status = 'running';

  const dataset = await loadDataset({ reload: true });
  const batch = batchFor(agent, dataset);
  const operations = [
    ...batch.nodes.map((value) => ({ kind: 'node', value })),
    ...batch.links.map((value) => ({ kind: 'link', value }))
  ];
  agent.totalUnits = operations.length;
  const safeBatchSize = Number.isFinite(Number(batchSize))
    ? Math.max(1, Math.floor(Number(batchSize)))
    : operations.length;
  const nextOperations = operations.slice(agent.processedUnits, agent.processedUnits + safeBatchSize);
  const beforeNodes = state.nodes.size;
  const beforeLinks = state.links.size;
  for (const operation of nextOperations) {
    if (operation.kind === 'node') {
      state.nodes.set(operation.value.id, operation.value);
    } else if (state.nodes.has(operation.value.source) && state.nodes.has(operation.value.target)) {
      state.links.set(operation.value.id, operation.value);
    }
  }

  agent.processedUnits += nextOperations.length;
  agent.progress = agent.totalUnits ? Math.round((agent.processedUnits / agent.totalUnits) * 100) : 100;
  agent.nodesAdded += state.nodes.size - beforeNodes;
  agent.relationshipsAdded += state.links.size - beforeLinks;
  const agentComplete = agent.processedUnits >= agent.totalUnits;
  agent.status = agentComplete ? 'complete' : 'running';
  if (agentComplete) agent.completedAt = new Date().toISOString();
  state.version += 1;

  const complete = state.agents.every((candidate) => candidate.status === 'complete');
  state.status = complete ? 'complete' : 'running';
  state.currentAgent = agentComplete ? null : agent.id;
  if (complete) state.completedAt = new Date().toISOString();
  return discoveryStatus();
}
