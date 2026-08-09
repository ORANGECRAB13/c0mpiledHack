// API location. In dev, empty — Vite proxies /api to the local backend.
// On Vercel, set VITE_API_BASE to the deployed backend origin
// (e.g. https://api.vocare.example) at build time.
const raw = import.meta.env.VITE_API_BASE || '';
export const API_BASE = raw.replace(/\/+$/, '');

export const apiUrl = (path) => `${API_BASE}${path}`;

export const wsUrl = (path) => {
  if (API_BASE) return `${API_BASE.replace(/^http/, 'ws')}${path}`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${path}`;
};
