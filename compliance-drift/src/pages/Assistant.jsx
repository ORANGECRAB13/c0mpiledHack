import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { DOC_META } from '../data/askdocs.js';
import { askLive, assistantStatus } from '../data/assistantApi.js';
import { loadChat, saveChat, toHistory } from '../data/chatStore.js';
import PdfViewer from '../components/PdfViewer.jsx';

// The assistant page: a real chat over the internal compliance corpus.
// Questions go to the backend model (/api/assistant/ask); every citation the
// model returns is corpus-verified server-side, and clicking one opens the
// actual PDF at the cited page with the quote highlighted.
export default function Assistant() {
  // Persisted per officer — the thread survives reloads and is shared with
  // the ask-bar overlay, so follow-ups keep their context anywhere.
  const [messages, setMessages] = useState(() => loadChat()); // {role, text, citations?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeCite, setActiveCite] = useState(null);
  const [target, setTarget] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const seq = useRef(0);
  const scroller = useRef(null);

  useEffect(() => {
    assistantStatus().then(setStatus).catch(() => setStatus({ configured: false, tier: 'offline' }));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    saveChat(messages);
  }, [messages, busy]);

  const jumpTo = (cite) => {
    seq.current += 1;
    setActiveCite(cite);
    setNumPages(null);
    setTarget({ ...cite, key: seq.current });
  };

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const history = toHistory(messages);
    setMessages((ms) => [...ms, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await askLive(q, history);
      setMessages((ms) => [...ms, { role: 'assistant', text: r.answer, citations: r.citations, model: r.model }]);
      if (r.citations?.length) jumpTo(r.citations[0]);
    } catch (e) {
      setMessages((ms) => [...ms, {
        role: 'assistant',
        error: true,
        text: e.code === 'not_configured'
          ? 'The model is not configured yet. Add the Azure AI Foundry keys (AZURE_NEW_ENDPOINT / AZURE_NEW_KEY) to the backend and restart it.'
          : `The assistant could not answer: ${e.message}`
      }]);
    } finally {
      setBusy(false);
    }
  }

  const doc = activeCite ? DOC_META[activeCite.doc] : null;

  return (
    <div className="assist">
      {/* ── chat column ── */}
      <div className="chatcol">
        <div className="crumbs" style={{ paddingBottom: 8 }}>
          <a><Icon name="home" size={14} /> Home</a>
          <span className="sep"><Icon name="chevR" size={11} /></span>
          <span>Assistant</span>
          <span className="sep"><Icon name="chevR" size={11} /></span>
          <span className="here">
            {status ? (status.configured ? `${status.tier} · ${status.model}` : 'model not configured') : 'connecting…'}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} ref={scroller}>
          {messages.length === 0 && (
            <div className="resp" style={{ color: 'var(--t3)' }}>
              Ask anything about the {status?.documents ?? 7} internal compliance documents — disconnection
              thresholds, hardship protections, best-offer switches, billing accuracy. Answers cite the
              clause and open the PDF at the cited page.
              {status && !status.configured && (
                <><br /><br /><b>Model not configured.</b> The backend has no LLM keys yet — questions will
                fail until AZURE_NEW_ENDPOINT / AZURE_NEW_KEY (Azure AI Foundry) are set.</>
              )}
            </div>
          )}

          {messages.map((m, i) => m.role === 'user' ? (
            <div className="qbubble" key={i}>{m.text}</div>
          ) : (
            <div key={i}>
              <div className="resp-l">Response{m.model ? ` · ${m.model}` : ''}</div>
              <div className="resp" style={m.error ? { color: 'var(--red)' } : undefined}>
                {m.text}
                {m.citations?.map((c) => (
                  <button
                    key={c.n}
                    className={`citebtn ${activeCite === c ? 'on' : ''}`}
                    onClick={() => jumpTo(c)}
                  >{c.n}</button>
                ))}
              </div>
              {m.citations?.length > 0 && (
                <div className="ask-cites" style={{ marginTop: 8 }}>
                  {m.citations.map((c) => (
                    <button key={c.n} className={`ask-src ${activeCite === c ? 'on' : ''}`} onClick={() => jumpTo(c)}>
                      <span className="cn">{c.n}</span>
                      <span>
                        <div className="dn">{DOC_META[c.doc]?.title || c.doc}</div>
                        <div className="dp">p. {c.page} · {DOC_META[c.doc]?.scope || ''} · {c.reason}</div>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="resp" style={{ color: 'var(--t3)' }}>
              <span className="spinner" style={{ width: 11, height: 11, marginRight: 7 }} />
              cross-referencing the corpus…
            </div>
          )}
        </div>

        <div className="chat-ask chat-ask-row">
          <input
            className="chat-input"
            placeholder="Ask your documents…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            disabled={busy}
          />
          <button className="chat-send" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
            <Icon name="chevR" size={15} />
          </button>
        </div>
        <div className="cited">Cited to your documents — every claim verified against the corpus</div>
      </div>

      {/* ── pdf viewer column ── */}
      <div className="pdfcol">
        {!doc ? (
          <div className="viewer-empty" style={{ flex: 1 }}>
            <Icon name="doc" size={30} color="var(--t4)" />
            <span>Citations open here</span>
          </div>
        ) : (
          <>
            <div className="pdf-h">
              <span className="n1">{activeCite.n}</span>
              <span className="t">{doc.title}</span>
            </div>
            <div className="pdf-toolbar">
              <span className="pageno">{activeCite.page}</span> {numPages ? `of ${numPages}` : ''}
              <span className="sp" />
              <span className="cached">{doc.file}</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <PdfViewer
                url={`/docs/${doc.file}`}
                target={target}
                onMeta={({ numPages: n }) => setNumPages(n)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
