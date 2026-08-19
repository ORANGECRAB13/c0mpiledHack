import React, { useEffect, useRef, useState } from 'react';
import { Icon, Mark } from '../icons.jsx';
import { DOC_META } from '../data/askdocs.js';
import { askLive, toScript } from '../data/assistantApi.js';
import { loadChat, saveChat, toHistory } from '../data/chatStore.js';
import PdfViewer from './PdfViewer.jsx';

// The ask-your-documents agent: a multi-turn chat. Each answer streams in with
// citations while the viewer opens the real cited PDF, scrolls to the page and
// highlights the quoted text. Follow-up questions go in the input at the
// bottom — no need to close and reopen. History is persisted per officer
// (chatStore) and shared with the Assistant page.
//
// Every answer comes from the configured backend model. There is deliberately
// no canned fallback: failures remain visible instead of looking like answers.
export default function AskOverlay({ query, onClose, fresh = false }) {
  // messages: {role:'user'|'assistant', text, answer?, citations?, mode?}
  const [messages, setMessages] = useState(() => fresh ? [] : loadChat());
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
      if (!fresh) saveChat(next);
      return next;
    });
    let entry;
    try {
      const r = await askLive(q, fresh ? [] : toHistory(loadChat()));
      const s = toScript(q, r);
      entry = { role: 'assistant', text: r.answer, answer: s.answer, citations: s.citations, mode: 'live', model: r.model };
    } catch (error) {
      const text = error.code === 'not_configured'
        ? 'The compliance model is not configured. Add the Azure AI Foundry credentials and restart the backend.'
        : `The compliance model could not answer: ${error.message}`;
      entry = { role: 'assistant', text, answer: [[text, 0]], citations: [], mode: 'error', error: true };
    }
    setStreamed(0);
    setMessages((ms) => {
      const next = [...ms, entry];
      if (!fresh) saveChat(next);
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
  const sourceDocumentCount = new Set((last?.citations || []).map((citation) => citation.doc)).size;

  return (
    <div className="askveil">
      <div className="askpanel">
        <button className="xbtn ask-close" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button>
        {/* ── left: agent conversation ── */}
        <div className="ask-chat">
          <div className="ask-chat-h">
            <Mark size={22} />
            <span>Compliance agent</span>
            <span className="crossref">
              {busy
                ? <><span className="spinner" style={{ width: 11, height: 11 }} /> cross-referencing the corpus…</>
                : lastIsAnswer && last.error
                  ? <><Icon name="warn" size={12} /> model request failed</>
                  : lastIsAnswer
                    ? <><Icon name="check" size={12} /> {sourceDocumentCount} PDF{sourceDocumentCount === 1 ? '' : 's'} · {last.citations?.length || 0} citations · {last.model || 'live model'}</>
                  : null}
            </span>
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
                    <SourceList citations={m.citations} activeCite={activeCite} onSelect={jumpTo} />
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

function SourceList({ citations, activeCite, onSelect }) {
  const groups = citations.reduce((all, citation) => {
    const existing = all.find((group) => group.doc === citation.doc);
    if (existing) existing.citations.push(citation);
    else all.push({ doc: citation.doc, citations: [citation] });
    return all;
  }, []);

  return (
    <div className="ask-cites">
      <div className="ask-cites-h">Source documents — click to inspect</div>
      {groups.map((group, index) => {
        const pages = [...new Set(group.citations.map((citation) => citation.page))].sort((a, b) => a - b);
        const meta = DOC_META[group.doc];
        return (
          <button key={group.doc} className={`ask-src ${activeCite?.doc === group.doc ? 'on' : ''}`} onClick={() => onSelect(group.citations[0])}>
            <span className="cn">{index + 1}</span>
            <span>
              <div className="dn">{meta?.title || group.doc}</div>
              <div className="dp">{group.citations.length} cited passages · pp. {pages.join(', ')} · {meta?.scope || meta?.file || ''}</div>
            </span>
            <Icon name="chevR" size={13} style={{ marginLeft: 'auto', color: 'var(--t4)' }} />
          </button>
        );
      })}
    </div>
  );
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
