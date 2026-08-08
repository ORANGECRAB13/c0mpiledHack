// Client for the real compliance assistant on the Vocare backend.
// Dev: vite proxies /api to the Node server (see vite.config.js).
// The overlay and Assistant page fall back to the canned demo scripts when the
// backend is unreachable or no model keys are configured yet.

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
 * Shape a live answer like the canned scripts so AskOverlay renders both
 * identically: answer word-array with inline citation markers appended, and
 * citations in the {n, doc, page, quote, reason} form the viewer expects.
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
