import WebSocket from 'ws';

// Start a case first via HTTP.
const started = await fetch('http://localhost:5182/api/case/start', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ customerId: 'CUS-77241' })
}).then((r) => r.json());
const caseId = started.case.caseId;
console.log('case:', caseId);

const ws = new WebSocket(`ws://localhost:5182/api/voice/stream?caseId=${caseId}`);
let audioChunks = 0;
const seen = new Set();

ws.on('open', () => console.log('bridge open'));
ws.on('message', (data) => {
  const e = JSON.parse(data);
  if (e.type === 'audio') { audioChunks += 1; return; }
  seen.add(e.type);
  console.log('event:', e.type, e.message || e.text?.slice(0, 60) || '');
});
ws.on('error', (err) => console.log('bridge error', err.message));

setTimeout(() => {
  console.log('--- summary ---');
  console.log('event types:', [...seen].join(', '));
  console.log('audio chunks from agent:', audioChunks);
  ws.close();
  process.exit(0);
}, 12000);
