import React from 'react';
import { Icon } from '../icons.jsx';
import { AskBar } from '../components/Chrome.jsx';

export default function Home({ openCase, goQueue, goWorkflow, goMonitoring, decisions, queue = [] }) {
  const urgent = queue.filter((item) => item.priority === 'High' && !decisions[item.id]?.approved);
  const ready = queue.filter((item) => item.status === 'Ready for review' && !decisions[item.id]?.approved).length;
  const completed = Object.values(decisions).filter((item) => item.approved).length;

  return (
    <div className="page product-page home-product">
      <div className="home-welcome">
        <div>
          <div className="eyebrow">Saturday, 8 August</div>
          <h1 className="display">Good morning, Priya</h1>
          <div className="h1sub">Here is the work that needs your attention.</div>
        </div>
        <button className="btn-orange" onClick={() => urgent[0] && openCase(urgent[0].id)}>Review highest priority <Icon name="chevR" size={13} /></button>
      </div>

      <div className="home-metrics">
        <button onClick={goQueue}><b>{urgent.length}</b><span>High-priority cases</span><Icon name="chevR" size={13} /></button>
        <button onClick={goQueue}><b>{ready}</b><span>Ready for review</span><Icon name="chevR" size={13} /></button>
        <button onClick={goQueue}><b>{completed}</b><span>Completed this session</span><Icon name="chevR" size={13} /></button>
      </div>

      <section className="lifecycle-section">
        <div className="home-section-head">
          <div><h2>Three operational workflows</h2><p>Consistent work queues with reproducible decisions and evidence.</p></div>
        </div>
        <div className="lifecycle-grid">
          {[
            ['Hardship & best offer', 'Hardship & Best Offer', 'Find silent customers and make the required switch from 1 October'],
            ['Continuous hardship monitoring', 'Continuous Monitoring', 'Reassess whether support still fits as circumstances change'],
          ].map(([label, workflow, description]) => (
            <button key={workflow} onClick={() => workflow === 'Continuous Monitoring' ? goMonitoring() : goWorkflow(workflow)}>
              <span><b>{workflow === 'Continuous Monitoring' ? queue.filter((item) => item.status === 'Monitoring').length : queue.filter((item) => item.workflow === workflow).length}</b>{label}</span>
              <small>{description}</small>
              <Icon name="chevR" size={13} />
            </button>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <div>
            <h2>Priority work</h2>
            <p>Cases ordered by customer risk and regulatory timing.</p>
          </div>
          <button className="text-button primary" onClick={goQueue}>View decision queue</button>
        </div>
        <div className="home-case-list">
          {urgent.map((item) => (
            <button key={item.id} onClick={() => openCase(item.id)}>
              <span className="home-priority-dot" />
              <span className="home-case-main"><b>{item.customer}</b><small>{item.id} · {item.workflow}</small></span>
              <span className="home-case-action">{item.action}</span>
              <Icon name="chevR" size={14} />
            </button>
          ))}
        </div>
      </section>
      <AskBar />
    </div>
  );
}
