'use strict';
// MCP client for RedCat (Node app). No new dependencies.
// Transports: stdio local servers + remote Streamable HTTP servers.
// Auth: OAuth 2.1 PKCE with dynamic client registration (RFC 7591) where the
// vendor supports it; no-account remotes; Zapier key-URL.
// Tokens live ONLY in mcp-tokens.json in the project root (local PC). Nothing
// here ever logs a token, and no token is ever returned to the frontend.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const CATALOG_PATH = path.join(__dirname, 'mcp-catalog.json');
const TOKENS_PATH = path.join(__dirname, 'mcp-tokens.json');
const FIELDS_PATH = path.join(__dirname, 'mcp-server-fields.json');
const TIMEOUT_MS = 20000;
// Fixed loopback port for OAuth callbacks. Tier 2 setup cards tell users to
// register http://127.0.0.1:37429/callback, and own-app flows must use this
// same port. Never a per-connect random port, never a port copied from
// another product. Note: Asana rejects loopback redirects entirely, so no
// loopback URL is offered on the Asana card even though this port exists.
const MCP_LOOPBACK_PORT = 37429;
const MAX_TOOL_TEXT = 8000;
const MAX_PROMPT_TOOLS = 60;

let catalogCache = null;
function loadCatalog() {
  if (!catalogCache) catalogCache = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return catalogCache;
}
function getEntry(id) {
  const c = loadCatalog();
  return (c.servers || []).find(s => s.id === id) || null;
}
function addCustomEntry(entry) {
  const c = loadCatalog();
  if (!Array.isArray(c.servers)) c.servers = [];
  if (c.servers.find(s => s.id === entry.id)) return { ok: false, error: 'A server with this name already exists.' };
  c.servers.push(entry);
  writeJsonFile(CATALOG_PATH, c);
  return { ok: true, entry: entry };
}
function readJsonFile(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}
function writeJsonFile(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  try { fs.chmodSync(p, 0o600); } catch (e) {}
}
function readTokens() { return readJsonFile(TOKENS_PATH); }
function readFields() { return readJsonFile(FIELDS_PATH); }
function getSavedFields(id) {
  const entry = getEntry(id);
  const fields = readFields()[id] || {};
  const tokens = readTokens()[id] || {};
  const out = Object.assign({}, fields);
  if (entry && Array.isArray(entry.fields)) {
    for (const f of entry.fields) {
      if (f.secret && tokens.fields && tokens.fields[f.key] !== undefined) out[f.key] = tokens.fields[f.key];
    }
  }
  return out;
}
function saveFields(id, fields) {
  if (!fields) return;
  const entry = getEntry(id);
  const secretKeys = new Set((entry && entry.fields || []).filter(f => f.secret).map(f => f.key));
  const plain = readFields();
  const tokens = readTokens();
  if (!plain[id]) plain[id] = {};
  if (!tokens[id]) tokens[id] = {};
  if (!tokens[id].fields) tokens[id].fields = {};
  for (const k of Object.keys(fields)) {
    if (secretKeys.has(k)) {
      // An empty secret input means "keep the saved value", never "erase
      // it": the UI sends every field (possibly empty) on every Connect.
      if (fields[k] === '' && tokens[id].fields[k] !== undefined) continue;
      tokens[id].fields[k] = fields[k];
    }
    else plain[id][k] = fields[k];
  }
  writeJsonFile(FIELDS_PATH, plain);
  writeJsonFile(TOKENS_PATH, tokens);
}
function resolveUrl(entry, fields) {
  let url = entry.url || '';
  if (entry.urlTemplate) {
    url = entry.urlTemplate;
    if (entry.id === 'supabase') {
      url = url.replace('{project_ref}', encodeURIComponent(fields.project_ref || ''));
    } else if (entry.id === 'sentry') {
      const org = (fields.org || '').trim();
      const project = (fields.project || '').trim();
      if (!org) url = 'https://mcp.sentry.dev/mcp';
      else {
        url = url.replace('{org}', encodeURIComponent(org));
        url = project ? url.replace('{project}', encodeURIComponent(project)) : url.replace('/{project}', '');
      }
    } else {
      url = url.replace(/\{[^}]+\}/g, m => encodeURIComponent(fields[m.slice(1, -1)] || ''));
    }
  }
  if (entry.id === 'zapier') url = fields.mcpUrl || '';
  return url;
}
function resolveArgs(entry, fields) {
  return (entry.args || []).map(a => {
    if (typeof a !== 'string') return a;
    if (a === '{dir}') return (fields.dir || '').trim() || __dirname;
    return a.replace(/\{([^}]+)\}/g, (m, k) => fields[k] || '');
  });
}
function applyExcludeTools(entry, tools) {
  const ex = new Set(entry.excludeTools || []);
  return tools.filter(t => !ex.has(t.name));
}
function toolText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  const content = result.content || [];
  const parts = [];
  for (const c of content) {
    if (c && c.type === 'text' && typeof c.text === 'string') parts.push(c.text);
    else if (c && typeof c === 'string') parts.push(c);
  }
  let text = parts.join('\n');
  if (!text && result.structuredContent) { try { text = JSON.stringify(result.structuredContent); } catch (e) {} }
  if (text.length > MAX_TOOL_TEXT) text = text.slice(0, MAX_TOOL_TEXT) + '\n[truncated]';
  return text;
}
function parseSseJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) { try { return JSON.parse(trimmed); } catch (e) { return null; } }
  let last = null;
  for (const line of trimmed.split('\n')) {
    const t = line.trim();
    if (t.startsWith('data:')) {
      const d = t.slice(5).trim();
      if (d && d !== '[DONE]') { try { last = JSON.parse(d); } catch (e) {} }
    }
  }
  return last;
}
function parseResourceMetadata(header) {
  if (!header) return null;
  const m = header.match(/resource_metadata="([^"]+)"/);
  return m ? m[1] : null;
}
async function fetchJson(url, opts) {
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(TIMEOUT_MS) }, opts));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { res, text, json };
}
function sanitizeError(e) {
  const m = (e && e.message) || String(e || 'unknown error');
  return m.replace(/Bearer [A-Za-z0-9._\-~+/=]+/g, 'Bearer [redacted]').slice(0, 500);
}

// ---------------- sessions ----------------
const sessions = new Map(); // id -> session
let globalRpcId = 1;
function stdioSend(session, method, params, isNotification) {
  return new Promise((resolve, reject) => {
    const proc = session.proc;
    if (!proc || proc.killed) return reject(new Error('server process is not running'));
    if (isNotification) {
      try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); } catch (e) { return reject(e); }
      return resolve(null);
    }
    const id = globalRpcId++;
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error('timeout waiting for MCP response'));
    }, TIMEOUT_MS);
    session.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }
    catch (e) { clearTimeout(timer); session.pending.delete(id); reject(e); }
  });
}
function attachStdio(session) {
  let buf = '';
  session.proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg && msg.id !== undefined && session.pending.has(msg.id)) {
        const p = session.pending.get(msg.id);
        session.pending.delete(msg.id);
        if (msg.error) p.reject(new Error('MCP error: ' + (msg.error.message || JSON.stringify(msg.error))));
        else p.resolve(msg.result);
      }
    }
  });
  session.proc.stderr.on('data', (chunk) => {
    session.stderrTail = (session.stderrTail + chunk.toString('utf8')).slice(-2000);
  });
  session.proc.on('error', () => {
    for (const p2 of session.pending.values()) { try { p2.reject(new Error('could not start server program')); } catch (e) {} }
    session.pending.clear();
    session.connected = false;
  });
  session.proc.on('exit', () => {
    for (const p of session.pending.values()) { try { p.reject(new Error('server process exited')); } catch (e) {} }
    session.pending.clear();
    session.connected = false;
  });
}
async function startStdio(entry, fields) {
  const args = resolveArgs(entry, fields);
  let spawnCmd = entry.command;
  let spawnArgs = args;
  if (process.platform === 'win32') {
    const quoteArg = (a) => {
      if (/["\r\n]/.test(a)) throw new Error('invalid argument for server command');
      return /[\s]/.test(a) ? '"' + a + '"' : a;
    };
    const cmdline = [(entry.command === 'npx' ? 'npx.cmd' : entry.command)].concat(args).map(quoteArg).join(' ');
    spawnCmd = 'cmd.exe';
    spawnArgs = ['/d', '/c', cmdline];
  }
  const env = Object.assign({}, process.env);
  if (entry.envMap) for (const [fk, ev] of Object.entries(entry.envMap)) if ((fields[fk] || '').trim()) env[ev] = (fields[fk] || '').trim();
  const proc = spawn(spawnCmd, spawnArgs, { cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
  const session = { kind: 'stdio', id: entry.id, proc, pending: new Map(), stderrTail: '', connected: false, tools: [] };
  attachStdio(session);
  const init = await stdioSend(session, 'initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'RedCat', version: '1.0.0' }
  });
  if (!init || !init.protocolVersion) throw new Error('server did not return a protocol version');
  await stdioSend(session, 'notifications/initialized', {}, true);
  const listed = await stdioSend(session, 'tools/list', {});
  session.tools = applyExcludeTools(entry, listed.tools || []);
  session.connected = true;
  return session;
}
function stopStdio(session) {
  try { if (session.proc && !session.proc.killed) session.proc.kill(); } catch (e) {}
  for (const p of session.pending.values()) { try { p.reject(new Error('disconnected')); } catch (e) {} }
  session.pending.clear();
  session.connected = false;
}

function authHeaders(session) {
  if (!session.token) return {};
  if (session.keyHeader) return { [session.keyHeader]: session.token };
  return { Authorization: 'Bearer ' + session.token };
}
async function readResponseText(res, isNotification) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/event-stream')) return await res.text();
  // SSE servers (Jina) hold the stream open after the first message: waiting
  // for stream close would hang until the request timeout. Read until the
  // first complete JSON-RPC message, then stop. Notifications have no result
  // by definition, so a quiet stream for one is success, not a hang.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let timer = null;
  try {
    const giveUp = isNotification
      ? new Promise(r => { timer = setTimeout(() => r('notify-timeout'), 5000); })
      : new Promise(() => {});
    while (true) {
      const outcome = await Promise.race([reader.read(), giveUp]);
      if (outcome === 'notify-timeout') { try { await reader.cancel(); } catch (e) {} return ''; }
      const { done, value } = outcome;
      if (value) buf += decoder.decode(value, { stream: true });
      if (done) break;
      const parsed = parseSseJson(buf);
      if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) break;
      if (buf.length > 524288) break;
    }
  } finally { if (timer) clearTimeout(timer); }
  return buf;
}
async function postRemote(session, body, allowRetry) {
  const headers = Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }, authHeaders(session));
  if (session.sessionId) headers['Mcp-Session-Id'] = session.sessionId;
  let res;
  try {
    res = await fetch(session.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) { throw new Error('could not reach MCP server: ' + sanitizeError(e)); }
  const sid = res.headers.get('mcp-session-id');
  if (sid) session.sessionId = sid;
  if (res.status === 401 && session.token && session.refresh && allowRetry !== false) {
    const refreshed = await tryRefresh(session);
    if (refreshed) {
      Object.assign(headers, authHeaders(session));
      res = await fetch(session.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const sid2 = res.headers.get('mcp-session-id');
      if (sid2) session.sessionId = sid2;
    }
  }
  if (res.status === 404 && session.sessionId && allowRetry !== false) {
    session.sessionId = null;
    await initRemoteSession(session);
    return postRemote(session, body, false);
  }
  const text = await readResponseText(res, !!(body && typeof body.method === 'string' && body.method.startsWith('notifications/')));
  if (!text.trim()) return null;
  if (text.trim() === 'null') return null; // JSON-RPC notification acknowledgement (Shopify UCP replies literal null)
  if (res.status === 401) throw new Error('MCP server rejected the connection (unauthorized). Sign in again from Connectors.');
  if (res.status === 403) throw new Error('MCP server rejected this client (forbidden). This server may only accept listed clients.');
  if (res.status >= 400) throw new Error('MCP server returned HTTP ' + res.status);
  const parsed = parseSseJson(text);
  if (!parsed) throw new Error('MCP server returned an unreadable response');
  if (parsed.error) throw new Error('MCP error: ' + (parsed.error.message || JSON.stringify(parsed.error)));
  return parsed.result;
}
async function initRemoteSession(session) {
  const init = await postRemote(session, {
    jsonrpc: '2.0', id: globalRpcId++, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'RedCat', version: '1.0.0' } }
  }, false);
  if (!init || !init.protocolVersion) throw new Error('server did not return a protocol version');
  await postRemote(session, { jsonrpc: '2.0', method: 'notifications/initialized' }, false);
  const listed = await postRemote(session, { jsonrpc: '2.0', id: globalRpcId++, method: 'tools/list', params: {} }, false);
  return listed;
}
async function startRemote(entry, url, token, refreshInfo) {
  const session = { kind: 'remote', id: entry.id, url, token: token || null, sessionId: null, connected: false, tools: [], refresh: refreshInfo || null, keyHeader: entry.keyHeader || null };
  const listed = await initRemoteSession(session);
  session.tools = applyExcludeTools(entry, listed.tools || []);
  session.connected = true;
  return session;
}
async function tryRefresh(session) {
  if (!session.refresh || !session.refresh.refreshToken || !session.refresh.tokenEndpoint) return false;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: session.refresh.refreshToken, client_id: session.refresh.clientId || ''
    });
    const { res, json } = await fetchJson(session.refresh.tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
    });
    if (res.status >= 400 || !json || !json.access_token) return false;
    session.token = json.access_token;
    if (json.refresh_token) session.refresh.refreshToken = json.refresh_token;
    const tokens = readTokens();
    if (!tokens[session.id]) tokens[session.id] = {};
    tokens[session.id].access_token = json.access_token;
    if (json.refresh_token) tokens[session.id].refresh_token = json.refresh_token;
    if (json.expires_in) tokens[session.id].expires_at = Date.now() + json.expires_in * 1000;
    writeJsonFile(TOKENS_PATH, tokens);
    return true;
  } catch (e) { return false; }
}
async function testRemoteUrl(url) {
  const session = { kind: 'remote', id: '__test__', url, token: null, sessionId: null, connected: false, tools: [], refresh: null };
  const listed = await initRemoteSession(session);
  return (listed.tools || []).map(t => ({ name: t.name, description: t.description || '' }));
}

// ---------------- OAuth ----------------
const pendingFlows = new Map(); // state -> flow
// Pre-registered OAuth flows (own-app, e.g. Discord): state -> flow. Unlike
// DCR flows these carry a vendor-registered client_id + client_secret; the
// secret is read from the local token file only, never from the catalog.
const pendingOwnAppFlows = new Map(); // state -> flow
function purgeStaleFlows() {
  const now = Date.now();
  for (const [state, f] of pendingFlows.entries()) {
    if (now - f.createdAt > 10 * 60 * 1000) {
      try { if (f.server) f.server.close(); } catch (e) {}
      pendingFlows.delete(state);
    }
  }
  for (const [state, f] of pendingOwnAppFlows.entries()) {
    if (now - f.createdAt > 10 * 60 * 1000) pendingOwnAppFlows.delete(state);
  }
}

// Shared loopback listener (EADDRINUSE fix, 2026-11-04): previously every
// OAuth flow bound its own server to the fixed port 37429 and released it
// only on completion, DCR failure, or a >10min purge — so closing a sign-in
// popup without finishing left the port bound, and the NEXT Connect failed
// with EADDRINUSE. Now one server binds 37429 once and serves every flow's
// /callback, routing by the state param (finishOAuth already looks flows up
// by state). Abandoned popups no longer block later Connects, and concurrent
// flows each keep their own state. The server is never closed per-flow; a
// process restart clears it. If an external program already holds 37429 at
// first use, the clear bind error is returned and the next Connect retries
// the bind (sharedLoopbackPromise is reset on failure).
let sharedLoopback = null;
let sharedLoopbackPromise = null;
function sharedCallbackHandler(req, res) {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/callback') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const code = u.searchParams.get('code');
    const st = u.searchParams.get('state');
    const err = u.searchParams.get('error');
    if (err || !code || !st || (!pendingFlows.has(st) && !pendingOwnAppFlows.has(st))) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>Sign-in failed</h1><p>RedCat did not receive a valid authorization code. You can close this tab and try again from RedCat.</p></body></html>');
      return;
    }
    const finisher = pendingFlows.has(st) ? finishOAuth : finishOwnAppOAuth;
    finisher(code, st).then((r) => {
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(r.ok
        ? '<html><body><h1>Connected</h1><p>You can close this tab and return to RedCat. Your tools are now available in chat.</p></body></html>'
        : '<html><body><h1>Sign-in failed</h1><p>' + r.error.replace(/</g, '') + ' You can close this tab and try again from RedCat.</p></body></html>');
    }).catch(() => {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>Sign-in failed</h1><p>An unexpected error occurred. You can close this tab and try again from RedCat.</p></body></html>');
    });
  } catch (e) {
    try { res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<html><body><h1>Sign-in failed</h1></body></html>'); } catch (e2) {}
  }
}
function ensureSharedLoopback() {
  if (sharedLoopback) return Promise.resolve(sharedLoopback);
  if (sharedLoopbackPromise) return sharedLoopbackPromise;
  sharedLoopbackPromise = new Promise((resolve, reject) => {
    const srv = http.createServer(sharedCallbackHandler);
    const onErr = (e) => {
      sharedLoopbackPromise = null;
      reject(new Error('RedCat sign-in listener could not bind 127.0.0.1:' + MCP_LOOPBACK_PORT + ' (' + (e && e.code) + '). Close whatever uses that port and try again.'));
    };
    srv.once('error', onErr);
    srv.listen(MCP_LOOPBACK_PORT, '127.0.0.1', () => {
      srv.removeListener('error', onErr);
      srv.on('error', () => {});
      sharedLoopback = srv;
      resolve(srv);
    });
  });
  return sharedLoopbackPromise;
}
async function discoverAuth(url) {
  let probe;
  try {
    probe = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: globalRpcId++, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'RedCat', version: '1.0.0' } } }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) { throw new Error('could not reach MCP server: ' + sanitizeError(e)); }
  if (probe.status !== 401) return { noAuth: true };
  const metaUrl = parseResourceMetadata(probe.headers.get('www-authenticate'));
  let asUrl = null;
  if (metaUrl) {
    try {
      const { res, json } = await fetchJson(metaUrl, {});
      if (res.status < 400 && json && Array.isArray(json.authorization_servers) && json.authorization_servers[0]) asUrl = json.authorization_servers[0];
    } catch (e) {}
  }
  if (!asUrl) {
    try {
      const origin = new URL(url).origin;
      const { res, json } = await fetchJson(origin + '/.well-known/oauth-authorization-server', {});
      if (res.status < 400 && json && json.authorization_endpoint) return { authorization_endpoint: json.authorization_endpoint, token_endpoint: json.token_endpoint, registration_endpoint: json.registration_endpoint || null };
    } catch (e) {}
    return { error: 'NO_METADATA', detail: 'The server asked for sign-in but did not publish its authorization server. This server needs manual setup.' };
  }
  try {
    const clean = asUrl.replace(/\/$/, '');
    const { res, json } = await fetchJson(clean + '/.well-known/oauth-authorization-server', {});
    if (res.status >= 400 || !json || !json.authorization_endpoint) return { error: 'NO_METADATA', detail: 'The authorization server metadata could not be read.' };
    return { authorization_endpoint: json.authorization_endpoint, token_endpoint: json.token_endpoint, registration_endpoint: json.registration_endpoint || null };
  } catch (e) { return { error: 'NO_METADATA', detail: 'The authorization server metadata could not be read.' }; }
}
function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
function startOAuth(entryId, fields, redirectUriOpt) {
  purgeStaleFlows();
  const entry = getEntry(entryId);
  if (!entry) return Promise.resolve({ ok: false, error: 'Unknown server.' });
  const url = resolveUrl(entry, fields);
  return discoverAuth(url).then(async (disc) => {
    if (disc.noAuth) {
      try {
        const session = await startRemote(entry, url, null, null);
        sessions.set(entryId, session);
        return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
      } catch (e) { return { ok: false, error: sanitizeError(e) }; }
    }
    if (disc.error) return { ok: false, error: disc.detail || 'Sign-in discovery failed.' };
    if (!disc.registration_endpoint) {
      return { ok: false, error: 'NO_DCR', detail: 'This server does not accept dynamic client registration. It needs a pre-registered OAuth app (RedCat cannot sign you in automatically yet.).' };
    }
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = pkcePair();
    const flow = { entryId, fields, createdAt: Date.now(), verifier, tokenEndpoint: disc.token_endpoint, server: null, clientId: null, redirectUri: redirectUriOpt || null };
    if (!redirectUriOpt) {
      try {
        await ensureSharedLoopback();
      } catch (e) {
        return { ok: false, error: sanitizeError(e) };
      }
      flow.redirectUri = 'http://127.0.0.1:' + MCP_LOOPBACK_PORT + '/callback';
    }
    const dcrBody = {
      client_name: 'RedCat', redirect_uris: [flow.redirectUri],
      grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none'
    };
    let dcr;
    try {
      const r = await fetchJson(disc.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dcrBody) });
      dcr = r;
      if (r.res.status >= 400 || !r.json || !r.json.client_id) {
        // MIRO-COMPAT: some servers require grant_types to include
        // refresh_token (Miro's DCR 400 says so verbatim). Retry once with
        // it added, only when the failure body names grant_types; every
        // other failure keeps the original honest NO_DCR error below.
        var recovered = false;
        var bodyText = (r.text || '') + ' ' + ((r.json && (r.json.error_description || r.json.error)) || '');
        if (/grant_types/i.test(bodyText)) {
          try {
            var dcrBody2 = Object.assign({}, dcrBody, { grant_types: ['authorization_code', 'refresh_token'] });
            var r2 = await fetchJson(disc.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dcrBody2) });
            if (r2.res.status < 400 && r2.json && r2.json.client_id) { dcr = r2; recovered = true; }
          } catch (e) {}
        }
        if (!recovered) {
          if (flow.server) { try { flow.server.close(); } catch (e) {} }
          return { ok: false, error: 'NO_DCR', detail: 'This server rejected dynamic client registration (HTTP ' + r.res.status + '). It needs a pre-registered OAuth app (RedCat cannot sign you in automatically yet.).' };
        }
      }
    } catch (e) {
      if (flow.server) { try { flow.server.close(); } catch (e2) {} }
      return { ok: false, error: 'Could not register RedCat with this server: ' + sanitizeError(e) };
    }
    flow.clientId = dcr.json.client_id;
    if (dcr.json.client_secret) flow.clientSecret = dcr.json.client_secret;
    if (typeof dcr.json.scope === 'string' && dcr.json.scope) flow.scope = dcr.json.scope;
    pendingFlows.set(state, flow);
    const authUrl = disc.authorization_endpoint + '?response_type=code'
      + '&client_id=' + encodeURIComponent(flow.clientId)
      + '&redirect_uri=' + encodeURIComponent(flow.redirectUri)
      + '&code_challenge=' + encodeURIComponent(challenge)
      + '&code_challenge_method=S256'
      + '&state=' + encodeURIComponent(state)
      + (flow.scope ? '&scope=' + encodeURIComponent(flow.scope) : '');
    return { ok: true, needsBrowser: true, authUrl, state };
  }).catch((e) => ({ ok: false, error: sanitizeError(e) }));
}
async function finishOAuth(code, state) {
  const flow = pendingFlows.get(state);
  if (!flow) return { ok: false, error: 'This sign-in session expired or is unknown. Please press Connect again.' };
  pendingFlows.delete(state);
  if (flow.server) { try { flow.server.close(); } catch (e) {} }
  const entry = getEntry(flow.entryId);
  if (!entry) return { ok: false, error: 'Unknown server.' };
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: flow.redirectUri,
    client_id: flow.clientId, code_verifier: flow.verifier
  });
  if (flow.clientSecret) body.set('client_secret', flow.clientSecret);
  try {
    const { res, json } = await fetchJson(flow.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (res.status >= 400 || !json || !json.access_token) return { ok: false, error: 'The vendor refused the authorization code (HTTP ' + res.status + '). Please try signing in again.' };
    const tokens = readTokens();
    tokens[flow.entryId] = Object.assign(tokens[flow.entryId] || {}, {
      access_token: json.access_token, refresh_token: json.refresh_token || null,
      expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : null,
      token_endpoint: flow.tokenEndpoint, client_id: flow.clientId
    });
    writeJsonFile(TOKENS_PATH, tokens);
    const url = resolveUrl(entry, flow.fields);
    const session = await startRemote(entry, url, json.access_token, {
      refreshToken: json.refresh_token || null, tokenEndpoint: flow.tokenEndpoint, clientId: flow.clientId
    });
    sessions.set(flow.entryId, session);
    return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
  } catch (e) { return { ok: false, error: sanitizeError(e) }; }
}

// ---------------- pre-registered OAuth (own-app) ----------------
// For vendors that do not accept dynamic client registration (Discord,
// Box): the user registers one OAuth app in the vendor portal, pastes its
// Client ID + Client Secret into the card fields (the secret lands only in
// the local token file via saveFields), and signs in. The authorize URL
// never contains the secret. For a pure connector (Discord, no MCP server)
// the connected state is the verified user token and tools stay []. For an
// MCP server (Box, which has a url) the flow also opens the real MCP tool
// session with the fresh token, exactly like the DCR flow does.
async function startOwnAppOAuth(entry, fields) {
  const cfg = entry.oauth || {};
  const clientId = (fields.clientId || '').trim();
  const clientSecret = (fields.clientSecret || '').trim();
  if (!cfg.authorize || !cfg.token || !clientId || !clientSecret) {
    return { ok: false, error: 'Fill in the Client ID and Client Secret from the vendor OAuth page first.' };
  }
  try { await ensureSharedLoopback(); } catch (e) { return { ok: false, error: sanitizeError(e) }; }
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = 'http://127.0.0.1:' + MCP_LOOPBACK_PORT + '/callback';
  pendingOwnAppFlows.set(state, {
    entryId: entry.id, clientId, clientSecret,
    tokenEndpoint: cfg.token, verifyEndpoint: cfg.verify || null,
    redirectUri, createdAt: Date.now()
  });
  const authUrl = cfg.authorize + '?response_type=code'
    + '&client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&scope=' + encodeURIComponent(cfg.scopes || '')
    + '&state=' + encodeURIComponent(state)
    + '&prompt=consent';
  return { ok: true, needsBrowser: true, authUrl, state };
}
async function finishOwnAppOAuth(code, state) {
  const flow = pendingOwnAppFlows.get(state);
  if (!flow) return { ok: false, error: 'This sign-in session expired or is unknown. Please press Connect again.' };
  pendingOwnAppFlows.delete(state);
  const entry = getEntry(flow.entryId);
  if (!entry) return { ok: false, error: 'Unknown server.' };
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: flow.redirectUri,
      client_id: flow.clientId, client_secret: flow.clientSecret
    });
    const { res, json } = await fetchJson(flow.tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
    });
    if (res.status >= 400 || !json || !json.access_token) return { ok: false, error: 'The vendor refused the authorization code (HTTP ' + res.status + '). Please try signing in again.' };
    const tokens = readTokens();
    tokens[flow.entryId] = Object.assign(tokens[flow.entryId] || {}, {
      access_token: json.access_token, refresh_token: json.refresh_token || null,
      expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : null,
      token_endpoint: flow.tokenEndpoint, client_id: flow.clientId
    });
    writeJsonFile(TOKENS_PATH, tokens);
    if (flow.verifyEndpoint) {
      try {
        const chk = await fetch(flow.verifyEndpoint, {
          headers: { Authorization: 'Bearer ' + json.access_token },
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (chk.status !== 200) return { ok: false, error: 'Sign-in succeeded but the verification check failed (HTTP ' + chk.status + '). Please try again.' };
      } catch (e) { return { ok: false, error: 'Sign-in succeeded but the verification check could not be reached.' }; }
    }
    if (entry.url) {
      try {
        const url = resolveUrl(entry, {});
        const session = await startRemote(entry, url, json.access_token, {
          refreshToken: json.refresh_token || null, tokenEndpoint: flow.tokenEndpoint, clientId: flow.clientId
        });
        sessions.set(flow.entryId, session);
        return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
      } catch (e) { return { ok: false, error: 'Sign-in succeeded but the MCP session could not be started: ' + sanitizeError(e) }; }
    }
    sessions.set(flow.entryId, { kind: 'connector', id: flow.entryId, connected: true, tools: [] });
    return { ok: true, tools: [] };
  } catch (e) { return { ok: false, error: sanitizeError(e) }; }
}

// ---------------- public operations ----------------
async function connect(id, fieldsIn) {
  const entry = getEntry(id);
  if (!entry) return { ok: false, error: 'Unknown server.' };
  const fields = Object.assign({}, getSavedFields(id), fieldsIn || {});
  // Manual (tier 2) entries stay NEEDS_SETUP, EXCEPT a wired pre-registered
  // OAuth entry explicitly flagged manualConnect whose Client ID + Client
  // Secret are filled in: that user has done the vendor-side setup, so the
  // Connect button on the manual card is real. Without the flag (Discord:
  // its Portal redirect is a global one-time step, so it flips to the grid
  // instead) or without both values, the steps are still the answer.
  const canOwnApp = entry.oauthKind === 'pre-registered' && entry.manualConnect === true
    && (fields.clientId || '').trim() && (fields.clientSecret || '').trim();
  if (entry.tier === 2 && !canOwnApp) return { ok: false, error: 'NEEDS_SETUP', setupSteps: entry.setupSteps || [] };
  // API-key entries save only AFTER a successful test (see the api-key
  // branch below): a rejected key must never land in the token file as a
  // "Saved sign-in". Every other entry saves its fields up front.
  if (fieldsIn && entry.auth !== 'api-key') saveFields(id, fieldsIn);
  const existing = sessions.get(id);
  if (existing && existing.connected) {
    // A freshly pasted API key must be tested, not ignored: if the user
    // pasted a key different from the one the live session uses, fall
    // through and re-test it instead of returning the old session.
    const kf = (entry.fields || []).find(f => f.secret);
    const pasted = kf && fieldsIn && (fieldsIn[kf.key] || '').trim();
    if (!(entry.auth === 'api-key' && pasted && pasted !== (existing.token || ''))) {
      return { ok: true, tools: existing.tools.map(t => ({ name: t.name, description: t.description || '' })) };
    }
  }
  try {
    if (entry.oauthKind === 'pre-registered') {
      const cfg = entry.oauth || {};
      const savedFields = getSavedFields(id);
      const clientId = (fields.clientId || '').trim() || (savedFields.clientId || '').trim();
      const clientSecret = (fields.clientSecret || '').trim() || (savedFields.clientSecret || '').trim();
      const saved = readTokens()[id] || {};
      if (saved.access_token && cfg.verify) {
        try {
          const chk = await fetch(cfg.verify, {
            headers: { Authorization: 'Bearer ' + saved.access_token },
            signal: AbortSignal.timeout(TIMEOUT_MS)
          });
          if (chk.status === 200) {
            if (entry.url) {
              try {
                const url = resolveUrl(entry, fields);
                const session = await startRemote(entry, url, saved.access_token, {
                  refreshToken: saved.refresh_token || null, tokenEndpoint: saved.token_endpoint || cfg.token, clientId: saved.client_id || clientId
                });
                sessions.set(id, session);
                return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
              } catch (e) { /* fall through to fresh sign-in */ }
            } else {
              sessions.set(id, { kind: 'connector', id, connected: true, tools: [] });
              return { ok: true, tools: [] };
            }
          }
        } catch (e) { /* fall through to fresh sign-in */ }
      }
      return await startOwnAppOAuth(entry, { clientId, clientSecret });
    }
    if (entry.auth === 'api-key') {
      // Test-before-save: the key is tried first (initialize + tools/list
      // for remotes, spawn + tools/list for stdio) and persisted only on
      // success. A rejected key is reported plainly and never saved, so a
      // previously saved good key survives a bad paste. Entries whose key
      // field is optional (Jina, Hugging Face) also connect anonymously:
      // the vendor's free tier answers without a key, at lower limits.
      const keyField = (entry.fields || []).find(f => f.secret) || (entry.fields || [])[0] || null;
      const key = keyField ? (fields[keyField.key] || '').trim() : '';
      if (!key && keyField && keyField.required) return { ok: false, error: 'Paste your ' + (keyField.label || 'API key') + ' first.' };
      try {
        if (entry.transport === 'stdio') {
          const session = await startStdio(entry, fields);
          const prev = sessions.get(id);
          if (prev && prev.kind === 'stdio') stopStdio(prev);
          sessions.set(id, session);
          if (fieldsIn) saveFields(id, fieldsIn);
          return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
        }
        const url2 = resolveUrl(entry, fields);
        if (!url2) return { ok: false, error: 'A required field is missing.' };
        const session = await startRemote(entry, url2, key || null, null);
        sessions.set(id, session);
        if (fieldsIn) saveFields(id, fieldsIn);
        return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
      } catch (e) {
        let msg = sanitizeError(e);
        if (key && key.length >= 8) msg = msg.split(key).join('[redacted]');
        if (key && /unauthorized/i.test(msg)) return { ok: false, error: 'The key was rejected by the vendor (unauthorized). Check the key and try again. Nothing was saved.' };
        return { ok: false, error: msg };
      }
    }
    if (entry.transport === 'stdio') {
      if (entry.id === 'filesystem' && !(fields.dir || '').trim()) fields.dir = __dirname;
      const session = await startStdio(entry, fields);
      sessions.set(id, session);
      return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
    }
    const url = resolveUrl(entry, fields);
    if (!url) return { ok: false, error: 'A required field is missing.' };
    if (entry.auth === 'none') {
      const session = await startRemote(entry, url, null, null);
      sessions.set(id, session);
      return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
    }
    if (entry.auth === 'key-url') {
      if (!(fields.mcpUrl || '').trim()) return { ok: false, error: 'Paste your Zapier MCP URL first.' };
      const session = await startRemote(entry, url, null, null);
      sessions.set(id, session);
      return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
    }
    if (entry.auth === 'oauth') {
      const saved = readTokens()[id] || {};
      if (saved.access_token) {
        try {
          const session = await startRemote(entry, url, saved.access_token, {
            refreshToken: saved.refresh_token || null, tokenEndpoint: saved.token_endpoint || null, clientId: saved.client_id || null
          });
          sessions.set(id, session);
          return { ok: true, tools: session.tools.map(t => ({ name: t.name, description: t.description || '' })) };
        } catch (e) { /* fall through to fresh sign-in */ }
      }
      return await startOAuth(id, fields, null);
    }
    return { ok: false, error: 'This server uses an unsupported auth type.' };
  } catch (e) { return { ok: false, error: sanitizeError(e) }; }
}
function disconnect(id) {
  const s = sessions.get(id);
  if (s && s.kind === 'stdio') stopStdio(s);
  sessions.delete(id);
  const tokens = readTokens();
  if (tokens[id]) { delete tokens[id]; writeJsonFile(TOKENS_PATH, tokens); }
  return { ok: true };
}
function getSessionStatus(id) {
  const s = sessions.get(id);
  const tokens = readTokens();
  return {
    connected: !!(s && s.connected),
    hasToken: !!(tokens[id] && (tokens[id].access_token || (tokens[id].fields && Object.keys(tokens[id].fields).length))),
    toolCount: (s && s.connected) ? s.tools.length : 0
  };
}
function getTools(id) {
  const s = sessions.get(id);
  if (!s || !s.connected) return [];
  return s.tools.map(t => ({ name: t.name, description: t.description || '' }));
}
async function callTool(id, tool, args) {
  const s = sessions.get(id);
  if (!s || !s.connected) return { ok: false, text: 'Server is not connected. Connect it in Connectors first.' };
  try {
    if (s.kind === 'stdio') {
      const result = await stdioSend(s, 'tools/call', { name: tool, arguments: args || {} });
      if (result && result.isError) return { ok: false, text: toolText(result) || 'Tool reported an error.' };
      return { ok: true, text: toolText(result) };
    }
    const result = await postRemote(s, { jsonrpc: '2.0', id: globalRpcId++, method: 'tools/call', params: { name: tool, arguments: args || {} } });
    if (result && result.isError) return { ok: false, text: toolText(result) || 'Tool reported an error.' };
    return { ok: true, text: toolText(result) };
  } catch (e) { return { ok: false, text: sanitizeError(e) }; }
}
const READ_RE = /^(get|list|search|read|fetch|query|show|describe|view|check|lookup|find|retrieve|status|info|whoami|health|resolve|explain|validate|inspect|export|download)(_|$)/;
function isWriteTool(serverId, toolName) {
  if (serverId === 'thinking') return false;
  return !READ_RE.test(toolName);
}
function mcpToolName(serverId, tool) { return 'mcp_' + serverId + '_' + tool; }
function parseMcpTool(name) {
  if (typeof name !== 'string' || !name.startsWith('mcp_')) return null;
  const rest = name.slice(4);
  const idx = rest.indexOf('_');
  if (idx < 1) return null;
  const server = rest.slice(0, idx);
  const tool = rest.slice(idx + 1);
  if (!tool || !getEntry(server)) return null;
  return { server, tool };
}
function systemSection(depth) {
  if ((depth || 0) >= 1) return '';
  const lines = [];
  for (const s of sessions.values()) {
    if (!s || !s.connected) continue;
    for (const t of s.tools) {
      lines.push('- ' + mcpToolName(s.id, t.name) + ' - ' + (t.description || '').replace(/\s+/g, ' ').slice(0, 120));
      if (lines.length >= MAX_PROMPT_TOOLS) break;
    }
    if (lines.length >= MAX_PROMPT_TOOLS) break;
  }
  if (!lines.length) return '';
  return '\nMCP TOOLS (only servers the user connected in Connectors are listed; call them like any other tool, with tool + args JSON):\n'
    + lines.join('\n')
    + '\nRule: a write tool (anything that creates, updates, deletes, sends, or spends) always needs the user\'s approval first. The app enforces this; never claim a write happened before approval.\n';
}
function catalogForUi() {
  const c = loadCatalog();
  return c.servers.map(s => {
    const st = getSessionStatus(s.id);
    return {
      id: s.id, name: s.name, desc: s.desc, tier: s.tier, transport: s.transport, auth: s.auth,
      spending: !!s.spending, note: s.note || null, fields: s.fields || null,
      setupSteps: s.setupSteps || null, dashboardUrl: s.dashboardUrl || null,
      logo: s.logo || null, community: !!s.community, custom: !!s.custom,
      category: s.category || null, kind: s.kind || 'mcp', official: s.official || null, unverified: !!s.unverified,
      oauthKind: s.oauthKind || null, manualConnect: !!s.manualConnect,
      connected: st.connected, hasToken: st.hasToken, toolCount: st.toolCount
    };
  });
}
module.exports = {
  loadCatalog, getEntry, addCustomEntry, connect, disconnect, getSessionStatus, getTools, callTool,
  isWriteTool, mcpToolName, parseMcpTool, systemSection, catalogForUi, testRemoteUrl,
  startOAuth, finishOAuth, startOwnAppOAuth, finishOwnAppOAuth, resolveUrl, getSavedFields
};
