// Persisted assistant chat history, keyed per person so each officer keeps
// their own thread. The overlay and the Assistant page share this store, so a
// conversation started from the ask bar continues on the Assistant screen.

export const CURRENT_OFFICER = 'officer-pm'; // the signed-in account in the sidebar

const key = (person) => `aurora-assistant-chat:${person}`;

export function loadChat(person = CURRENT_OFFICER) {
  try {
    const raw = localStorage.getItem(key(person));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const cleaned = [];
    for (const message of parsed) {
      if (message?.mode === 'demo') {
        if (cleaned.at(-1)?.role === 'user') cleaned.pop();
        continue;
      }
      cleaned.push(message);
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function saveChat(messages, person = CURRENT_OFFICER) {
  try {
    localStorage.setItem(key(person), JSON.stringify(messages.slice(-40)));
  } catch { /* storage full or unavailable — chat still works in-memory */ }
}

export function clearChat(person = CURRENT_OFFICER) {
  try { localStorage.removeItem(key(person)); } catch { /* noop */ }
}

/** History in the shape the backend expects. */
export function toHistory(messages) {
  return messages.map((m) => ({ role: m.role, text: m.text }));
}
