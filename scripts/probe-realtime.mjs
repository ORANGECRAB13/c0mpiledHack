import { config } from 'dotenv';
import WebSocket from 'ws';
config({ path: '.env.local' });

const endpoint = process.env.AZURE_NEW_ENDPOINT || process.env.AZURE_REALTIME_ENDPOINT;
const key = process.env.AZURE_NEW_KEY || process.env.AZURE_REALTIME_API_KEY;
const deployment = process.env.AZURE_NEW_DEPLOYMENT || process.env.AZURE_REALTIME_DEPLOYMENT;
const apiVersion = process.env.AZURE_REALTIME_API_VERSION || '2025-04-01-preview';
const host = new URL(endpoint).host;

const candidates = [
  `wss://${host}/openai/realtime?api-version=${apiVersion}&deployment=${deployment}`,
  `wss://${host}/voice-live/realtime?api-version=${apiVersion}&model=${deployment}`
];

function probe(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; try { ws.terminate(); } catch {} resolve(r); } };
    const ws = new WebSocket(url, { headers: { 'api-key': key }, handshakeTimeout: 6000 });
    const t = setTimeout(() => finish('timeout'), 7000);
    ws.on('open', () => { clearTimeout(t); finish('OPEN ✓'); });
    ws.on('unexpected-response', (_q, res) => { clearTimeout(t); finish(`HTTP ${res.statusCode}`); });
    ws.on('error', (e) => { clearTimeout(t); finish(`err ${e.message.slice(0,60)}`); });
  });
}

for (const url of candidates) {
  const r = await probe(url);
  console.log(r.padEnd(16), url.slice(6, 70));
}
process.exit(0);
