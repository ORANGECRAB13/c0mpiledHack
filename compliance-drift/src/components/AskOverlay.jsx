import React, { useEffect, useRef, useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import { DOC_META, SCRIPTS } from '../data/askdocs.js';
import PdfViewer from './PdfViewer.jsx';

// The ask-your-documents agent: streams an answer with citations while the
// viewer opens the real cited PDF, scrolls to the page, highlights the
// quoted text on the text layer and pops the reasoning bubble beside it.
export default function AskOverlay({ query, onClose }) {
  const script = pickScript(query);
  const [shownWords, setShownWords] = useState(0);
  const [activeCite, setActiveCite] = useState(null);
  const [target, setTarget] = useState(null); // passed to PdfViewer
  const [numPages, setNumPages] = useState(null);
  const [scanning, setScanning] = useState(true);
  const timers = useRef([]);
  const seq = useRef(0);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const words = flatWords(script.answer);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 3;
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
    seq.current += 1;
    setActiveCite(cite);
    setNumPages(null);
    setTarget({ ...cite, key: seq.current });
  };

  const doc = activeCite ? DOC_META[activeCite.doc] : null;

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
                <button key={c.n} className={`ask-src ${activeCite?.n === c.n ? 'on' : ''}`} onClick={() => jumpTo(c)}>
                  <span className="cn">{c.n}</span>
                  <span>
                    <div className="dn">{DOC_META[c.doc].title}</div>
                    <div className="dp">p. {c.page} · {DOC_META[c.doc].file}</div>
                  </span>
                  <Icon name="chevR" size={13} style={{ marginLeft: 'auto', color: 'var(--t4)' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── right: real PDF viewer ── */}
        <div className="ask-viewer">
          {!doc ? (
            <div className="viewer-empty">
              <Icon name="doc" size={30} color="#C9C5BD" />
              <span>Reading the corpus…</span>
            </div>
          ) : (
            <>
              <div className="viewer-h">
                <span className="pdficon" style={{ width: 32, height: 32, fontSize: 8 }}>PDF</span>
                <span>
                  <div className="t">{doc.title}</div>
                  <div className="s">{doc.file}</div>
                </span>
                <span className="pg">p. {activeCite.page}{numPages ? ` / ${numPages}` : ''}</span>
              </div>
              <PdfViewer
                url={`/docs/${doc.file}`}
                target={target}
                onMeta={({ numPages: n }) => setNumPages(n)}
              />
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
