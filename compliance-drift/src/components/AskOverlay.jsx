import React, { useEffect, useRef, useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import { DOC_META, SCRIPTS } from '../data/askdocs.js';
import { askLive, toScript } from '../data/assistantApi.js';
import { loadChat, saveChat, toHistory } from '../data/chatStore.js';
import PdfViewer from './PdfViewer.jsx';

// The ask-your-documents agent: a multi-turn chat. Each answer streams in with
// citations while the viewer opens the real cited PDF, scrolls to the page and
// highlights the quoted text. Follow-up questions go in the input at the
// bottom — no need to close and reopen. History is persisted per officer
// (chatStore) and shared with the Assistant page.
//
// Live-first: questions go to the real model (/api/assistant/ask). If the
// backend is down or keyless, the canned demo script for the closest question
// keeps the overlay working — labelled as demo, never passed off as live.
export default function AskOverlay({ query, onClose }) {
  // messages: {role:'user'|'assistant', text, answer?, citations?, mode?}
  const [messages, setMessages] = useState(() => loadChat());
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [streamed, setStreamed] = useState(0); // words shown of the LAST assistant msg
  const [activeCite, setActiveCite] = useState(null);
  const [target, setTarget] = useState(null); // passed to PdfViewer
  const [numPages, setNumPages] = useState(null);
  const timers = useRef([]);
  const seq = useRef(0);
  const asked = useRef(false);
  const scroller = useRef(null);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const ask = async (q) => {
    setBusy(true);
    setMessages((ms) => {
      const next = [...ms, { role: 'user', text: q }];
      saveChat(next);
      return next;
    });
    let entry;
    try {
      const r = await askLive(q, toHistory(loadChat()));
      const s = toScript(q, r);
      entry = { role: 'assistant', text: r.answer, answer: s.answer, citations: s.citations, mode: 'live', model: r.model };
    } catch {
      const s = pickScript(q);
      entry = { role: 'assistant', text: flatWords(s.answer).map(([t]) => t).join(''), answer: s.answer, citations: s.citations, mode: 'demo' };
    }
    setStreamed(0);
    setMessages((ms) => {
      const next = [...ms, entry];
      saveChat(next);
      return next;
    });
    setBusy(false);
  };

  // The opening question from the ask bar.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    ask(query);
    return () => timers.current.forEach(clearTimeout);
  }, [query]);

  const last = messages[messages.length - 1];
  const lastIsAnswer = last?.role === 'assistant';
  const lastWords = lastIsAnswer ? flatWords(last.answer || [[last.text, 0]]) : [];

  // Stream the newest answer, then fly to its first citation.
  useEffect(() => {
    if (!lastIsAnswer) return;
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setStreamed(i);
      if (i >= lastWords.length) {
        clearInterval(id);
        if (last.citations?.length) later(() => jumpTo(last.citations[0]), 400);
      }
    }, 50);
    return () => clearInterval(id);
  }, [messages.length]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamed, busy]);

  const jumpTo = (cite) => {
    seq.current += 1;
    setActiveCite(cite);
    setNumPages(null);
    setTarget({ ...cite, key: seq.current });
  };

  const send = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    ask(q);
  };

  const doc = activeCite ? DOC_META[activeCite.doc] : null;
  const lastDone = lastIsAnswer && streamed >= lastWords.length;

  return (
    <div className="askveil">
      <div className="askpanel">
        {/* ── left: agent conversation ── */}
        <div className="ask-chat">
          <div className="ask-chat-h">
            <Mark size={22} />
            <span>Compliance agent</span>
            <span className="crossref">
              {busy
                ? <><span className="spinner" style={{ width: 11, height: 11 }} /> cross-referencing the corpus…</>
                : lastIsAnswer
                  ? <><Icon name="check" size={12} /> {last.citations?.length || 0} sources cited · {last.mode === 'live' ? (last.model || 'live model') : 'demo corpus'}</>
                  : null}
            </span>
            <button className="xbtn" onClick={onClose}><Icon name="x" size={15} /></button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} ref={scroller}>
            {messages.map((m, i) => {
              if (m.role === 'user') return <div className="ask-q" key={i}>{m.text}</div>;
              const isLast = i === messages.length - 1;
              const shown = isLast ? streamed : Infinity;
              return (
                <div key={i}>
                  <div className="ask-a">
                    <StreamedAnswer
                      answer={m.answer || [[m.text, 0]]}
                      shownWords={shown}
                      activeN={activeCite?.n}
                      onCite={(n) => jumpTo(m.citations?.find((c) => c.n === n))}
                    />
                  </div>
                  {(!isLast || lastDone) && m.citations?.length > 0 && (
                    <div className="ask-cites">
                      <div className="ask-cites-h">Sources — click to inspect</div>
                      {m.citations.map((c) => (
                        <button key={c.n} className={`ask-src ${activeCite === c ? 'on' : ''}`} onClick={() => jumpTo(c)}>
                          <span className="cn">{c.n}</span>
                          <span>
                            <div className="dn">{DOC_META[c.doc]?.title || c.doc}</div>
                            <div className="dp">p. {c.page} · {DOC_META[c.doc]?.scope || DOC_META[c.doc]?.file || ''}</div>
                          </span>
                          <Icon name="chevR" size={13} style={{ marginLeft: 'auto', color: 'var(--t4)' }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {busy && <div className="ask-a" style={{ color: 'var(--t3)' }}><span className="caret" /></div>}
          </div>

          <div className="chat-ask chat-ask-row" style={{ marginTop: 12 }}>
            <input
              className="chat-input"
              placeholder="Ask a follow-up…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              disabled={busy}
            />
            <button className="chat-send" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
              <Icon name="chevR" size={15} />
            </button>
          </div>
        </div>

        {/* ── right: real PDF viewer ── */}
        <div className="ask-viewer">
          {!doc ? (
            <div className="viewer-empty">
              <Icon name="doc" size={30} color="var(--t4)" />
              <span>Reading the corpus…</span>
            </div>
          ) : (
            <>
              <div className="viewer-h">
                <span className="pdficon" style={{ width: 32, height: 32, fontSize: 8 }}>PDF</span>
                <span>
                  <div className="t">{doc.title}</div>
                  <div className="s">{doc.scope || doc.file}</div>
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
  const shown = Number.isFinite(shownWords) ? words.slice(0, shownWords) : words;
  const done = !Number.isFinite(shownWords) || shownWords >= words.length;
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
