import WebSocket from 'ws';
const started = await fetch('http://localhost:5182/api/case/start', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ customerId: 'CUS-77241' })
}).then((r) => r.json());
const caseId = started.case.caseId;
console.log('case:', caseId);
const ws = new WebSocket(`ws://localhost:5182/api/voice/stream?caseId=${caseId}`);
let audio = 0; const seen = new Set();
ws.on('open', () => console.log('bridge open'));
ws.on('message', (d) => {
  const e = JSON.parse(d);
  if (e.type === 'audio') { audio++; return; }
  seen.add(e.type);
  console.log('event:', e.type, e.message || e.text?.slice(0, 70) || '');
});
ws.on('error', (err) => console.log('bridge error', err.message));
setTimeout(() => { console.log('--- types:', [...seen].join(', '), '| pcm24k chunks:', audio); ws.close(); process.exit(0); }, 11000);
