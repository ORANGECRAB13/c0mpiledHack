import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

export default function ChatPanel({ open, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me about synthetic customers, billing, meters, outages, grid assets, work orders, procurement, or the utility ledger.' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const data = await api.post('/api/agent/chat', { message });
      setMessages((current) => [...current, { role: 'assistant', content: data.answer, toolTrace: data.toolTrace }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <aside className="flex w-[28rem] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">AI Assistant</h2>
          <p className="text-xs text-slate-400">Synthetic utility context</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          ×
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={
                message.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white'
                  : 'max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-800'
              }
            >
              <Markdown text={message.content} />
              {message.toolTrace?.length > 0 && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">What I checked ({message.toolTrace.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {message.toolTrace.map((trace, traceIndex) => (
                      <li key={traceIndex}>
                        <code className="rounded bg-slate-200 px-1">{trace.tool}</code> — {trace.summary}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-slate-400">Thinking…</p>}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your data…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}

/** Minimal markdown renderer: tables, bold, code, lists. */
function Markdown({ text }) {
  const blocks = String(text || '').split('\n\n');
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter(Boolean);
        if (lines.length > 1 && lines.every((line) => line.trim().startsWith('|'))) {
          const rows = lines.filter((line) => !/^\|[\s:|-]+\|$/.test(line.trim()));
          return (
            <div key={index} className="overflow-x-auto">
              <table className="min-w-full border border-slate-200 text-xs">
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? 'bg-slate-200 font-medium' : 'odd:bg-white even:bg-slate-50'}>
                      {row
                        .split('|')
                        .slice(1, -1)
                        .map((cell, cellIndex) => (
                          <td key={cellIndex} className="border border-slate-200 px-2 py-1">
                            <Inline text={cell.trim()} />
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (lines.every((line) => /^[-*]\s/.test(line.trim()))) {
          return (
            <ul key={index} className="list-disc space-y-0.5 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  <Inline text={line.replace(/^[-*]\s/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                <Inline text={line.replace(/^#+\s/, '')} />
                {lineIndex < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={index} className="rounded bg-slate-200 px-1 text-xs">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}
