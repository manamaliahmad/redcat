// RedCat Discord gateway — PC poller (BUNDLED version, 2026-11-06).
// Spawned by the Electron app (main.js) when RedCat starts; stops when the
// app quits. No .bat, no manual start. Pulls this user's queued Discord
// prompts from the relay, sends each to the local RedCat agent
// (http://127.0.0.1:<port>/api/agent-chat), and posts the reply back.
// Provider/model/key are read from the PC's own browser localStorage (the
// same Settings the UI uses) — the key never leaves this PC and is never logged.
// TRANSPORT: RELAY_URL is a public HTTPS relay URL (no SSH, no key, no IP).
// If RELAY_URL is http://127.0.0.1:8080 and SSH_HOST is set, the poller
// keeps an SSH tunnel to the VM up instead (legacy mode, used on the dev PC
// until the public relay is live). If the public relay is unreachable and
// SSH is configured, the poller falls back to the SSH tunnel and logs it.
// The relay resolves the device token to the Discord user, so this poller
// only ever sees its own user's jobs (per-user isolation).
// Env (set by main.js; defaults shown):
//   RELAY_URL   https://discord-relay.arexora.com  (public relay)
//   REDCAT_URL  http://127.0.0.1:3000
//   DISCORD_DEVICE_TOKEN  (per-install random token, from the app's userData)
//   POLLER_LOG_DIR  (where discord-poller.log goes; default: this folder)
//   SSH_KEY     C:\Users\HOME\oracle-vm-key   (legacy SSH mode only)
//   SSH_HOST    <vm-ip>  (legacy SSH mode only)
//   SSH_USER    ubuntu
//   DISCORD_LANG  (optional override; empty = detect the language of each user message)
//   AGENT_TIMEOUT_MS 600000 (10 min)

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PUBLIC_RELAY_URL = 'https://discord-relay.arexora.com';
let RELAY_URL = process.env.RELAY_URL || PUBLIC_RELAY_URL;
const REDCAT_URL = process.env.REDCAT_URL || 'http://127.0.0.1:3000';
const DEVICE_TOKEN = (process.env.DISCORD_DEVICE_TOKEN || '').trim();
const SSH_KEY = process.env.SSH_KEY || 'C:\\Users\\HOME\\oracle-vm-key';
const SSH_HOST = process.env.SSH_HOST || ''; // Legacy SSH mode only; never hardcoded.
const SSH_USER = process.env.SSH_USER || 'ubuntu';
// Transport mode: 'https' (public relay, no SSH) or 'ssh' (legacy tunnel).
// The poller starts in https mode; if the public relay is unreachable and
// SSH is configured, it falls back to the SSH tunnel (dev PC only).
let transportMode = RELAY_URL.startsWith('https://') ? 'https' : 'ssh';
const LANG_OVERRIDE = (process.env.DISCORD_LANG || '').trim(); // empty = detect per message
// Real per-message language detection (same rules as the RedCat server):
// Urdu script -> 'urdu', Roman Urdu words -> 'roman_urdu', otherwise 'en'.
// The reply language follows the user's message language — never forced.
const ROMAN_URDU_WORDS = ['salam', 'assalam', 'walaikum', 'banao', 'banado', 'banake', 'banane', 'karke', 'mujhe', 'chahiye', 'batao', 'karo', 'karna', 'kar', 'kaisa', 'kaisi', 'kab', 'kahan', 'kyun', 'kaun', 'kitna', 'kitni', 'mera', 'tumhara', 'aapka', 'iska', 'uska', 'hamara', 'tum', 'aap', 'kya', 'kaise', 'hai', 'hain', 'tha', 'thi', 'hoga', 'ye', 'wo', 'yeh', 'woh', 'ab', 'bhi', 'nahi', 'dekho', 'bhejo', 'ke', 'ki', 'ka', 'ko', 'se', 'mein', 'par', 'phir', 'acha', 'theek', 'zaroor', 'bas', 'sirf', 'liye', 'wala', 'wali', 'bahut', 'bohot', 'aaj', 'kal', 'abhi', 'raha', 'rahi', 'rahe', 'hua', 'hui'];
function detectLang(text) {
  const msg = String(text || '');
  if (/[\u0600-\u06FF]/.test(msg)) return 'urdu';
  const clean = msg.toLowerCase().replace(/[^a-z\s]/g, ' ');
  const padded = ' ' + clean + ' ';
  let hits = 0;
  for (const w of ROMAN_URDU_WORDS) { if (padded.includes(' ' + w + ' ')) hits++; }
  if (hits >= 1) return 'roman_urdu';
  return 'en';
}
const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS || '600000', 10);
const POLL_MS = 2000;
const LOG_DIR = process.env.POLLER_LOG_DIR || __dirname;
const LOG_FILE = path.join(LOG_DIR, 'discord-poller.log');

function log(...a) {
  const line = new Date().toISOString() + ' ' + a.join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------- relay client ---
async function relay(pathname, method, body, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 10000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (DEVICE_TOKEN) headers.Authorization = 'Bearer ' + DEVICE_TOKEN;
    const r = await fetch(RELAY_URL + pathname, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    if (r.status === 204) return null;
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (_) { return { _raw: txt, _status: r.status }; }
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------ tunnel -----
let sshChild = null;
async function relayHealthy() {
  try { const h = await relay('/health', 'GET', null, 3000); return !!(h && h.ok); }
  catch (_) { return false; }
}
function spawnTunnel() {
  if (sshChild && sshChild.exitCode === null) return sshChild;
  const args = ['-N', '-L', '8080:127.0.0.1:8080',
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    SSH_USER + '@' + SSH_HOST];
  log('starting SSH tunnel:', 'ssh', args.join(' ').replace(SSH_KEY, '<key>'));
  try {
    sshChild = spawn('ssh', args, { detached: true, stdio: 'ignore', windowsHide: true });
    sshChild.on('error', (e) => log('tunnel spawn error:', e.message));
    sshChild.on('exit', (code) => log('tunnel ssh exited, code', code));
    sshChild.unref();
  } catch (e) {
    log('tunnel spawn failed:', e.message);
    sshChild = null;
  }
  return sshChild;
}
async function ensureTunnel() {
  if (await relayHealthy()) return true;
  // HTTPS mode with no SSH configured: there is no tunnel to start; the
  // public relay is simply unreachable right now. Retry later.
  if (transportMode === 'https' && !SSH_HOST) {
    log('public relay unreachable and no SSH fallback configured (will retry)');
    return false;
  }
  spawnTunnel();
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    if (await relayHealthy()) { log('tunnel is up'); return true; }
  }
  log('tunnel still down after 20s (will retry)');
  return false;
}

// ------------------------------------------- provider key from localStorage
// Chromium localStorage lives in LevelDB. Recent writes sit in the .log file
// as UTF-16LE text; we scan it for the RedCat AI store and the current provider.
// (.ldb files are Snappy-compressed and are NOT scanned here.)
function levelDbDirs() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const dirs = [
    path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'),
    path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Storage', 'leveldb'),
    path.join(roaming, 'redcat', 'Local Storage', 'leveldb'),
  ];
  // Any other Chrome profiles, as a fallback.
  try {
    const userData = path.join(local, 'Google', 'Chrome', 'User Data');
    for (const d of fs.readdirSync(userData)) {
      if (/^Profile /.test(d)) dirs.push(path.join(userData, d, 'Local Storage', 'leveldb'));
    }
  } catch (_) {}
  return dirs;
}

function extractJsonAfter(text, marker) {
  const idx = text.lastIndexOf(marker);
  if (idx < 0) return null;
  const start = text.indexOf('{', idx);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

function readStoreFromDir(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')); } catch (_) { return null; }
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(path.join(dir, f)); }
    catch (_) {
      try { // locked by the browser? try a temp copy
        const tmp = path.join(os.tmpdir(), 'redcat-ls-' + Date.now() + '.log');
        fs.copyFileSync(path.join(dir, f), tmp);
        buf = fs.readFileSync(tmp);
        try { fs.unlinkSync(tmp); } catch (_) {}
      } catch (_) { continue; }
    }
    if (!buf || !buf.length) continue;
    const text = buf.toString('utf16le');
    const json = extractJsonAfter(text, 'ai_models_providers_data');
    if (!json) continue;
    try {
      const store = JSON.parse(json);
      let current = null;
      const m = /redcat_chat_provider.{0,40}?([A-Za-z0-9_\-]{2,40})/.exec(text);
      if (m) current = m[1];
      return { store, current, dir, file: f };
    } catch (_) { /* keep scanning */ }
  }
  return readStoreFromLdb(dir);
}

// --- Pure-JS LevelDB .ldb reader (no native deps; the live data is usually
// in Snappy-compressed .ldb files, not the .log). Finds the RedCat AI store.
function _readVarint(buf, off) {
  let result = 0, shift = 0, i = off;
  while (i < buf.length) {
    const b = buf[i++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 63) throw new Error('varint too long');
  }
  return { value: result, next: i };
}
function _snappyDecompress(buf) {
  let p = 0;
  const len = _readVarint(buf, p); p = len.next;
  const out = Buffer.alloc(len.value);
  let o = 0;
  while (p < buf.length) {
    const tag = buf[p++];
    const type = tag & 0x03;
    if (type === 0) {
      let l = tag >>> 2, n;
      if (l < 60) { n = l + 1; }
      else {
        const nb = l - 59; n = 0;
        for (let i = 0; i < nb; i++) n += buf[p++] * Math.pow(2, 8 * i);
        n += 1;
      }
      buf.copy(out, o, p, p + n); p += n; o += n;
    } else if (type === 1) {
      const l = ((tag >>> 2) & 0x07) + 4;
      const off = (((tag >>> 5) & 0x07) * 256) + buf[p++];
      for (let i = 0; i < l; i++) { out[o] = out[o - off]; o++; }
    } else if (type === 2) {
      const l = (tag >>> 2) + 1;
      const off = buf[p] + buf[p + 1] * 256; p += 2;
      for (let i = 0; i < l; i++) { out[o] = out[o - off]; o++; }
    } else {
      const l = (tag >>> 2) + 1;
      const off = buf[p] + buf[p + 1] * 256 + buf[p + 2] * 65536 + buf[p + 3] * 16777216; p += 4;
      for (let i = 0; i < l; i++) { out[o] = out[o - off]; o++; }
    }
  }
  if (o !== len.value) throw new Error('snappy length mismatch');
  return out;
}
function _parseBlock(raw) {
  if (raw.length < 4) return [];
  const numRestarts = raw.readUInt32LE(raw.length - 4);
  const entriesEnd = raw.length - 4 * (numRestarts + 1);
  const entries = [];
  let p = 0, prevKey = Buffer.alloc(0);
  while (p < entriesEnd) {
    const shared = _readVarint(raw, p); p = shared.next;
    const nonShared = _readVarint(raw, p); p = nonShared.next;
    const valueLen = _readVarint(raw, p); p = valueLen.next;
    const keyDelta = raw.slice(p, p + nonShared.value); p += nonShared.value;
    const value = raw.slice(p, p + valueLen.value); p += valueLen.value;
    const key = Buffer.concat([prevKey.slice(0, shared.value), keyDelta]);
    entries.push({ key, value });
    prevKey = key;
  }
  return entries;
}
function _readBlockAt(fileBuf, handle) {
  const compType = fileBuf[handle.offset + handle.size];
  const raw = fileBuf.slice(handle.offset, handle.offset + handle.size);
  return _parseBlock(compType === 1 ? _snappyDecompress(raw) : raw);
}
function _scanLdbFile(fileBuf) {
  const out = [];
  if (fileBuf.length < 48) return out;
  const foot = fileBuf.slice(fileBuf.length - 48);
  if (foot.readBigUInt64LE(40) !== 0xdb4775248b80fb57n) return out;
  let p = 0;
  _readVarint(foot, p); p = _readVarint(foot, p).next;
  _readVarint(foot, p); p = _readVarint(foot, p).next;
  const idx = _readVarint(foot, p); p = idx.next;
  const idxSize = _readVarint(foot, p);
  let indexEntries;
  try { indexEntries = _readBlockAt(fileBuf, { offset: idx.value, size: idxSize.value }); } catch (_) { return out; }
  for (const ie of indexEntries) {
    try {
      const off = _readVarint(ie.value, 0);
      const size = _readVarint(ie.value, off.next);
      out.push(..._readBlockAt(fileBuf, { offset: off.value, size: size.value }));
    } catch (_) { /* skip bad block */ }
  }
  return out;
}
function _decodeStoreValue(value) {
  for (const off of [1, 0]) {
    for (const enc of ['utf16le', 'latin1']) {
      const s = value.slice(off).toString(enc);
      const i = s.indexOf('{');
      if (i < 0) continue;
      try { return JSON.parse(s.slice(i)); } catch (_) {}
    }
  }
  return null;
}
function readStoreFromLdb(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.ldb')); } catch (_) { return null; }
  let store = null, current = null;
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(path.join(dir, f)); } catch (_) { continue; }
    let entries;
    try { entries = _scanLdbFile(buf); } catch (_) { continue; }
    for (const { key, value } of entries) {
      const k1 = key.toString('latin1');
      if (k1.includes('ai_models_providers_data')) {
        const s = _decodeStoreValue(value);
        if (s) store = s;
      } else if (k1.includes('redcat_chat_provider')) {
        const v = value.slice(1).toString('latin1').replace(/[^\x20-\x7E]/g, '');
        const m = /([A-Za-z0-9_\-]{2,40})/.exec(v);
        if (m) current = m[1];
      }
    }
    if (store) return { store, current, dir, file: f };
  }
  return null;
}

let cachedCandidates = null, cachedAt = 0, preferredProvider = null;
// Returns [{provider, model, key}] — the current Settings provider first,
// then other saved providers with keys. The poller tries them in order and
// remembers whichever one actually works (preferredProvider).
function getCredentials() {
  if (cachedCandidates && Date.now() - cachedAt < 60000) return cachedCandidates;
  cachedCandidates = null; cachedAt = Date.now();
  for (const dir of levelDbDirs()) {
    const found = readStoreFromDir(dir);
    if (!found) continue;
    const { store, current } = found;
    const pick = (id) => {
      const rec = store[id];
      if (!rec || typeof rec !== 'object') return null;
      const key = String(rec.key || '');
      const model = String(rec.customChatModel || rec.chatModel || '');
      if (!key || !model) return null;
      return { provider: id, model, key };
    };
    const ordered = [];
    const seen = new Set();
    const push = (c) => { if (c && !seen.has(c.provider)) { seen.add(c.provider); ordered.push(c); } };
    if (preferredProvider) push(pick(preferredProvider));
    if (current) push(pick(current));
    for (const id of Object.keys(store)) push(pick(id));
    if (ordered.length) {
      log('credentials: ' + ordered.map((c) => c.provider + '/' + c.model).join(', ') + ' (from ' + dir + ')');
      cachedCandidates = ordered;
      return ordered;
    }
    log('store found in ' + dir + ' but no provider has a saved key+model');
  }
  log('no provider key found in PC Settings localStorage');
  return [];
}

function isAuthBillingError(text) {
  // Continuable errors: the call failed for a reason another provider (or
  // the free fallback) might not share, so the chain keeps going instead of
  // returning this one raw. Covers auth/billing/model errors AND transient
  // ones: an overloaded free model ("high demand") and temporary network
  // failures (DNS lookup, connection reset, timeout).
  return /key|401|403|429|unauthor|insufficient|balance|quota|billing|exceeded|invalid|not found|does not exist|no longer|retired|credits|afford|max_tokens|rate limit|too many requests|tokens per minute|too large|TPM|high demand|EAI_AGAIN|getaddrinfo|ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(String(text || ''));
}

// ------------------------------------------- desktop chat mirroring -----
// The RedCat server keeps chats in chats/<id>.json (chatstore.js) and the
// desktop app loads them at startup (restoreChatsFromServer). The poller
// mirrors each Discord conversation into a desktop chat (id "discord-<userId>")
// so the same conversation has two faces: the DM and the desktop chat.
// NOTE: the desktop app only fetches the chat list at startup, so a mirrored
// chat appears there after the app/tab is reloaded — it is not pushed live.
// The DM is always the live face.
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// TIMESTAMPS (2026-11-05, v2.45): the poller is the source of Discord
// messages, so it stamps the real local time on each mirrored message. A
// message without a stored time shows no time at all — never invented.
function formatTime(ts) {
  if (!ts || isNaN(Number(ts))) return '';
  const d = new Date(Number(ts));
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function historyToHtml(history) {
  return history.map((m) => {
    const body = escapeHtml(m.content || m.text || '').replace(/\n/g, '<br>');
    const time = formatTime(m.ts);
    const timeHtml = time ? '<span class="msg-time">' + time + '</span>' : '';
    if (m.role === 'user') return '<div class="user-message-card"><div>' + body + '</div>' + timeHtml + '</div>';
    return '<article class="agent-message-card"><div class="message-text-content">' + body + '</div>' + timeHtml + '</article>';
  }).join('\n');
}
async function getDesktopChat(chatId) {
  try {
    const r = await fetch(REDCAT_URL + '/api/chats/' + encodeURIComponent(chatId), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (d && d.ok && d.chat && Array.isArray(d.chat.history)) return d.chat.history;
  } catch (e) { log('getDesktopChat failed:', e.message); }
  return null;
}
// DISCORD PROFILE (2026-11-07, v1.0.8): create the empty profile chat
// for a bound Discord user (title "Discord — <username>", no messages
// yet) so the profile row appears in the sidebar within ~5s of Connect,
// before the first DM. The server only allows creating an empty-history
// file for a discord-* id with profile:true (chatstore EMPTY_NEW guard);
// this is the ONLY caller that sends that flag.
async function saveDesktopChatProfile(chatId, title) {
  try {
    const r = await fetch(REDCAT_URL + '/api/chats/' + encodeURIComponent(chatId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ id: chatId, title, html: '', history: [], profile: true }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) log('saveDesktopChatProfile failed:', d.error || r.status);
    return !!d.ok;
  } catch (e) { log('saveDesktopChatProfile error:', e.message); return false; }
}
async function saveDesktopChat(chatId, title, history) {
  const kept = history.slice(-100);
  try {
    const r = await fetch(REDCAT_URL + '/api/chats/' + encodeURIComponent(chatId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ id: chatId, title, html: historyToHtml(kept), history: kept }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) log('saveDesktopChat failed:', d.error || r.status);
    return !!d.ok;
  } catch (e) { log('saveDesktopChat error:', e.message); return false; }
}

// Short human reason for a provider error (used in the transparent failure
// message so the user sees exactly which providers were tried and why each
// one failed — no hidden fallback, no fake success).
function shortReason(text) {
  const t = String(text || '');
  if (/quota/i.test(t)) return 'quota exceeded';
  if (/credits|afford/i.test(t)) return 'out of credits';
  if (/balance|insufficient/i.test(t)) return 'no balance';
  if (/high demand/i.test(t)) return 'busy right now';
  if (/EAI_AGAIN|getaddrinfo|ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(t)) return 'network error';
  if (/rate limit|too many requests|tokens per minute/i.test(t)) return 'rate limit';
  if (/401|403|unauthor/i.test(t)) return 'key rejected';
  return t.replace(/^Model error:\s*/i, '').slice(0, 100);
}

// Tries candidates in order; on an auth/billing/model error, falls through
// to the next saved provider. Remembers the one that works. If every
// provider fails, the reply lists each one tried and its real reason.
// Free fallback: when every saved provider fails on credits/quota, retry
// once with a free OpenRouter model on the user's own saved OpenRouter key
// ($0, no Settings change) — this keeps the bot answering while the paid
// models are out of credits.
async function askAgentWithFallback(candidates, chatId, messages, lang) {
  let lastErr = null;
  const failures = [];
  for (const creds of candidates) {
    const out = await askAgent(creds, chatId, messages, lang);
    if (out.kind === 'done' || out.kind === 'approval' || out.kind === 'timeout') {
      preferredProvider = creds.provider;
      return out;
    }
    log('agent call failed on', creds.provider + '/' + creds.model + ':', out.text.slice(0, 160));
    failures.push({ provider: creds.provider, model: creds.model, error: out.text });
    lastErr = out;
    if (!isAuthBillingError(out.text)) return out; // real failure, not a credential problem
  }
  if (failures.length) {
    const openrouter = candidates.find((c) => c.provider === 'openrouter' && c.key);
    if (openrouter && !/(:free|^openrouter\/free$)/.test(openrouter.model)) {
      const free = { provider: 'openrouter', model: 'openrouter/free', key: openrouter.key };
      log('trying free fallback model', free.model);
      const out = await askAgent(free, chatId, messages, lang);
      if (out.kind === 'done' || out.kind === 'approval' || out.kind === 'timeout') {
        preferredProvider = 'openrouter';
        return out;
      }
      log('free fallback failed:', out.text.slice(0, 160));
      failures.push({ provider: 'openrouter', model: free.model, error: out.text });
      lastErr = out;
    }
    const summary = failures.map((f) => f.provider + (f.model === 'openrouter/free' ? ' (free)' : '') + ': ' + shortReason(f.error)).join('; ');
    return { kind: 'error', text: 'All providers failed — ' + summary + '. Add credits or switch to a free model in RedCat Settings.' };
  }
  return lastErr || { kind: 'error', text: 'No final reply came from the PC.' };
}
async function askAgent(creds, chatId, messages, lang) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AGENT_TIMEOUT_MS);
  try {
    const res = await fetch(REDCAT_URL + '/api/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        provider: creds.provider, model: creds.model, key: creds.key,
        messages: messages,
        lang: lang, chatId, policy: 'ask',
        attachments: null, connectorStates: { connectors: [], social: [] },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { kind: 'error', text: 'RedCat server error (' + res.status + '): ' + t.slice(0, 200) };
    }
    let buf = '';
    let finalLine = null, progressCount = 0;
    for await (const chunk of res.body) {
      buf += Buffer.from(chunk).toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === 'progress') { progressCount++; continue; }
          if (evt.status) finalLine = evt;
          else if (evt.ok === false) finalLine = evt;
        } catch (_) { /* ignore partial lines */ }
      }
    }
    log('agent stream done, progress lines', progressCount, 'final', finalLine ? (finalLine.status || 'error') : 'none');
    if (!finalLine) return { kind: 'error', text: 'No final reply came from the PC.' };
    if (finalLine.ok && finalLine.status === 'done') return { kind: 'done', text: finalLine.text || '' };
    if (finalLine.ok && finalLine.status === 'need_approval') {
      const what = finalLine.approval && (finalLine.approval.summary || finalLine.approval.tool || 'an action');
      return { kind: 'approval', text: 'This task needs approval on the PC (' + what + ') — I have sent it to the PC; approve it there and I will send the reply.' };
    }
    if (finalLine.ok && finalLine.status === 'plan') {
      return { kind: 'approval', text: 'I have prepared a plan on the PC — approve the plan there and I will start the work.' };
    }
    return { kind: 'error', text: 'Model error: ' + String(finalLine.error || 'unknown').slice(0, 300) };
  } catch (e) {
    if (e.name === 'AbortError') return { kind: 'timeout', text: '' };
    return { kind: 'error', text: 'Cannot connect to the RedCat server (' + e.message.slice(0, 120) + ') — is the server running on the PC?' };
  } finally { clearTimeout(timer); }
}

// -------------------------------------------------------------- main -----
async function processJob(job) {
  log('job', job.jobId, 'from', job.source, 'user', job.userId, job.userName || '');
  const chatId = 'discord-' + job.userId;
  const title = 'Discord — ' + (job.userName || job.userId);
  // Mirror the prompt to the desktop chat first (same conversation, two faces).
  let history = (await getDesktopChat(chatId)) || [];
  history.push({ role: 'user', content: job.text, ts: Date.now() });
  await saveDesktopChat(chatId, title, history);

  const candidates = getCredentials();
  let reply;
  if (!candidates.length) {
    reply = 'No API key is saved in RedCat Settings on the PC — add your key in Settings (a free OpenRouter key works), then send it again.';
  } else {
    const lang = LANG_OVERRIDE || detectLang(job.text);
    const out = await askAgentWithFallback(candidates, chatId, history.slice(-20), lang);
    if (out.kind === 'done') reply = out.text || '(Empty reply from the PC.)';
    else if (out.kind === 'approval') reply = out.text;
    else if (out.kind === 'timeout') reply = 'The task on the PC took more than 10 minutes — I stopped it. Try again with a shorter prompt.';
    else reply = out.text;
  }
  // Mirror the reply to the desktop chat too, then hand it to Discord.
  history.push({ role: 'assistant', content: reply, ts: Date.now() });
  await saveDesktopChat(chatId, title, history);
  // The relay can flap (VM restarts); retry the handoff so the reply is not lost.
  for (let attempt = 0; attempt < 5; attempt++) {
    try { await relay('/complete', 'POST', { jobId: job.jobId, reply }); break; }
    catch (e) {
      log('complete attempt ' + (attempt + 1) + ' failed for', job.jobId, e.message);
      if (attempt === 4) log('complete FAILED for', job.jobId, '- reply kept in desktop chat only');
      else await sleep(3000);
    }
  }
}

// DISCORD PROFILE (2026-11-07, v1.0.8): ask the relay who this device
// token is bound to (GET /discord/whoami) and, if a user is bound and no
// desktop chat exists for them yet, create the empty profile chat. The
// check is throttled to once every 30s; a bound user whose chat already
// exists is remembered so no work repeats. Runs on every loop iteration
// (throttled) so the row appears within ~5s of Connect.
let lastWhoamiCheck = 0;
let profileEnsuredFor = null;
async function ensureDiscordProfile() {
  if (!DEVICE_TOKEN) return;
  const now = Date.now();
  if (now - lastWhoamiCheck < 30000) return;
  lastWhoamiCheck = now;
  let who;
  try { who = await relay('/discord/whoami', 'GET', null, 8000); } catch (e) { return; }
  if (!who || !who.bound || !who.id) return;
  const chatId = 'discord-' + who.id;
  if (profileEnsuredFor === chatId) return;
  const existing = await getDesktopChat(chatId);
  if (existing) { profileEnsuredFor = chatId; return; }
  const username = who.username || who.id;
  const title = 'Discord — ' + username;
  const ok = await saveDesktopChatProfile(chatId, title);
  if (ok) { profileEnsuredFor = chatId; log('discord profile row created for', username, '(' + who.id + ')'); }
}
async function main() {
  log('RedCat Discord poller starting (bundled). Relay', RELAY_URL, 'mode', transportMode, 'RedCat', REDCAT_URL, 'device token', DEVICE_TOKEN ? 'set' : 'MISSING');
  if (!DEVICE_TOKEN) log('WARNING: DISCORD_DEVICE_TOKEN is not set — the relay will reject /next and /complete (401).');
  for (;;) {
    try {
      if (!(await relayHealthy())) {
        // Public relay unreachable? Fall back to the SSH tunnel (dev PC only).
        if (transportMode === 'https' && SSH_HOST) {
          log('public relay unreachable — falling back to SSH tunnel (legacy mode)');
          RELAY_URL = 'http://127.0.0.1:8080';
          transportMode = 'ssh';
        }
        if (!(await ensureTunnel())) { await sleep(10000); continue; }
      }
      await ensureDiscordProfile();
      const job = await relay('/next', 'GET', null, 8000);
      if (!job) { await sleep(POLL_MS); continue; }
      // A 401/403 (device not linked) or other relay error is not a job —
      // log it and retry instead of feeding it to processJob.
      if (job._status || job.ok === false) {
        log('relay /next error:', job._status || '', job.error || job._raw || '');
        await sleep(5000);
        continue;
      }
      await processJob(job);
    } catch (e) {
      log('loop error:', e.message);
      await sleep(5000);
    }
  }
}

process.on('SIGINT', () => { log('poller stopping'); process.exit(0); });
process.on('SIGTERM', () => { log('poller stopping'); process.exit(0); });
main().catch((e) => { log('FATAL', e.message); process.exit(1); });
