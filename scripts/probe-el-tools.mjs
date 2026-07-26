import WebSocket from 'ws';
const started = await fetch('http://localhost:5182/api/case/start', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ customerId: 'CUS-77241' })
}).then((r) => r.json());
const caseId = started.case.caseId;
console.log('unlocked before:', started.case.stack.totals.benefitsUnlocked);
const ws = new WebSocket(`ws://localhost:5182/api/voice/stream?caseId=${caseId}`);
const send = (o) => ws.send(JSON.stringify(o));
let greeted = false;
ws.on('message', async (d) => {
  const e = JSON.parse(d);
  if (e.type === 'audio') return;
  if (e.type === 'transcript') console.log(`  [${e.speaker}] ${e.text.slice(0,90)}`);
  if (e.type === 'case_changed') {
    const c = await fetch(`http://localhost:5182/api/case/${caseId}`).then(r=>r.json());
    console.log('  >> case_changed · unlocked NOW: $' + c.case.stack.totals.benefitsUnlocked, '· eligible:', c.case.stack.eligible.map(x=>x.id).join(','));
  }
  if (e.type === 'error') console.log('  ERROR:', e.message);
  // After the greeting, inject the disclosure as a user text turn.
  if (e.type === 'transcript' && e.speaker === 'agent' && !greeted) {
    greeted = true;
    setTimeout(() => {
      console.log('  (injecting customer disclosure as text)');
      send({ type: 'user_text', text: "Yes this is her. My hours at the clinic were cut in April, and my daughter moved in with her two kids. So there are five of us now and my income is about thirty four thousand a year." });
    }, 1500);
  }
});
ws.on('error', (err) => console.log('bridge error', err.message));
setTimeout(() => { ws.close(); process.exit(0); }, 22000);
