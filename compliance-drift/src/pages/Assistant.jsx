import React from 'react';
import { Icon } from '../icons.jsx';

export default function Assistant() {
  return (
    <div className="assist">
      {/* ── chat column ── */}
      <div className="chatcol">
        <div className="crumbs" style={{ paddingBottom: 8 }}>
          <a><Icon name="home" size={14} /> Home</a>
          <span className="sep"><Icon name="chevR" size={11} /></span>
          <span>Assistant</span>
          <span className="sep"><Icon name="chevR" size={11} /></span>
          <span className="here">Dr…</span>
        </div>

        <div className="qbubble">
          Draft a notice of latent conditions — rock encountered in SW stormwater trench. Ground
          evidence is in the diary (DIARY-NGT-0728), and check the contract's clause 25 for
          consequences on time for the works, then estimate.
        </div>

        <div className="resp-l">Response</div>
        <div className="resp">
          I'm drafting <b>Notice of latent conditions — rock in SW stormwater trench (Northgate
          Developments)</b> now — a Draft with citations to the head contract (Cl 25 Latent
          Conditions, Cl 34) and the site diary for Northgate Tower (Tue 28 Jul 2026). Open it to
          review the document — save it to the project when you're happy with it, or the library
          when it's right.
        </div>
        <div className="resp-actions">
          <button><Icon name="copy" size={13} /> Copy</button>
          <button><Icon name="upload" size={13} /> Export</button>
          <button>👍</button>
          <button>👎</button>
        </div>

        <div className="docchip">
          <Icon name="doc" size={20} color="#8B8780" />
          <span>
            <div className="t">Notice of latent conditions — rock in SW stormwater trench</div>
            <div className="s">Open to review, check citations</div>
          </span>
        </div>

        <div className="chat-ask">
          Ask your documents, dr…
          <div className="row2">
            <Icon name="mic" size={15} />
            <Icon name="link" size={15} />
            <Icon name="upload" size={15} />
          </div>
        </div>
        <div className="cited">Cited to your do…</div>
      </div>

      {/* ── pdf viewer column ── */}
      <div className="pdfcol">
        <div className="pdf-h">
          <span className="n1">1</span>
          <span className="t">Head Contract extract</span>
          <button className="x"><Icon name="x" size={14} /></button>
        </div>
        <div className="pdf-toolbar">
          <Icon name="chevL" size={14} />
          <span className="pageno">1</span> of 2
          <Icon name="chevR" size={14} />
          <span className="cached">cached</span>
          <span className="sp" />
          <Icon name="search" size={14} />
          73%
          <Icon name="plus" size={13} />
          <Icon name="expand" size={14} />
          <Icon name="refresh" size={14} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div className="pdfpage">
            <div className="doc-title">Northgate Tower — Head Contract</div>
            <div className="extract">
              <div className="et">General Conditions of Contract — Extract</div>
              Principal: Northgate Developments Pty Ltd<br />
              Contractor: Halevorn Construction Pty Ltd<br />
              Contract: Construct only, lump sum — AS 4000-1997 General Conditions of Contract as amended by
              the Contract Particulars
            </div>
            <p>
              Extract issued for project record: Clauses 25 (Latent Conditions), 34 (Time and Progress) and 36
              (Variations). Where this extract and the executed contract differ, the executed contract prevails.
            </p>
            <h4>25. Latent Conditions</h4>
            <h5>25.1 Definition</h5>
            <p>
              Latent conditions are physical conditions on the Site or its surroundings, including artificial things but
              excluding weather conditions, which differ materially from the physical conditions which should
              reasonably have been anticipated by a competent contractor at the time of the Contractor's tender if
              the Contractor had inspected all written information made available by the Principal for tendering
              purposes, including the geotechnical baseline report, and all information otherwise discoverable by
              the inspections and enquiries described in the tender documents.
            </p>
            <h5>25.2 Direction to proceed</h5>
            <p>
              Upon becoming aware of a latent condition the Contractor shall, where practicable, suspend work in
              the affected area pending the Superintendent's direction, except to the extent work is necessary to
              protect people, property or the Works. The Superintendent shall direct the Contractor as to how to
              proceed.
            </p>
            <h5>25.3 Notice of latent conditions</h5>
            <p>
              The Contractor shall give the Superintendent written notice of a latent condition within 5 business
              days of the Contractor first becoming aware of the latent condition, and in any event before the
              latent condition is disturbed, covered or remediated. The notice shall describe: (a) the latent
              condition encountered and where it was encountered; (b) the respects in which it differs materially
              from the physical conditions which should reasonably have been anticipated, by reference to the
              tender information including the geotechnical baseline report; (c) the evidence relied upon, including
              photographs, survey records and test results where available; and (d) the Contractor's initial
              estimate of the effect on cost and on the programme.
            </p>
            <p>
              Time is of the essence for a notice under this subclause. If the Contractor fails to give notice within
              the time required, the Contractor's entitlement to have the latent condition valued as a variation and
              to any consequential extension of time is reduced to the extent that the failure has prejudiced the
              Principal, and is barred where the latent condition has been covered or remediated before notice is
              given such that the Superintendent has been deprived of the reasonable opportunity to inspect it.
            </p>
          </div>
        </div>
      </div>

      {/* ── editor column ── */}
      <div className="editcol">
        <div className="ed-h">
          <span className="draft"><Icon name="doc" size={14} /> DRAFT</span>
          <span className="ready">● Ready</span>
          <span className="sp" />
          <span className="pill"><Icon name="doc" size={12} /> 5</span>
          <span className="pill orange"><Icon name="quote" size={12} /> 50</span>
          <span className="pill"><Icon name="save" size={12} /> Save</span>
          <button className="xbtn"><Icon name="x" size={14} /></button>
        </div>
        <div className="ed-title">
          Notice of latent conditions — rock in SW stormwater trench (Northgate Developments)
        </div>
        <div className="ed-toolbar">
          {['undo', 'redo', 'img', 'table', 'link', 'search', 'comment', 'signature'].map((ic) => (
            <Icon name={ic} size={15} key={ic} />
          ))}
        </div>
        <div className="ed-body">
          <div className="ed-page">
            <div className="tiny">Notice of Latent Condition — Rock Encountered in SW Stormwater Trench · Rev 0</div>
            <div className="corp">Northgate Tower</div>
            <h2>Notice of Latent Condition — Rock Encountered in SW Stormwater Trench</h2>
            <h3>Executive Summary</h3>
            <p>1.0 Executive Summary</p>
            <p>
              This notice is issued to Northgate Developments Pty Ltd as Principal for Northgate Tower, 150 Ann
              Street, Brisbane City QLD 4000, under the construct only, lump sum head contract with Halevorn
              Construction Pty Ltd <span className="cite">1</span>. DIARY-NGT-0728 records that Halevorn first
              became aware of hard rock in the SW stormwater trench on Tue 28 Jul 2026 <span className="cite">3</span>. The
              excavation crew stopped at the affected chainage before the condition was disturbed, covered or
              remediated <span className="cite">7</span>. The notice must state:
            </p>
            <ul>
              <li>the condition and location;</li>
              <li>
                the material difference from anticipated conditions, by reference to tender information including
                the geotechnical baseline report;
              </li>
              <li>
                the evidence relied on, including photographs, survey records and test results where available; and
              </li>
              <li>the initial cost and programme effect.</li>
            </ul>
            <p>
              Time is of the essence under clause 25.3 <span className="cite">8</span>. Late notice reduces entitlement to
              valuation as a variation and any consequential EOT to the extent of Principal prejudice, and bars
              entitlement where covering or remediation deprives the Superintendent of a reasonable inspection
              opportunity <span className="cite">8</span>. The initial impact is 2–3 days additional to this run and
              $18,000–$25,000 for hammer attachment hire and standing time, to be confirmed once the extent of
              rock is known <span className="cite">9</span>.
            </p>
          </div>

          <div className="citepop">
            <div className="t">Head Contract extract</div>
            <div className="pg">Page 1</div>
            <div className="bd">
              Principal: Northgate Developments Pty Ltd<br />
              Contractor: Halevorn Construction Pty Ltd…
            </div>
            <a className="open">Open source</a>
          </div>
        </div>
        <div className="ed-foot">
          <span>1 / 6</span>
          <span className="z"><Icon name="minus" size={13} /> 58% <Icon name="plus" size={13} /></span>
          <span className="z"><Icon name="chevL" size={13} /> 1/48 <Icon name="chevR" size={13} /></span>
        </div>
      </div>
    </div>
  );
}
