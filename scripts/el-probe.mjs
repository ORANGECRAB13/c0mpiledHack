import { config } from 'dotenv';
import WebSocket from 'ws';
config({ path: '.env.local' });
const key = process.env.NEW_ELEVENLABS_API_KEY;
const agent = process.env.NEW_ELEVENLABS_AGENT;
const su = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agent}`, { headers: { 'xi-api-key': key } }).then(r => r.json());
const ws = new WebSocket(su.signed_url);
const seen = new Set(); let audio = 0;
ws.on('open', () => { console.log('open'); ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' })); });
ws.on('message', (d) => {
  const e = JSON.parse(d); seen.add(e.type);
  if (e.type === 'audio') { audio++; return; }
  if (e.type === 'agent_response') console.log('AGENT:', e.agent_response_event?.agent_response?.slice(0,90));
  if (e.type === 'ping') ws.send(JSON.stringify({ type: 'pong', event_id: e.ping_event?.event_id }));
});
ws.on('error', (err) => console.log('error', err.message));
setTimeout(() => { console.log('--- types:', [...seen].join(', '), '| audio:', audio); ws.close(); process.exit(0); }, 10000);
