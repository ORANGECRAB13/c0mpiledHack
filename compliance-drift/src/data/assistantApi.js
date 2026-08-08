// Client for the real compliance assistant on the Vocare backend.
// Dev: vite proxies /api to the Node server (see vite.config.js).
// The overlay and Assistant page surface backend failures honestly; no canned
// response is substituted for a model answer.

export async function assistantStatus() {
  const r = await fetch('/api/assistant/status');
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

export async function askLive(question, history = []) {
  const r = await fetch('/api/assistant/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body.error || `ask failed ${r.status}`);
    err.code = body.code;
    throw err;
  }
  return body;
}

/**
 * Shape a live model answer for AskOverlay: an answer word-array with inline
 * citation markers and citations in the viewer's expected form.
 */
export function toScript(question, live) {
  const citations = (live.citations || []).map((c, i) => ({
    n: c.n || i + 1,
    doc: c.doc,
    page: c.page,
    quote: c.quote,
    reason: c.reason || ''
  }));
  const answer = [[live.answer + ' ', 0]];
  for (const c of citations) answer.push([`[${c.n}]`, `c${c.n}`], [' ', 0]);
  return { question, answer, citations, live: true, model: live.model, tier: live.tier };
}
