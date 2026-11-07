// Unit tests for v1.0.11 — Discord mirror fix (Bugs 1, 3, 4).
// Run: node test-discord-mirror-v111.js
// Exits non-zero on any failure. The /api/discord/send live checks spin
// up the real server.js on PORT 3123 and shut it down afterwards.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const serverSrc = fs.readFileSync(path.join(__dirname, 'redcat-app', 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, 'redcat-app', 'public', 'app.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, 'redcat-app', 'public', 'index.html'), 'utf8');

// ---- Bug 4: defaultPersonalityTemplate is English, matches the PC file ----
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '() {');
  if (start < 0) return null;
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
const tmplFn = extractFunction(serverSrc, 'defaultPersonalityTemplate');
check('Bug4: template function found', !!tmplFn);
const template = tmplFn ? eval('(' + tmplFn.replace('function defaultPersonalityTemplate()', 'function ()') + ')')() : '';
check('Bug4: template has no "Roman Urdu"', !/roman urdu/i.test(template), template.slice(0, 200));
check('Bug4: template has no Urdu-script chars', !/[\u0600-\u06FF]/.test(template));
check('Bug4: template has no "bhai"', !/\bbhai\b/i.test(template));
check('Bug4: template says Primary: English', template.indexOf('- Primary: English.') >= 0);
check('Bug4: template says reply in user language ONLY', template.indexOf("Reply in the user's language ONLY") >= 0);
check('Bug4: template keeps NEVER-mirror guardrails', template.indexOf('## NEVER mirror') >= 0);
const pcFile = '/home/hatch/workspace/discord-mirror-fix/PERSONALITY-new.md';
if (fs.existsSync(pcFile)) {
  const pc = fs.readFileSync(pcFile, 'utf8');
  check('Bug4: template == PERSONALITY-new.md (PC file)', template === pc, 'template len ' + template.length + ' vs PC len ' + pc.length);
} else { console.log('SKIP Bug4: PC personality file not present here'); }
// Conditional per-message instructions must stay (only fire on real Roman Urdu input).
check('Bug4: conditional Roman Urdu instruction kept (chatSystemText)', serverSrc.indexOf("if (lang === 'roman_urdu') return \"You are RedCat") >= 0);
check('Bug4: conditional Roman Urdu instruction kept (agentSystemText)', serverSrc.indexOf("? 'Respond in Roman Urdu (Urdu written in Latin script).'") >= 0);

// ---- Bug 1: Discord section at TOP of sidebar + bound-first sort ----
check('Bug1: discordSection before Main chat button in index.html',
  indexSrc.indexOf('id="discordSection"') >= 0 &&
  indexSrc.indexOf('id="discordSection"') < indexSrc.indexOf('data-chat-id="main"'));
// The sort comparator, copied verbatim from renderDiscordSection.
function sortDiscord(entries, boundId, updatedAtMap) {
  const discordUpdatedAt = (e) => (typeof e.updatedAt === 'number' && e.updatedAt > 0) ? e.updatedAt : (updatedAtMap[e.id] || 0);
  return entries.slice().sort((a, b) => {
    const aBound = a.id === boundId ? 1 : 0;
    const bBound = b.id === boundId ? 1 : 0;
    if (aBound !== bBound) return bBound - aBound;
    return discordUpdatedAt(b) - discordUpdatedAt(a);
  });
}
// Real PC data: old chat updatedAt NEWER than the new bound chat.
const entries = [
  { id: 'discord-1542531624699306047', updatedAt: 1794057838417 },
  { id: 'discord-1399069586174902363', updatedAt: 1794057743223 },
];
const sorted = sortDiscord(entries, 'discord-1399069586174902363', {});
check('Bug1: bound account first even though its updatedAt is OLDER',
  sorted[0].id === 'discord-1399069586174902363', JSON.stringify(sorted.map(e => e.id)));
const sortedNoBound = sortDiscord(entries, '', {});
check('Bug1: without a bound profile, newest first',
  sortedNoBound[0].id === 'discord-1542531624699306047');
check('Bug1: app.js contains bound-first sort', appSrc.indexOf('discordEntries.sort') >= 0 && appSrc.indexOf('bBound - aBound') >= 0);

// ---- Bug 3: Join-server guidance until a real DM exists ----
function showGuide(boundProfile, discordEntries) {
  const hasDiscordDm = discordEntries.some(e => {
    if (Array.isArray(e.history)) return e.history.length > 0;
    return (typeof e.messageCount === 'number' ? e.messageCount : 0) > 0;
  });
  return !!(boundProfile && !hasDiscordDm);
}
check('Bug3: guide shows when bound, no entries', showGuide({ id: '1' }, []) === true);
check('Bug3: guide shows when bound, empty-history entry (poll: messageCount 0)',
  showGuide({ id: '1' }, [{ id: 'discord-1', messageCount: 0 }]) === true);
check('Bug3: guide shows when bound, local empty-history entry',
  showGuide({ id: '1' }, [{ id: 'discord-1', history: [] }]) === true);
check('Bug3: guide hides once a DM exists (local history)',
  showGuide({ id: '1' }, [{ id: 'discord-1', history: [{ role: 'user', content: 'hi' }] }]) === false);
check('Bug3: guide hides once a DM exists (poll messageCount)',
  showGuide({ id: '1' }, [{ id: 'discord-1', messageCount: 62 }]) === false);
check('Bug3: guide hides when not bound', showGuide(null, []) === false);
check('Bug3: app.js contains new guidance condition', appSrc.indexOf('hasDiscordDm') >= 0 && appSrc.indexOf("discordBoundProfile && !hasDiscordDm") >= 0);
check('Bug3: app.js forwards in sendChatMessage', appSrc.indexOf('forwardDiscordMirror(sendChatId, message)') >= 0);
check('Bug3: server.js has POST /api/discord/send', serverSrc.indexOf("req.url === '/api/discord/send'") >= 0);
check('Bug3: server.js /send-dm forwards to relay /send-dm', serverSrc.indexOf("https://discord-relay.arexora.com/send-dm") >= 0);

// ---- Bug 3 live: real server.js on :3123, /api/discord/send validation ----
function post(port, pathName, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: port, path: pathName, method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers || {}) }, (res) => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, json: null, raw: b }); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
function waitPort(port, ms) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function tryOnce() {
      const req = http.request({ host: '127.0.0.1', port: port, path: '/api/chats', method: 'GET' }, (res) => resolve(true));
      req.on('error', () => { if (Date.now() - t0 > ms) resolve(false); else setTimeout(tryOnce, 300); });
      req.end();
    })();
  });
}
async function live() {
  // Start 1: no device token -> endpoint must refuse with the token error.
  const env1 = Object.assign({}, process.env, { PORT: '3123' });
  delete env1.DISCORD_DEVICE_TOKEN;
  const child1 = spawn('node', ['redcat-app/server.js'], { env: env1, stdio: 'ignore' });
  const up1 = await waitPort(3123, 15000);
  check('Bug3 live: test server starts', up1);
  if (up1) {
    const r1 = await post(3123, '/api/discord/send', { chatId: 'main', text: 'hi' });
    check('Bug3 live: non-Discord chat rejected', r1.json && r1.json.ok === false && r1.json.error === 'not a Discord chat', JSON.stringify(r1.json));
    const r2 = await post(3123, '/api/discord/send', { chatId: 'discord-1399069586174902363', text: '   ' });
    check('Bug3 live: empty text rejected', r2.json && r2.json.ok === false && r2.json.error === 'empty text', JSON.stringify(r2.json));
    const r3 = await post(3123, '/api/discord/send', { chatId: 'discord-1399069586174902363', text: 'hello' });
    check('Bug3 live: no device token -> token error', r3.json && r3.json.ok === false && /device token/i.test(r3.json.error || ''), JSON.stringify(r3.json));
  }
  child1.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1200));
  // Start 2: fake device token -> relay must 401 (proves the server calls
  // the relay with Bearer auth; a real token + binding would deliver).
  const env2 = Object.assign({}, process.env, { PORT: '3123', DISCORD_DEVICE_TOKEN: 'fake-token-for-test-only' });
  const child2 = spawn('node', ['redcat-app/server.js'], { env: env2, stdio: 'ignore' });
  const up2 = await waitPort(3123, 15000);
  check('Bug3 live: test server restarts with token', up2);
  if (up2) {
    const r4 = await post(3123, '/api/discord/send', { chatId: 'discord-1399069586174902363', text: 'hello' });
    check('Bug3 live: bad token -> relay 401 (auth enforced, call reaches relay)',
      r4.json && r4.json.ok === false && r4.json.error === 'relay error 401', JSON.stringify(r4.json));
  }
  child2.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 800));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
live().catch((e) => { console.log('FAIL live harness — ' + (e && e.message)); process.exit(1); });
