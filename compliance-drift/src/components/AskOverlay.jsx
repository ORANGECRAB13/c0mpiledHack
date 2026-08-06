import React, { useEffect, useRef, useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import { DOC_LIB, SCRIPTS } from '../data/askdocs.js';

// The ask-your-documents agent: streams an answer with citations while the
// viewer opens the cited document, scrolls to the exact clause, sweeps a
// highlight over it and pops the reasoning bubble beside it.
export default function AskOverlay({ query, onClose }) {
  const script = pickScript(query);
  const [shownWords, setShownWords] = useState(0);
  const [activeCite, setActiveCite] = useState(null); // citation object
  const [docId, setDocId] = useState(null);
  const [hl, setHl] = useState(null);       // clause id currently highlighted
  const [bubble, setBubble] = useState(null); // clause id with visible bubble
  const [scanning, setScanning] = useState(true);
  const viewerRef = useRef(null);
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const words = flatWords(script.answer);

  // stream the answer, then walk citation 1 automatically
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 3; // words per tick
      setShownWords(i);
      if (i >= words.length) {
        clearInterval(id);
        setScanning(false);
        later(() => jumpTo(script.citations[0]), 400);
      }
    }, 50);
    return () => { clearInterval(id); timers.current.forEach(clearTimeout); };
  }, []);

  const jumpTo = (cite) => {
    setActiveCite(cite);
    setHl(null);
    setBubble(null);
    const sameDoc = docId === cite.doc;
    setDocId(cite.doc);
    // let the doc render/swap, then scroll, then highlight, then bubble
    later(() => {
      const el = document.getElementById(`clause-${cite.clause}`);
      const box = viewerRef.current;
      if (el && box) {
        box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
      }
      later(() => setHl(cite.clause), sameDoc ? 450 : 700);
      later(() => setBubble(cite.clause), sameDoc ? 1000 : 1300);
    }, sameDoc ? 60 : 320);
  };

  const doc = docId ? DOC_LIB[docId] : null;

  return (
    <div className="askveil">
      <div className="askpanel">
        {/* ── left: agent conversation ── */}
        <div className="ask-chat">
          <div className="ask-chat-h">
            <Mark size={22} />
            <span>Alloovium agent</span>
            <span className="crossref">
              {scanning
                ? <><span className="spinner" style={{ width: 11, height: 11 }} /> cross-referencing 173 documents…</>
                : <><Icon name="check" size={12} /> {script.citations.length} sources cited</>}
            </span>
            <button className="xbtn" onClick={onClose}><Icon name="x" size={15} /></button>
          </div>

          <div className="ask-q">{script.question}</div>

          <div className="ask-a">
            <StreamedAnswer
              answer={script.answer}
              shownWords={shownWords}
              activeN={activeCite?.n}
              onCite={(n) => jumpTo(script.citations.find((c) => c.n === n))}
            />
          </div>

          {shownWords >= words.length && (
            <div className="ask-cites">
              <div className="ask-cites-h">Sources — click to inspect</div>
              {script.citations.map((c) => (
                <button
                  key={c.n}
                  className={`ask-src ${activeCite?.n === c.n ? 'on' : ''}`}
                  onClick={() => jumpTo(c)}
                >
                  <span className="cn">{c.n}</span>
                  <span>
                    <div className="dn">{DOC_LIB[c.doc].title}</div>
                    <div className="dp">p. {c.page} · {DOC_LIB[c.doc].file}</div>
                  </span>
                  <Icon name="chevR" size={13} style={{ marginLeft: 'auto', color: 'var(--t4)' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── right: document viewer ── */}
        <div className="ask-viewer">
          {!doc ? (
            <div className="viewer-empty">
              <Icon name="doc" size={30} color="#C9C5BD" />
              <span>Reading the corpus…</span>
            </div>
          ) : (
            <>
              <div className="viewer-h">
                <span className="pdficon" style={{ width: 32, height: 32, fontSize: 8 }}>
                  {doc.file.endsWith('.pdf') ? 'PDF' : 'DOCX'}
                </span>
                <span>
                  <div className="t">{doc.title}</div>
                  <div className="s">{doc.file}</div>
                </span>
                <span className="pg">p. {activeCite?.page ?? 1} / {doc.pages}</span>
              </div>
              <div className="viewer-scroll" ref={viewerRef} key={docId}>
                <div className="viewer-page">
                  {doc.body.map((sec, si) => sec.title ? (
                    <div key={si}>
                      <div className="vp-title">{sec.h}</div>
                      <div className="vp-meta">{sec.meta}</div>
                    </div>
                  ) : (
                    <div key={si} className="vp-sec">
                      <div className="vp-h">{sec.h}</div>
                      {sec.paras.map((p, pi) => (
                        <div
                          key={pi}
                          id={p.id ? `clause-${p.id}` : undefined}
                          className={`vp-p ${hl === p.id ? 'lit' : ''}`}
                        >
                          {p.t}
                          {bubble === p.id && activeCite && (
                            <div className="whybubble">
                              <div className="wb-h"><span className="cn">{activeCite.n}</span> Why this matters</div>
                              <div className="wb-b">{activeCite.reason}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  {/* filler so short docs can centre-scroll */}
                  <div style={{ height: 260 }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pickScript(q) {
  const lq = (q || '').toLowerCase();
  let best = SCRIPTS[0], score = 0;
  for (const s of SCRIPTS) {
    const n = s.match.filter((m) => lq.includes(m)).length;
    if (n > score) { best = s; score = n; }
  }
  return best;
}

function flatWords(answer) {
  return answer.flatMap(([t, k]) => (k && String(k).startsWith('c') ? [[t, k]] : t.split(' ').map((w) => [w + ' ', k])));
}

function StreamedAnswer({ answer, shownWords, activeN, onCite }) {
  const words = flatWords(answer);
  const shown = words.slice(0, shownWords);
  const done = shownWords >= words.length;
  return (
    <span>
      {shown.map(([t, k], i) => {
        if (k && String(k).startsWith('c')) {
          const n = Number(String(k).slice(1));
          return (
            <button key={i} className={`citebtn ${activeN === n ? 'on' : ''}`} onClick={() => onCite(n)}>{n}</button>
          );
        }
        return <span key={i} style={k === 'b' ? { fontWeight: 650 } : {}}>{t}</span>;
      })}
      {!done && <span className="caret" />}
    </span>
  );
}
