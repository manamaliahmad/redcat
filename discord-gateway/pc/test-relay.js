// End-to-end relay test (runs on the PC). Enqueues a prompt through the SSH
// tunnel, polls the relay for the reply, prints it, then removes the test
// desktop chat. Retries the enqueue/result calls because the VM relay can
// flap while the gateway restarts. Usage: node test-relay.js "your prompt"
const RELAY = process.env.RELAY_URL || 'http://127.0.0.1:8080';
const REDCAT = process.env.REDCAT_URL || 'http://127.0.0.1:3000';
const prompt = process.argv.slice(2).join(' ') || 'Say exactly: gateway test ok';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, opts, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 10000);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
  } finally { clearTimeout(t); }
}

(async () => {
  let jobId = null;
  for (let i = 0; i < 40; i++) {
    try {
      const enq = await fetchJson(RELAY + '/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test', userName: 'gateway-test', channelId: 'test', text: prompt, source: 'test' }),
      });
      const d = await enq.json();
      jobId = d.jobId;
      break;
    } catch (e) {
      console.log('enqueue retry', i + 1, '-', e.message);
      await sleep(3000);
    }
  }
  if (!jobId) { console.log('ENQUEUE FAILED after retries'); process.exit(1); }
  console.log('jobId', jobId);
  const started = Date.now();
  while (Date.now() - started < 600000) {
    await sleep(3000);
    let d;
    try {
      const r = await fetchJson(RELAY + '/result/' + jobId, {}, 10000);
      d = await r.json();
    } catch (e) { console.log('result poll retry -', e.message); continue; }
    if (d.status === 'done') {
      console.log('REPLY:', d.reply);
      try {
        await fetch(REDCAT + '/api/chats/discord-test', { method: 'DELETE' });
        console.log('test desktop chat cleaned');
      } catch (_) {}
      process.exit(0);
    }
  }
  console.log('TIMEOUT: no reply in 10 min');
  process.exit(1);
})().catch((e) => { console.error('TEST ERROR', e.message); process.exit(1); });
