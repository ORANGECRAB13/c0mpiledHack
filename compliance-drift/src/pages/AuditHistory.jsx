import React from 'react';
import { Icon } from '../icons.jsx';
import { Crumbs, AskBar } from '../components/Chrome.jsx';

export default function AuditHistory({ latestDecision, sessionDecisions = [], records: persisted = [] }) {
  const backend = persisted.map((row) => ({ id: row.id, case: `${row.customer_id} · ${row.name}`, workflow: 'Hardship & Best Offer', outcome: row.outcome, evidence: row.evidence?.length || 0, rules: row.evidence?.length || 0, policy: `${row.policy_id}@${row.policy_version}`, officer: row.actor_id || 'Awaiting approval', ts: new Date(row.created_at).toLocaleString('en-AU'), trigger: row.action_type || null }));
  const records = [...sessionDecisions].reverse().concat(backend);
  const exportEvidence = () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      officer: 'Priya N.',
      recordCount: records.length,
      records,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocare-decision-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="page">
      <Crumbs items={['Operations', 'Audit History']} />
      <div className="h1row">
        <div>
          <h1 className="display">Decision Audit</h1>
          <div className="h1sub">Every decision is reproducible: inputs, rules, uncertainty, policy version and accountable officer.</div>
        </div>
        <button className="btn-ghost" onClick={exportEvidence}><Icon name="upload" size={14} /> Export evidence bundle</button>
      </div>

      {latestDecision && (
        <div className="okbanner compact-banner">
          <Icon name="check" size={16} />
          <span>{latestDecision.id} was recorded with {latestDecision.evidence} evidence sources and {latestDecision.officer}’s approval.</span>
          <button>Evidence snapshot preserved <Icon name="check" size={12} /></button>
        </div>
      )}

      <div className="qtable audittable" style={{ marginTop: 26 }}>
        <div className="q-head">
          <span>Decision ID</span><span>Case</span><span>Workflow</span><span>Outcome</span>
          <span>Evidence</span><span>Approver</span><span>Timestamp</span>
        </div>
        {records.map((record) => (
          <div className={`q-row ${record.id === latestDecision?.id ? 'new-audit-row' : ''}`} key={record.id}>
            <span className="mono" style={{ fontSize: 12, color: '#3B6FE0' }}>{record.id}</span>
            <span className="cust" style={{ fontWeight: 600 }}>{record.case}</span>
            <span className="sub">{record.workflow}</span>
            <span className="audit-outcome"><b>{record.outcome}</b>{record.trigger && <small>{record.trigger}</small>}</span>
            <span className="auditmeta">{record.evidence} sources · {record.rules} rules · {record.policy}</span>
            <span className="sub">{record.officer}</span>
            <span className="auditmeta mono">{record.ts}{record.id === latestDecision?.id && <b className="new-record">New</b>}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '12px 4px' }}>
        {records.length} persisted decisions · each record preserves the evidence used, rules evaluated, policy version, approver and timestamp
      </div>

      <AskBar />
    </div>
  );
}
