const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const mcp = require('./mcp.js');
// TOKENOPT (v1.0.15) — token optimizations: fast-path router, lazy skills,
// history compaction, prompt-cache markers. Pure helpers, no prompt wording.
const tokenopt = require('./tokenopt.js');
const skillAdd = require('./skill-add.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
};

function detectLangServer(text) {
  const msg = (text || '');
  if (/[\u0600-\u06FF]/.test(msg)) return 'urdu';
  const lower = msg.toLowerCase();
  const clean = lower.replace(/[^a-z\s]/g, ' ');
  const padded = ' ' + clean + ' ';
  const romanWords = ['salam', 'assalam', 'walaikum', 'banao', 'banado', 'banake', 'banane', 'karke', 'mujhe', 'chahiye', 'batao', 'karo', 'karna', 'kar', 'kaisa', 'kaisi', 'kab', 'kahan', 'kyun', 'kaun', 'kitna', 'kitni', 'mera', 'tumhara', 'aapka', 'iska', 'uska', 'hamara', 'tum', 'aap', 'kya', 'kaise', 'hai', 'hain', 'tha', 'thi', 'hoga', 'ye', 'wo', 'yeh', 'woh', 'ab', 'bhi', 'nahi', 'dekho', 'bhejo', 'ke', 'ki', 'ka', 'ko', 'se', 'mein', 'par', 'phir', 'acha', 'theek', 'zaroor', 'bas', 'sirf', 'liye', 'wala', 'wali', 'bahut', 'bohot', 'aaj', 'kal', 'abhi', 'raha', 'rahi', 'rahe', 'hua', 'hui'];
  const distinctive = romanWords;
  let hits = 0;
  let hasDistinctive = false;
  romanWords.forEach(w => {
    if (padded.includes(' ' + w + ' ')) {
      hits++;
      if (distinctive.includes(w)) hasDistinctive = true;
    }
  });
  if (hasDistinctive || hits >= 2) return 'roman_urdu';
  return 'en';
}

// ---- RedCat model proxy: the browser never calls providers directly.
// The API key travels only from this PC to the provider. It is never
// logged and never stored on the server.
const CODE_SYSTEM_PROMPT = "You are RedCat's coding engine, a senior full-stack engineer who builds production-quality websites to international standards. You always reply with a single JSON object and nothing else: {\"files\": {\"index.html\": \"...\"}, \"summary\": \"...\", \"changes\": [\"...\"]}. The files object holds every file you create or change, each with its COMPLETE new content — never truncated, never with placeholders. Do not return unchanged files. Quality bar: real copy only (never lorem ipsum), responsive from 375px to desktop, semantic HTML with alt text and visible focus states, a maximum of 3 colors plus neutrals, no purple-blue gradients, no emoji icons, a display typeface distinct from body text, no AI buzzwords, and complete interactive states (hover, focus, active). The summary is one or two plain sentences in English. The changes list names each file and what changed in it.";

function postHttps(urlString, headers, bodyString, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyString) }, headers)
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('Provider timed out')));
    req.on('error', reject);
    req.write(bodyString);
    req.end();
  });
}

function postJson(urlString, headers, bodyString, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyString) }, headers)
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('Provider timed out')));
    req.on('error', reject);
    req.write(bodyString);
    req.end();
  });
}

function extractProjectJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (parsed && typeof parsed.files === 'object' && parsed.files !== null) return parsed;
    return null;
  } catch (e) {
    return null;
  }
}

async function callCodingModel(provider, model, key, prompt, currentFiles) {
  const filesText = currentFiles && Object.keys(currentFiles).length
    ? '\n\nCurrent project files (return full new content only for files you create or change; do not repeat unchanged files):\n' + Object.keys(currentFiles).map(n => '--- ' + n + ' ---\n' + currentFiles[n]).join('\n')
    : '';
  const userText = prompt + filesText;
  if (provider === 'deepseek' || provider === 'openrouter' || provider === 'openai' || provider === 'qwen') {
    let endpoint = '';
    let apiModel = model;
    if (provider === 'deepseek') { endpoint = 'https://api.deepseek.com/chat/completions'; if (model === 'deepseek-v4.1-flash') apiModel = 'deepseek-flash'; }
    if (provider === 'openrouter') { endpoint = 'https://openrouter.ai/api/v1/chat/completions'; }
    if (provider === 'openai') { endpoint = 'https://api.openai.com/v1/chat/completions'; }
    if (provider === 'qwen') { endpoint = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'; }
    const headers = { 'Authorization': 'Bearer ' + key };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'RedCat';
    }
    const r = await postHttps(endpoint, headers, JSON.stringify({
      model: apiModel,
      messages: [
        { role: 'system', content: CODE_SYSTEM_PROMPT },
        { role: 'user', content: userText }
      ],
      temperature: 0.7
    }), 0);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Provider returned an unreadable response (HTTP ' + r.status + ').'); }
    if (r.status >= 400) {
      const msg = (parsed && parsed.error && (parsed.error.message || parsed.error.code)) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const text = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
    if (!text) throw new Error('Provider returned an empty reply.');
    return text;
  }
  if (provider === 'claude') {
    const r = await postHttps('https://api.anthropic.com/v1/messages', {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    }, JSON.stringify({
      model: model,
      max_tokens: 8000,
      system: CODE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }]
    }), 0);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Provider returned an unreadable response (HTTP ' + r.status + ').'); }
    if (r.status >= 400) {
      const msg = (parsed && parsed.error && parsed.error.message) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const parts = (parsed.content || []).filter(p => p.type === 'text').map(p => p.text);
    if (!parts.length) throw new Error('Provider returned an empty reply.');
    return parts.join('\n');
  }
  if (provider === 'gemini') {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const r = await postHttps(endpoint, {}, JSON.stringify({
      system_instruction: { parts: [{ text: CODE_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }]
    }), 0);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Provider returned an unreadable response (HTTP ' + r.status + ').'); }
    if (r.status >= 400) {
      const msg = (parsed && parsed.error && parsed.error.message) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const parts = [];
    (parsed.candidates || []).forEach(c => {
      (c.content && c.content.parts || []).forEach(p => { if (p.text) parts.push(p.text); });
    });
    if (!parts.length) throw new Error('Provider returned an empty reply.');
    return parts.join('\n');
  }
  throw new Error('Unknown provider: ' + provider);
}

function chatSystemText(lang) {
  if (lang === 'roman_urdu') return "You are RedCat, a helpful AI assistant running on the user's own PC. Respond in Roman Urdu (Urdu written in Latin script). Be direct, specific, and helpful. " + currentTimeLine();
  if (lang === 'urdu') return "You are RedCat, a helpful AI assistant running on the user's own PC. Respond in Urdu (Urdu script). Be direct, specific, and helpful. " + currentTimeLine();
  return "You are RedCat, a helpful AI assistant running on the user's own PC. Respond in English. Be direct, specific, and helpful. " + currentTimeLine();
}

async function callChatModel(provider, model, key, systemText, messages, usageSink) {
  // VISION: Ollama vision models get the native images array; OpenAI-style
  // providers receive image_url parts untouched (pass-through branches).
  const vision = require('./vision.js');
  if (provider === 'deepseek' || provider === 'openrouter' || provider === 'openai' || provider === 'qwen' || provider === 'kimi' || provider === 'groq') {
    let endpoint = '';
    let apiModel = model;
    if (provider === 'deepseek') { endpoint = 'https://api.deepseek.com/chat/completions'; if (model === 'deepseek-v4.1-flash') apiModel = 'deepseek-flash'; }
    if (provider === 'openrouter') { endpoint = 'https://openrouter.ai/api/v1/chat/completions'; }
    if (provider === 'openai') { endpoint = 'https://api.openai.com/v1/chat/completions'; }
    if (provider === 'qwen') { endpoint = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'; }
    // 7-POINTS (7) KIMI K3 — verified from Moonshot's own docs
    // (platform.kimi.ai, international): model id kimi-k3, OpenAI-compatible
    // endpoint https://api.moonshot.ai/v1/chat/completions; the .cn endpoint
    // is the China platform and stays as fallback (see below).
    if (provider === 'kimi') { endpoint = 'https://api.moonshot.ai/v1/chat/completions'; }
    if (provider === 'groq') { endpoint = 'https://api.groq.com/openai/v1/chat/completions'; }
    const headers = { 'Authorization': 'Bearer ' + key };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'RedCat';
    }
    // TOKENOPT (v1.0.15): Claude-family models get cache_control breakpoints
    // (system prompt + rolling last 3 messages, Hermes "system_and_3").
    // Other providers get their inputs back unchanged.
    const cachedReq = tokenopt.applyCacheControl(provider, model, systemText, messages);
    const bodyObj = {
      model: apiModel,
      messages: [{ role: 'system', content: cachedReq.system }].concat(cachedReq.messages),
      temperature: 0.7
    };
    // K3 thinking is always on and temperature/top_p are FIXED (1.0/0.95) —
    // Moonshot docs say to omit them for K3, so drop temperature here.
    if (provider === 'kimi' && /^kimi-k3/i.test(apiModel)) delete bodyObj.temperature;
    let r = await postHttps(endpoint, headers, JSON.stringify(bodyObj), 0);
    // Kimi endpoint fallback: international (.ai) first, China (.cn) second.
    // A key valid on only one platform then works on either without a retry
    // from the user; if both fail, the primary (.ai) error is reported.
    if (provider === 'kimi' && r.status >= 400) {
      const altEndpoint = endpoint.indexOf('api.moonshot.ai') !== -1 ? 'https://api.moonshot.cn/v1/chat/completions' : 'https://api.moonshot.ai/v1/chat/completions';
      const r2 = await postHttps(altEndpoint, headers, JSON.stringify(bodyObj), 0);
      if (r2.status < 400) r = r2;
    }
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Provider returned an unreadable response (HTTP ' + r.status + ').'); }
    // TOKEN-USAGE (2026-11-05): capture the provider's real usage (and any 429) before the error path.
    addUsageFromResponse(usageSink, provider, parsed, r.status);
    if (r.status >= 400) {
      const msg = (parsed && parsed.error && (parsed.error.message || parsed.error.code)) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const text = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
    if (!text) throw new Error('Provider returned an empty reply.');
    return text;
  }
  if (provider === 'claude') {
    const r = await postHttps('https://api.anthropic.com/v1/messages', {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    }, JSON.stringify({
      model: model,
      max_tokens: 8000,
      system: tokenopt.applyCacheControl(provider, model, systemText, messages).system,
      messages: tokenopt.applyCacheControl(provider, model, systemText, messages).messages
    }), 0);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Provider returned an unreadable response (HTTP ' + r.status + ').'); }
    // TOKEN-USAGE (2026-11-05): capture the provider's real usage (and any 429) before the error path.
    addUsageFromResponse(usageSink, provider, parsed, r.status);
    if (r.status >= 400) {
      const msg = (parsed && parsed.error && parsed.error.message) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const parts = (parsed.content || []).filter(p => p.type === 'text').map(p => p.text);
    if (!parts.length) throw new Error('Provider returned an empty reply.');
    return parts.join('\n');
  }
  if (provider === 'gemini') {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const r = await postHttps(endpoint, {}, JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents: contents
    }), 0);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Provider returned an unreadable response (HTTP ' + r.status + ').'); }
    // TOKEN-USAGE (2026-11-05): capture the provider's real usage (and any 429) before the error path.
    addUsageFromResponse(usageSink, provider, parsed, r.status);
    if (r.status >= 400) {
      const msg = (parsed && parsed.error && parsed.error.message) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const parts = [];
    (parsed.candidates || []).forEach(c => {
      (c.content && c.content.parts || []).forEach(p => { if (p.text) parts.push(p.text); });
    });
    if (!parts.length) throw new Error('Provider returned an empty reply.');
    return parts.join('\n');
  }
  if (provider === 'ollama') {
    const r = await postJson('http://localhost:11434/api/chat', {}, JSON.stringify({
      model: model,
      messages: vision.toOllamaMessages(messages),
      stream: false
    }), 0);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch (e) { throw new Error('Ollama returned an unreadable response (HTTP ' + r.status + '). Is Ollama running? Start it with: ollama serve'); }
    // TOKEN-USAGE (2026-11-05): capture Ollama's real eval counts (and any 429) before the error path.
    addUsageFromResponse(usageSink, provider, parsed, r.status);
    if (r.status >= 400) {
      const msg = (parsed && parsed.error) || ('HTTP ' + r.status);
      throw new Error(String(msg));
    }
    const text = parsed.message && parsed.message.content;
    if (!text) throw new Error('Ollama returned an empty reply. Is the model pulled? Try: ollama pull ' + model);
    return text;
  }
  throw new Error('Unknown provider: ' + provider);
}

// ==========================================================================
// RedCat agent tools (Round 13): terminal + browser, approval-first.
// Lessons applied from the open-source agent research (OpenClaw / MausBot /
// Hermes): read-only commands run on their own, everything else needs one
// approval showing the EXACT command; a denial is respected, never retried
// silently; a hard blocklist is never overridden by approval; fail-closed on
// parse errors; every run is bounded (10 steps, 30s per command, 8000 chars).
// The key rule still holds: keys are forwarded to providers only, never
// logged and never stored on this server.
// ==========================================================================
const AGENT_MAX_STEPS = 10;
const AGENT_MAX_STEPS_PLAN = 40;
const AGENT_CMD_TIMEOUT_MS = 30000;
const AGENT_OUTPUT_CHARS = 8000;

const TERMINAL_BLOCKED = [
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bvssadmin\b/i,
  /\bwbadmin\b/i,
  /\bbcdedit\b/i,
  /\bshutdown\b/i,
  /\breg\s+(delete|add)\b/i,
  /\btakeown\b/i,
  /\bicacls\b/i,
  /\bcipher\s+\/w\b/i,
  /\bnet\s+(user|localgroup)\b/i,
  /\bsc\s+delete\b/i,
  /\bwmic\b/i,
  /-EncodedCommand/i,
  /Invoke-Expression/i,
  /\biex\s*\(/i,
  /\bbitsadmin\b/i,
  /\bcertutil\b/i,
  /\bschtasks\b/i,
  /\bregedit\b/i,
  /\brundll32\b/i,
  /\bmshta\b/i,
  /\bwscript\b/i,
  /\bcscript\b/i,
  /\b(powershell|pwsh)\b[^|&]*\s-enc\b/i,
  /\bcurl\b[^|&]*\|\s*(cmd|powershell|pwsh)\b/i,
  /\bRemove-Item\b[^|&]*-Recurse/i
];

function isTerminalBlocked(command) {
  const cmd = String(command || '');
  if (TERMINAL_BLOCKED.some(re => re.test(cmd))) return true;
  if (/\b(del|erase|rd|rmdir)\b/i.test(cmd) && /C:\\Windows/i.test(cmd)) return true;
  return false;
}

const TERMINAL_READ_COMMANDS = ['dir', 'type', 'more', 'find', 'findstr', 'where', 'whoami', 'hostname', 'ver', 'tree', 'tasklist', 'systeminfo', 'echo'];

// 7-POINTS (6) — children are read-only BY CODE: the spawn handler intersects
// any requested tool list with CHILD_READONLY_TOOLS. terminal_exec stays in
// the set for reads only — writes are additionally denied by policy Never.
// Roles: 'explore' gathers facts, 'review' gives a fresh-eyes check.
const CHILD_READONLY_TOOLS = ['browser_read', 'browser_read_js', 'web_search', 'deep_read', 'memory_search', 'skill_read', 'skill_prepare', 'run_info', 'session_list', 'session_read', 'session_search', 'session_surface', 'terminal_exec'];

// 7-POINTS (5) POST-WRITE HOOK — verify paths attached to terminal_exec
// (string or array, max 5, each max 500 chars). The harness checks each path
// on disk after an approved write and appends VERIFY lines to the result.
function normalizeVerifyPaths(v) {
  try {
    if (typeof v === 'string') return [String(v).slice(0, 500)];
    if (Array.isArray(v)) return v.filter(x => typeof x === 'string').slice(0, 5).map(x => String(x).slice(0, 500));
  } catch (e) {}
  return [];
}

function isTerminalReadOnly(command) {
  const cmd = String(command || '').trim();
  if (!cmd) return false;
  if (/[\r\n]/.test(cmd)) return false;
  if (/[>|&]/.test(cmd)) return false;
  const parts = cmd.split(/\s+/);
  const first = parts[0].toLowerCase().replace(/\.exe$/, '');
  if (first === 'powershell' || first === 'pwsh' || first === 'cmd') return false;
  if (first === 'git') {
    const sub = (parts[1] || '').toLowerCase();
    return ['status', 'log', 'diff', 'show', 'branch', 'remote'].indexOf(sub) !== -1;
  }
  if (first === 'node' || first === 'python') return /\s(--version|-v)\b/.test(cmd);
  if (first === 'date' || first === 'time' || first === 'attrib') return parts.length === 1;
  if (first === 'ipconfig') return parts.length === 1 || /\s\/all\b/i.test(cmd);
  return TERMINAL_READ_COMMANDS.indexOf(first) !== -1;
}

function terminalTimeout(args) {
  const s = args && typeof args.timeoutSec === 'number' ? args.timeoutSec : 30;
  const clamped = Math.max(5, Math.min(600, s));
  return clamped * 1000;
}

function runTerminal(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const workdir = (cwd && typeof cwd === 'string' && cwd) ? cwd : __dirname;
    execFile('cmd.exe', ['/c', command], { cwd: workdir, timeout: (timeoutMs || AGENT_CMD_TIMEOUT_MS), maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.killed) { resolve({ ok: false, error: 'Command timed out.' }); return; }
      let out = String(stdout || '') + (stderr ? ('\n' + stderr) : '');
      if (!out.trim()) out = '[no output, exit code ' + ((err && typeof err.code === 'number') ? err.code : 0) + ']';
      if (out.length > AGENT_OUTPUT_CHARS) out = out.slice(0, AGENT_OUTPUT_CHARS) + '\n...[output truncated]';
      resolve({ ok: true, output: out, code: (err && typeof err.code === 'number') ? err.code : 0 });
    });
  });
}

function fetchPageText(urlString, redirectsLeft) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlString); } catch (e) { resolve({ ok: false, error: 'Invalid URL.' }); return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') { resolve({ ok: false, error: 'Only http(s) URLs can be read.' }); return; }
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.get({ hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, headers: { 'User-Agent': 'RedCat/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        fetchPageText(next, redirectsLeft - 1).then(resolve);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: 'Page returned HTTP ' + res.statusCode + '.' }); return; }
      let data = '';
      let tooBig = false;
      res.on('data', (chunk) => {
        if (tooBig) return;
        data += chunk;
        if (data.length > 500000) { tooBig = true; req.destroy(); resolve({ ok: false, error: 'Page too large to read.' }); }
      });
      res.on('end', () => {
        if (tooBig) return;
        const titleMatch = data.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
        let text = data.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > AGENT_OUTPUT_CHARS) text = text.slice(0, AGENT_OUTPUT_CHARS) + '\n...[page truncated]';
        const links = [];
        const linkRe = /<a\s[^>]*href=["']([^"']+)["']/gi;
        let lm;
        while ((lm = linkRe.exec(data)) && links.length < 100) {
          try {
            const abs = new URL(lm[1], url).href.split('#')[0];
            if ((abs.startsWith('http://') || abs.startsWith('https://')) && links.indexOf(abs) === -1) links.push(abs);
          } catch (e) {}
        }
        const headings = [];
        const headRe = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
        let hm;
        while ((hm = headRe.exec(data)) && headings.length < 30) {
          const t = hm[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (t) headings.push(t);
        }
        resolve({ ok: true, title: title, text: text, links: links, headings: headings });
      });
    });
    req.setTimeout(15000, () => { req.destroy(new Error('Page read timed out')); });
    req.on('error', (e) => resolve({ ok: false, error: 'Could not read page: ' + (e.message || 'request failed') }));
  });
}

function readWebPage(urlString) { return fetchPageText(urlString, 3); }

// Batch 2B: JS-rendered read via jsdom (lightweight, no 150MB browser download).
// Executes page scripts and returns the rendered text. If jsdom is missing, fails honestly.
async function readWebPageJs(urlString) {
  try {
    const { JSDOM } = require('jsdom');
    const dom = await JSDOM.fromURL(urlString, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
    await new Promise(r => setTimeout(r, 3000));
    const title = dom.window.document.title || '';
    const text = (dom.window.document.body ? dom.window.document.body.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 8000);
    dom.window.close();
    if (!text) return { ok: false, error: 'JS-rendered page had no readable text.' };
    return { ok: true, title, text };
  } catch (e) { return { ok: false, error: 'JS-render failed: ' + sanitizeError(e && e.message ? e.message : 'jsdom unavailable') }; }
}


// Playwright final slice: real browser control (Chromium, headless).
// READ actions (navigate/text) run without approval, like browser_read_js.
// WRITE actions (fill/click/submit) are approval-gated like terminal_exec.
// Hardblock: login / sign-in / checkout / payment pages, and password fields
// are never driven, even with approval. Text output capped at 8000 chars.
function isBrowserControlBlocked(urlString, args) {
  try {
    const u = String(urlString || '').toLowerCase();
    if (/(login|sign-in|signin|sign_in|checkout|payment|billing|pay\/)/.test(u)) return true;
    const acts = (args && Array.isArray(args.actions)) ? args.actions : [];
    for (const a of acts) {
      const sel = String((a && a.selector) || '').toLowerCase();
      if (/password/.test(sel)) return true;
    }
    if (/password/.test(String((args && args.fillSelector) || '').toLowerCase())) return true;
    return false;
  } catch (e) { return true; }
}
async function browserControl(args) {
  const urlString = args && args.url;
  if (!urlString || typeof urlString !== 'string') return { ok: false, error: 'browser_control needs a url.' };
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(urlString, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const acts = [];
    if (Array.isArray(args.actions)) acts.push(...args.actions);
    if (args.fillSelector) acts.push({ action: 'fill', selector: args.fillSelector, value: args.fillValue || '' });
    if (args.clickSelector) acts.push({ action: 'click', selector: args.clickSelector });
    for (const a of acts) {
      if (!a || !a.selector) continue;
      if (a.action === 'fill') await page.fill(a.selector, String(a.value || ''), { timeout: 10000 });
      else if (a.action === 'click') await page.click(a.selector, { timeout: 10000 });
      else if (a.action === 'submit') await page.click(a.selector, { timeout: 10000 });
    }
    try { await page.waitForTimeout(1000); } catch (e) {}
    const title = await page.title().catch(() => '');
    const text = (await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 8000);
    return { ok: true, title, text };
  } catch (e) { return { ok: false, error: 'Browser control failed: ' + sanitizeError(e && e.message ? e.message : 'Playwright unavailable') }; }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
}

async function deepRead(startUrl, maxPages) {
  let origin;
  try { origin = new URL(startUrl).origin; } catch (e) { return { ok: false, error: 'Invalid URL.' }; }
  const cap = Math.max(1, Math.min(10, maxPages || 5));
  const queue = [startUrl];
  const seen = new Set();
  const pages = [];
  while (queue.length && pages.length < cap) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const page = await readWebPage(url);
    if (!page.ok) continue;
    pages.push({ url: url, title: page.title || '', headings: (page.headings || []).slice(0, 10), text: (page.text || '').slice(0, 4000) });
    (page.links || []).forEach(l => {
      try {
        if (new URL(l).origin === origin && !seen.has(l) && queue.indexOf(l) === -1 && queue.length < 20) queue.push(l);
      } catch (e) {}
    });
  }
  if (!pages.length) return { ok: false, error: 'Could not read any page from this site.' };
  return { ok: true, pages: pages };
}

function currentTimeLine() {
  try {
    const now = new Date();
    const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    const stamp = now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return 'Current date and time on the user PC: ' + stamp + (tz ? ' (' + tz + ')' : '') + '. Use this when the user asks about today, now, or dates - never guess the date or time.';
  } catch (e) { return ''; }
}

// ADOPT-START — adopt.md learning layer (ADDITIVE ONLY).
// adopt.md (project root) is the single readable record of what RedCat
// has learned: Adopted rules + Rejected patterns + Pending review.
// Read at run start (fresh per model call, like character.md); a missing
// file means empty learnings, never a crash. The model APPLIES these
// entries to the new case; it does not decide whether they are true.
// The user AMENDS them. Writes are approval-gated inside adopt.js
// (appendEntry/amendEntry refuse without approved=true) — the model
// never edits adopt.md directly, and this slice exposes no adopt write
// endpoint; the user-override 3-option workflow is procedure, not code.
// Does NOT touch SELFDEV, VISION, CURATOR, CHATSTORE, 7-POINTS, or the
// system prompt text: the only hooks are two ADOPT-marked lines in
// agentSystemText below that load and append this block's text.
const adoptStore = require('./adopt.js');
// INVENTORY-START — live connectors + MCP inventory for the model prompt (ADDITIVE ONLY).
// inventory.js builds the block fresh per model call from mcp.catalogForUi()
// (live sessions + tokens) plus the browser token lists the chat client sends
// with each /api/agent-chat request (connector/social tokens live in the
// browser only). Mirrors the ADOPT pattern: the base prompt text below is
// otherwise untouched — the only hook is one INVENTORY-marked line in
// agentSystemText that appends this block's text.
const inventoryStore = require('./inventory.js');
// VISION-VERIFY-START — screenshot verify loop + 3-strike rule (ADDITIVE ONLY).
// vision-verify.js holds the logic (capture, strike machine, tool handler).
// Mirrors the ADOPT/INVENTORY pattern: the base prompt text below is otherwise
// untouched — the only hooks are one VISION-VERIFY line in agentSystemText,
// the dispatch block, the consume step, and the strike hooks.
const visionVerifyStore = require('./vision-verify.js');
// Server glue for the strike machine: run fields hold error strings only
// (never images, never keys); the trip note goes to the model loop.
function applyVerifyStrike(run, rawError) {
  return visionVerifyStore.applyStrike(run, rawError, function (type, data) { appendLogEvent(run, type, data); }, function (content) { appendLogEvent(run, 'loop/note', { step: run.step || 0, content: content }); run.history.push({ role: 'user', content: content }); });
}
// VISION-VERIFY-END
// REFFLOW-START — reference-URL flow + depth-portrait recipe (ADDITIVE ONLY).
// refflow.js holds the short flow block (site-to-design -> analyze-site.js
// -> design.md -> collect-inputs -> design-to-site -> depth-portrait recipe).
// Mirrors the ADOPT/INVENTORY/VISION pattern: the base prompt text below is
// otherwise untouched — the only hook is one REFFLOW-marked line in
// agentSystemText that appends this block's text.
const refflowStore = require('./refflow.js');
// REFFLOW-END
// BROWSER-START — in-app browser system (2026-11-05). Playwright
// persistent context on the user's PC; see browser.js and
// docs/browser-system-design.md. No credentials are read or stored here.
const browserSystem = require('./browser.js');
// BROWSER-END
function sanitizeConnectorStates(v) {
  const clean = (arr) => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set(); const out = [];
    for (const x of arr) {
      if (typeof x !== 'string' || !/^[a-z0-9-]+$/.test(x)) continue;
      if (seen.has(x)) continue; seen.add(x); out.push(x);
      if (out.length >= 200) break;
    }
    return out;
  };
  if (!v || typeof v !== 'object') return { connectors: [], social: [] };
  return { connectors: clean(v.connectors), social: clean(v.social) };
}
// SMART-MODEL + TOKEN-USAGE (2026-11-05) — all additive, no existing behaviour changed.
// Usage numbers come ONLY from the provider's own response usage field; if a
// provider returns none, the run reports that honestly instead of inventing one.
function freshUsage() { return { input: 0, output: 0, total: 0, calls: 0, reported: false, rateLimited: false, rateLimitNotes: [] }; }
function addUsageFromResponse(sink, provider, parsed, status) {
  if (!sink || !parsed || typeof parsed !== 'object') return;
  try {
    let inp = 0, out = 0;
    if (parsed.usage && typeof parsed.usage === 'object') {
      // OpenAI-compatible + Claude: prompt_tokens/input_tokens, completion_tokens/output_tokens.
      if (typeof parsed.usage.prompt_tokens === 'number') inp = parsed.usage.prompt_tokens;
      else if (typeof parsed.usage.input_tokens === 'number') inp = parsed.usage.input_tokens;
      if (typeof parsed.usage.completion_tokens === 'number') out = parsed.usage.completion_tokens;
      else if (typeof parsed.usage.output_tokens === 'number') out = parsed.usage.output_tokens;
    } else if (parsed.usageMetadata && typeof parsed.usageMetadata === 'object') {
      // Gemini: usageMetadata { promptTokenCount, candidatesTokenCount, totalTokenCount }.
      if (typeof parsed.usageMetadata.promptTokenCount === 'number') inp = parsed.usageMetadata.promptTokenCount;
      if (typeof parsed.usageMetadata.candidatesTokenCount === 'number') out = parsed.usageMetadata.candidatesTokenCount;
    } else if (typeof parsed.prompt_eval_count === 'number' || typeof parsed.eval_count === 'number') {
      // Ollama: prompt_eval_count / eval_count.
      if (typeof parsed.prompt_eval_count === 'number') inp = parsed.prompt_eval_count;
      if (typeof parsed.eval_count === 'number') out = parsed.eval_count;
    }
    if (inp > 0 || out > 0) {
      sink.input += inp; sink.output += out; sink.total += inp + out; sink.calls += 1; sink.reported = true;
    }
  } catch (e) {}
  // Rate limit: HTTP 429 is a real throttling event (postHttps returns no headers, so the status is the signal).
  if (status === 429) {
    sink.rateLimited = true;
    const note = 'HTTP 429 (rate limited) from ' + provider;
    if (sink.rateLimitNotes.indexOf(note) === -1) sink.rateLimitNotes.push(note);
  }
}
// TOKEN DISPLAY REMOVED (2026-11-06, ali order): replies no longer show a usage line.
// THOUGHT SANITIZER (2026-11-05) — the thought shown to the user must NEVER reveal
// the bot's character/personality instruction. If a thought leaks it (names the
// savage character, the personality, or the instruction itself), the DISPLAYED
// thought is replaced with a neutral task note. The raw thought stays in the run
// log (model/reply event) and the sanitization is logged, so the record is honest.
function sanitizeThought(thought, parsed) {
  const t = String(thought || '').trim();
  if (!t) return '';
  const leak = /savage|in character|my (character|personality|soul|tone)|mock (the user|him|her|them)|teas(e|ing) (the user|him|her|them)|system instruction|my instructions|as (a|the) savage/i.test(t);
  if (!leak) return t.slice(0, 500);
  if (parsed && typeof parsed.tool === 'string' && parsed.tool) return 'Running ' + parsed.tool + ' for your request.';
  if (parsed && typeof parsed.final === 'string') return 'Wrapping up your reply.';
  if (parsed && parsed.plan) return 'Drafting a plan for your task.';
  return 'Working on your request.';
}
// PROVIDER STATES (2026-11-05) — the browser sends the saved provider/model list
// (names + models only, never keys) with each /api/agent-chat request, mirroring
// connectorStates. The server only trusts the shape, never the content.
function sanitizeProviderStates(v) {
  const clean = (arr) => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set(); const out = [];
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue;
      const id = String(x.id || '');
      if (!/^[a-z0-9-]+$/.test(id)) continue;
      if (seen.has(id)) continue; seen.add(id);
      out.push({ id: id, name: String(x.name || id).slice(0, 60), model: String(x.model || '').slice(0, 120), hasKey: x.hasKey === true });
      if (out.length >= 50) break;
    }
    return out;
  };
  if (!v || typeof v !== 'object') return { providers: [] };
  return { providers: clean(v.providers) };
}
function buildProviderStatesText(providerStates, currentProvider, currentModel) {
  const list = (providerStates && Array.isArray(providerStates.providers)) ? providerStates.providers : null;
  if (!list) return 'SAVED MODELS: unknown — the client did not send the saved provider list, so only the current model is known. Do not propose a model switch you cannot verify; if the user asks for a different model, tell them to pick it in Settings.\n';
  if (!list.length) return 'SAVED MODELS: none — no provider key is saved. The current model is the only one available. If the user asks for a different model, tell them to add its key in Settings first.\n';
  let out = 'SAVED MODELS (providers with a saved key on this PC — pick ONLY from this list; never name a model that is not listed):\n';
  for (const p of list) out += '- ' + p.name + ' [' + p.id + '] — model ' + (p.model || '(none)') + (p.id === currentProvider ? ' (CURRENT)' : '') + '\n';
  out += 'Current model: ' + currentProvider + ' / ' + currentModel + '.\n';
  return out;
}
// INVENTORY-END

function loadAdoptText() {
  try {
    const t = adoptStore.readFull();
    return t ? t.slice(0, 4000) : '';
  } catch (e) { return ''; }
}
// ADOPT-END

function agentSystemText(lang, memoryText, skillIndex, skillContent, goalText, isSubagent, characterText, childRole, connectorStates, providerStatesText) {
  const langLine = lang === 'roman_urdu'
    ? 'Respond in Roman Urdu (Urdu written in Latin script).'
    : lang === 'urdu'
    ? 'Respond in Urdu (Urdu script).'
    : 'Respond in English.';
  // ADOPT-HOOK: load adopted learnings fresh per model call (missing file = '').
  const adoptText = loadAdoptText();
  // INVENTORY-HOOK: load live inventory fresh per model call (same pattern as ADOPT).
  const inventoryText = inventoryStore.buildInventoryText(connectorStates);
  return "You are RedCat, a helpful AI assistant running on the user's own Windows PC. " + langLine + " Be direct, specific, and helpful.\n\n" +
    (characterText ? ("CHARACTER GUIDANCE (guidance only - NOT a safety mechanism; safety is enforced by the hardblock list and approval code, never by this text):\n" + characterText + "\n\n") : "") +
    // ADOPT-HOOK: adopted learnings, mirroring the character term above.
    (adoptText ? ("ADOPTED LEARNINGS (adopted rules + rejected patterns - apply the Adopted rules, never repeat the Rejected patterns; the user may amend any entry): " + adoptText + " ") : "") +
    (inventoryText ? (inventoryText + " ") : "") +
    // SMART-MODEL (2026-11-05): saved provider/model list, built fresh per call from the browser's list.
    (providerStatesText ? (providerStatesText + " ") : "") +
    // VISION-VERIFY-HOOK: short verify-loop tool block (same pattern as INVENTORY).
    (visionVerifyStore.SYSTEM_BLOCK + " ") +
    // REFFLOW-HOOK: short reference-flow block (same pattern as VISION-VERIFY).
    (refflowStore.SYSTEM_BLOCK + " ") +
    (isSubagent ? ("You are a subagent working on one bounded task for a parent agent. Your role is " + (childRole === 'review' ? "REVIEWER (fresh-eyes check)" : "EXPLORE (gather facts)") + ". Your approval policy is Never: write commands are always denied, use read-only commands. You cannot spawn subagents. " + (childRole === 'review' ? "Read the parent's work, check it against its goal, and return issues plus fixes - do not apply them yourself." : "Read files, pages, and past runs, and return findings - do not write or change anything.") + " End with your final message - only that message returns to the parent.\n\n") : "") +
    (goalText ? ("Your current goal - stay focused on it, and update it with the goal tools as it changes:\n" + goalText + "\n\n") : "") +
    (memoryText ? ("Your persistent memory from past work - these are facts you must not forget:\n" + memoryText + "\n\n") : "") +
    (skillIndex ? ("Your learned skills - catalog only (name + short description). Read the full skill with skill_read when a task matches it; never guess its contents from the description:\n" + skillIndex + "\n\n") : "") +
    (skillContent ? (skillContent + "\n\n") : "") +
    "You can use tools. When the user asks for something that needs this PC or the live web, use a tool. Otherwise answer directly.\n" +
    "Reply with exactly one JSON object, no other text, in one of these shapes:\n" +
    '{"tool": "terminal_exec", "args": {"command": "dir"}} - run a Windows cmd command on the PC.\n' +
    '{"tool": "browser_read", "args": {"url": "https://example.com"}} - read a public web page as text.\n' +
    '{"tool": "browser_read_js", "args": {"url": "https://example.com"}} - read a JS-rendered web page: executes page scripts (jsdom) and returns rendered text. Use this when browser_read returns only a loader / empty shell.\n' +
    '{"tool": "browser_control", "args": {"url": "https://example.com/form", "actions": [{"action": "fill", "selector": "#name", "value": "Ali"}, {"action": "click", "selector": "#go"}]}} - drive a real headless Chromium browser (Playwright): navigate, fill inputs, click/submit, return rendered text (max 8000 chars). Navigate/text reads need no approval; fill/click/submit ALWAYS need user approval first. NEVER use on login, sign-in, checkout, or payment pages, or password fields.\n' +
    '{"tool": "browser_panel", "args": {"action": "open", "url": "https://example.com"}} - drive the in-app Browser panel (the live, visible browser the user watches): open a page, read it, click, move the mouse visibly, type, and request a post/send. Actions: open (start the browser and go to a URL — the panel opens for the user), navigate (go to a URL), read (return the current panel page title + text), click (click a CSS selector), move (move the mouse to x,y — visible in the panel), type (type text into the focused field), send/publish/submit (request a sensitive action — it NEVER runs immediately, it waits for the user to approve it in the Browser panel), status (panel state). Use this for live research and for social posting: the user logs in themselves in the panel (you never see a password), you navigate to the compose flow, type the text, and request the post — the user approves it in the panel.\n' +
    '{"tool": "model_switch", "args": {"provider": "claude", "model": "claude-sonnet-4-5", "reason": "This website build needs a stronger model than the current free one"}} - ask the user to switch to a different saved model for THIS task (see MODEL PICKER below). Use it ONLY when the current model is clearly the wrong fit for the task and the target is in the SAVED MODELS list. The user approves or denies the switch; you never switch silently. Never call it for a model that is not saved.\n' +
    '{"tool": "memory_search", "args": {"query": "imredcat"}} - search your persistent memory for past facts.\n' +
    '{"tool": "memory_save", "args": {"fact": "The user prefers ..."}} - save a durable fact for later (never a secret). Facts starting "RULE:" become standing rules, always injected at run start.\n' +
    '{"tool": "memory_supersede", "args": {"old": "old fact text", "new": "new fact text"}} - when a fact is corrected or replaced, mark the old one SUPERSEDED and save the new one. Never just append a contradicting fact.\n' +
    '{"tool": "memory_forget", "args": {"fact": "fact text to remove"}} - remove a fact from MEMORY.md and RULES.md (dated audit log is kept).\n' +
    '{"tool": "personality_update", "args": {"trait": "Short sentences, rarely over 15 words", "evidence": "3 user messages on 2026-11-05"}} - update the user\'s style profile (PERSONALITY.md) when you notice a repeated pattern in how the user talks (2-3 observations). Style only: language, tone, sentence length, vocabulary, structure. NEVER add a trait that mirrors rudeness, insults, sarcasm, political/religious views, overconfidence, or anything illegal or wrong — those are refused. No approval is needed (the profile updates itself); the user sees a small "updating personality" status while it runs. Do not use it for facts (use memory_save) or for the bot\'s own character.\n' +
    '{"tool": "web_search", "args": {"query": "best open source agent 2026"}} - search the web for sources, then read them.\n' +
    '{"tool": "deep_read", "args": {"url": "https://example.com", "maxPages": 5}} - crawl a site deeply: the page plus same-site linked pages (up to 10) for notes.\n' +
    '{"tool": "skill_read", "args": {"name": "website-build"}} - read a learned skill in full.\n' +
    '{"tool": "skill_save", "args": {"name": "website-build", "when": "building a website", "content": "steps..."}} - save a reusable procedure you learned (never a secret).\n' +
    '{"tool": "skill_prepare", "args": {"source": "github", "url": "https://github.com/anthropics/skills/tree/main/skills/pdf"}} - fetch a skill and run the skill-scan gate, WITHOUT installing it. source "github" = a GitHub repo URL, skills-folder URL, or direct SKILL.md/raw URL (only skill files are fetched, never the whole repo, never scripts). source "paste" = the user pasted SKILL.md text in chat (args.text). Returns the preview: name, description, file list, scan verdict (BLOCK/REVIEW/ALLOW) + specific findings, name conflict, catalog count. Show the preview to the user and ask before installing — never install without the user seeing the preview first.\n' +
    '{"tool": "skill_install", "args": {"prepToken": "prep-...", "name": "pdf", "description": "What the skill does, and when to use it."}} - install a skill you prepared with skill_prepare. Takes the prepToken from the skill_prepare result (the prepared files live on the server — you never retype them). The user sees an approval card and must allow it; a BLOCK scan is refused unless the user named the finding and confirmed explicitly (pass override: {confirmed: true, findings: ["<finding class>"]}). If the name already exists, pass allowOverwrite: true ONLY when the user said update/overwrite — otherwise stop and ask. After install, the skill joins the catalog from the NEXT run and appears in the Skills page.\n' +
    '{"tool": "schedule_create", "args": {"title": "Morning reminder", "prompt": "Remind me to post the Tux reel", "kind": "daily", "value": "09:00"}} - create a scheduled task in THIS chat. kind: after_seconds (value = seconds), at (value = "2026-10-30 09:00"), every_seconds (value = seconds, minimum 60), daily (value = "09:00"), weekly (value = "Mon 09:00"), cron (value = "30 9 * * Mon"). When it is due, the client delivers the prompt into this chat as a new user message and you run it. One-shot kinds (after_seconds, at) run once; the rest repeat. Maximum 50 active schedules per chat.\n' +
    '{"tool": "schedule_list", "args": {}} - list the active schedules in THIS chat.\n' +
    '{"tool": "schedule_delete", "args": {"id": "sch-..."}} - delete a schedule in THIS chat by its id.\n' +
    '{"tool": "todo_write", "args": {"todos": [{"content": "Download the file", "status": "pending"}]}} - replace your whole todo list for this task. Each item: content (max 200 chars) + status pending, in_progress, or completed. Maximum 25 items, at most one in_progress. Send the full list every time (add, finish, or drop items by including or omitting them). An empty list clears it.\n' +
    '{"tool": "session_list", "args": {}} - list past agent runs (id, task, status, event count).\n' +
    '{"tool": "session_read", "args": {"runId": "agent-...", "limit": 50}} - read one past run log events (last 50 by default, max 200).\n' +
    '{"tool": "session_trace", "args": {"runId": "agent-..."}} - step-by-step trace of one past run: thoughts, tool calls with results, approvals, plans, outcome.\n' +
    '{"tool": "session_search", "args": {"query": "Tux reel"}} - search all past run logs for a word or phrase; returns matching events with snippets.\n' +
    '{"tool": "session_surface", "args": {"query": "Tux reel"}} - find past runs related to a topic, ranked by match count, with task and status.\n' +
    '{"tool": "sandbox_set", "args": {"mode": "readonly"}} - set this run\'s sandbox mode: readonly (only read-only commands run), workspace (writes stay inside the project folder), or full (default, approval-gated writes anywhere).\n' +
    '{"tool": "goal_set", "args": {"goal": "Build the landing page"}} - set this session\'s one goal (fails if a goal is already active or paused).\n' +
    '{"tool": "goal_status", "args": {}} - read the current goal and its status.\n' +
    '{"tool": "goal_pause", "args": {"reason": "Waiting for the user to confirm the price"}} - pause the active goal.\n' +
    '{"tool": "goal_resume", "args": {}} - resume a paused goal, only after the user directly asks for it.\n' +
    '{"tool": "goal_complete", "args": {"summary": "Landing page built and linked"}} - mark the active goal complete.\n' +
    '{"tool": "goal_block", "args": {"reason": "API key missing"}} - mark the active goal blocked.\n' +
    '{"tool": "subagent_spawn", "args": {"prompt": "Summarize this folder", "mode": "fresh", "maxSteps": 10}} - run a bounded child agent on one task (mode fresh = only the prompt, fork = parent history prefix + prompt; maxSteps 1-20, default 10). The child approval policy is Never, it cannot spawn subagents, and only its final message returns to you. Role: "explore" (gather facts, default) or "review" (fresh-eyes check). Children are read-only by code: allowedTools is intersected with the read-only set, and writes, sends, and approvals stay with the parent.\n' +
    '{"tool": "plugin_list", "args": {}} - list registered plugins and their tools.\n' +
    '{"tool": "run_info", "args": {}} - read-only info about the current run (step, model, policy, sandbox, goal, depth, children).\n' +
    '{"final": "your reply here"} - your final answer to the user. The "final" value must ALWAYS be a plain string of natural text — never an object, never JSON, never a nested structure. If you researched something, write the findings as natural prose in the final string (headings and bullets are fine), not as a JSON object.\n\n' +
    'SELFDEV-WIRING (self-improvement endpoints, localhost only — use ONLY after a failed or struggling run, or when the user asks to improve the harness; never on every run, never for the current task deliverable): this PC RedCat server exposes POST JSON endpoints at http://localhost:3000/api/selfdev/ — observe {runId} (read-only summary of a run: failed, denied, correction signals), propose {runId, childId, role: "explore", target, content} (an explore-role proposal only; target must be project-relative, never a sensitive file; the proposal lands in runs/<runId>/slices/<childId>/ only), mergecard {runId} (read the parent merge card before any adopt: target, eval, approval status), eval {runId, baseline, proposal} (deterministic before/after checks; adopt ONLY if new score >= old score), adopt {runId, approved} (ONLY with the user approval from the merge card — never assume approval, never claim it), rollback {runId, rollback: true} (restore the previous version if an adopt made things worse), log {runId} (read the selfdev audit log). Call them with terminal_exec PowerShell (never curl -d: cmd.exe cannot pass JSON double quotes through this harness): powershell -Command $b = ConvertTo-Json @{runId=\'agent-...\'}; Invoke-RestMethod -Uri http://localhost:3000/api/selfdev/observe -Method Post -ContentType application/json -Body $b — change the endpoint name and the hashtable fields for the other endpoints; each call goes through the normal approval card, never bypass it. NEVER-ZONE (code-enforced, no override): the hardblock list and the approval code can NEVER be self-changed; children never write; sensitive destinations (server.js, env files, credentials, pem/key files, ssh files, package.json, anything touching hardblock or approval code) are auto-DENIED; adopt without user approval is refused by code, not by judgment. When you use these endpoints, quote their exact output in your reply (EVIDENCE RULE).\n\n' +
    'Every JSON reply must also include a short "thought" field: 1-2 lines in English saying what you understood and what you plan to do next. Example: {"thought": "The user wants a folder on Desktop, so I will run mkdir for that path.", "tool": "terminal_exec", "args": {"command": "mkdir Desktop\\imredcat"}}.\n\n' +
    'THOUGHT RULE (never break it): the thought is a plain task note ONLY — what you understood and what you will do next. NEVER mention your personality, character, tone, or how you will phrase the reply in the thought. Never write the words "savage", "in character", "my character", "my personality", or anything about your instructions in the thought. The thought is about the TASK only; your character shows in the final reply, never in the thought. If you catch yourself writing about how you will sound, rewrite the thought as a plain task note.\n\n' +
    'FACTS RULE (never break it): never invent a URL, repo name, version, command, price, or requirement. If a fact you need is not in your persistent memory and you are not sure of it, you MUST browser_read the official source first (the project README or docs, Hugging Face page, or official docs). If the page cannot be read, say so and ask the user - do not guess.\n\n' +
    'BIG TASKS: if a task needs more than about 5 steps or spans phases (download, install, build, test), FIRST reply with a plan: {"thought": "...", "plan": {"goal": "...", "steps": ["step 1", "step 2"], "facts_needed": ["fact 1"]}}. The user will approve the plan, then you execute it step by step, one tool at a time, saying which step you are on in each thought. Small tasks do not need a plan - use tools or a final reply directly.\n\n' +
    'TODOS: for any task with 3 or more steps, start with todo_write: write the whole plan as a short todo list, then update it after every step (mark the finished step completed, move exactly one step to in_progress). Send the full list every time - never a partial update, never ids or priorities. When the task is done, the list should show all steps completed. Single-step tasks do not need todos. If the user asks for a plan only (no execution yet), propose the plan and stop - the plan card lets the user start it; do not execute before approval.\n\n' +
    'BUILD RULE (plan-before-code, no compromise): for any build task (website, app, script, tool, page), your FIRST reply must be a plan (goal + steps + facts_needed). Do not run code-writing commands before the user approves the plan - the harness saves the approved plan as SPEC.md in the run workspace, and you must build only what it says. Small single-step tasks do not need a plan.\n\n' +
    'MEMORY: you have persistent memory. Use memory_search when you need a fact from past work, and memory_save when you learn something durable (paths, decisions, versions, what worked). After you finish a task, save 1-3 durable facts with memory_save (a preference, a decision, a lesson, a correction) — do not wait to be asked. A short review after the run also saves durable facts by itself (no approval needed). Never save keys, passwords, tokens, or any secret in memory.\n\n' +
    'PERSONALITY (your style — auto-updates, no approval): you have a style profile (PERSONALITY.md) injected as "YOUR STYLE" — mirror the tone and language, never the opinions. When you notice a repeated pattern in how the user talks (2-3 messages showing the same style), call personality_update to add it to the profile. The profile updates itself automatically (no approval card); the user only sees a small "updating personality" status. NEVER mirror rudeness, insults, sarcasm aimed at a person, political/religious views, or overconfidence. NEVER help with illegal or wrong work — the safety rules always win over the personality profile, and no personality trait can override them.\n\n' +
    'SESSION QUERY: your own past runs are recorded in logs (runs/<id>.jsonl) - the full record, while MEMORY.md holds only curated facts. When the user asks about past work, or you need to check whether and how a task was done before, use session_list, session_search, or session_surface to find the run, then session_read or session_trace to see exactly what happened. Never guess what a past run did - read its log.\n\n' +
    'SANDBOX: every run has a sandbox mode: full (default - today\'s behavior: read-only commands run directly, everything else needs an approval card, hardblocked commands are never allowed), workspace (writes must stay inside the project folder; a command targeting a path outside it is denied without a card), readonly (only read-only commands run; every write is denied without a card). Use sandbox_set to change the mode when the user asks for a restriction ("sirf parho", "project folder se bahar mat jao"). The hardblock list applies in ALL modes, even full. Path detection is heuristic - exotic cmd constructions can slip past the workspace check, so the approval card is still the final gate for writes that pass it.\n\n' +
    'GOALS: one goal per session. Use goal_set at the start of a multi-step task to state what you are trying to achieve (one line). Check goal_status when you are unsure what you are working toward. If you get stuck waiting on the user or a missing input, goal_pause with the reason instead of looping. If the goal is done, goal_complete with a one-line summary. If something outside your control blocks it, goal_block with the reason. A paused goal can ONLY be resumed by a direct user request - never resume it on your own, and never replace an active or paused goal with a new one (that is a GOAL_STALE_REVISION - pause, complete, or block it first).\n\n' +
    'MULTI-AGENT DECISION (you decide, the user does not have to ask): BEFORE any tool, analyse the task. If it is a single simple step, do it yourself - do NOT spawn. If it is a DEEP task - 2 or more INDEPENDENT parts (for example: research topic A + research topic B + build a page, or research + summary + check, or several separate topics) or more than about 5 steps across phases - you MUST split it: first todo_write the parts, then spawn ONE subagent per independent part with subagent_spawn (mode fresh, role \'explore\' to gather facts or \'review\' for a fresh-eyes check, a bounded prompt naming exactly one part, maxSteps you set; the harness enforces read-only tool sets for children in code, whatever you request). Dependent steps (step B needs step A output) stay with you, in order - never parallelise a dependency. Limits: at most 8 children per run, depth 1 (a child cannot spawn), child approval is Never so children NEVER write files, send, or ask the user - writing, sending, and approvals stay with you. Wait for every child, VERIFY each child result with dir/type or a read before using it, combine all parts into ONE final answer naming what each agent did, and if a child fails or returns nothing, retry it once with a narrower prompt or do that part yourself - never fake its result. State your split decision in your thought field: \'Split: N agents - ...\' or \'No split: single task.\'\n\n' +
    'MODEL ROUTING (Kimi K3): when the main model is Kimi K3 (strong), Explore children run on the cheaper kimi-k2 model in fresh mode only, so no thinking history is lost; Reviewer children keep the main model. Never switch models mid-session on a Kimi K3 chat - K3 thinking history must be replayed in full, and the harness refuses mid-session switches in code.\n\n' +
    'PLUGINS: tools can also arrive as plugins. The plugin list is explicit - an entry list in code, never auto-downloaded or auto-discovered. plugin_list shows what is registered; built-in tools win if a plugin name ever collides. A plugin that fails to start refuses server boot with its name in the error - it never silently runs half-working.\n\n' +
    'SKILLS: you learn from experience. When a task succeeds with a reusable procedure, save it with skill_save so next time is better. The list above is only a catalog - names plus one short description each. When a task matches a skill, read the full skill with skill_read first and follow it exactly. Skills marked [side-effect skill] in the catalog need user approval before first use (the harness enforces this in code). When you use a skill for the first time in a chat, tell the user naturally in English that first time there may be an issue, but next time you will give a much better result because you will have learned. If the user writes /skillname, that skill full text is already loaded below as <skill_content>. ADD A SKILL (two ways, one gate): (1) The user uses the Skills page Add Skill form (GitHub link, file upload, or pasted text) — that form runs the same fetch + scan + preview + approval. (2) In CHAT, when the user pastes a GitHub link and asks you to pick it up ("skill uthao yahan se", "install this skill", "add this skill") OR pastes SKILL.md text directly, YOU do it: call skill_prepare with the URL or the pasted text (it fetches ONLY skill files — SKILL.md plus its referenced support files, never the whole repo, never scripts — and runs the skill-scan gate), then SHOW the user the preview (name, description, file list, scan verdict + each finding in plain words) and ASK before installing. Install ONLY with skill_install (it shows an approval card — the user must allow it) and ONLY after the user said yes in chat. A BLOCK scan = refuse by default; install only if the user names the finding and confirms explicitly. A REVIEW scan = show the concern and let the user decide. A name conflict = stop and ask (overwrite / rename / cancel), never silent-overwrite. After install, tell the user the skill is in the catalog from the next run and visible in the Skills page. Never install a skill the user did not name, never go hunting for skills on your own, never run anything from a skill, never fetch a private repo (no token is ever asked for or stored).\n\n' +
    'DEEP RESEARCH: for research questions or unknown facts, read at least 2-3 independent sources with web_search or browser_read, cross-check them, and name your sources in the final reply. One page is never enough for an important fact. If sources disagree, say so. CONTEXT ANCHORING: keep the ORIGINAL question\'s intent — never reframe it into a different domain (ecommerce products to sell are NOT stock-market sectors; an AI product is NOT market trends). When the user nudges with "??" or a bare follow-up, re-read the ORIGINAL question from the conversation history and stick to it. If the question is ambiguous (AI product vs market trends, which market), ASK one short clarifying question with the options, OR state your assumption clearly, BEFORE researching — never guess the domain. SOURCE SELECTION: resources must ALWAYS come from factual sites — sites that actually state the facts, where the facts are written. Primary sources first (official docs, repos, data pages, the thing itself, official reports, news). Wikipedia is for background/encyclopedia ONLY — never the source for a current or trending topic (ecommerce trends, market trends, 2026 trends). For a current or trending topic use the right sources (Exploding Topics, Shopify, Trend Hunter, Google Trends, Amazon Best Sellers, official reports, news). Use search operators to target factual sites (site:domain, "exact phrase", intitle:word, -term). FALLBACK: if web_search returns no results, or only Wikipedia results for a question that needs non-Wikipedia sources, EITHER open the Browser panel and search/read directly (search in the browser, open the real factual sites, read them live) OR ask the user right away — never guess, never invent, never settle for a weak or wrong source. NO FAKE: cite ONLY what you actually read — never invent a source, a number, a date, or a quote. If a fact cannot be verified, say so honestly. ARTIFACT: at the end of ANY big task (research, deep dive, comparison, investigation), BUILD the user a minimalist world-class website artifact containing ALL the resources (all sources with links, plus the findings) — build it as part of the task, do not just offer it and wait. The artifact is minimalist (clean, lots of white space, simple typography, no clutter) and world-class.\n\n' +
    'VERIFY BEFORE FINAL: before your final reply, re-check every file you claim to have created or changed with a read-only command (dir/type). If any check fails, fix it or say the task FAILED - never claim success on words alone.\n\n' +
    'EVIDENCE RULE (verify loop): when your final reply claims a check, test, build, or verification passed or failed, quote the exact tool output (command + result lines) that proves it. Never write \'tests pass\' or \'verified\' without quoting the output. The harness records every tool result in the run log (runs/<id>.jsonl) - your claims must match that record. If a check FAILED, say so, fix it on real output, re-run it, and quote the new output. A loop that closes on real pass/fail output is the goal, whether the result is good or bad.\n\n' +
    'LONG DOWNLOADS: for downloads longer than a minute, launch in the background (start /b ...) and poll with dir checks instead of blocking. Downloads are separate Windows processes - they keep running even if this server restarts; after a resume, VERIFY the file (dir) before re-downloading.\n\n' +
    'DEEP WEBSITE NOTES: when the user shares a website link and wants to understand it, use deep_read (up to 10 pages on the same site), then write Deep Notes in your final reply: (1) ye site kya hai, (2) kis ke liye / kis kaam ki hai, (3) main sections, (4) key content aur facts, (5) design aur style notes, (6) tech notes jo pages se nazar aayein, (7) sources = pages you read, with the site link at the end. If deep_read returns thin or empty content, the site is likely JavaScript-heavy - read the crawl4ai-js-render skill and use it.\n\n' +
    'RESEARCH KING (Perplexity pattern): when the user asks a research question, do NOT answer from memory and do NOT answer from web_search snippets alone. Follow the DEEP RESEARCH rules (context anchoring, factual sites only, browser-or-ask fallback, no fake, build the artifact). (1) web_search ONCE with the question. If the result says "source: wikipedia — LAST RESORT ONLY", do NOT settle for Wikipedia: open the Browser panel and search the real factual sites there (or ask the user). If web_search fails (no results), open the Browser panel and search there, or ask the user — never guess. (2) Your NEXT tool call MUST be browser_panel action "open" with the best result URL — open it in the Browser panel and read it live with browser_panel action "read" (the user watches you research in the browser like a human researcher; use "move" to move the mouse visibly and "click" to follow links); read 2 sources this way. (3) Cross-check them. (4) Answer with the EXACT thing first, then the evidence, then the source names. If sources disagree, say so. If the web cannot verify it, say so instead of guessing. (5) At the end of a research answer, BUILD the user a minimalist world-class website artifact (a full deep dive with the findings, graphs, and ALL the sources with links) — build it as part of the task, do not just offer it and wait. Tell the user naturally, in your own words, that you built it, and give the localhost link plus the folder.\n\n' +
    'HERMES (disambiguation — read this before answering about Hermes): in this product\'s context, "Hermes" ALWAYS means Nous Research\'s hermes-agent — the MIT open-source AI agent framework (repo: https://github.com/NousResearch/hermes-agent, docs: https://hermes-agent.nousresearch.com). It is NOT the Mistral AI Hermes language model. When the user asks about Hermes, open the Browser panel to the hermes-agent repo/docs and read them live (browser_panel "open" + "read") — never answer from memory and never confuse it with the Mistral model. If the user clearly means the Mistral model, say so explicitly and ask which one they mean.\n\n' +
    'PANEL BROWSER (live research + social posting): the Browser panel is the visible browser inside RedCat — the user sees the page and the cursor move in real time. When the user asks for research, DO the research in the panel with browser_panel (open, read, move, click) instead of only reading pages as text — the user must see you working in the browser. When the user asks you to post on their social media: the user logs in themselves in the panel (you never see a password, never ask for one); you open the site in the panel, navigate to the compose/post flow, click into the text field, type the post with browser_panel "type", and request the post with browser_panel "send" or "publish" — that request NEVER runs by itself, it waits for the user to approve it in the Browser panel, and you must tell the user to approve it there. Only ask the user to do manual work when something genuinely needs a human (a login you cannot do, a CAPTCHA) — and say so clearly in that case. Never post, send, or publish anything without the user asking for that exact post and approving it in the panel.\n\n' +
    'MODEL PICKER (smart model/key selection — you decide, the user approves): for every task, FIRST decide which saved model fits it best. Read the model-picker skill with skill_read when the task is a build, research, or anything long — it carries the task-to-model mapping. Rules: (1) Pick ONLY from the SAVED MODELS list above — never name a model that is not saved. (2) If the current model already fits the task, just do the task — do not switch, do not ask. Only propose a switch when the current model is clearly the wrong fit (for example: a free/weak model for a complex website build, or a strong/expensive model for a trivial one-line question). (3) To switch, call the model_switch tool with the target provider + model + a one-line reason — the user sees an approval card and allows or denies it. NEVER switch silently, and never call model_switch for a model that is not saved. (4) If the best model for the task is NOT in the SAVED MODELS list, do NOT switch: tell the user in your final reply which model would be best and ask them to add its key in Settings — OR ask if they want to continue with the current model ("if you want to continue with this one, that is fine") — then wait for their answer before starting the work. (5) If the user denies a switch, continue with the current model for this task and do not ask again for the same task. (6) Groq is NOT usable for agent work: its token-per-minute limit is below the agent request size, so never pick Groq for an agent task. (7) Never switch models mid-session on a Kimi K3 chat — those chats are pinned to K3 by code.\n\n' +
    'MOTION VIDEO: when the user asks for a motion graphics video, FIRST read the motion-video skill with skill_read, then follow it exactly - the skill carries the world-class quality, so this works with ANY model. Workflow: prompt -> timestamped beat sheet (every beat names its camera move) -> one self-contained HTML animation file -> contact sheet (one frame per beat) -> QA -> ffmpeg MP4 into the videos folder -> end your final reply with the direct link: http://localhost:' + PORT + '/videos/<name>.mp4 - the user clicks the link in chat and the video plays. Length: the user decides, up to 3 minutes (never present 15 seconds as a limit - that was only an example). 3 minutes at 30fps is 5400 frames, so render time grows with length. If the task goes through a plan card, the plan goal MUST begin with a time notice in the user language (English default: "Building your video - this may take a while because the video is being coded and rendered frame by frame (up to 3 minutes)."). The final reply must state the video length and frame count in the user language before the link. If the user asks for longer than 3 minutes, say 3 minutes is the current maximum and offer to split it into parts. Never ask the user to open files by hand.\n\n' +
    'SAAS EXPLAINER FROM A URL: when the user shares a website URL and asks for a SaaS explainer video, follow this workflow. DURATION FIRST: if the request has no duration, reply with exactly one short question asking how many minutes the video should be, in the user language (English by default), and stop - do not fetch or build yet. Ask only once: if the user declines to choose or answers vaguely, use 90 seconds and say so, then proceed. If a duration is given, it must be 3 minutes or less (longer: 3-minute maximum plus split offer, same as motion videos). UNDERSTAND DEEPLY - take full time, do not rush: use deep_read on the URL (up to 10 pages); if the content comes back thin or empty (JavaScript-heavy site), read the crawl4ai-js-render skill and use it. From the fetched pages only, extract: product name, one-line purpose, target user, top 3 to 5 real features, pricing ONLY if the site states it, and the design language (colors, tone, style). Never invent features, prices, numbers, testimonials, or customer names - product names, numbers, and prices stay literal. STRUCTURE (proven SaaS arc, scaled to the chosen length): Hook = one specific problem the viewer already feels (first ~10 percent), Tension = why current solutions fall short, Solution = the core workflow in 3 to 4 steps shown not described, Proof = ONE real number or fact from the site (only if present on the site - if none exists, skip proof, never invent one), CTA = ONE action using the site own CTA wording when present. BUILD: follow the motion-video skill (beat sheet grounded in site facts, every beat claim traceable to a fetched page, then HTML, contact sheet, QA, ffmpeg MP4 into the videos folder) and end the final reply with the direct video link plus length, frame count, and the source site, all in the user language. Never ask the user to open files by hand.\n\n' +
    'SCHEDULED TASKS: when the user asks for a reminder, a repeated check, or anything "every day / every hour / tomorrow at 9", use schedule_create - never promise to remember it yourself. Say the title and the next run time back to the user so they can confirm it. When a scheduled prompt arrives in chat (it will look like a normal user message), run it like any other request. To show or cancel schedules, use schedule_list and schedule_delete. If a schedule time has passed while the app was closed, it is delivered once when the chat opens - never run it twice for the missed slots.\n\n' +
    'FINAL REPLY RULE: end every task with the primary results first, then a brief explanation, then sources - so the reply is enjoyable to read. Results = what was made, found, or changed. Explanation = short, in the user language, no filler. Sources = a clickable link for every file you created or changed (sites/ or videos/ link), the site link for website work, and the names of the pages you read for web facts. Never present a bare claim without its source when a source exists, and never invent a source.\n\n' +
    'TOKEN USAGE (the server reports it, never you): after your final reply, the server appends a real token-usage line from the provider response (input/output counts). Do NOT write token numbers, token counts, or a usage line yourself — you do not know them, and inventing one would be fake. If the user asks about tokens, say only that the usage line after each reply comes from the provider, and that you do not know their remaining balance.\n\n' +
    "Rules: use tools only when the task truly needs them. Prefer safe, read-only commands for inspection. Never run destructive commands (format, disk tools, registry writes, shutdown, user changes) - they are blocked. If a command is denied by the user, respect it and suggest another way. For website or anything-visual tasks, build under the project sites folder (sites/<short-name>/index.html, assets next to it) and end your final reply with the direct link: http://localhost:" + PORT + "/sites/<short-name>/ \u2014 the user clicks the link in chat and sees it in their browser. Never ask the user to open files by hand or to use Code view. Keep final answers concise." + (currentTimeLine() ? ("\n\n" + currentTimeLine()) : ""); // TOKENOPT (v1.0.15): timestamp moved to the END (volatile tier) so the stable prefix stays byte-identical for provider prefix-cache. Wording unchanged.
}

function parseAgentReply(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {}
  }
  return null;
}

// JSON-LEAK FIX (2026-11-05) — the user must NEVER see the agent's internal
// {"thought": ..., "final": ...} protocol. Two helpers:
//  * renderFinalObject(obj) — a non-string "final" (e.g. {"research_summary": {...}})
//    rendered as natural readable text, never JSON braces.
//  * cleanFinalText(text) — choke-point sanitizer for any final text: if the
//    text is a raw protocol JSON object, extract/render its "final" instead.
//    A legitimate reply that happens to be JSON (a code sample, a data object)
//    is left alone — only the protocol shape (a "thought" plus one of
//    "final"/"tool"/"plan") is treated as a leak.
function renderFinalObject(obj) {
  const lines = [];
  function walk(o) {
    if (o == null) return;
    if (typeof o === 'string') { const s = o.trim(); if (s) lines.push(s); return; }
    if (typeof o === 'number' || typeof o === 'boolean') { lines.push(String(o)); return; }
    if (Array.isArray(o)) { o.forEach((v) => { if (typeof v === 'string') { const s = v.trim(); if (s) lines.push('• ' + s); } else walk(v); }); return; }
    if (typeof o === 'object') {
      Object.keys(o).forEach((k) => {
        if (k === 'thought') return; // the thought is internal, never shown
        const v = o[k];
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (typeof v === 'string') { const s = v.trim(); if (s) lines.push(label + ': ' + s); }
        else if (Array.isArray(v)) { lines.push(label + ':'); v.forEach((x) => { if (typeof x === 'string') { const s = x.trim(); if (s) lines.push('• ' + s); } else walk(x); }); }
        else if (v && typeof v === 'object') { lines.push(label + ':'); walk(v); }
      });
      return;
    }
  }
  walk(obj);
  return lines.join('\n').trim();
}
function cleanFinalText(text) {
  const t = String(text || '').trim();
  if (!t || !t.startsWith('{')) return t;
  let obj = null;
  try { obj = JSON.parse(t); } catch (e) {}
  if (!obj || typeof obj !== 'object') {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end > start) { try { obj = JSON.parse(t.slice(start, end + 1)); } catch (e) {} }
  }
  if (!obj || typeof obj !== 'object') return t;
  const isProtocol = typeof obj.thought === 'string' && ('final' in obj || 'tool' in obj || 'plan' in obj);
  if (!isProtocol) return t;
  if (typeof obj.final === 'string') return obj.final.trim();
  if (obj.final && typeof obj.final === 'object') {
    const rendered = renderFinalObject(obj.final);
    if (rendered) return rendered;
  }
  return 'I could not put that reply into words — please try again.';
}

function normalizeAgentMessages(messages) {
  const list = (Array.isArray(messages) ? messages : []).filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-40);
  while (list.length && list[0].role !== 'user') list.shift();
  const merged = [];
  list.forEach(m => {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else merged.push({ role: m.role, content: m.content });
  });
  return merged;
}

// Error text shown in chat must never carry a full provider ID or token:
// request_id / user_id values, bare UUIDs, and long opaque tokens are masked
// to their first/last characters. Plain messages pass through unchanged.
function sanitizeError(text) {
  let out = String(text || '');
  out = out.replace(/(request_id|requestId|req_id|user_id)(\s*[:=]\s*)([A-Za-z0-9_\-]{8,})/gi, (m, k, sep, v) => k + sep + v.slice(0, 4) + '…' + v.slice(-4));
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (m) => m.slice(0, 8) + '…' + m.slice(-4));
  out = out.replace(/\b[A-Za-z0-9_\-]{32,}\b/g, (m) => m.slice(0, 4) + '…' + m.slice(-4));
  return out;
}

function memoryDir() { return path.join(__dirname, 'memory'); }

// 7-POINTS (3) CHARACTER FILE — guidance only, NEVER a safety mechanism.
// Safety is enforced in code by TERMINAL_BLOCKED and the approval gate, never
// by this text and never by any prompt. If this file is missing, the agent
// simply runs without character guidance.
function loadCharacterText() {
  try {
    const p = path.join(__dirname, 'character.md');
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8').slice(0, 2000);
  } catch (e) { return ''; }
}

function isExpiredFact(line) {
  try {
    const m = String(line).match(/(?:until|expires?)\s+(\d{4}-\d{2}-\d{2})/i);
    if (!m) return false;
    const today = new Date(); const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return m[1] < todayStr;
  } catch (e) { return false; }
}
function isSupersededLine(line) { return String(line).trim().startsWith('SUPERSEDED:') || String(line).indexOf('[SUPERSEDED]') !== -1; }
function personalitySettings(dir) {
  try {
    const sp = path.join(dir, 'personality-settings.json');
    if (fs.existsSync(sp)) {
      const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
      return { enabled: s.enabled !== false, scope: (s.scope === 'app' || s.scope === 'discord' ? s.scope : 'both') };
    }
  } catch (e) {}
  return { enabled: true, scope: 'both' };
}
function personalityEnabled(dir) { return personalitySettings(dir).enabled; }
// PERSONALITY (your style) — auto-updates, no approval (ali's order, 2026-11-05).
// The profile mirrors the user's tone and language, never the opinions. It can
// NEVER override RULES.md or the safety/hardblock rules, and it can NEVER help
// with illegal or wrong work. The NEVER mirror block in the profile is the
// standing guardrail, and the safety rules always win over this slice.
function loadMemoryText(dir) {
  try {
    let base = '';
    // STANDING RULES first: prospective constraints, always applied.
    try {
      const rp = path.join(dir, 'RULES.md');
      if (fs.existsSync(rp)) {
        const rules = fs.readFileSync(rp, 'utf8').split('\n').filter(l => l.trim() && !isSupersededLine(l) && !isExpiredFact(l));
        if (rules.length) base += 'STANDING RULES (always apply, do not ignore):\n' + rules.join('\n').slice(0, 1000) + '\n';
      }
    } catch (e) {}
    // PERSONALITY (your style) — second, after RULES, so RULES always win.
    // Mirror the tone and language, never the opinions. The slice is skipped
    // entirely when the user turns mirroring off (settings file); the profile
    // file itself stays on disk, untouched.
    try {
      if (personalityEnabled(dir)) {
        const pp = path.join(dir, 'PERSONALITY.md');
        if (fs.existsSync(pp)) {
          const plines = fs.readFileSync(pp, 'utf8').split('\n').filter(l => l.trim() && !isSupersededLine(l) && !isExpiredFact(l));
          if (plines.length) base += 'YOUR STYLE (how this user talks — mirror the tone and language, never the opinions):\n' + plines.join('\n').slice(0, 1000) + '\n';
        }
      }
    } catch (e) {}
    const p = path.join(dir, 'MEMORY.md');
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim() && !isSupersededLine(l) && !isExpiredFact(l));
      // Hermes-style header: the model sees the store name + how many facts it holds.
      if (lines.length) base += 'MEMORY (your personal notes) [' + lines.length + ' facts]:\n' + lines.join('\n').slice(0, 2500) + '\n';
    }
    // Dated unforgettable log: most recent dated file, last 5 lines, max 1000 chars.
    // Filter: superseded originals and forgotten facts are never re-injected, even via dated log.
    try {
      const dated = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
      if (dated.length) {
        let supersededOriginals = [];
        let forgotten = [];
        try {
          const mp = path.join(dir, 'MEMORY.md');
          if (fs.existsSync(mp)) fs.readFileSync(mp, 'utf8').split('\n').forEach(l => { const m = l.match(/^SUPERSEDED:\s*(.*?)\s*-> replaced by:/); if (m) supersededOriginals.push(m[1]); });
          const fp = path.join(dir, 'FORGOTTEN.md');
          if (fs.existsSync(fp)) forgotten = fs.readFileSync(fp, 'utf8').split('\n').filter(x => x.trim());
        } catch (e) {}
        let lines = fs.readFileSync(path.join(dir, dated[dated.length - 1]), 'utf8').split('\n').filter(l => l.trim());
        lines = lines.filter(l => {
          if (supersededOriginals.some(o => o && l.indexOf(o) !== -1)) return false;
          if (forgotten.some(o => o && l.toLowerCase().indexOf(o.toLowerCase()) !== -1)) return false;
          return true;
        }).slice(-5);
        if (lines.length) base += '\nDATED (most recent dated log, ' + dated[dated.length - 1].replace('.md', '') + '):\n' + lines.join('\n').slice(0, 500);
      }
    } catch (e) {}
    return base;
  } catch (e) { return ''; }
}

function saveMemoryFact(dir, fact) {
  const clean = String(fact || '').trim().slice(0, 500);
  if (!clean) return { ok: false, error: 'empty fact' };
  if (/api[_-]?key|password|passwd|token|secret|sk-[A-Za-z0-9]|bearer/i.test(clean)) return { ok: false, error: 'never save secrets (keys, passwords, tokens) in memory' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'MEMORY.md');
    let lines = [];
    if (fs.existsSync(p)) lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
    if (lines.indexOf(clean) !== -1) return { ok: true, duplicate: true };
    // Hermes rule: NEVER silently drop. When the store is full, fail loudly so
    // the caller consolidates first (remove/shorten stale entries, then retry).
    if (lines.length >= 200) return { ok: false, error: 'Memory is full (200/200 lines). Consolidate first: use memory_forget to remove a stale entry (or memory_supersede to replace one), then save again.' };
    lines.push(clean);
    fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');
    // RULES: facts starting RULE: are also standing prospective constraints.
    if (/^RULE:/i.test(clean)) {
      try {
        const rp = path.join(dir, 'RULES.md');
        let rlines = [];
        if (fs.existsSync(rp)) rlines = fs.readFileSync(rp, 'utf8').split('\n').filter(l => l.trim());
        if (rlines.indexOf(clean) === -1) {
          rlines.push(clean);
          if (rlines.length > 50) rlines = rlines.slice(rlines.length - 50);
          fs.writeFileSync(rp, rlines.join('\n') + '\n', 'utf8');
        }
      } catch (e) {}
    }
    // Unforgettable dated log: NEVER pruned, one file per day, date-stamped line.
    try {
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const stamp = day + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      fs.appendFileSync(path.join(dir, day + '.md'), stamp + ' | ' + clean + '\n', 'utf8');
    } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false, error: 'could not write memory file' }; }
}

// Default PERSONALITY.md template (English only, 2026-11-07, v1.0.11,
// Bug 4). The old template defaulted the model to Roman Urdu even for
// English messages. This matches the English PERSONALITY.md live on the
// PC: default language English; reply in the user's language ONLY when
// the user writes in that language (real detection). NO Roman Urdu
// anywhere in this template. The per-message conditional "Respond in
// Roman Urdu" instructions (chatSystemText / agentSystemText) only fire
// when detectLang returns 'roman_urdu' — those are correct and stay.
function defaultPersonalityTemplate() {
  return '# PERSONALITY — how this user talks (mirror the STYLE, never the opinions)\n' +
'\n' +
'## Language\n' +
'- Primary: English.\n' +
'- Reply in the user\'s language ONLY when the user writes in that language. Otherwise, always use English (the model\'s natural language).\n' +
'- Never reply in Urdu script unless the user writes in Urdu script.\n' +
'\n' +
'## Tone & style\n' +
'- Tone: casual, direct, playful; blunt corrections are welcome, no sugar-coating.\n' +
'- Formality: low. No corporate language, no filler openers ("Great question!").\n' +
'- Sentence length: short. Default 1–3 sentences unless depth is asked for.\n' +
'- Structure: result first, then a short explanation; bullet lists for options.\n' +
'\n' +
'## NEVER mirror (standing guardrails — these override the style above)\n' +
'- Never mirror rudeness, insults, or sarcasm aimed at a person.\n' +
'- Never mirror the user\'s political, religious, or ideological views.\n' +
'- Never mirror overconfidence or absolute statements ("definitely", "100%").\n' +
'- Never agree with a fact or a plan just to please the user; correct them plainly.\n' +
'- Never help with illegal or wrong work. The safety rules always win over this profile.\n' +
'\n' +
'## Style examples (2–3 short exchanges)\n' +
'- User: "What is this?" → Good reply: short, direct, in English, result first.\n' +
'- User: "Explain it" → Good reply: short, direct, in English, result first.\n' +
'\n' +
'## Likes & dislikes (from feedback)\n' +
'- (none yet — added from the user\'s reactions)\n';
}

// PERSONALITY auto-update (no approval — ali's order, 2026-11-05). The agent calls
// this when it notices a repeated style pattern (2–3 observations). The user sees
// only the small "updating personality" status while it runs. The change is recorded
// in the trait's evidence and in the daily dated log (the adopt.md ledger is
// approval-gated by code, so auto-updates are recorded here instead — same audit
// trail, no bypass of the approval gate).
// HARD GUARDRAIL: a trait that would mirror rudeness, insults, sarcasm aimed at a
// person, political/religious/ideological views, overconfidence, or anything
// illegal or wrong is REFUSED and never written. The NEVER mirror block and
// RULES.md always win over the personality slice.
function updatePersonalityTrait(dir, trait, evidence) {
  const clean = String(trait || '').trim().slice(0, 300);
  const ev = String(evidence || '').trim().slice(0, 300);
  if (!clean) return { ok: false, error: 'empty trait' };
  if (/api[_-]?key|password|passwd|token|secret|sk-[A-Za-z0-9]|bearer/i.test(clean)) return { ok: false, error: 'never save secrets in the personality profile' };
  if (/rude|insult|swear|curse|sarcas|mock|hate|racist|sexist|politic|religio|ideolog|definitely|100%|always right|illegal|hack|steal|cheat|scam|fraud|harm|kill|violence|weapon|drug/i.test(clean)) return { ok: false, error: 'refused — personality traits never mirror rudeness, opinions, overconfidence, or wrongdoing' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'PERSONALITY.md');
    let lines = [];
    if (fs.existsSync(p)) lines = fs.readFileSync(p, 'utf8').split('\n');
    const norm = clean.toLowerCase();
    if (lines.some(l => l.trim().toLowerCase().replace(/^-\s*/, '') === norm)) return { ok: true, duplicate: true };
    const day = new Date();
    const dayStr = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
    const bullet = '- ' + clean + (ev ? ' (evidence: ' + ev + ', ' + dayStr + ')' : ' (' + dayStr + ')');
    let sectionIdx = -1;
    for (let i = 0; i < lines.length; i++) { if (/^##\s+(Learned traits|Tone & style)/i.test(lines[i])) { sectionIdx = i; break; } }
    if (sectionIdx === -1) {
      lines = defaultPersonalityTemplate().split('\n');
      for (let i = 0; i < lines.length; i++) { if (/^##\s+Tone & style/i.test(lines[i])) { sectionIdx = i; break; } }
    }
    let insertAt = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) { if (/^##\s+/.test(lines[i])) { insertAt = i; break; } }
    lines.splice(insertAt, 0, bullet);
    // Cap: keep at most 30 learned-trait bullets (oldest dropped first).
    // The NEVER mirror block is a separate section and is never touched.
    let traitIdx = [];
    let inTraitSection = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) inTraitSection = /^##\s+(Learned traits|Tone & style)/i.test(lines[i]);
      if (inTraitSection && /^-\s/.test(lines[i]) && /\(evidence:|\d{4}-\d{2}-\d{2}\)/.test(lines[i])) traitIdx.push(i);
    }
    if (traitIdx.length > 30) {
      const drop = traitIdx.slice(0, traitIdx.length - 30).sort((a, b) => b - a);
      drop.forEach(i => lines.splice(i, 1));
    }
    fs.writeFileSync(p, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
    // Dated audit log (never pruned): the auto-update is recorded, not approved.
    try {
      const stamp = dayStr + ' ' + String(day.getHours()).padStart(2, '0') + ':' + String(day.getMinutes()).padStart(2, '0');
      fs.appendFileSync(path.join(dir, dayStr + '.md'), stamp + ' | personality auto-update: ' + clean + '\n', 'utf8');
    } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false, error: 'could not write personality file' }; }
}

// Forget one personality trait (user-initiated). Dated audit kept in FORGOTTEN.md,
// same pattern as forgetMemoryFact.
function forgetPersonalityTrait(dir, trait) {
  const clean = String(trait || '').trim();
  if (!clean) return { removed: false };
  try {
    const p = path.join(dir, 'PERSONALITY.md');
    if (!fs.existsSync(p)) return { removed: false };
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    const idx = lines.findIndex(l => l.trim().toLowerCase().indexOf(clean.toLowerCase()) !== -1 && /^-\s/.test(l.trim()));
    if (idx === -1) return { removed: false };
    const removed = lines[idx];
    lines.splice(idx, 1);
    fs.writeFileSync(p, lines.join('\n'), 'utf8');
    try { fs.appendFileSync(path.join(dir, 'FORGOTTEN.md'), removed.trim() + '\n', 'utf8'); } catch (e) {}
    return { removed: true };
  } catch (e) { return { removed: false }; }
}

function searchMemory(dir, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const all = [];
  const files = ['MEMORY.md', 'RULES.md', 'RUNS.md'];
  try { fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().forEach(f => files.push(f)); } catch (e) {}
  // Priority: current MEMORY/RULES first, then RUNS, then dated audit (newest dated slightly higher, still below RUNS).
  const baseFor = (f, fi) => {
    if (f === 'MEMORY.md') return 40000;
    if (f === 'RULES.md') return 30000;
    if (f === 'RUNS.md') return 20000;
    return 10000 + (fi - 3) * 100;
  };
  let forgottenList = [];
  try { const fp = path.join(dir, 'FORGOTTEN.md'); if (fs.existsSync(fp)) forgottenList = fs.readFileSync(fp, 'utf8').split('\n').filter(x => x.trim()); } catch (e) {}
  files.forEach((f, fi) => {
    try {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) return;
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, li) => {
        if (l.toLowerCase().indexOf(q) === -1) return;
        if (forgottenList.some(o => l.toLowerCase().indexOf(o.toLowerCase()) !== -1)) return;
        all.push({ text: l.trim(), score: baseFor(f, fi) + li });
      });
    } catch (e) {}
  });
  // Recency first (newest wins), then MMR diversity: skip near-duplicates.
  all.sort((a, b) => b.score - a.score);
  const selected = [];
  const wordsOf = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2));
  for (const h of all) {
    if (selected.length >= 10) break;
    const ws = wordsOf(h.text);
    let dup = false;
    for (const s of selected) {
      const sw = wordsOf(s.text);
      let inter = 0; ws.forEach(w => { if (sw.has(w)) inter++; });
      const denom = Math.min(ws.size, sw.size) || 1;
      if (inter / denom > 0.7) { dup = true; break; }
    }
    if (!dup) selected.push(h);
  }
  return selected.map(h => h.text);
}

function supersedeMemoryFact(dir, oldText, newFact) {
  const old = String(oldText || '').trim();
  const clean = String(newFact || '').trim().slice(0, 500);
  if (!old || !clean) return { ok: false, error: 'old and new fact required' };
  if (/api[_-]?key|password|passwd|token|secret|sk-[A-Za-z0-9]|bearer/i.test(clean)) return { ok: false, error: 'never save secrets (keys, passwords, tokens) in memory' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'MEMORY.md');
    let lines = [];
    if (fs.existsSync(p)) lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
    const idx = lines.findIndex(l => l.toLowerCase().indexOf(old.toLowerCase()) !== -1 && !isSupersededLine(l));
    if (idx === -1) return { ok: false, error: 'old fact not found in MEMORY.md' };
    const original = lines[idx];
    lines[idx] = ('SUPERSEDED: ' + original + ' -> replaced by: ' + clean).slice(0, 1000);
    fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');
    const saved = saveMemoryFact(dir, clean);
    try {
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      fs.appendFileSync(path.join(dir, day + '.md'), day + ' | SUPERSEDED: ' + original + ' -> ' + clean + '\n', 'utf8');
    } catch (e) {}
    return { ok: true, saved: saved.ok };
  } catch (e) { return { ok: false, error: 'could not write memory file' }; }
}

function forgetMemoryFact(dir, factText) {
  const q = String(factText || '').trim().toLowerCase();
  if (!q) return { ok: false, error: 'fact required' };
  try {
    let removed = false;
    ['MEMORY.md', 'RULES.md'].forEach(f => {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) return;
      const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
      const kept = lines.filter(l => l.toLowerCase().indexOf(q) === -1);
      if (kept.length !== lines.length) { removed = true; fs.writeFileSync(p, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8'); }
    });
    // Forgotten list: search/load filter these out even from dated audit files (audit files stay on disk, but are never injected or searched).
    if (removed) {
      try {
        const fp = path.join(dir, 'FORGOTTEN.md');
        let fl = [];
        if (fs.existsSync(fp)) fl = fs.readFileSync(fp, 'utf8').split('\n').filter(x => x.trim());
        if (fl.indexOf(q) === -1) { fl.push(q); fs.writeFileSync(fp, fl.join('\n') + '\n', 'utf8'); }
      } catch (e) {}
    }
    return { ok: removed, removed: removed };
  } catch (e) { return { ok: false, error: 'could not write memory file' }; }
}

// MEMORY REVIEW (Hermes-style background review, 2026-11-05, adapted to RedCat).
// After a top-level run completes, a short model call replays a COMPACT DIGEST of
// the run (task, tools used, user corrections, final reply) and decides what is
// worth remembering — so the agent gets better for the user every time. This is
// the "1000% memory" loop: do -> record -> remember -> improve.
// - NO approval (ali's order, like the personality auto-update). The user sees
//   only the small "updating memory" status (activityStep label) while it runs.
// - Writes go through saveMemoryFact (secrets blocked, dedup, caps) — the review
//   can NEVER store a secret, and it can NEVER override RULES.md or safety.
// - The review's tokens are NOT counted in the task's usage line (usageSink null)
//   — they are a small background cost, recorded only in the run log.
// - Best-effort: any failure (model error, bad JSON, timeout) is logged to the
//   run log and the review is skipped. It NEVER blocks or breaks the reply.
const MEMORY_REVIEW_TIMEOUT_MS = 30000;
const MEMORY_REVIEW_PROMPT =
'You are reviewing a completed task for a personal AI agent. Decide what is worth remembering so the agent is better for the user next time. Be ACTIVE — most completed tasks produce at least one durable fact, but a trivial chat produces none.\n' +
'Reply ONLY as JSON, no other text: {"facts": [{"target": "memory" or "user", "text": "..."}], "runRecord": "one line: what was done, what worked, what the user liked or corrected"}\n' +
'RULES:\n' +
'- A fact must be DURABLE and CHECKABLE: a user preference, a decision, a lesson learned, a correction, or a project/environment fact. Keep each fact under 200 characters. At most 3 facts.\n' +
'- Route each fact to exactly one target: "user" = who the user is (preferences, communication style, expectations); "memory" = environment, work, lessons, decisions. Never both.\n' +
'- NEVER save: secrets (API keys, passwords, tokens), environment-dependent failures (missing binaries, unconfigured credentials), negative claims about tools ("X does not work"), transient errors that resolved, one-off task narratives, unresolved failures written as if they worked, raw data or log dumps, or anything already in the run system prompt. The agent\'s own output format/protocol (JSON tool calls, reply format) is NOT a user preference — never save it as one.\n' +
'- Do not save a fact that is already in the CURRENT MEMORY below, even in different words — only save NEW facts.\n' +
'- If nothing is durable, reply {"facts": [], "runRecord": ""}.\n' +
'The completed run follows. Review it and reply ONLY as JSON.';

function parseMemoryReviewJson(text) {
  try {
    const t = String(text || '');
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const obj = JSON.parse(t.slice(start, end + 1));
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (e) { return null; }
}

function buildMemoryReviewDigest(run, outcome) {
  try {
    const parts = [];
    const hist = Array.isArray(run.history) ? run.history : [];
    const isUserMsg = (m) => m && m.role === 'user' && typeof m.content === 'string' && !String(m.content).startsWith('Tool result');
    const firstUser = hist.find(isUserMsg);
    if (firstUser) parts.push('TASK: ' + String(firstUser.content).replace(/\s+/g, ' ').slice(0, 400));
    const tools = Array.isArray(run.recentTools) ? run.recentTools.slice(-12) : [];
    if (tools.length) parts.push('TOOLS USED: ' + tools.join(' | ').slice(0, 500));
    const denies = (run.approvalAudit || []).filter(a => a && a.decision === 'deny');
    if (denies.length) parts.push('USER CORRECTIONS: the user denied ' + denies.length + ' action(s): ' + denies.map(a => (a.tool || '') + ' ' + (a.command || '')).join(' | ').slice(0, 300));
    const userMsgs = hist.filter(isUserMsg).slice(-3);
    userMsgs.forEach((m) => { if (m !== firstUser) parts.push('USER SAID: ' + String(m.content).replace(/\s+/g, ' ').slice(0, 300)); });
    // Strip the token-usage line (appended to the reply before the review runs).
    let fin = String((outcome && outcome.text) || '').replace(/Tokens used:.*$/s, '').replace(/\s+/g, ' ').trim();
    if (fin) parts.push('FINAL REPLY: ' + fin.slice(0, 600));
    return parts.join('\n').slice(0, 2500);
  } catch (e) { return ''; }
}

// When MEMORY.md is full, make room in code (Hermes: consolidate, never silently
// drop). Removes the oldest non-RULE, non-USER entries (10 at a time) and records
// the consolidation in the dated log so it is auditable, never silent.
function consolidateMemoryForReview(dir) {
  try {
    const p = path.join(dir, 'MEMORY.md');
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
    if (lines.length < 200) return;
    const kept = [];
    let removed = 0;
    for (const l of lines) {
      const t = l.trim();
      if (removed < 10 && !/^RULE:/i.test(t) && !/^USER:/i.test(t)) { removed++; continue; }
      kept.push(l);
    }
    fs.writeFileSync(p, kept.join('\n') + '\n', 'utf8');
    try {
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      fs.appendFileSync(path.join(dir, day + '.md'), day + ' | memory consolidated: removed ' + removed + ' oldest entries to make room (never silently dropped — recorded here).\n', 'utf8');
    } catch (e) {}
  } catch (e) {}
}

async function runMemoryReview(run, outcome, onProgress) {
  try {
    if (!run || (run.depth || 0) !== 0) return;
    if (!run.provider || !run.model) return;
    // Gate: skip trivial runs (no tools, short reply, no correction) — nothing
    // worth remembering, and no extra model call for a "hi" chat.
    const tools = Array.isArray(run.recentTools) ? run.recentTools : [];
    const finText = String((outcome && outcome.text) || '');
    const corrected = (run.denyCount || 0) > 0 || (run.approvalAudit || []).some(a => a && a.decision === 'deny');
    if (!tools.length && finText.length < 200 && !corrected) return;
    let digest = buildMemoryReviewDigest(run, outcome);
    if (!digest) return;
    // Hermes read-before-write: show the review the CURRENT memory so it does
    // not re-save a fact that is already there (even in different words).
    try {
      const memPath = path.join(memoryDir(), 'MEMORY.md');
      if (fs.existsSync(memPath)) {
        const cur = fs.readFileSync(memPath, 'utf8').split('\n').filter(l => { const t = l.trim(); return t && !t.startsWith('#') && t !== '(No facts recorded yet.)'; }).join('\n').slice(0, 800);
        if (cur) digest = (digest + '\nCURRENT MEMORY (do not re-save these, even in different words):\n' + cur).slice(0, 3000);
      }
    } catch (e) {}
    if (onProgress) { try { onProgress('memory_review', {}, ''); } catch (e) {} }
    const reviewText = await Promise.race([
      callChatModel(run.provider, run.model, run.key, MEMORY_REVIEW_PROMPT, [{ role: 'user', content: digest }], null),
      new Promise((_, rej) => setTimeout(() => rej(new Error('memory review timed out')), MEMORY_REVIEW_TIMEOUT_MS))
    ]);
    const parsed = parseMemoryReviewJson(reviewText);
    if (!parsed) {
      try { appendLogEvent(run, 'memory/review', { result: 'no usable facts (unparseable reply)' }); } catch (e) {}
      return;
    }
    const facts = Array.isArray(parsed.facts) ? parsed.facts.slice(0, 3) : [];
    let saved = 0;
    for (const f of facts) {
      if (!f || typeof f.text !== 'string') continue;
      let text = String(f.text).trim().slice(0, 200);
      if (!text) continue;
      // RedCat keeps one curated store (MEMORY.md); user-profile facts carry a
      // "USER:" prefix so they stay distinguishable and searchable (Hermes's
      // USER.md target, adapted — the personality system handles style separately).
      if (f.target === 'user') text = 'USER: ' + text;
      let s = saveMemoryFact(memoryDir(), text);
      if (!s.ok && /full/i.test(String(s.error || ''))) {
        consolidateMemoryForReview(memoryDir());
        s = saveMemoryFact(memoryDir(), text);
      }
      if (s.ok && !s.duplicate) saved++;
    }
    const record = (typeof parsed.runRecord === 'string' && parsed.runRecord.trim()) ? String(parsed.runRecord).slice(0, 300) : '';
    try { appendLogEvent(run, 'memory/review', { saved: saved, runRecord: record }); } catch (e) {}
  } catch (e) {
    try { appendLogEvent(run, 'memory/review', { result: 'failed', error: String((e && e.message) || e).slice(0, 120) }); } catch (e2) {}
  }
}

function logAgentRun(dir, task, outcome) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'RUNS.md');
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const line = stamp + ' | task: ' + String(task || '').replace(/\s+/g, ' ').slice(0, 100) + ' | outcome: ' + String(outcome || '').replace(/\s+/g, ' ').slice(0, 100);
    let lines = [];
    if (fs.existsSync(p)) lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
    lines.push(line);
    if (lines.length > 100) lines = lines.slice(lines.length - 100);
    fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');
  } catch (e) {}
}

function runsDir() { return path.join(__dirname, 'runs'); }

// 7-POINTS (2) SPEC.md — the approved plan, saved by CODE (not by the model)
// into the run workspace runs/<runId>/SPEC.md, before any code write runs.
function writeSpecFile(run, plan) {
  try {
    const lines = [];
    lines.push('# SPEC - ' + String((plan && plan.goal) || run.id));
    lines.push('');
    lines.push('Approved: ' + new Date().toISOString());
    lines.push('');
    lines.push('## Goal');
    lines.push(String((plan && plan.goal) || ''));
    lines.push('');
    lines.push('## Steps');
    ((plan && plan.steps) || []).forEach((st, i) => lines.push((i + 1) + '. ' + st));
    lines.push('');
    lines.push('## Facts needed');
    ((plan && plan.facts_needed) || []).forEach(f => lines.push('- ' + f));
    lines.push('');
    const dir = path.join(runsDir(), String(run.id).replace(/[^A-Za-z0-9\-]/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'SPEC.md');
    fs.writeFileSync(p, lines.join('\n'), 'utf8');
    return p;
  } catch (e) { return ''; }
}

function runFilePath(id) { return path.join(runsDir(), String(id).replace(/[^A-Za-z0-9\-]/g, '') + '.json'); }

function serializeRun(run) {
  return { id: run.id, chatId: run.chatId || '', provider: run.provider, model: run.model, lang: run.lang || 'en', history: run.history, pendingApproval: run.pendingApproval || null, approvalAudit: run.approvalAudit || [], policy: run.policy || 'ask', plan: run.plan || null, planApproved: !!run.planApproved, planMode: !!run.planMode, sandboxMode: run.sandboxMode || 'full', goal: run.goal || null, depth: run.depth || 0, maxSteps: run.maxSteps || 0, allowedTools: run.allowedTools || null, childCount: run.childCount || 0, evidenceCount: Array.isArray(run.evidence) ? run.evidence.length : 0, specPath: run.specPath || '', specApproved: !!run.specApproved, role: run.role || '', todos: run.todos || [], recentTools: run.recentTools || [], usage: run.usage || null, providerStates: run.providerStates || null, step: run.step || 0, status: run.status || 'active', task: run.history && run.history[0] ? String(run.history[0].content).slice(0, 120) : '', updatedAt: new Date().toISOString() };
}

function saveRun(run) {
  try {
    fs.mkdirSync(runsDir(), { recursive: true });
    const tmp = runFilePath(run.id) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(serializeRun(run)), 'utf8');
    fs.renameSync(tmp, runFilePath(run.id));
    const files = fs.readdirSync(runsDir()).filter(f => f.endsWith('.json'));
    if (files.length > 50) {
      const withTime = files.map(f => ({ f: f, t: fs.statSync(path.join(runsDir(), f)).mtimeMs })).sort((a, b) => a.t - b.t);
      withTime.slice(0, withTime.length - 50).forEach(x => { try { fs.unlinkSync(path.join(runsDir(), x.f)); } catch (e) {} try { fs.unlinkSync(path.join(runsDir(), x.f.replace(/\.json$/, '.jsonl'))); } catch (e) {} });
    try {
      const jsons = new Set(fs.readdirSync(runsDir()).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
      fs.readdirSync(runsDir()).filter(f => f.endsWith('.jsonl')).forEach(f => { if (!jsons.has(f.replace(/\.jsonl$/, ''))) { try { fs.unlinkSync(path.join(runsDir(), f)); } catch (e) {} } });
    } catch (e) {}
    }
  } catch (e) {}
}
// --- Scheduled tasks (DSH-style durable record, client pickup delivery) ---
// Keys live in the browser, never on the server, so the server cannot run the
// agent itself when the browser is closed. The server owns the schedule record
// and due computation; the client picks due items up (poll + chat switch) and
// runs them through the normal agent path. A missed recurring occurrence is
// delivered ONCE (the latest), then the next slot is computed - downtime never
// queues a backlog.
let scheduleSeq = 0;
function schedulesFile() { return path.join(__dirname, 'schedules.json'); }
function loadSchedules() {
  try {
    const p = schedulesFile();
    if (!fs.existsSync(p)) return [];
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}
function saveSchedules(list) {
  try {
    const tmp = schedulesFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list), 'utf8');
    fs.renameSync(tmp, schedulesFile());
    return true;
  } catch (e) { return false; }
}
function cronFieldMatch(field, value, min, max) {
  const parts = String(field).split(',');
  for (const part of parts) {
    let range = part, step = 1;
    if (part.indexOf('/') !== -1) { const sp = part.split('/'); range = sp[0]; step = parseInt(sp[1], 10); if (!step || step < 1) return false; }
    let lo, hi;
    if (range === '*') { lo = min; hi = max; }
    else if (range.indexOf('-') !== -1) { const r = range.split('-'); lo = parseInt(r[0], 10); hi = parseInt(r[1], 10); if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) return false; }
    else { lo = parseInt(range, 10); hi = lo; if (isNaN(lo) || lo < min || lo > max) return false; }
    for (let v = lo; v <= hi; v += step) { if (v === value) return true; }
  }
  return false;
}
function cronMatches(expr, date) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) return false;
  const dow = date.getDay();
  const DOW_ALIAS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
  const dowField = f[4].replace(/[A-Za-z]+/g, w => (DOW_ALIAS[w.toLowerCase()] !== undefined ? String(DOW_ALIAS[w.toLowerCase()]) : w));
  return cronFieldMatch(f[0], date.getMinutes(), 0, 59) &&
    cronFieldMatch(f[1], date.getHours(), 0, 23) &&
    cronFieldMatch(f[2], date.getDate(), 1, 31) &&
    cronFieldMatch(f[3], date.getMonth() + 1, 1, 12) &&
    (cronFieldMatch(dowField, dow, 0, 7) || (dow === 0 && cronFieldMatch(dowField, 7, 0, 7)));
}
function nextCronTime(expr, fromMs) {
  let t = new Date(fromMs + 60000);
  t.setSeconds(0, 0);
  const limit = fromMs + 366 * 24 * 60 * 60 * 1000;
  while (t.getTime() <= limit) {
    if (cronMatches(expr, t)) return t.getTime();
    t = new Date(t.getTime() + 60000);
  }
  return null;
}
function parseHHMM(s) {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(String(s || '').trim());
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}
function nextDailyTime(spec, fromMs) {
  const d = new Date(fromMs);
  d.setHours(spec.hour, spec.minute, 0, 0);
  if (d.getTime() <= fromMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function nextWeeklyTime(spec, fromMs) {
  const d = new Date(fromMs);
  d.setHours(spec.hour, spec.minute, 0, 0);
  let add = (spec.dow - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= fromMs) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}
function advanceSchedule(item, nowMs) {
  if (!item.recurring) { item.active = false; return false; }
  if (item.kind === 'every_seconds') { item.nextAt = nowMs + item.spec.seconds * 1000; return true; }
  if (item.kind === 'daily') { item.nextAt = nextDailyTime(item.spec, nowMs); return true; }
  if (item.kind === 'weekly') { item.nextAt = nextWeeklyTime(item.spec, nowMs); return true; }
  if (item.kind === 'cron') { const n = nextCronTime(item.spec.expr, nowMs); if (!n) { item.active = false; return false; } item.nextAt = n; return true; }
  item.active = false; return false;
}
function parseScheduleArgs(a) {
  const title = String(a.title || '').trim();
  const prompt = String(a.prompt || '').trim();
  const kind = String(a.kind || '').trim();
  if (!title || title.length > 120) return { ok: false, error: 'Title must be 1-120 characters.' };
  if (!prompt) return { ok: false, error: 'Prompt must not be empty.' };
  const nowMs = Date.now();
  if (kind === 'after_seconds' || kind === 'every_seconds') {
    const seconds = parseInt(a.value, 10);
    if (!seconds || seconds < 1) return { ok: false, error: 'Value must be seconds (a number above 0).' };
    if (kind === 'every_seconds' && seconds < 60) return { ok: false, error: 'Repeating interval must be at least 60 seconds.' };
    return { ok: true, kind: kind, spec: { seconds: seconds }, recurring: kind === 'every_seconds', firstNext: nowMs + seconds * 1000 };
  }
  if (kind === 'at') {
    const atMs = Date.parse(a.value);
    if (!atMs) return { ok: false, error: 'Value must be a date and time, for example 2026-10-30 09:00.' };
    if (atMs <= nowMs) return { ok: false, error: 'That time is in the past. Pick a future time.' };
    return { ok: true, kind: kind, spec: { atMs: atMs }, recurring: false, firstNext: atMs };
  }
  if (kind === 'daily') {
    const spec = parseHHMM(a.value);
    if (!spec) return { ok: false, error: 'Daily value must be HH:MM (24-hour), for example 09:00.' };
    return { ok: true, kind: kind, spec: spec, recurring: true, firstNext: nextDailyTime(spec, nowMs) };
  }
  if (kind === 'weekly') {
    const m = /^([A-Za-z]{3})\s+([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(String(a.value || '').trim());
    if (!m) return { ok: false, error: 'Weekly value must look like "Mon 09:00".' };
    const dow = WEEKDAYS[m[1].toLowerCase()];
    if (dow === undefined) return { ok: false, error: 'Weekly day must be Mon, Tue, Wed, Thu, Fri, Sat or Sun.' };
    const spec = { dow: dow, hour: parseInt(m[2], 10), minute: parseInt(m[3], 10) };
    return { ok: true, kind: kind, spec: spec, recurring: true, firstNext: nextWeeklyTime(spec, nowMs) };
  }
  if (kind === 'cron') {
    const expr = String(a.value || '').trim();
    const f = expr.split(/\s+/);
    if (f.length !== 5) return { ok: false, error: 'Cron value must have 5 fields: minute hour day month weekday, for example "30 9 * * Mon".' };
    const first = nextCronTime(expr, nowMs);
    if (!first) return { ok: false, error: 'That cron pattern never matches a real time.' };
    return { ok: true, kind: kind, spec: { expr: expr }, recurring: true, firstNext: first };
  }
  return { ok: false, error: 'Kind must be after_seconds, at, every_seconds, daily, weekly, or cron.' };
}
function createSchedule(chatId, a) {
  const p = parseScheduleArgs(a);
  if (!p.ok) return p;
  const list = loadSchedules();
  const own = list.filter(s => s.chatId === chatId && s.active);
  if (own.length >= 50) return { ok: false, error: 'This chat already has 50 active schedules. Delete one first.' };
  const item = { id: 'sch-' + Date.now() + '-' + (++scheduleSeq), chatId: chatId, title: String(a.title).trim(), prompt: String(a.prompt).trim(), kind: p.kind, value: String(a.value), spec: p.spec, recurring: p.recurring, nextAt: p.firstNext, active: true, createdAt: new Date().toISOString() };
  list.push(item);
  if (!saveSchedules(list)) return { ok: false, error: 'Could not save the schedule.' };
  return { ok: true, item: scheduleView(item) };
}
function scheduleView(s) {
  return { id: s.id, title: s.title, kind: s.kind, value: s.value, recurring: !!s.recurring, active: !!s.active, nextAt: s.nextAt, nextAtText: s.nextAt ? new Date(s.nextAt).toLocaleString() : '' };
}
function listSchedulesForChat(chatId) {
  return loadSchedules().filter(s => s.chatId === chatId && s.active).sort((x, y) => x.nextAt - y.nextAt).map(scheduleView);
}
function dueSchedulesForChat(chatId) {
  const nowMs = Date.now();
  return loadSchedules().filter(s => s.chatId === chatId && s.active && s.nextAt <= nowMs).sort((x, y) => x.nextAt - y.nextAt).map(scheduleView);
}
function ackSchedule(id) {
  const list = loadSchedules();
  const item = list.find(s => s.id === id);
  if (!item) return { ok: false, error: 'Schedule not found.' };
  const nowMs = Date.now();
  advanceSchedule(item, nowMs);
  if (!saveSchedules(list)) return { ok: false, error: 'Could not save.' };
  return { ok: true, item: scheduleView(item) };
}
function deleteSchedule(id, chatId) {
  const list = loadSchedules();
  const idx = list.findIndex(s => s.id === id && s.chatId === chatId);
  if (idx === -1) return { ok: false, error: 'Schedule not found in this chat.' };
  list.splice(idx, 1);
  if (!saveSchedules(list)) return { ok: false, error: 'Could not save.' };
  return { ok: true };
}

function loadRunFromDisk(id) {
  try {
    const p = runFilePath(id);
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || !data.id) return null;
    return data;
  } catch (e) { return null; }
}

function listRuns() {
  try {
    if (!fs.existsSync(runsDir())) return [];
    return fs.readdirSync(runsDir()).filter(f => f.endsWith('.json')).map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(runsDir(), f), 'utf8'));
        return { id: d.id, chatId: d.chatId || '', task: d.task || '', status: d.status || '', step: d.step || 0, updatedAt: d.updatedAt || '', provider: d.provider || '', model: d.model || '' };
      } catch (e) { return null; }
    }).filter(Boolean).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch (e) { return []; }
}

function restoreRun(data, provider, model, key) {
  return { id: data.id, chatId: data.chatId || '', provider: provider || data.provider, model: model || data.model, key: key || '', lang: data.lang || 'en', history: Array.isArray(data.history) ? data.history : [], pendingApproval: data.pendingApproval || null, approvalAudit: Array.isArray(data.approvalAudit) ? data.approvalAudit : [], policy: data.policy || 'ask', plan: data.plan || null, planApproved: !!data.planApproved, planMode: !!data.planMode, sandboxMode: data.sandboxMode || 'full', goal: data.goal || null, depth: data.depth || 0, maxSteps: data.maxSteps || 0, allowedTools: data.allowedTools || null, childCount: data.childCount || 0, todos: Array.isArray(data.todos) ? data.todos : [], recentTools: Array.isArray(data.recentTools) ? data.recentTools : [], usage: (data.usage && typeof data.usage === 'object') ? data.usage : freshUsage(), providerStates: sanitizeProviderStates(data.providerStates), step: data.step || 0, status: 'active', cancelled: false, waitingForApproval: false, waitingForPlan: false, denyCount: 0, memoryText: loadMemoryText(memoryDir()), skillIndex: loadSkillsIndex() };
}

function getRunForDecision(runId, data) {
  let run = agentRuns[runId];
  if (!run) {
    const disk = loadRunFromDisk(runId);
    if (disk) { run = restoreRun(disk, String(data.provider || ''), String(data.model || ''), String(data.key || '')); agentRuns[runId] = run; }
  } else {
    if (data.provider) run.provider = String(data.provider);
    if (data.model) run.model = String(data.model);
    if (data.key) run.key = String(data.key);
  }
  return run || null;
}

function skillsDir() { return path.join(__dirname, 'skills'); }

let skillCatalogCache = { digest: '', index: '' };
function skillDescription(text) {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const m = /^description:\s*(.+)$/i.exec(lines[i].trim());
    if (m) return m[1].trim().slice(0, 500);
  }
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const m = /^when to use:\s*(.+)$/i.exec(lines[i].trim());
    if (m) return m[1].trim().slice(0, 500);
  }
  const para = [];
  let started = false;
  for (const l of lines) {
    const t = l.trim();
    if (!started) { if (!t || t.startsWith('#')) continue; started = true; }
    if (!t || t.startsWith('#')) break;
    para.push(t);
  }
  return para.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
// SKILLS-ADD (v1.0.12): cheap digest over BOTH skill dirs (bundled + user)
// plus the disabled/removed lists, so toggling or installing invalidates
// the catalog cache without reading every SKILL.md on every call.
function skillDirsDigest() {
  const parts = [];
  const scan = (root) => {
    if (!root || !fs.existsSync(root)) return;
    for (const d of fs.readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(root, d.name, 'SKILL.md');
      try { const st = fs.statSync(p); parts.push(d.name + ':' + st.mtimeMs + ':' + st.size); } catch (e) { parts.push(d.name + ':missing'); }
    }
  };
  scan(skillsDir());
  scan(skillAdd.userSkillsDir());
  parts.push('disabled:' + skillAdd.skillsDisabled().sort().join(','));
  parts.push('removed:' + skillAdd.skillsRemoved().sort().join(','));
  return parts.join('|');
}
function loadSkillsIndex() {
  try {
    const digest = skillDirsDigest();
    if (skillCatalogCache.digest === digest && skillCatalogCache.index) return skillCatalogCache.index;
    const all = skillAdd.listSkills(skillsDir(), skillAdd.userSkillsDir());
    const enabled = all.filter(s => s.enabled);
    if (!enabled.length) { skillCatalogCache = { digest: digest, index: '' }; return ''; }
    const parts = [];
    enabled.slice(0, 30).forEach(s => {
      try {
        const text = fs.readFileSync(path.join(s.origin === 'user' ? skillAdd.userSkillsDir() : skillsDir(), s.name, 'SKILL.md'), 'utf8');
        parts.push('- ' + s.name + ': ' + skillDescription(text) + (skillHasSideEffects(text) ? ' [side-effect skill: needs user approval before first use]' : ''));
      } catch (e) {}
    });
    const index = parts.join('\n').slice(0, 8000);
    skillCatalogCache = { digest: digest, index: index };
    return index;
  } catch (e) { return ''; }
}

function readSkill(name) {
  const clean = String(name || '').replace(/[^A-Za-z0-9\-]/g, '').slice(0, 64);
  if (!clean) return { ok: false, error: 'invalid skill name' };
  // SKILLS-ADD (v1.0.12): a disabled or removed skill is not readable — the
  // toggle is enforced here, not only in the catalog listing.
  if (skillAdd.skillsDisabled().indexOf(clean) !== -1) return { ok: false, error: 'skill is disabled: ' + clean };
  if (skillAdd.skillsRemoved().indexOf(clean) !== -1) return { ok: false, error: 'skill was removed: ' + clean };
  try {
    const userP = path.join(skillAdd.userSkillsDir(), clean, 'SKILL.md');
    if (fs.existsSync(userP)) return { ok: true, text: fs.readFileSync(userP, 'utf8').slice(0, 8000) };
    const p = path.join(skillsDir(), clean, 'SKILL.md');
    if (!fs.existsSync(p)) return { ok: false, error: 'no such skill: ' + clean };
    return { ok: true, text: fs.readFileSync(p, 'utf8').slice(0, 8000) };
  } catch (e) { return { ok: false, error: 'could not read skill' }; }
}

// 7-POINTS (4) SIDE-EFFECT SKILLS — a skill declares side effects with a
// "side_effects: true" line inside its first 12 lines. The catalog annotates
// flagged skills, and skill_read on a flagged skill needs user approval
// (unless the user already invoked it with /skillname). No shipped skill
// carries the marker today, so existing behaviour is unchanged.
function skillHasSideEffects(text) {
  try {
    const lines = String(text || '').split('\n');
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      if (/^side_effects:\s*(true|yes)\s*$/i.test(lines[i].trim())) return true;
    }
  } catch (e) {}
  return false;
}
function skillSideEffects(name) {
  const s = readSkill(name);
  return s.ok ? skillHasSideEffects(s.text) : false;
}
function saveSkill(name, when, content) {
  const clean = String(name || '').replace(/[^A-Za-z0-9\-]/g, '').slice(0, 64);
  const body = String(content || '').trim().slice(0, 3000);
  if (!clean || !body) return { ok: false, error: 'skill needs a name and content' };
  if (/api[_-]?key|password|passwd|token|secret|sk-[A-Za-z0-9]|bearer/i.test(body)) return { ok: false, error: 'never save secrets in a skill' };
  try {
    const dir = path.join(skillsDir(), clean);
    fs.mkdirSync(dir, { recursive: true });
    const text = '# ' + clean + '\n\nWhen to use: ' + String(when || '').trim().slice(0, 300) + '\n\n' + body + '\n';
    fs.writeFileSync(path.join(dir, 'SKILL.md'), text, 'utf8');
    return { ok: true };
  } catch (e) { return { ok: false, error: 'could not write skill' }; }
}

function parseDdgLite(html) {
  const out = [];
  // DDG Lite result links use single quotes (class='result-link') and the href
  // comes BEFORE the class, so a class-then-href double-quote regex never
  // matches them. Match the whole <a> tag, then extract href + title.
  // (Hermes pattern: a provider parser must match the provider's actual HTML.)
  const tagRe = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = tagRe.exec(html)) && out.length < 8) {
    const attrs = m[1];
    if (!/class\s*=\s*['"]result-link['"]/.test(attrs)) continue;
    const hrefM = /href\s*=\s*['"]([^'"]+)['"]/.exec(attrs);
    if (!hrefM) continue;
    let url = hrefM[1].trim();
    // DDG Lite wraps the real URL in a redirect: //duckduckgo.com/l/?uddg=<real-url>
    try { const u = new URL(url, 'https://duckduckgo.com'); const uddg = u.searchParams.get('uddg'); if (uddg) url = uddg; } catch (e) {}
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (url && title && !url.includes('duckduckgo.com')) out.push({ title: title, url: url, source: 'duckduckgo' });
  }
  return out;
}

function parseWikiSearch(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    const list = (data.query && data.query.search) || [];
    return list.slice(0, 8).map(s => ({ title: s.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(s.title.replace(/ /g, '_')), snippet: (s.snippet || '').replace(/<[^>]+>/g, ' '), source: 'wikipedia' }));
  } catch (e) { return []; }
}

function fetchText(urlString, timeoutMs, redirects) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlString); } catch (e) { resolve(''); return; }
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.get({ hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'text/html,application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (redirects === undefined || redirects > 0)) { res.resume(); try { const next = new URL(res.headers.location, urlString).toString(); fetchText(next, timeoutMs, (redirects === undefined ? 3 : redirects - 1)).then(resolve); } catch (e) { resolve(''); } return; }
      if (res.statusCode !== 200 && res.statusCode !== 202) { res.resume(); resolve(''); return; }
      let data = '';
      res.on('data', (chunk) => { data += chunk; if (data.length > 500000) { req.destroy(); } });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs || 15000, () => { req.destroy(); });
    req.on('error', () => resolve(''));
  });
}
function parseDdgHtml(html) {
  const out = [];
  // Same robustness as parseDdgLite: single or double quotes, href in either
  // order, and decode the uddg redirect to the real URL.
  const tagRe = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = tagRe.exec(html)) && out.length < 8) {
    const attrs = m[1];
    if (!/class\s*=\s*['"]result__a['"]/.test(attrs)) continue;
    const hrefM = /href\s*=\s*['"]([^'"]+)['"]/.exec(attrs);
    if (!hrefM) continue;
    let url = hrefM[1].trim();
    try { const u = new URL(url, 'https://duckduckgo.com'); const uddg = u.searchParams.get('uddg'); if (uddg) url = uddg; } catch (e) {}
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (url && title && !url.includes('duckduckgo.com')) out.push({ title: title, url: url, source: 'duckduckgo' });
  }
  return out;
}

async function webSearch(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return { ok: false, error: 'empty query' };
  // Search backends, in order (Hermes pattern: try the working backends first;
  // a failed backend is tried once and never becomes sticky; Wikipedia is the
  // LAST resort and is always labelled, never the silent default).
  // 1. DuckDuckGo Lite — the only server-side search that returns real results
  //    from this PC (it is intermittent: sometimes it returns a bot-check page).
  const ddg = await fetchText('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q), 15000);
  const results = parseDdgLite(ddg);
  if (results.length) return { ok: true, results: results, source: 'duckduckgo' };
  // 2. DuckDuckGo HTML — often bot-blocked from this PC, but cheap to try.
  const ddgHtml = await fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), 15000);
  const hresults = parseDdgHtml(ddgHtml);
  if (hresults.length) return { ok: true, results: hresults, source: 'duckduckgo' };
  // 3. Wikipedia API — LAST RESORT ONLY, always labelled. Wikipedia is an
  //    encyclopedia (background), never the source for a current or trending
  //    topic. The caller is told this explicitly (onlyWikipedia: true) so it
  //    escalates to the Browser panel (or asks the user) instead of settling
  //    for Wikipedia alone.
  const wiki = await fetchText('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(q) + '&format=json&srlimit=8', 15000);
  const wresults = parseWikiSearch(wiki);
  if (wresults.length) return { ok: true, results: wresults, source: 'wikipedia', onlyWikipedia: true };
  // All backends failed — honest failure, never a silent weak fallback.
  // The caller must go to the Browser panel or ask the user.
  return { ok: false, error: 'no_results' };
}

const agentRuns = {};
// VISION: server-memory-only image store (runId -> validated images).
// Images are NEVER written to run files or logs; the entry lives only for
// the run lifetime and is deleted on terminal outcomes (done/cancelled).
const visionStore = {};
let agentRunSeq = 0;
// 7-POINTS (7) KIMI K3 PIN — chatId -> model, in-memory only (cleared on
// server restart). A chat that started on a Kimi K3 model cannot switch
// models mid-session (see the pin check in /api/agent-chat).
const chatModelPins = {};

function activityStep(tool, args) {
  const a = args || {};
  const trunc = (s, n) => String(s || '').slice(0, n);
  if (tool === 'terminal_exec') {
    const cmd = String(a.command || '');
    if (/ffmpeg/i.test(cmd)) return { label: 'Rendering video', detail: trunc(cmd, 80) };
    if (/--screenshot/i.test(cmd)) return { label: 'Capturing frames', detail: trunc(cmd, 80) };
    const m = cmd.match(/>\s*"?([^"\s]+\.(html|css|js|json|md|py|bat|txt))/i);
    if (m) return { label: 'Writing ' + m[1].split(/\\|\//).pop(), detail: trunc(cmd, 80) };
    if (/^\s*mkdir\b/i.test(cmd)) return { label: 'Creating folder', detail: trunc(cmd, 80) };
    return { label: 'Running command', detail: trunc(cmd, 80) };
  }
  if (tool === 'skill_read') return { label: 'Reading skill: ' + trunc(a.name, 40), detail: '' };
  if (tool === 'skill_save') return { label: 'Saving skill: ' + trunc(a.name, 40), detail: '' };
  if (tool === 'skill_prepare') return { label: 'Preparing skill: ' + trunc(a.url || a.source || '', 40), detail: '' };
  if (tool === 'skill_install') return { label: 'Installing skill: ' + trunc(a.name || '', 40), detail: '' };
  if (tool === 'schedule_create') return { label: 'Creating reminder', detail: trunc(a.title, 60) };
  if (tool === 'schedule_list') return { label: 'Listing reminders', detail: '' };
  if (tool === 'schedule_delete') return { label: 'Deleting reminder', detail: trunc(a.id, 40) };
  if (tool === 'memory_save') return { label: 'Saving to memory', detail: trunc(a.fact, 60) };
  if (tool === 'memory_supersede') return { label: 'Updating memory (supersede)', detail: trunc(a.new, 60) };
  if (tool === 'memory_forget') return { label: 'Forgetting from memory', detail: trunc(a.fact, 60) };
  if (tool === 'personality_update') return { label: 'updating personality', detail: '' };
  if (tool === 'memory_review') return { label: 'updating memory', detail: '' };
  if (tool === 'model_switch') return { label: 'Switching model', detail: trunc((a.provider || '') + ' / ' + (a.model || ''), 80) };
  if (tool === 'memory_search') return { label: 'Searching memory', detail: trunc(a.query, 60) };
  if (tool === 'web_search') return { label: 'Searching the web', detail: trunc(a.query, 60) };
  if (tool === 'browser_read') return { label: 'Reading page', detail: trunc(a.url, 80) };
  if (tool === 'browser_read_js') return { label: 'Reading JS page', detail: trunc(a.url, 80) };
  if (tool === 'subagent_spawn') return { label: 'Building agent', detail: trunc(a.prompt, 60) };
  if (tool === 'browser_control') return { label: 'Controlling browser', detail: trunc(a.url, 80) };
  if (tool === 'browser_panel') return { label: 'Using the in-app browser', detail: trunc(a.action + (a.url ? ' ' + a.url : ''), 80) };
  if (tool === 'deep_read') return { label: 'Reading website deeply', detail: trunc(a.url, 80) };
  return { label: String(tool), detail: '' };
}

function resolveSlashSkill(run) {
  // Deterministic /name load: a genuine user message starting with /name loads
  // that skill full body into this run system prompt. Tool results also carry
  // role 'user' - never match those.
  try {
    const hist = run.history || [];
    let last = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      const m = hist[i];
      if (m && m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('Tool result')) { last = m.content; break; }
    }
    if (!last) return;
    const mm = /^\s*\/([A-Za-z0-9_-]+)(?:\s|$)/.exec(last);
    if (!mm) return;
    const name = mm[1];
    if (run.loadedSkillName === name && run.skillContent) return;
    const s = readSkill(name);
    if (!s.ok) return;
    run.loadedSkillName = name;
    run.skillContent = '<skill_content name="' + name + '">\n' + s.text + '\n</skill_content>';
  } catch (e) {}
}

let approvalSeq = 0;
function recordApprovalAsked(run, approval) {
  try {
    if (!run.approvalAudit) run.approvalAudit = [];
    const entry = { id: 'appr-' + Date.now() + '-' + (++approvalSeq), tool: approval.tool || 'terminal_exec', command: approval.command || '', cwd: approval.cwd || '', askedAt: new Date().toISOString(), decision: null, reason: '', decidedAt: '' };
    run.approvalAudit.push(entry);
    return entry;
  } catch (e) { return null; }
}
function recordApprovalDecided(run, decision, reason) {
  try {
    if (!run.approvalAudit) run.approvalAudit = [];
    for (let i = run.approvalAudit.length - 1; i >= 0; i--) {
      if (!run.approvalAudit[i].decision) {
        run.approvalAudit[i].decision = decision;
        run.approvalAudit[i].reason = String(reason || '').slice(0, 300);
        run.approvalAudit[i].decidedAt = new Date().toISOString();
        return run.approvalAudit[i];
      }
    }
    return null;
  } catch (e) { return null; }
}


// --- JSONL session log (DSH-style append-only log; the run file stays the resume state) ---
function runLogPath(runId) { return path.join(runsDir(), String(runId) + '.jsonl'); }
let logSeqCache = {};
function readLogEvents(runId) {
  try {
    const file = runLogPath(runId);
    if (!fs.existsSync(file)) return [];
    const out = [];
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { out.push(JSON.parse(l)); } catch (e) {}
    }
    return out;
  } catch (e) { return []; }
}
function appendLogEvent(run, type, data) {
  try {
    if (!run || !run.id) return 0;
    const file = runLogPath(run.id);
    let seq = logSeqCache[run.id];
    if (seq === undefined || !fs.existsSync(file)) {
      const evs = readLogEvents(run.id);
      seq = evs.length ? (evs[evs.length - 1].seq || 0) : 0;
    }
    seq += 1;
    logSeqCache[run.id] = seq;
    const event = { seq: seq, time: new Date().toISOString(), type: type, data: data || {} };
    try { Object.freeze(event.data); Object.freeze(event); } catch (e) {}
    fs.mkdirSync(runsDir(), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
    return seq;
  } catch (e) { return 0; }
}
function summarizeArgs(tool, args) {
  try {
    if (typeof args === 'string') return args.slice(0, 2000);
    const s = JSON.stringify(args || {});
    return s.length > 2000 ? s.slice(0, 2000) : s;
  } catch (e) { return ''; }
}
function pushToolResult(run, tool, args, content, ok) {
  run.history.push({ role: 'user', content: content });
  appendLogEvent(run, 'tool/result', { step: run.step || 0, tool: tool, args: summarizeArgs(tool, args), content: content, ok: !!ok });
  // 7-POINTS (1) VERIFY LOOP — tool evidence index (code-enforced): every tool
  // result is recorded in memory (bounded) and in the run log (runs/<id>.jsonl).
  // Final claims about checks/tests must quote this record (see EVIDENCE RULE
  // in the system prompt — prompt-level, the model may ignore it, but the
  // record itself is deterministic and auditable via run_info/session_trace).
  try {
    if (!Array.isArray(run.evidence)) run.evidence = [];
    run.evidence.push({ step: run.step || 0, tool: tool, ok: !!ok, excerpt: String(content || '').slice(0, 500) });
    if (run.evidence.length > 100) run.evidence.splice(0, run.evidence.length - 100);
  } catch (e) {}
}
function foldLogToHistory(events) {
  const history = [];
  for (const ev of (events || [])) {
    if (!ev || !ev.type) continue;
    if (ev.type === 'user/message') history.push({ role: 'user', content: String((ev.data || {}).content || '') });
    else if (ev.type === 'tool/result' && !(ev.data || {}).synthetic) history.push({ role: 'user', content: String((ev.data || {}).content || '') });
    else if (ev.type === 'loop/note') history.push({ role: 'user', content: String((ev.data || {}).content || '') });
    else if (ev.type === 'plan/decided' && (ev.data || {}).approved) history.push({ role: 'user', content: 'User approved this plan: ' + JSON.stringify((ev.data || {}).plan || {}) + '. Now execute it step by step, one tool at a time. In each thought, say which step you are on (for example Step 2/8).' });
    else if (ev.type === 'plan/decided' && !(ev.data || {}).approved) history.push({ role: 'user', content: 'User did NOT approve this plan. Ask briefly what to change, or propose a simpler plan.' });
  }
  return history;
}
function repairLog(run) {
  try {
    if (!run || !run.id) return;
    let events = readLogEvents(run.id);
    if (!events.length) {
      appendLogEvent(run, 'run/start', { migrated: true });
      appendLogEvent(run, 'log/migrated', { from: 'runs-json' });
      for (const h of (run.history || [])) {
        const c = String(h.content || '');
        if (c.indexOf('Tool result') === 0) appendLogEvent(run, 'tool/result', { step: run.step || 0, tool: 'unknown', args: '', content: c, ok: true });
        else appendLogEvent(run, 'user/message', { content: c, source: 'migrated' });
      }
      events = readLogEvents(run.id);
    }
    if (events.length && events[events.length - 1].type === 'turn/end') return;
    const open = [];
    for (const ev of events) {
      if (ev.type === 'tool/call') open.push(ev);
      else if (ev.type === 'tool/result') {
        for (let i = open.length - 1; i >= 0; i--) {
          if (open[i].data && open[i].data.step === (ev.data || {}).step && open[i].data.tool === (ev.data || {}).tool) { open.splice(i, 1); break; }
        }
      }
    }
    const unmatched = open.map(ev => ({ step: (ev.data || {}).step || 0, tool: (ev.data || {}).tool || '' }));
    appendLogEvent(run, 'log/repaired', { reason: 'interrupted', unmatched: unmatched });
    for (const ev of open) {
      appendLogEvent(run, 'tool/result', { step: (ev.data || {}).step || 0, tool: (ev.data || {}).tool || '', args: (ev.data || {}).args || '', content: '', ok: false, synthetic: true, error: 'interrupted before result' });
    }
    appendLogEvent(run, 'step/end', { step: run.step || 0, status: 'interrupted' });
    appendLogEvent(run, 'turn/end', { status: 'interrupted', reason: 'interrupted' });
  } catch (e) {}
}

function validateTodos(input) {
  if (!Array.isArray(input)) return { ok: false, error: 'todos must be an array of {content, status} items.' };
  if (input.length > 25) return { ok: false, error: 'todo list is limited to 25 items (got ' + input.length + ').' };
  const todos = [];
  let inProgress = 0;
  for (const item of input) {
    if (!item || typeof item.content !== 'string' || !item.content.trim()) return { ok: false, error: 'every todo needs a non-empty content string.' };
    const content = item.content.trim();
    if (content.length > 200) return { ok: false, error: 'todo content is limited to 200 characters: "' + content.slice(0, 40) + '..."' };
    const status = (item.status === undefined || item.status === null) ? 'pending' : String(item.status);
    if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') return { ok: false, error: 'todo status must be pending, in_progress, or completed (got "' + status + '").' };
    if (status === 'in_progress') inProgress++;
    if (inProgress > 1) return { ok: false, error: 'only one todo may be in_progress at a time.' };
    todos.push({ content: content, status: status });
  }
  return { ok: true, todos: todos };
}

function validRunId(runId) { return typeof runId === 'string' && /^[A-Za-z0-9_-]+$/.test(runId); }
function eventText(ev) {
  try { return JSON.stringify((ev || {}).data || {}); } catch (e) { return ''; }
}
function snippetAround(text, query, width) {
  const t = String(text || '');
  const q = String(query || '');
  if (!q) return t.slice(0, width || 120);
  const idx = t.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return '';
  const w = width || 120;
  const start = Math.max(0, idx - 30);
  const end = Math.min(t.length, idx + q.length + 60);
  let s = t.slice(start, end);
  if (start > 0) s = '...' + s;
  if (end < t.length) s = s + '...';
  return s;
}
function shortText(s, n) { const t = String(s || ''); return t.length > (n || 200) ? t.slice(0, n || 200) + '...' : t; }
function listSessionLogs() {
  try {
    if (!fs.existsSync(runsDir())) return [];
    const files = fs.readdirSync(runsDir()).filter(f => f.endsWith('.jsonl'));
    return files.map(f => {
      const id = f.replace(/\.jsonl$/, '');
      let events = 0;
      try { events = fs.readFileSync(path.join(runsDir(), f), 'utf8').split('\n').filter(l => l.trim()).length; } catch (e) {}
      let mtime = '';
      try { mtime = fs.statSync(path.join(runsDir(), f)).mtime.toISOString(); } catch (e) {}
      return { id: id, events: events, updatedAt: mtime };
    }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch (e) { return []; }
}
function searchSessionEvents(query, limit) {
  const q = String(query || '').trim();
  if (!q) return [];
  const max = Math.max(1, Math.min(50, Number(limit) || 20));
  const out = [];
  for (const s of listSessionLogs()) {
    if (out.length >= max) break;
    for (const ev of readLogEvents(s.id)) {
      if (out.length >= max) break;
      const text = eventText(ev);
      if (text.toLowerCase().indexOf(q.toLowerCase()) !== -1) {
        out.push({ runId: s.id, seq: ev.seq || 0, type: ev.type || '', snippet: snippetAround(text, q, 160) });
      }
    }
  }
  return out;
}
function surfaceSessions(query, limit) {
  const q = String(query || '').trim();
  if (!q) return [];
  const max = Math.max(1, Math.min(10, Number(limit) || 10));
  const meta = {};
  for (const r of listRuns()) meta[r.id] = r;
  const counts = {};
  for (const s of listSessionLogs()) {
    let n = 0;
    let last = '';
    for (const ev of readLogEvents(s.id)) {
      const text = eventText(ev);
      if (text.toLowerCase().indexOf(q.toLowerCase()) !== -1) { n++; last = snippetAround(text, q, 120); }
    }
    if (n > 0) counts[s.id] = { matches: n, lastSnippet: last };
  }
  return Object.keys(counts).map(id => ({ runId: id, task: (meta[id] && meta[id].task) || '', status: (meta[id] && meta[id].status) || 'unknown', updatedAt: (meta[id] && meta[id].updatedAt) || '', matches: counts[id].matches, snippet: counts[id].lastSnippet })).sort((a, b) => (b.matches - a.matches) || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, max);
}
function traceSession(runId) {
  const events = readLogEvents(runId);
  if (!events.length) return null;
  const lines = [];
  const pending = [];
  function flushCall(callEv, resultEv) {
    const c = callEv.data || {};
    const base = 'Tool ' + (c.tool || '') + ': ' + shortText(typeof c.args === 'string' ? c.args : JSON.stringify(c.args || ''), 100);
    if (!resultEv) lines.push(base + ' -> (no result - interrupted)');
    else {
      const r = resultEv.data || {};
      const res = r.synthetic ? '(synthetic - interrupted)' : (r.ok ? 'ok' : 'failed');
      lines.push(base + ' -> ' + res + (r.content ? ': ' + shortText(r.content, 150) : ''));
    }
  }
  for (const ev of events) {
    const d = ev.data || {};
    if (ev.type === 'run/start') lines.push('Run started' + (d.migrated ? ' (migrated from run file)' : ''));
    else if (ev.type === 'user/message') lines.push('User: ' + shortText(d.content, 200));
    else if (ev.type === 'model/reply') {
      if (d.thought) lines.push('Thought: ' + shortText(d.thought, 200));
      if (d.kind === 'final' && d.final) lines.push('Reply: ' + shortText(d.final, 300));
    }
    else if (ev.type === 'tool/call') pending.push(ev);
    else if (ev.type === 'tool/result') {
      let idx = -1;
      for (let i = pending.length - 1; i >= 0; i--) { if ((pending[i].data || {}).step === d.step && (pending[i].data || {}).tool === d.tool) { idx = i; break; } }
      if (idx >= 0) { const callEv = pending.splice(idx, 1)[0]; flushCall(callEv, ev); }
      else lines.push('Tool ' + (d.tool || '') + ' result (no matching call): ' + shortText(d.content, 150));
    }
    else if (ev.type === 'approval/asked') lines.push('Approval asked: ' + shortText(d.command, 100));
    else if (ev.type === 'approval/decided') lines.push('Approval ' + (d.decision || '') + (d.reason ? ' (' + shortText(d.reason, 100) + ')' : ''));
    else if (ev.type === 'plan/proposed') lines.push('Plan proposed: ' + shortText((d.plan && d.plan.goal) || '', 150));
    else if (ev.type === 'plan/decided') lines.push('Plan ' + (d.approved ? 'approved' : 'denied'));
    else if (ev.type === 'loop/note') lines.push('Note: ' + shortText(d.content, 150));
    else if (ev.type === 'log/repaired') lines.push('Log repaired after interruption (' + (((d.unmatched) || []).length) + ' unmatched)');
    else if (ev.type === 'turn/end') lines.push('Turn ended: ' + (d.status || '') + (d.reason && d.reason !== d.status ? ' (' + d.reason + ')' : ''));
  }
  for (const callEv of pending) flushCall(callEv, null);
  return lines;
}
function formatSessionEvent(ev) {
  const d = ev.data || {};
  if (ev.type === 'user/message') return '[' + (ev.seq || 0) + '] user/message: ' + shortText(d.content, 300);
  if (ev.type === 'tool/result') return '[' + (ev.seq || 0) + '] tool/result ' + (d.tool || '') + (d.ok ? ' ok' : ' failed') + ': ' + shortText(d.content, 200);
  if (ev.type === 'tool/call') return '[' + (ev.seq || 0) + '] tool/call ' + (d.tool || '') + ': ' + shortText(typeof d.args === 'string' ? d.args : JSON.stringify(d.args || ''), 200);
  return '[' + (ev.seq || 0) + '] ' + (ev.type || '') + ': ' + shortText(JSON.stringify(d), 300);
}

function commandEscapesWorkspace(command, root) {
  const win = path.win32;
  const base = win.resolve(String(root || ''));
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(command || ''))) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2]);
  for (const raw of tokens) {
    const tok = String(raw || '').trim();
    if (!tok || tok.indexOf('%') !== -1) continue;
    if (tok[0] === '/' || tok[0] === '-') continue;
    if (tok.indexOf('\\') === -1 && tok.indexOf('/') === -1) continue;
    let resolved;
    if (/^[A-Za-z]:[\\/]/.test(tok) || tok.startsWith('\\\\')) resolved = win.normalize(tok);
    else if (tok.indexOf('/') !== -1) resolved = win.resolve(base, tok.replace(/\//g, '\\'));
    else resolved = win.resolve(base, tok);
    const rel = win.relative(base, resolved);
    if (rel === '..' || rel.startsWith('..\\') || win.isAbsolute(rel)) return true;
  }
  return false;
}

function goalLine(goal) {
  if (!goal || !goal.text) return '';
  return 'CURRENT GOAL (' + (goal.status || 'active') + '): ' + goal.text + (goal.reason ? ' [' + goal.reason + ']' : '');
}
function userAskedGoalResume(run) {
  const hist = (run && run.history) || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].role !== 'user') continue;
    const c = String(hist[i].content || '');
    if (c.indexOf('Tool result') === 0) continue;
    const l = c.toLowerCase();
    return l.indexOf('resume the goal') !== -1 || l.indexOf('continue the goal') !== -1 || l.indexOf('unpause') !== -1 || l.indexOf('goal dobara shuru') !== -1 || l.indexOf('goal jaari') !== -1 || l.indexOf('goal continue') !== -1;
  }
  return false;
}
function goalPushHistory(goal, status, reason) {
  if (!goal.history) goal.history = [];
  goal.history.push({ status: status, reason: reason || '', at: new Date().toISOString() });
  if (goal.history.length > 20) goal.history = goal.history.slice(-20);
}
function formatGoal(goal) {
  if (!goal) return 'No goal set for this run.';
  let s = 'Goal: ' + goal.text + '\nStatus: ' + goal.status + (goal.reason ? '\nReason: ' + goal.reason : '') + '\nArmed: ' + (goal.status === 'active' ? 'yes' : 'no');
  if (goal.history && goal.history.length) s += '\nHistory: ' + goal.history.map(h => h.status + (h.reason ? ' (' + h.reason + ')' : '')).join(' -> ');
  return s;
}

function createKernel(entries) {
  const plugins = [];
  const tools = {};
  for (const entry of (Array.isArray(entries) ? entries : [])) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) throw new Error('Plugin entry must have a name.');
    if (plugins.some(p => p.name === entry.name)) throw new Error('Duplicate plugin name: ' + entry.name);
    const toolsList = Array.isArray(entry.tools) ? entry.tools : [];
    for (const t of toolsList) {
      if (!t || typeof t.name !== 'string' || typeof t.run !== 'function') throw new Error('Plugin ' + entry.name + ' has an invalid tool.');
      if (tools[t.name]) throw new Error('Duplicate tool name: ' + t.name);
      tools[t.name] = { plugin: entry.name, tool: t };
    }
    plugins.push(entry);
  }
  return { plugins: plugins, tools: tools, started: false, disposers: [] };
}
function startKernel(kernel, allServices) {
  const audit = [];
  const disposers = [];
  for (const p of kernel.plugins) {
    try {
      const needs = Array.isArray(p.needs) ? p.needs : [];
      const services = {};
      for (const n of needs) {
        if (!allServices || !(n in allServices)) throw new Error('Unknown service: ' + n);
        services[n] = allServices[n];
      }
      let disposer = null;
      if (typeof p.start === 'function') disposer = p.start(services) || null;
      if (disposer !== null && typeof disposer !== 'function') throw new Error('Plugin ' + p.name + ' start must return a disposer function or nothing.');
      if (disposer) disposers.push(disposer);
      audit.push({ name: p.name, tools: (p.tools || []).map(t => t.name), started: true });
    } catch (e) {
      audit.push({ name: p.name, tools: [], started: false, error: e.message });
      for (let i = disposers.length - 1; i >= 0; i--) { try { disposers[i](); } catch (e2) {} }
      throw new Error('Plugin startup failed at ' + p.name + ': ' + e.message);
    }
  }
  kernel.disposers = disposers;
  kernel.started = true;
  return audit;
}
function stopKernel(kernel) {
  const disposers = kernel.disposers || [];
  for (let i = disposers.length - 1; i >= 0; i--) { try { disposers[i](); } catch (e) {} }
  kernel.disposers = [];
  kernel.started = false;
}
const CORE_PLUGIN = {
  name: 'core',
  tools: [
    { name: 'plugin_list', description: 'List registered plugins and their tools.', run: async (run, args, ctx) => {
      const lines = agentKernel.plugins.map(p => p.name + ': ' + (p.tools || []).map(t => t.name).join(', '));
      return { ok: true, content: '(' + agentKernel.plugins.length + ' plugins):\n' + lines.join('\n') };
    } },
    { name: 'run_info', description: 'Read-only info about the current run.', run: async (run, args, ctx) => {
      return { ok: true, content: 'Run: ' + run.id + '\nStep: ' + (run.step || 0) + '\nModel: ' + (run.provider || '') + '/' + (run.model || '') + '\nPolicy: ' + (run.policy || 'ask') + '\nSandbox: ' + (run.sandboxMode || 'full') + '\nGoal: ' + (run.goal ? (run.goal.status + ' - ' + run.goal.text) : 'none') + '\nDepth: ' + (run.depth || 0) + '\nChildren: ' + (run.childCount || 0) + '\nEvidence entries: ' + (Array.isArray(run.evidence) ? run.evidence.length : 0) + '\nSPEC: ' + (run.specPath || 'none') + (run.specApproved ? ' (approved)' : '') + '\nRole: ' + (run.role || 'main') };
    } },
  ]
};
const agentKernel = createKernel([CORE_PLUGIN]);
startKernel(agentKernel, {});

async function runAgentLoopInner(run, onProgress) {
  const lang = run.lang || 'en';
  // TOKEN-USAGE (2026-11-05): every run accumulates the provider's real usage for this task.
  if (!run.usage) run.usage = freshUsage();
  const stuckText = lang === 'roman_urdu'
    ? 'Main is kaam mein atak gaya hoon (ek hi step baar baar) - is liye ruk raha hoon. Zara tareeqa badal kar dobara batao.'
    : lang === 'urdu'
    ? 'میں اس کام میں اٹک گیا ہوں (ایک ہی مرحلہ بار بار) - اس لیے رک رہا ہوں۔ ذرا طریقہ بدل کر دوبارہ بتائیں۔'
    : 'I got stuck repeating the same step, so I stopped. Please rephrase the task and I will try another way.';
  const maxSteps = run.maxSteps ? Math.max(1, Math.min(40, run.maxSteps)) : (run.planApproved ? AGENT_MAX_STEPS_PLAN : AGENT_MAX_STEPS);
  let formatRepromptUsed = false;
  for (let step = 0; step < maxSteps; step++) {
    if (run.cancelled) return { status: 'cancelled' };
    run.step = step; run.status = 'active'; saveRun(run);
    let history = normalizeAgentMessages(run.history);
    // TOKENOPT (v1.0.15): compact older history only when it is large.
    // Disk history is never touched - only what is SENT this turn changes.
    // On any failure compactHistory returns the full history (safe fallback).
    try {
      const comp = tokenopt.compactHistory(history);
      if (comp.compacted) {
        history = comp.messages;
        appendLogEvent(run, 'loop/note', { step: step, content: 'History compacted for this request: ' + comp.droppedCount + ' older messages summarized (' + comp.originalTokens + ' est. tokens -> ' + comp.compactedTokens + ' est. tokens). Full history stays saved on disk.' });
      }
    } catch (e) { try { console.log('[tokenopt] compaction skipped: ' + (e && e.message ? String(e.message).slice(0, 120) : 'error')); } catch (e2) {} }
    // VISION: attach validated images for vision-capable providers only;
    // for all other providers callHistory is identical to history.
    const visionLoop = require('./vision.js');
    const callHistory = visionLoop.applyToMessages(history, run.provider, run.model, visionStore[run.id] || run.visionImages || []);
    if (!history.length) return { status: 'done', text: 'No messages to answer.' };
    resolveSlashSkill(run);
    // TOKENOPT (v1.0.15): lazy skill preload - if the latest user message
    // clearly matches a skill (keyword match on the index), load that full
    // SKILL.md now so the model follows it; otherwise the index stays and
    // the model loads via skill_read as before (safe fallback). Side-effect
    // skills are never preloaded - they keep the approval gate.
    if (step === 0 && !run.tokenoptPreloadDone && !run.skillContent && !run.loadedSkillName) {
      run.tokenoptPreloadDone = true;
      try {
        const lastUser = history.filter(m => m && m.role === 'user').pop();
        const matched = tokenopt.matchSkillsForTask(lastUser ? lastUser.content : '', run.skillIndex || '');
        const loaded = [];
        for (const m of matched.slice(0, 2)) {
          if (skillSideEffects(m.name)) continue;
          const s = readSkill(m.name);
          if (s.ok) loaded.push({ name: m.name, text: s.text });
        }
        if (loaded.length) {
          run.loadedSkillName = loaded[0].name;
          run.skillContent = loaded.map(x => '<skill_content name="' + x.name + '">\n' + x.text + '\n</skill_content>').join('\n');
          appendLogEvent(run, 'loop/note', { step: step, content: 'Preloaded skill(s) by keyword match: ' + loaded.map(x => x.name).join(', ') + ' (full text in system prompt this turn).' });
        }
      } catch (e) { try { console.log('[tokenopt] skill preload skipped: ' + (e && e.message ? String(e.message).slice(0, 120) : 'error')); } catch (e2) {} }
    }
    let text;
    let modelError = null;
    appendLogEvent(run, 'model/call', { step: step });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (run.provider === 'ollama') {
          text = await callChatModel(run.provider, run.model, run.key, '', [{ role: 'system', content: (agentSystemText(lang, run.memoryText || '', run.skillIndex || '', run.skillContent || '', goalLine(run.goal), (run.depth || 0) >= 1, loadCharacterText(), run.role || '', run.connectorStates || null, buildProviderStatesText(run.providerStates, run.provider, run.model)) + mcp.systemSection(run.depth || 0)) }].concat(callHistory), run.usage);
        } else {
          text = await callChatModel(run.provider, run.model, run.key, (agentSystemText(lang, run.memoryText || '', run.skillIndex || '', run.skillContent || '', goalLine(run.goal), (run.depth || 0) >= 1, loadCharacterText(), run.role || '', run.connectorStates || null, buildProviderStatesText(run.providerStates, run.provider, run.model)) + mcp.systemSection(run.depth || 0)), callHistory, run.usage);
        }
        modelError = null;
        break;
      } catch (e) {
        modelError = e;
        if (!/timed out/i.test(e.message || '') || attempt === 1) break;
      }
    }
    // VISION-VERIFY-CONSUME — verify shots attach to this call only.
    if (!modelError) visionVerifyStore.consumeVerifyShots(run, visionStore);
    if (modelError) {
      const msg = modelError.message || '';
      const friendly = /timed out/i.test(msg)
        ? 'The model call timed out - the model is slow or overloaded right now. Please try again, or switch to a faster model.'
        : msg;
      return { status: 'error', error: sanitizeError(friendly || (modelError.code === 'ECONNREFUSED' ? 'Connection refused. If this is Ollama, start it with: ollama serve' : '') || 'Model call failed.') };
    }
    if (run.cancelled) return { status: 'cancelled' };
    const parsed = parseAgentReply(text);
    appendLogEvent(run, 'model/reply', { step: step, thought: (parsed && parsed.thought) || '', kind: (!parsed ? 'none' : (typeof parsed.final === 'string' ? 'final' : (parsed.plan ? 'plan' : (parsed.tool ? 'tool' : 'none')))), tool: (parsed && parsed.tool) || '', final: (parsed && typeof parsed.final === 'string' ? parsed.final : '') });
    if (parsed && typeof parsed.thought === 'string' && parsed.thought.trim()) {
      // THOUGHT SANITIZER (2026-11-05): the displayed thought must never name the bot's character.
      const rawThought = parsed.thought.trim();
      const cleanThought = sanitizeThought(rawThought, parsed);
      if (cleanThought !== rawThought.slice(0, 500)) {
        appendLogEvent(run, 'loop/note', { step: step, content: 'Thought sanitized for display: it named the bot character/personality instruction. Raw thought kept in the model/reply log above.' });
      }
      run.lastThought = cleanThought;
    }
    if (!parsed) {
      if (!formatRepromptUsed) {
        formatRepromptUsed = true;
        appendLogEvent(run, 'loop/note', { step: step, content: 'Format retry: last reply was not valid agent JSON; reprompting once.' });
        run.history.push({ role: 'assistant', content: text });
        run.history.push({ role: 'user', content: 'Your last reply was not valid JSON. Reply with exactly one JSON object and no other text. Required shapes: {"thought": "...", "final": "..."} to finish, {"thought": "...", "tool": "...", "args": {...}} to act, or {"thought": "...", "plan": {...}} to plan.' });
        continue;
      }
      return { status: 'error', error: 'The model did not follow the agent reply format after a retry. Please try again or switch to a stronger model.' };
    }
    if (typeof parsed.final === 'string') {
      return { status: 'done', text: parsed.final, thought: run.lastThought || '' };
    }
    if (parsed.plan && typeof parsed.plan === 'object' && Array.isArray(parsed.plan.steps) && parsed.plan.steps.length > 0) {
      const steps = parsed.plan.steps.filter(s => typeof s === 'string').slice(0, 30);
      if (!steps.length) {
        appendLogEvent(run, 'loop/note', { step: step, content: 'Tool result: your plan had no usable steps. Reply with a valid plan (steps as a list of strings) or proceed with tools.'  });
        run.history.push({ role: 'user', content: 'Tool result: your plan had no usable steps. Reply with a valid plan (steps as a list of strings) or proceed with tools.' });
        continue;
      }
      run.plan = { goal: (typeof parsed.plan.goal === 'string' ? parsed.plan.goal : ''), steps: steps, facts_needed: Array.isArray(parsed.plan.facts_needed) ? parsed.plan.facts_needed.filter(f => typeof f === 'string').slice(0, 10) : [] };
      appendLogEvent(run, 'plan/proposed', { step: step, plan: run.plan });
      run.status = 'waiting_plan';
      run.planMode = true;
      return { status: 'plan', runId: run.id, plan: run.plan, thought: run.lastThought || '' };
    }
    if (parsed.tool && typeof parsed.tool === 'string') appendLogEvent(run, 'tool/call', { step: step, tool: parsed.tool, args: summarizeArgs(parsed.tool, parsed.args) });
    if (parsed.tool && Array.isArray(run.allowedTools) && run.allowedTools.indexOf(parsed.tool) === -1) {
      pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: this tool is not allowed for this subagent. Allowed tools: ' + run.allowedTools.join(', ') + '.', false);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'memory_save' && parsed.args && typeof parsed.args.fact === 'string') {
      const saved = saveMemoryFact(memoryDir(), parsed.args.fact);
      pushToolResult(run, 'memory_save', parsed.args, saved.ok ? 'Tool result for memory_save: saved to persistent memory.' : 'Tool result for memory_save: refused - ' + saved.error , saved.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'memory_search' && parsed.args && typeof parsed.args.query === 'string') {
      const hits = searchMemory(memoryDir(), parsed.args.query);
      pushToolResult(run, 'memory_search', parsed.args, hits.length ? ('Tool result for memory_search (matches, newest first, duplicates removed):\n' + hits.join('\n')) : 'Tool result for memory_search: no matches in persistent memory.' , true);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'memory_supersede' && parsed.args && typeof parsed.args.old === 'string' && typeof parsed.args.new === 'string') {
      const s = supersedeMemoryFact(memoryDir(), parsed.args.old, parsed.args.new);
      pushToolResult(run, 'memory_supersede', parsed.args, s.ok ? 'Tool result for memory_supersede: old fact marked SUPERSEDED, new fact saved. Old facts are never injected again.' : 'Tool result for memory_supersede failed: ' + s.error , s.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'memory_forget' && parsed.args && typeof parsed.args.fact === 'string') {
      const s = forgetMemoryFact(memoryDir(), parsed.args.fact);
      pushToolResult(run, 'memory_forget', parsed.args, s.removed ? 'Tool result for memory_forget: removed from MEMORY.md and RULES.md (dated audit log kept).' : 'Tool result for memory_forget: fact not found.' , s.removed);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'personality_update' && parsed.args && typeof parsed.args.trait === 'string') {
      const s = updatePersonalityTrait(memoryDir(), parsed.args.trait, parsed.args.evidence || '');
      pushToolResult(run, 'personality_update', parsed.args, s.ok ? (s.duplicate ? 'Tool result for personality_update: trait already in the profile (duplicate, not added).' : 'Tool result for personality_update: style profile updated (auto-update, recorded in the dated log).') : 'Tool result for personality_update failed: ' + s.error , s.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'skill_read' && parsed.args && typeof parsed.args.name === 'string') {
      // 7-POINTS (4) PROGRESSIVE DISCLOSURE — side-effect gate (code-enforced):
      // a flagged skill needs user approval before first use, unless the user
      // already invoked it with /skillname (loadedSkillName) or approved it.
      if (skillSideEffects(parsed.args.name) && run.loadedSkillName !== parsed.args.name && !(Array.isArray(run.userApprovedSkills) && run.userApprovedSkills.indexOf(parsed.args.name) !== -1)) {
        if (run.policy === 'never') {
          pushToolResult(run, 'skill_read', parsed.args, 'Tool result for skill_read: DENIED - ' + parsed.args.name + ' is a side-effect skill and approvals are set to Never for this session. Ask the user to invoke it with /' + parsed.args.name + ' or change the policy.' , false);
        } else {
          run.pendingApproval = { tool: 'skill_read', command: 'Read skill: ' + parsed.args.name + ' (side-effect skill - approve to load and follow it)', name: parsed.args.name, cwd: '(project folder)' };
          const auditEntry3 = recordApprovalAsked(run, run.pendingApproval);
          if (auditEntry3) appendLogEvent(run, 'approval/asked', { approvalId: auditEntry3.id, tool: auditEntry3.tool, command: auditEntry3.command });
          run.status = 'waiting_approval';
          return { status: 'need_approval', runId: run.id, approval: { tool: 'skill_read', command: 'Read skill: ' + parsed.args.name + ' (side-effect skill - approve to load and follow it)', cwd: '(project folder)' }, thought: run.lastThought || '' };
        }
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      const s = readSkill(parsed.args.name);
      // 7-POINTS (4) FIRST-USE NOTE — deterministic trigger, prompt-level wording:
      // if this skill was never read before in this run's history, the tool
      // result tells the model to say so naturally in English (first time may
      // have an issue, next time much better because it will have learned).
      // Whether the model actually says it is NOT code-enforced.
      let firstUseNote = '';
      try {
        const seen = (run.history || []).some(m => m && typeof m.content === 'string' && (m.content.indexOf('<skill_content name="' + parsed.args.name + '">') !== -1 || m.content.indexOf('Tool result for skill_read ' + parsed.args.name) !== -1));
        if (s.ok && !seen) firstUseNote = '\n[FIRST USE: this is the first time you use this skill in this chat. Tell the user, naturally in English, that first time there may be an issue, but next time you will give a much better result because you will have learned. Then follow the skill.]';
      } catch (e) {}
      pushToolResult(run, 'skill_read', parsed.args, s.ok ? ('Tool result for skill_read ' + parsed.args.name + ':\n<skill_content name="' + parsed.args.name + '">\n' + s.text + '\n</skill_content>' + firstUseNote) : ('Tool result for skill_read failed: ' + s.error) , s.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'skill_save' && parsed.args && typeof parsed.args.name === 'string' && typeof parsed.args.content === 'string') {
      if (run.policy === 'never') {
        pushToolResult(run, 'skill_save', parsed.args, 'Tool result for skill_save: DENIED by policy - approvals are set to Never for this session. Show the draft to the user and ask them to change the policy or approve it manually.' , false);
        run.denyCount = (run.denyCount || 0) + 1;
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      run.pendingApproval = { tool: 'skill_save', command: 'Save skill: ' + parsed.args.name, name: parsed.args.name, when: parsed.args.when || '', content: parsed.args.content, cwd: '(project folder)' };
      const auditEntry2 = recordApprovalAsked(run, run.pendingApproval);
      if (auditEntry2) appendLogEvent(run, 'approval/asked', { approvalId: auditEntry2.id, tool: auditEntry2.tool, command: auditEntry2.command });
      run.status = 'waiting_approval';
      return { status: 'need_approval', runId: run.id, approval: { tool: 'skill_save', command: 'Save skill: ' + parsed.args.name + ' — ' + (parsed.args.when || '') + '\n' + String(parsed.args.content).slice(0, 500), cwd: '(project folder)' }, thought: run.lastThought || '' };
    }
    // SKILLS-ADD (v1.0.12): chat path — fetch + scan + preview, no install.
    // Read-only (no approval needed). The prepared files are stashed
    // server-side under a prepToken; the model installs by token.
    if (parsed.tool === 'skill_prepare' && parsed.args && typeof parsed.args.source === 'string') {
      let prep = null;
      try {
        if (parsed.args.source === 'github' && typeof parsed.args.url === 'string') {
          prep = await skillAdd.fetchGithubSkill(parsed.args.url);
        } else if (parsed.args.source === 'paste' && typeof parsed.args.text === 'string') {
          prep = skillAdd.prepareFromText(parsed.args.text, parsed.args.fileName || '');
        } else {
          prep = { ok: false, error: 'skill_prepare needs source "github" with a url, or source "paste" with text.' };
        }
      } catch (e) {
        prep = { ok: false, error: 'PREPARE_ERROR' };
      }
      if (!prep || !prep.ok) {
        pushToolResult(run, 'skill_prepare', parsed.args, 'Tool result for skill_prepare failed: ' + ((prep && prep.error) || 'PREPARE_FAILED') + (prep && prep.tried ? ' (tried: ' + prep.tried.join(', ') + ')' : ''), false);
      } else {
        const r = skillAdd.chatPreview(prep, skillsDir(), skillAdd.userSkillsDir());
        if (!r.ok) {
          pushToolResult(run, 'skill_prepare', parsed.args, 'Tool result for skill_prepare failed: ' + (r.error || 'PREPARE_FAILED'), false);
        } else {
          const scanNote = r.scan.verdict === 'ALLOW' ? 'Scan: ALLOW (no flags found).' : ('Scan: ' + r.scan.verdict + ' — ' + r.scan.findings.map(f => f.cls + ' (' + f.severity + ') at ' + f.file + ':' + f.line + ': ' + f.text).join('; '));
          const preview = 'Tool result for skill_prepare (NOT installed yet — show this preview to the user and ask before installing):\n'
            + 'Name: ' + r.name + '\nDescription: ' + (r.description || '(missing — ask the user to supply one)') + '\n'
            + 'Files: ' + r.files.map(f => f.path + ' (' + f.size + ' B)').join(', ') + (r.skipped && r.skipped.length ? '\nSkipped (never copied): ' + r.skipped.join(', ') : '') + '\n'
            + scanNote + '\n'
            + (r.conflict ? 'Name conflict: a skill named ' + r.name + ' already exists — ask the user (overwrite / rename / cancel), never silent-overwrite.\n' : '')
            + (r.overCap ? 'Catalog full: 30 skills already installed — the user must remove one first.\n' : (r.warnCap ? 'Catalog nearly full (' + r.skillCount + '/30 skills) — warn the user.\n' : ''))
            + (r.source ? 'Source: ' + r.source.type + ' ' + (r.source.url || '') + '\n' : '')
            + 'SKILL.md preview (first 2000 chars):\n' + (r.skillMdPreview || '(empty)') + '\n'
            + 'To install, call skill_install with prepToken "' + r.prepToken + '" (and the description, edited if the user changed it).';
          pushToolResult(run, 'skill_prepare', parsed.args, preview, true);
        }
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    // SKILLS-ADD (v1.0.12): chat path — install a prepared skill. Approval-
    // gated exactly like skill_save: the run pauses, the user sees a card,
    // and the install runs only on Allow (see the decide handler).
    if (parsed.tool === 'skill_install' && parsed.args && typeof parsed.args.prepToken === 'string') {
      if (run.policy === 'never') {
        pushToolResult(run, 'skill_install', parsed.args, 'Tool result for skill_install: DENIED by policy - approvals are set to Never for this session. Show the preview to the user and ask them to change the policy or approve it manually.', false);
        run.denyCount = (run.denyCount || 0) + 1;
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      const prep = skillAdd.peekPrepare(parsed.args.prepToken);
      if (!prep) {
        pushToolResult(run, 'skill_install', parsed.args, 'Tool result for skill_install failed: the prepared skill expired or was not found (prepares expire after 15 minutes). Call skill_prepare again to fetch it fresh.', false);
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      run.pendingApproval = { tool: 'skill_install', command: 'Install skill: ' + (prep.name || 'skill') + (prep.description ? ' — ' + prep.description : ''), name: prep.name, prepToken: parsed.args.prepToken, description: parsed.args.description || '', override: parsed.args.override || null, allowOverwrite: !!parsed.args.allowOverwrite, cwd: '(project folder)' };
      const auditEntry4 = recordApprovalAsked(run, run.pendingApproval);
      if (auditEntry4) appendLogEvent(run, 'approval/asked', { approvalId: auditEntry4.id, tool: auditEntry4.tool, command: auditEntry4.command });
      run.status = 'waiting_approval';
      return { status: 'need_approval', runId: run.id, approval: { tool: 'skill_install', command: 'Install skill: ' + (prep.name || 'skill') + (prep.description ? ' — ' + prep.description : '') + '\nFiles: ' + (prep.files || []).map(f => f.path).join(', '), cwd: '(project folder)' }, thought: run.lastThought || '' };
    }
    if (parsed.tool === 'schedule_create' && parsed.args && typeof parsed.args.title === 'string' && typeof parsed.args.prompt === 'string') {
      const s = createSchedule(run.chatId || '', parsed.args);
      pushToolResult(run, 'schedule_create', parsed.args, s.ok ? ('Tool result for schedule_create: saved. Title: ' + s.item.title + '. Next run: ' + s.item.nextAtText + '. Tell the user it is set (and when it will run).') : ('Tool result for schedule_create failed: ' + s.error) , s.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'schedule_list') {
      const items = listSchedulesForChat(run.chatId || '');
      pushToolResult(run, 'schedule_list', parsed.args, items.length ? ('Tool result for schedule_list:\n' + items.map(x => '- ' + x.title + ' (' + x.kind + ' ' + x.value + ') - next: ' + x.nextAtText + ' - id: ' + x.id).join('\n')) : 'Tool result for schedule_list: no active schedules in this chat.' , true);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'schedule_delete' && parsed.args && typeof parsed.args.id === 'string') {
      const s = deleteSchedule(parsed.args.id, run.chatId || '');
      pushToolResult(run, 'schedule_delete', parsed.args, s.ok ? 'Tool result for schedule_delete: deleted.' : ('Tool result for schedule_delete failed: ' + s.error) , s.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'web_search' && parsed.args && typeof parsed.args.query === 'string') {
      const r = await webSearch(parsed.args.query);
      let webText;
      if (r.ok) {
        const srcNote = r.onlyWikipedia ? ' (source: wikipedia — LAST RESORT ONLY; these are encyclopedia results, not current or trending sources. For a current or trending topic, open the Browser panel and search the real factual sites there, or ask the user — do not settle for Wikipedia alone.)' : ' (source: ' + (r.source || 'web') + ')';
        webText = 'Tool result for web_search "' + parsed.args.query + '"' + srcNote + ':\n' + r.results.map(x => '- ' + x.title + ' (' + x.url + ')' + (x.snippet ? ' - ' + x.snippet : '')).join('\n');
      } else {
        webText = 'Tool result for web_search failed: ' + r.error + ' — the web search returned nothing. Open the Browser panel and search there, or ask the user. Do not guess and do not use Wikipedia as a silent fallback.';
      }
      pushToolResult(run, 'web_search', parsed.args, webText, r.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'deep_read' && parsed.args && typeof parsed.args.url === 'string') {
      const sig = 'deep_read:' + parsed.args.url;
      run.recentTools.push(sig);
      const r = run.recentTools;
      if (r.length >= 3 && r[r.length - 1] === r[r.length - 2] && r[r.length - 2] === r[r.length - 3]) {
        return { status: 'done', text: stuckText, thought: run.lastThought || '' };
      }
      const maxPages = (typeof parsed.args.maxPages === 'number') ? parsed.args.maxPages : 5;
      const d = await deepRead(parsed.args.url, maxPages);
      pushToolResult(run, 'deep_read', parsed.args, d.ok ? ('Tool result for deep_read ' + parsed.args.url + ' (' + d.pages.length + ' pages):\n' + d.pages.map(p => '--- PAGE: ' + p.url + '\nTitle: ' + p.title + '\nHeadings: ' + p.headings.join(' | ') + '\n' + p.text).join('\n')) : ('Tool result for deep_read ' + parsed.args.url + ' failed: ' + d.error) , d.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'browser_read' && parsed.args && typeof parsed.args.url === 'string') {
      const sig = 'browser_read:' + parsed.args.url;
      run.recentTools.push(sig);
      const r = run.recentTools;
      if (r.length >= 3 && r[r.length - 1] === r[r.length - 2] && r[r.length - 2] === r[r.length - 3]) {
        return { status: 'done', text: stuckText, thought: run.lastThought || '' };
      }
      const page = await readWebPage(parsed.args.url);
      pushToolResult(run, 'browser_read', parsed.args, page.ok ? ('Tool result for browser_read ' + parsed.args.url + ' (title: ' + page.title + '):\n' + page.text) : ('Tool result for browser_read ' + parsed.args.url + ' failed: ' + page.error) , page.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'browser_read_js' && parsed.args && typeof parsed.args.url === 'string') {
      const page = await readWebPageJs(parsed.args.url);
      pushToolResult(run, 'browser_read_js', parsed.args, page.ok ? ('Tool result for browser_read_js ' + parsed.args.url + ' (title: ' + page.title + ', JS-rendered):\n' + page.text) : ('Tool result for browser_read_js ' + parsed.args.url + ' failed: ' + page.error) , page.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'browser_control' && parsed.args && typeof parsed.args.url === 'string') {
      const acts = Array.isArray(parsed.args.actions) ? parsed.args.actions : [];
      const hasWrite = acts.some(a => a && (a.action === 'fill' || a.action === 'click' || a.action === 'submit')) || !!parsed.args.fillSelector || !!parsed.args.clickSelector;
      if (isBrowserControlBlocked(parsed.args.url, parsed.args)) {
        pushToolResult(run, 'browser_control', parsed.args, 'Tool result for browser_control: BLOCKED - login, sign-in, checkout, payment pages and password fields are never driven, even with approval.', false);
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      if (hasWrite) {
        if (run.policy === 'never') {
          pushToolResult(run, 'browser_control', parsed.args, 'Tool result for browser_control: DENIED by policy - approvals are set to Never for this session. Do not retry it.', false);
          run.denyCount = (run.denyCount || 0) + 1;
          if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
          continue;
        }
        run.pendingApproval = { tool: 'browser_control', url: parsed.args.url, actions: parsed.args.actions || null, fillSelector: parsed.args.fillSelector || '', fillValue: parsed.args.fillValue || '', clickSelector: parsed.args.clickSelector || '' };
        const auditEntry = recordApprovalAsked(run, { tool: 'browser_control', command: 'Browser: ' + parsed.args.url + ' fill/click', cwd: '(browser)' });
        if (auditEntry) appendLogEvent(run, 'approval/asked', { approvalId: auditEntry.id, tool: auditEntry.tool, command: auditEntry.command });
        run.status = 'waiting_approval';
        return { status: 'need_approval', runId: run.id, approval: { tool: 'browser_control', command: 'Browser control: ' + parsed.args.url + ' - ' + JSON.stringify(parsed.args.actions || { fill: parsed.args.fillSelector, click: parsed.args.clickSelector }), cwd: '(browser)' }, thought: run.lastThought || '' };
      }
      const r = await browserControl(parsed.args);
      pushToolResult(run, 'browser_control', parsed.args, r.ok ? ('Tool result for browser_control ' + parsed.args.url + ' (title: ' + r.title + ', browser-rendered):\n' + r.text) : ('Tool result for browser_control ' + parsed.args.url + ' failed: ' + r.error), r.ok);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    // BROWSER PANEL (2026-11-05, v2.46): drive the in-app Browser panel
    // (browser.js) — the live, visible browser the user watches. This is the
    // research tool: it opens the panel, navigates, reads pages, moves the
    // mouse visibly, types, and requests posts. The panel IS the visible
    // browser (headless engine + screenshot live view); the user sees every
    // move and can take control or press Stop at any time. Sensitive actions
    // (send/publish/submit) NEVER run immediately — they create an approval
    // in the panel and wait for the user to approve them there. The agent
    // never sees a password: the user logs in themselves in the panel.
    if (parsed.tool === 'browser_panel' && parsed.args && typeof parsed.args.action === 'string') {
      const bp = parsed.args;
      const act = String(bp.action || '');
      const sig = 'browser_panel:' + act + ':' + String(bp.url || bp.selector || '');
      run.recentTools.push(sig);
      const r2 = run.recentTools;
      if (r2.length >= 3 && r2[r2.length - 1] === r2[r2.length - 2] && r2[r2.length - 2] === r2[r2.length - 3]) {
        return { status: 'done', text: stuckText, thought: run.lastThought || '' };
      }
      const bpCall = async (p, method, body) => {
        try {
          const rr = await fetch('http://127.0.0.1:3000' + p, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
          return await rr.json();
        } catch (e) { return { ok: false, error: 'BROWSER_CALL_FAILED' }; }
      };
      const bpText = async () => {
        const t = await bpCall('/api/browser/text', 'GET');
        if (!t || !t.ok) return '';
        return 'Title: ' + (t.title || '') + '\nURL: ' + (t.url || '') + '\n' + String(t.text || '').slice(0, 6000);
      };
      let bpOut = '';
      let bpOk = true;
      if (act === 'open' || act === 'navigate') {
        const url = String(bp.url || '');
        if (!/^https?:\/\//.test(url)) { bpOk = false; bpOut = 'browser_panel: open needs a full http(s) URL.'; }
        else {
          const st = await bpCall('/api/browser/status', 'GET');
          let nav;
          if (st && st.ok && st.running) nav = await bpCall('/api/browser/navigate', 'POST', { url: url });
          else nav = await bpCall('/api/browser/start', 'POST', { url: url });
          if (!nav || !nav.ok) { bpOk = false; bpOut = 'browser_panel: could not open ' + url + ' — ' + ((nav && nav.error) || 'BROWSER_NOT_RUNNING') + '. Tell the user to open the Browser page and press Start, then try again.'; }
          else {
            const txt = await bpText();
            bpOut = 'browser_panel: the Browser panel is open and showing ' + url + ' — the user can see the page and the cursor in the panel.' + (txt ? ('\n' + txt) : '');
          }
        }
      } else if (act === 'read') {
        const txt = await bpText();
        if (!txt) { bpOk = false; bpOut = 'browser_panel: nothing to read — the browser is not running or has no tab. Open a page first with action "open".'; }
        else bpOut = 'browser_panel: current panel page:\n' + txt;
      } else if (act === 'click') {
        const sel = String(bp.selector || '');
        if (!sel) { bpOk = false; bpOut = 'browser_panel: click needs a CSS selector.'; }
        else {
          const c = await bpCall('/api/browser/click', 'POST', { selector: sel });
          if (!c || !c.ok) { bpOk = false; bpOut = 'browser_panel: click failed — ' + ((c && c.error) || 'BROWSER_NOT_RUNNING') + ((c && c.queued) ? ' (queued: the user has control of the browser; it runs when they press Done)' : ''); }
          else {
            const txt = await bpText();
            bpOut = 'browser_panel: clicked ' + sel + ' (now at ' + (c.url || '') + ').' + (txt ? ('\n' + txt) : '');
          }
        }
      } else if (act === 'move') {
        const x = Math.floor(Number(bp.x) || 0), y = Math.floor(Number(bp.y) || 0);
        const m = await bpCall('/api/browser/move', 'POST', { x: x, y: y });
        bpOut = (m && m.ok) ? ('browser_panel: mouse moved to ' + x + ', ' + y + ' (visible in the panel).') : 'browser_panel: move failed — ' + ((m && m.error) || 'BROWSER_NOT_RUNNING');
        bpOk = !!(m && m.ok);
      } else if (act === 'type') {
        const t = String(bp.text || '');
        if (!t) { bpOk = false; bpOut = 'browser_panel: type needs text.'; }
        else {
          const k = await bpCall('/api/browser/keyboard', 'POST', { text: t.slice(0, 200) });
          bpOut = (k && k.ok) ? 'browser_panel: typed into the focused field (visible in the panel).' : 'browser_panel: type failed — ' + ((k && k.error) || 'BROWSER_NOT_RUNNING');
          bpOk = !!(k && k.ok);
        }
      } else if (act === 'send' || act === 'publish' || act === 'submit') {
        const kind = act;
        const sel = String(bp.selector || '');
        const detail = String(bp.detail || '').slice(0, 300);
        const a = await bpCall('/api/browser/action', 'POST', { kind: kind, selector: sel, detail: detail });
        if (!a || !a.ok) { bpOk = false; bpOut = 'browser_panel: ' + kind + ' could not be requested — ' + ((a && a.error) || 'BROWSER_NOT_RUNNING'); }
        else if (a.needsApproval) {
          bpOut = 'browser_panel: ' + kind + ' requested (approval #' + a.id + '). It is WAITING for the user to approve it in the Browser panel — it has NOT run yet. Tell the user to open the Browser panel and approve it (or reject it). Do not repeat the request.';
        } else { bpOut = 'browser_panel: ' + kind + ' done.'; }
      } else if (act === 'status') {
        const st = await bpCall('/api/browser/status', 'GET');
        bpOut = (st && st.ok) ? ('browser_panel status: state=' + st.state + ', url=' + (st.url || '') + ', title=' + (st.title || '') + ', tabs=' + (st.tabs ? st.tabs.length : 0) + ', queued=' + (st.queued || 0) + ', pending approvals=' + (st.pending ? st.pending.length : 0)) : 'browser_panel: status failed.';
        bpOk = !!(st && st.ok);
      } else {
        bpOk = false; bpOut = 'browser_panel: unknown action "' + act + '". Use open, navigate, read, click, move, type, send, publish, submit, or status.';
      }
      pushToolResult(run, 'browser_panel', parsed.args, 'Tool result for browser_panel "' + act + '":\n' + bpOut, bpOk);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    // SMART-MODEL (2026-11-05): ask-before-switch. The agent proposes a switch to a SAVED model;
    // the user approves or denies it on a card. The server never switches silently, and the
    // frontend supplies the target key on approval (keys live in the browser, never here).
    if (parsed.tool === 'model_switch' && parsed.args && typeof parsed.args.provider === 'string' && typeof parsed.args.model === 'string') {
      const targetProvider = String(parsed.args.provider || '').trim();
      const targetModel = String(parsed.args.model || '').trim();
      const switchReason = String(parsed.args.reason || '').trim().slice(0, 300);
      const savedList = (run.providerStates && Array.isArray(run.providerStates.providers)) ? run.providerStates.providers : null;
      const targetEntry = savedList ? savedList.find(p => p.id === targetProvider) : null;
      if ((run.depth || 0) >= 1) {
        pushToolResult(run, 'model_switch', parsed.args, 'Tool result for model_switch failed: subagents cannot switch models. The parent agent decides the model.', false);
      } else if (!targetProvider || !targetModel) {
        pushToolResult(run, 'model_switch', parsed.args, 'Tool result for model_switch failed: provider and model are both required.', false);
      } else if (targetProvider === run.provider && targetModel === run.model) {
        pushToolResult(run, 'model_switch', parsed.args, 'Tool result for model_switch: already on ' + targetProvider + ' / ' + targetModel + '. Continue with it.', true);
      } else if (savedList && !targetEntry) {
        pushToolResult(run, 'model_switch', parsed.args, 'Tool result for model_switch failed: ' + targetProvider + ' is not in the saved provider list. Do not propose a switch to an unsaved provider — tell the user to add its key in Settings, or ask if they want to continue with the current model.', false);
      } else if (run.chatId && chatModelPins[run.chatId] && chatModelPins[run.chatId] !== targetModel && (/^kimi-k3/i.test(targetModel) || /^kimi-k3/i.test(chatModelPins[run.chatId]))) {
        pushToolResult(run, 'model_switch', parsed.args, 'Tool result for model_switch failed: this chat is pinned to a Kimi K3 model and cannot switch models mid-session. Start a new chat to use a different model.', false);
      } else {
        run.pendingApproval = { tool: 'model_switch', provider: targetProvider, model: targetModel, reason: switchReason, prevProvider: run.provider, prevModel: run.model, command: 'Switch model to ' + targetProvider + ' / ' + targetModel + ' for this task' + (switchReason ? ' — ' + switchReason : ''), cwd: '(model)' };
        const auditEntry = recordApprovalAsked(run, run.pendingApproval);
        if (auditEntry) appendLogEvent(run, 'approval/asked', { approvalId: auditEntry.id, tool: auditEntry.tool, command: auditEntry.command });
        run.status = 'waiting_approval';
        return { status: 'need_approval', runId: run.id, approval: { tool: 'model_switch', provider: targetProvider, model: targetModel, reason: switchReason, command: run.pendingApproval.command, cwd: '(model)' }, thought: run.lastThought || '' };
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'todo_write') {
      const todoCheck = validateTodos(parsed.args ? parsed.args.todos : null);
      if (!todoCheck.ok) {
        pushToolResult(run, 'todo_write', parsed.args, 'Tool result for todo_write failed: ' + todoCheck.error, false);
      } else {
        run.todos = todoCheck.todos;
        const todoLines = todoCheck.todos.map(t => (t.status === 'completed' ? '- [x] ' : (t.status === 'in_progress' ? '- [~] ' : '- [ ] ')) + t.content);
        pushToolResult(run, 'todo_write', parsed.args, 'Tool result for todo_write: saved.' + (todoCheck.todos.length ? (' Current todos:\n' + todoLines.join('\n')) : ' Todo list cleared.'), true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'session_list') {
      const logs = listSessionLogs();
      const byId = {};
      logs.forEach(s => { byId[s.id] = s; });
      const seen = {};
      const lines = [];
      for (const r of listRuns()) {
        seen[r.id] = true;
        lines.push(r.id + ' | ' + (r.task || '') + ' | ' + (r.status || '') + ' | events: ' + (byId[r.id] ? byId[r.id].events : 0) + ' | ' + (r.updatedAt || ''));
      }
      for (const s of logs) {
        if (!seen[s.id]) lines.push(s.id + ' |  | unknown | events: ' + s.events + ' | ' + (s.updatedAt || ''));
      }
      pushToolResult(run, 'session_list', parsed.args, lines.length ? ('Tool result for session_list (' + lines.length + ' runs):\n' + lines.slice(0, 20).join('\n')) : 'Tool result for session_list: no past runs.', true);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'session_read') {
      const runId = parsed.args ? String(parsed.args.runId || '') : '';
      if (!validRunId(runId)) {
        pushToolResult(run, 'session_read', parsed.args, 'Tool result for session_read failed: runId must be a run id (letters, numbers, dash, underscore).', false);
      } else {
        const limit = Math.max(1, Math.min(200, Number(parsed.args.limit) || 50));
        const events = readLogEvents(runId);
        if (!events.length) {
          pushToolResult(run, 'session_read', parsed.args, 'Tool result for session_read failed: no log found for run ' + runId + '.', false);
        } else {
          const shown = events.slice(-limit);
          pushToolResult(run, 'session_read', parsed.args, 'Tool result for session_read ' + runId + ' (' + events.length + ' events, showing last ' + shown.length + '):\n' + shown.map(formatSessionEvent).join('\n'), true);
        }
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'session_trace') {
      const runId = parsed.args ? String(parsed.args.runId || '') : '';
      if (!validRunId(runId)) {
        pushToolResult(run, 'session_trace', parsed.args, 'Tool result for session_trace failed: runId must be a run id (letters, numbers, dash, underscore).', false);
      } else {
        const trace = traceSession(runId);
        if (!trace) {
          pushToolResult(run, 'session_trace', parsed.args, 'Tool result for session_trace failed: no log found for run ' + runId + '.', false);
        } else {
          const shown = trace.slice(0, 100);
          pushToolResult(run, 'session_trace', parsed.args, 'Tool result for session_trace ' + runId + ' (' + trace.length + ' lines' + (trace.length > shown.length ? ', showing first ' + shown.length : '') + '):\n' + shown.join('\n'), true);
        }
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'session_search') {
      const query = parsed.args ? String(parsed.args.query || '').trim() : '';
      if (!query) {
        pushToolResult(run, 'session_search', parsed.args, 'Tool result for session_search failed: query must be a non-empty string.', false);
      } else {
        const limit = Math.max(1, Math.min(50, Number(parsed.args.limit) || 20));
        const hits = searchSessionEvents(query, limit);
        pushToolResult(run, 'session_search', parsed.args, hits.length ? ('Tool result for session_search "' + query + '" (' + hits.length + ' matches):\n' + hits.map(h => h.runId + ' #' + h.seq + ' [' + h.type + ']: ' + h.snippet).join('\n')) : 'Tool result for session_search "' + query + '": no matches.', true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'session_surface') {
      const query = parsed.args ? String(parsed.args.query || '').trim() : '';
      if (!query) {
        pushToolResult(run, 'session_surface', parsed.args, 'Tool result for session_surface failed: query must be a non-empty string.', false);
      } else {
        const limit = Math.max(1, Math.min(10, Number(parsed.args.limit) || 10));
        const runs = surfaceSessions(query, limit);
        pushToolResult(run, 'session_surface', parsed.args, runs.length ? ('Tool result for session_surface "' + query + '" (' + runs.length + ' runs):\n' + runs.map(r => r.runId + ' | ' + (r.task || '') + ' | ' + r.status + ' | matches: ' + r.matches + ' | ' + (r.updatedAt || '')).join('\n')) : 'Tool result for session_surface "' + query + '": no matching runs.', true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'subagent_spawn') {
      const prompt = parsed.args ? String(parsed.args.prompt || '').trim() : '';
      const mode = parsed.args ? String(parsed.args.mode || 'fresh') : 'fresh';
      const role = parsed.args ? String(parsed.args.role || 'explore') : 'explore';
      // 7-POINTS (6) — enforce read-only tool sets IN CODE, whatever the parent
      // requested: intersect with CHILD_READONLY_TOOLS (default: the full set).
      let allowed = CHILD_READONLY_TOOLS.slice();
      if (parsed.args && Array.isArray(parsed.args.allowedTools)) {
        const wanted = parsed.args.allowedTools.filter(t => typeof t === 'string');
        allowed = CHILD_READONLY_TOOLS.filter(t => wanted.indexOf(t) !== -1);
      }
      const childMaxSteps = parsed.args && typeof parsed.args.maxSteps === 'number' ? Math.max(1, Math.min(20, Math.floor(parsed.args.maxSteps))) : 10;
      if (!prompt) {
        pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn failed: prompt must be a non-empty string.', false);
      } else if ((run.depth || 0) >= 1) {
        pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn failed: subagents cannot spawn subagents (max depth 1).', false);
      } else if (mode !== 'fresh' && mode !== 'fork') {
        pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn failed: mode must be fresh or fork.', false);
      } else if (role !== 'explore' && role !== 'review') {
        pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn failed: role must be explore or review.', false);
      } else if ((run.childCount || 0) >= 8) {
        pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn failed: maximum 8 subagents per run.', false);
      } else {
        run.childCount = (run.childCount || 0) + 1;
        saveRun(run);
        const childId = run.id + '-sub' + run.childCount;
        const prefix = mode === 'fork' ? (run.history || []).slice(-20) : [];
        // 7-POINTS (7) ROUTING — a fresh-mode Explore child of a Kimi K3 parent
        // runs on the cheaper kimi-k2 model (fresh = no history, so no K3
        // thinking history is lost); Reviewer children keep the main model.
        let childModel = run.model;
        if (/^kimi-k3/i.test(String(run.model || '')) && mode === 'fresh' && role === 'explore') childModel = 'kimi-k2';
        const child = { id: childId, chatId: run.chatId || '', provider: run.provider, model: childModel, key: run.key, lang: run.lang || 'en', history: prefix.concat([{ role: 'user', content: prompt }]), pendingApproval: null, approvalAudit: [], policy: 'never', plan: null, planApproved: false, planMode: false, sandboxMode: run.sandboxMode || 'full', goal: null, todos: [], recentTools: [], step: 0, status: 'active', cancelled: false, waitingForApproval: false, waitingForPlan: false, denyCount: 0, memoryText: run.memoryText || '', skillIndex: run.skillIndex || '', skillContent: '', connectorStates: run.connectorStates || null, providerStates: run.providerStates || null, usage: freshUsage(), depth: 1, maxSteps: childMaxSteps, allowedTools: allowed, childCount: 0, role: role };
        let childOutcome;
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        try {
          childOutcome = await runAgentLoop(child, onProgress);
        } catch (e) {
          childOutcome = { status: 'error', text: 'Child run failed: ' + sanitizeError(e && e.message) };
        }
        // TOKEN-USAGE (2026-11-05): a child's real token usage counts toward the parent task's total.
        if (child && child.usage) {
          if (!run.usage) run.usage = freshUsage();
          run.usage.input += child.usage.input || 0; run.usage.output += child.usage.output || 0; run.usage.total += child.usage.total || 0; run.usage.calls += child.usage.calls || 0;
          if (child.usage.reported) run.usage.reported = true;
          if (child.usage.rateLimited) {
            run.usage.rateLimited = true;
            (child.usage.rateLimitNotes || []).forEach(n => { if (run.usage.rateLimitNotes.indexOf(n) === -1) run.usage.rateLimitNotes.push(n); });
          }
        }
        const childText = childOutcome && typeof childOutcome.text === 'string' && childOutcome.text.trim() ? childOutcome.text.trim() : '';
        if (childOutcome.status === 'done' && childText) {
          pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn (child ' + childId + ', role ' + role + ', done):\n' + childText, true);
        } else if (childOutcome.status === 'plan' || childOutcome.status === 'need_approval') {
          pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn (child ' + childId + ', role ' + role + ', stopped): the child asked for ' + (childOutcome.status === 'plan' ? 'a plan approval' : 'an approval') + ' - children cannot ask the user. Ask the user yourself, or rephrase the task so the child can finish alone.', false);
        } else {
          pushToolResult(run, 'subagent_spawn', parsed.args, 'Tool result for subagent_spawn (child ' + childId + ', role ' + role + ', ' + (childOutcome.status || 'ended') + '): ' + (childText || 'the child produced no final message.'), false);
        }
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'goal_set') {
      const text = parsed.args ? String(parsed.args.goal || '').trim() : '';
      if (!text) {
        pushToolResult(run, 'goal_set', parsed.args, 'Tool result for goal_set failed: goal must be a non-empty string.', false);
      } else if (run.goal && (run.goal.status === 'active' || run.goal.status === 'paused')) {
        pushToolResult(run, 'goal_set', parsed.args, 'Tool result for goal_set failed: GOAL_STALE_REVISION - a goal is already ' + run.goal.status + ' for this run ("' + run.goal.text + '"). Pause, complete, or block it first, then set a new goal. One goal per session.', false);
      } else {
        run.goal = { text: text.slice(0, 500), status: 'active', reason: '', updatedAt: new Date().toISOString(), history: [{ status: 'active', reason: '', at: new Date().toISOString() }] };
        saveRun(run);
        pushToolResult(run, 'goal_set', parsed.args, 'Tool result for goal_set: goal is now active.\n' + formatGoal(run.goal), true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'goal_status') {
      pushToolResult(run, 'goal_status', parsed.args, 'Tool result for goal_status:\n' + formatGoal(run.goal), true);
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'goal_pause') {
      const reason = parsed.args ? String(parsed.args.reason || '').trim() : '';
      if (!run.goal || run.goal.status !== 'active') {
        pushToolResult(run, 'goal_pause', parsed.args, 'Tool result for goal_pause failed: no active goal to pause.', false);
      } else {
        run.goal.status = 'paused'; run.goal.reason = reason.slice(0, 300); run.goal.updatedAt = new Date().toISOString(); goalPushHistory(run.goal, 'paused', reason);
        saveRun(run);
        pushToolResult(run, 'goal_pause', parsed.args, 'Tool result for goal_pause: goal paused. Only the user can resume it (ask the user to say so).\n' + formatGoal(run.goal), true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'goal_resume') {
      if (!run.goal || run.goal.status !== 'paused') {
        pushToolResult(run, 'goal_resume', parsed.args, 'Tool result for goal_resume failed: no paused goal to resume.', false);
      } else if (!userAskedGoalResume(run)) {
        pushToolResult(run, 'goal_resume', parsed.args, 'Tool result for goal_resume failed: only a direct user request can resume a paused goal. Ask the user to say so (for example: "goal dobara shuru karo").', false);
      } else {
        run.goal.status = 'active'; run.goal.reason = ''; run.goal.updatedAt = new Date().toISOString(); goalPushHistory(run.goal, 'active', 'resumed by user request');
        saveRun(run);
        pushToolResult(run, 'goal_resume', parsed.args, 'Tool result for goal_resume: goal is active again.\n' + formatGoal(run.goal), true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'goal_complete') {
      const summary = parsed.args ? String(parsed.args.summary || '').trim() : '';
      if (!run.goal || run.goal.status !== 'active') {
        pushToolResult(run, 'goal_complete', parsed.args, 'Tool result for goal_complete failed: no active goal to complete.', false);
      } else {
        run.goal.status = 'complete'; run.goal.reason = summary.slice(0, 300); run.goal.updatedAt = new Date().toISOString(); goalPushHistory(run.goal, 'complete', summary);
        saveRun(run);
        pushToolResult(run, 'goal_complete', parsed.args, 'Tool result for goal_complete: goal marked complete.\n' + formatGoal(run.goal), true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'goal_block') {
      const reason = parsed.args ? String(parsed.args.reason || '').trim() : '';
      if (!run.goal || run.goal.status !== 'active') {
        pushToolResult(run, 'goal_block', parsed.args, 'Tool result for goal_block failed: no active goal to block.', false);
      } else {
        run.goal.status = 'blocked'; run.goal.reason = reason.slice(0, 300); run.goal.updatedAt = new Date().toISOString(); goalPushHistory(run.goal, 'blocked', reason);
        saveRun(run);
        pushToolResult(run, 'goal_block', parsed.args, 'Tool result for goal_block: goal marked blocked. Tell the user what is needed to unblock it.\n' + formatGoal(run.goal), true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool === 'sandbox_set') {
      const mode = parsed.args ? String(parsed.args.mode || '') : '';
      if (mode !== 'readonly' && mode !== 'workspace' && mode !== 'full') {
        pushToolResult(run, 'sandbox_set', parsed.args, 'Tool result for sandbox_set failed: mode must be readonly, workspace, or full.', false);
      } else {
        run.sandboxMode = mode;
        saveRun(run);
        pushToolResult(run, 'sandbox_set', parsed.args, 'Tool result for sandbox_set: sandbox mode is now ' + mode + '.', true);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    // VIDEO-FRAMES-DISPATCH — sampled video frames (ADDITIVE ONLY).
    if (parsed.tool === 'video_frames') {
      const visionLoopV = require('./vision.js');
      await visionVerifyStore.handleVideoFrames(run, parsed.args || {}, { visionStore: visionStore, pushToolResult: pushToolResult, onProgress: onProgress, isVisionModel: visionLoopV.isVisionModel, validateImages: visionLoopV.validateImages, extractFn: visionVerifyStore.extractVideoFrames, projectDir: __dirname });
      continue;
    }
    // VISION-VERIFY-DISPATCH — screenshot verify loop (ADDITIVE ONLY).
    if (parsed.tool === 'vision_verify') {
      const visionLoop = require('./vision.js');
      const vvOut = await visionVerifyStore.handleVisionVerify(run, parsed.args || {}, { visionStore: visionStore, pushToolResult: pushToolResult, onProgress: onProgress, captureFn: visionVerifyStore.captureVerifyShots, isVisionModel: visionLoop.isVisionModel, validateImages: visionLoop.validateImages, applyStrike: applyVerifyStrike });
      if (vvOut && vvOut.action === 'fatal') return { status: 'error', error: vvOut.error };
      continue;
    }
    if (parsed.tool === 'terminal_exec' && parsed.args && typeof parsed.args.command === 'string') {
      const command = parsed.args.command;
      const cwd = (parsed.args.cwd && typeof parsed.args.cwd === 'string') ? parsed.args.cwd : undefined;
      if (command.length > 2000) {
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec: command too long (max 2000 characters). Please use a shorter command.' , false);
        continue;
      }
      if (isTerminalBlocked(command)) {
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec: BLOCKED - this command is never allowed (destructive or stealthy). Use a safer command.' , false);
        continue;
      }
      // 7-POINTS (2) PLAN PHASE — while a plan is proposed but not yet approved,
      // only read-only commands run; writes wait for SPEC.md approval.
      if (run.planMode && !run.planApproved && !isTerminalReadOnly(command)) {
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec: DENIED - a plan is awaiting approval. Read-only commands run during the plan phase; code writes wait until the plan is approved as SPEC.md.' , false);
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      const sig = 'terminal_exec:' + command;
      run.recentTools.push(sig);
      const r = run.recentTools;
      if (r.length >= 3 && r[r.length - 1] === r[r.length - 2] && r[r.length - 2] === r[r.length - 3]) {
        return { status: 'done', text: stuckText, thought: run.lastThought || '' };
      }
      if (run.sandboxMode === 'readonly' && !isTerminalReadOnly(command)) {
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec: DENIED - sandbox mode is read-only for this run. Only read-only commands run here. Use a read-only command (dir, type, git status, etc.), or set the sandbox mode to workspace or full.', false);
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      if (run.sandboxMode === 'workspace' && !isTerminalReadOnly(command) && commandEscapesWorkspace(command, cwd || __dirname)) {
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec: DENIED - sandbox mode is workspace-only for this run. This command targets a path outside the project folder. Keep paths inside the project folder, or set the sandbox mode to full.', false);
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      if (isTerminalReadOnly(command)) {
        const result = await runTerminal(command, cwd, terminalTimeout(parsed.args));
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec (command: ' + command + '):\n' + (result.ok ? result.output : ('ERROR: ' + result.error)) , result.ok);
        // VISION-VERIFY-STRIKE (read-only path) — same error 3x in the verify/fix phase trips.
        if (!result.ok && run.visionVerifyPhase) {
          const skRead = applyVerifyStrike(run, result.error || '');
          if (skRead.action === 'fatal') return { status: 'error', error: skRead.error };
        }
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      if (run.policy === 'never') {
        pushToolResult(run, 'terminal_exec', parsed.args, 'Tool result for terminal_exec: DENIED by policy - approvals are set to Never for this session. Do not retry it. Explain briefly and suggest a read-only alternative.' , false);
        run.denyCount = (run.denyCount || 0) + 1;
        if (run.denyCount >= 3) {
          return { status: 'done', text: 'Stopped: 3 commands denied in a row (approvals are set to Never). Change the approval policy to Ask, or use read-only commands.', thought: run.lastThought || '' };
        }
        if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
        continue;
      }
      run.pendingApproval = { tool: 'terminal_exec', command: command, cwd: cwd || '(project folder)', timeoutMs: terminalTimeout(parsed.args), verify: normalizeVerifyPaths(parsed.args.verify) };
      const auditEntry = recordApprovalAsked(run, run.pendingApproval);
      if (auditEntry) appendLogEvent(run, 'approval/asked', { approvalId: auditEntry.id, tool: auditEntry.tool, command: auditEntry.command, cwd: auditEntry.cwd });
      run.status = 'waiting_approval';
      return { status: 'need_approval', runId: run.id, approval: { tool: 'terminal_exec', command: command, cwd: cwd || '(project folder)' }, thought: run.lastThought || '' };
    }
    if (parsed.tool && typeof parsed.tool === 'string' && parsed.tool.indexOf('mcp_') === 0) {
      const parsedMcp = mcp.parseMcpTool(parsed.tool);
      if (!parsedMcp) {
        pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: unknown MCP tool.', false);
      } else {
        const mcpStatus = mcp.getSessionStatus(parsedMcp.server);
        if (!mcpStatus.connected) {
          pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: server ' + parsedMcp.server + ' is not connected. Ask the user to connect it in Connectors.', false);
        } else if ((run.depth || 0) >= 1) {
          pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: subagents cannot call MCP tools.', false);
        } else {
          const mcpTools = mcp.getTools(parsedMcp.server);
          const mcpToolEntry = mcpTools.find(function (t) { return t.name === parsedMcp.tool; });
          if (!mcpToolEntry) {
            pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: tool not found on server ' + parsedMcp.server + '.', false);
          } else if (mcp.isWriteTool(parsedMcp.server, parsedMcp.tool)) {
            if (run.policy === 'never') {
              pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' denied by policy (never).', false);
              run.denyCount = (run.denyCount || 0) + 1;
            } else {
              run.pendingApproval = { tool: 'mcp_call', server: parsedMcp.server, toolName: parsedMcp.tool, args: parsed.args || {}, command: 'MCP call: ' + parsed.tool + ' ' + JSON.stringify(parsed.args || {}).slice(0, 500), cwd: '(mcp)' };
              const auditEntryM = recordApprovalAsked(run, run.pendingApproval);
              if (auditEntryM) appendLogEvent(run, 'approval/asked', { approvalId: auditEntryM.id, tool: auditEntryM.tool, command: auditEntryM.command });
              run.status = 'waiting_approval';
              return { status: 'need_approval', runId: run.id, approval: { tool: 'mcp_call', command: 'MCP call: ' + parsed.tool + ' ' + JSON.stringify(parsed.args || {}).slice(0, 500), cwd: '(mcp)' }, thought: run.lastThought || '' };
            }
          } else {
            try {
              const r = await mcp.callTool(parsedMcp.server, parsedMcp.tool, parsed.args || {});
              pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + (r.ok === false ? ' failed' : '') + ': ' + (r.text || ''), r.ok !== false);
            } catch (e) {
              pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: ' + sanitizeError(e && e.message), false);
            }
          }
        }
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    if (parsed.tool && agentKernel.tools[parsed.tool]) {
      const entry = agentKernel.tools[parsed.tool];
      try {
        const r = await entry.tool.run(run, parsed.args || {}, { run: run, services: {} });
        pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + (r.ok === false ? ' failed' : '') + ': ' + (r.content || ''), r.ok !== false);
      } catch (e) {
        pushToolResult(run, parsed.tool, parsed.args, 'Tool result for ' + parsed.tool + ' failed: ' + sanitizeError(e && e.message), false);
      }
      if (onProgress) { try { onProgress(parsed.tool, parsed.args, run.lastThought || ''); } catch (e) {} }
      continue;
    }
    // JSON-LEAK FIX (2026-11-05): this fall-through used to return the model's
    // RAW reply text as the final answer — when the model emitted a "final"
    // that was an OBJECT (e.g. {"final": {"research_summary": {...}}}) instead
    // of a string, the whole {"thought": ..., "final": {...}} protocol JSON
    // reached the user (Discord screenshot, 2026-11-05). Never return raw text here.
    if (parsed && parsed.final && typeof parsed.final === 'object') {
      // The model did the work but structured its final as an object — render
      // it as natural text instead of leaking the JSON.
      const rendered = renderFinalObject(parsed.final);
      appendLogEvent(run, 'loop/note', { step: step, content: 'Final was a JSON object, not a string — rendered it as natural text instead of sending raw JSON.' });
      return { status: 'done', text: rendered || 'Here is what I found — the details were in a structured reply I could not render.', thought: run.lastThought || '' };
    }
    // Unknown tool, or a parsed reply with no usable final/tool/plan: ask the
    // model to reply properly instead of leaking its raw text to the user.
    appendLogEvent(run, 'loop/note', { step: step, content: 'Reply had no usable tool or final answer — reprompting for a proper reply (raw text never sent to the user).' });
    run.history.push({ role: 'assistant', content: text });
    run.history.push({ role: 'user', content: 'That reply did not contain a usable tool call or a final answer. Reply with exactly one JSON object: {"thought": "...", "final": "..."} where "final" is a plain string of natural text (never an object, never JSON), or {"thought": "...", "tool": "...", "args": {...}} to act.' });
    continue;
  }
  return { status: 'done', text: 'I used ' + maxSteps + ' steps without finishing. Please break the task into smaller parts.', thought: run.lastThought || '' };
}
async function runAgentLoop(run, onProgress) {
  const outcome = await runAgentLoopInner(run, onProgress);
  try {
    appendLogEvent(run, 'step/end', { step: run.step || 0, status: outcome.status || '' });
    if (outcome.status === 'done' || outcome.status === 'error' || outcome.status === 'cancelled') { run.planMode = false; appendLogEvent(run, 'turn/end', { status: outcome.status || '', reason: outcome.status || '', error: outcome.error || '' }); }
  } catch (e) {}
  // JSON-LEAK FIX (2026-11-05): choke-point — no raw protocol JSON may ever
  // leave the server as a final reply. Clean first, then append the usage line.
  if (outcome.status === 'done' && typeof outcome.text === 'string') {
    outcome.text = cleanFinalText(outcome.text);
  }
  // TOKEN DISPLAY REMOVED (2026-11-06, ali order): no usage line is appended to replies.
  // MEMORY REVIEW (Hermes-style background review, 2026-11-05) — after a top-level
  // run completes, a short review replays a compact digest and saves durable facts
  // to MEMORY.md (no approval; the user sees only the small "updating memory"
  // status). Best-effort: any failure is logged, never blocks the reply.
  if (outcome.status === 'done' && (run.depth || 0) === 0) {
    try { await runMemoryReview(run, outcome, onProgress); } catch (e) { try { console.log('[memory-review] skipped: ' + (e && e.message ? String(e.message).slice(0, 120) : 'error')); } catch (e2) {} }
  }
  return outcome;
}

// Slash commands v1 (deterministic, no model key required).
function slashOutDir() { const d = path.join(__dirname, 'slash-outputs'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; }
function slashUploadDir() { const d = path.join(__dirname, 'slash-uploads'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; }
function slashUnique(prefix, ext) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '.' + ext; }
function slashExec(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs || 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: String(stderr || err.message || 'Command failed').trim().slice(0, 500) });
      else resolve({ ok: true, stdout: String(stdout || '') });
    });
  });
}
function slashParseImage(dataUrl) {
  try {
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(dataUrl || '').trim());
    if (!m) return { ok: false, error: 'That image format is not supported. Use PNG, JPEG, or WebP.' };
    const ext = (m[1] === 'jpeg') ? 'jpg' : m[1];
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > 8 * 1024 * 1024) return { ok: false, error: 'Image is too large (max 8MB).' };
    const inPath = path.join(slashUploadDir(), slashUnique('in', ext));
    fs.writeFileSync(inPath, buf);
    return { ok: true, inPath: inPath, ext: ext };
  } catch (e) { return { ok: false, error: 'Could not read the attached image.' }; }
}
function slashStripHtml(html) {
  let t = String(html || '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}
async function slashHandle(data) {
  const command = String((data && data.command) || '');
  const arg = String((data && data.arg) || '').trim();
  if (['qr', 'resize', 'rembg', 'scrape', 'research'].indexOf(command) === -1) return { ok: false, error: 'Unknown slash command.' };
  if (command === 'qr') {
    if (!arg) return { ok: false, error: 'Type text after /qr, for example: /qr https://redcat.arexora.com' };
    if (arg.length > 1000) return { ok: false, error: 'QR text is too long (max 1000 characters).' };
    const outName = slashUnique('qr', 'png');
    const outPath = path.join(slashOutDir(), outName);
    const r = await slashExec('python', ['-c', "import sys, qrcode\nqr = qrcode.QRCode(border=4, box_size=10)\nqr.add_data(sys.argv[1])\nqr.make(fit=True)\nqr.make_image(fill_color='black', back_color='white').save(sys.argv[2])", arg, outPath], 60000);
    if (!r.ok) return { ok: false, error: 'QR code could not be created: ' + r.error };
    if (!fs.existsSync(outPath)) return { ok: false, error: 'QR code could not be created.' };
    return { ok: true, kind: 'image', imageUrl: '/slash-outputs/' + outName, title: 'QR code', text: 'QR for: ' + arg };
  }
  if (command === 'resize' || command === 'rembg') {
    if (!data || !data.imageDataUrl) return { ok: false, error: 'Attach an image first with the + button, then send /' + command + '.' };
    const img = slashParseImage(data.imageDataUrl);
    if (!img.ok) return { ok: false, error: img.error };
    try {
      if (command === 'resize') {
        const m = /^(\d{2,4})(?:x(\d{2,4}))?$/.exec(arg);
        if (!m) return { ok: false, error: 'Type a size after /resize, for example: /resize 800 or /resize 800x600' };
        const w = parseInt(m[1], 10);
        const h = m[2] ? parseInt(m[2], 10) : 0;
        if (w < 16 || w > 4000 || (h && (h < 16 || h > 4000))) return { ok: false, error: 'Size must be between 16 and 4000 pixels.' };
        const outName = slashUnique('resize', img.ext);
        const outPath = path.join(slashOutDir(), outName);
        const script = "import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1])\norig = im.size\nfmt = im.format\nw = int(sys.argv[3])\nh = int(sys.argv[4])\nif h == 0:\n    h = round(orig[1] * w / orig[0])\nim2 = im.resize((w, h), Image.LANCZOS)\nif fmt == 'JPEG':\n    im2 = im2.convert('RGB')\n    im2.save(sys.argv[2], quality=90)\nelif fmt == 'WEBP':\n    im2.save(sys.argv[2], quality=90)\nelse:\n    im2.save(sys.argv[2])\nprint(str(orig[0]) + 'x' + str(orig[1]) + ' -> ' + str(w) + 'x' + str(h))";
        const r = await slashExec('python', ['-c', script, img.inPath, outPath, String(w), String(h)], 60000);
        if (!r.ok) return { ok: false, error: 'Image could not be resized: ' + r.error };
        if (!fs.existsSync(outPath)) return { ok: false, error: 'Image could not be resized.' };
        return { ok: true, kind: 'image', imageUrl: '/slash-outputs/' + outName, title: 'Resized image', text: 'Resized: ' + (r.stdout || '').trim() };
      }
      const outName = slashUnique('rembg', 'png');
      const outPath = path.join(slashOutDir(), outName);
      const rembgScript = "import sys\nfrom PIL import Image\nfrom rembg import remove, new_session\nremove(Image.open(sys.argv[1]), session=new_session(\"u2netp\")).save(sys.argv[2])";
      const r = await slashExec('python', ['-c', rembgScript, img.inPath, outPath], 300000);
      if (!r.ok) {
        const isTimeout = /timed out|ETIMEDOUT/i.test(r.error);
        return { ok: false, error: isTimeout ? 'Background removal timed out. The first run downloads the background-removal model, so check the internet connection and try again.' : 'Background removal failed: ' + r.error };
      }
      if (!fs.existsSync(outPath)) return { ok: false, error: 'Background removal failed: no output was created.' };
      return { ok: true, kind: 'image', imageUrl: '/slash-outputs/' + outName, title: 'Background removed', text: 'Background removed (transparent PNG).' };
    } finally {
      try { fs.unlinkSync(img.inPath); } catch (e) {}
    }
  }
  if (command === 'scrape') {
    let u;
    try { u = new URL(arg); } catch (e) { return { ok: false, error: 'Type a full URL after /scrape, for example: /scrape https://example.com' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Only http:// and https:// URLs can be scraped.' };
    const html = await fetchText(arg, 15000);
    if (!html) return { ok: false, error: 'Could not read that page. Check the URL and try again.' };
    const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleM ? slashStripHtml(titleM[1]) : '';
    const descM = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html) || /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html);
    const heads = [];
    const hre = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
    let hm;
    while ((hm = hre.exec(html)) && heads.length < 10) { const t = slashStripHtml(hm[1]); if (t) heads.push(t); }
    const text = slashStripHtml(html).slice(0, 3000);
    let out = 'Page: ' + arg + '\n';
    if (title) out += 'Title: ' + title + '\n';
    if (descM && descM[1]) out += 'Description: ' + descM[1].slice(0, 500) + '\n';
    if (heads.length) out += 'Headings:\n' + heads.map(h => '- ' + h).join('\n') + '\n';
    out += 'Text (first 3000 characters):\n' + text;
    return { ok: true, kind: 'text', text: out };
  }
  if (command === 'research') {
    if (!arg) return { ok: false, error: 'Type a topic after /research, for example: /research best free image tools' };
    if (/^[^\s]+\.[^\s]+$/.test(arg)) {
      const siteUrl = /^https?:\/\//i.test(arg) ? arg : 'https://' + arg;
      const siteHtml = await fetchText(siteUrl, 15000);
      if (siteHtml) {
        const titleM2 = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(siteHtml);
        const siteTitle = titleM2 ? slashStripHtml(titleM2[1]) : siteUrl;
        return { ok: true, kind: 'text', text: 'Research (direct site read): ' + arg + '\n\nSite: ' + siteUrl + '\nTitle: ' + siteTitle + '\n\n' + slashStripHtml(siteHtml).slice(0, 2000) };
      }
    }
    const r = await webSearch(arg.slice(0, 500));
    if (!r.ok) return { ok: false, error: r.error === 'no_results' ? ("No results found for '" + arg + "'. Check the spelling, try a different topic, or give a known URL to read.") : 'Web search is unavailable right now. Use browser_read with a known URL, or ask the user for a source.' };
    const top = r.results.slice(0, 5);
    let out = 'Research (facts only, no model summary): ' + arg + '\nSource: ' + (r.source || 'web') + (r.onlyWikipedia ? ' (Wikipedia only — LAST RESORT; encyclopedia results, not current or trending sources. Open the Browser panel and search the real factual sites, or ask the user.)' : '') + '\n\n';
    top.forEach((s, i) => {
      out += (i + 1) + '. ' + (s.title || s.url) + '\n   ' + s.url + '\n';
      if (s.snippet) out += '   ' + String(s.snippet).slice(0, 300) + '\n';
    });
    out += '\nNote: these are search results only. Open a source to verify before quoting it.';
    return { ok: true, kind: 'text', text: out };
  }
  return { ok: false, error: 'Unknown slash command.' };
}

// MCP custom-server helpers (Add MCP dialog): slug for the catalog id, and a
// plain reachability probe — any HTTP response counts as reachable, since
// MCP endpoints often answer 404/405 to a bare GET. No MCP handshake here.
function mcpSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function mcpUrlReachable(url) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? require('https') : require('http');
      const req = lib.get(url, { timeout: 8000 }, (res) => { try { res.resume(); } catch (e) {} resolve(true); });
      req.on('timeout', () => { try { req.destroy(); } catch (e) {} resolve(false); });
      req.on('error', () => resolve(false));
    } catch (e) { resolve(false); }
  });
}
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API endpoints
  if (req.url === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'Connected',
      agent: 'REDCAT AI AGENT',
      avatar: '/assets/redcatlogo.png',
      time: new Date().toLocaleTimeString(),
      workspace: 'redcat'
    }));
    return;
  }

  if (req.url.startsWith('/api/workspace/file') && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const relPath = urlObj.searchParams.get('path') || '';
      const safePath = path.resolve(__dirname, relPath);
      if (!safePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }
      if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const content = fs.readFileSync(safePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(content);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(e.message);
    }
    return;
  }

  // Real model calls for the code view. The key is forwarded to the
  // provider only; it is never logged and never stored on the server.

  // Real model calls for the main chat. Same key rule:
  // the key is forwarded to the provider only, never logged, never stored here.
async function fetchProviderModels(provider, key) {
  const get = async (url, headers) => {
    const r = await fetch(url, { headers: headers || {}, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('Provider list failed (HTTP ' + r.status + ').');
    return r.json();
  };
  const ids = (arr) => [...new Set((arr || []).map(x => String(x)).filter(Boolean))].sort();
  if (provider === 'openrouter') {
    const j = await get('https://openrouter.ai/api/v1/models', key ? { Authorization: 'Bearer ' + key } : {});
    return ids((j.data || []).map(m => m.id));
  }
  if (provider === 'gemini') {
    if (!key) throw new Error('Missing API key for gemini.');
    const j = await get('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=1000');
    return ids((j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name || '').replace(/^models\//, '')));
  }
  if (provider === 'claude') {
    if (!key) throw new Error('Missing API key for claude.');
    const j = await get('https://api.anthropic.com/v1/models?limit=1000', { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
    return ids((j.data || []).map(m => m.id));
  }
  if (provider === 'openai') {
    if (!key) throw new Error('Missing API key for openai.');
    const j = await get('https://api.openai.com/v1/models', { Authorization: 'Bearer ' + key });
    return ids((j.data || []).map(m => m.id).filter(id => /^(gpt-|chatgpt-|o1|o3|o4)/.test(id)));
  }
  if (provider === 'deepseek') {
    if (!key) throw new Error('Missing API key for deepseek.');
    const j = await get('https://api.deepseek.com/v1/models', { Authorization: 'Bearer ' + key });
    return ids((j.data || []).map(m => m.id));
  }
  if (provider === 'groq') {
    if (!key) throw new Error('Missing API key for groq.');
    const j = await get('https://api.groq.com/openai/v1/models', { Authorization: 'Bearer ' + key });
    return ids((j.data || []).map(m => m.id));
  }
  if (provider === 'qwen') {
    if (!key) throw new Error('Missing API key for qwen.');
    const j = await get('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', { Authorization: 'Bearer ' + key });
    return ids((j.data || []).map(m => m.id));
  }
  if (provider === 'kimi') {
    if (!key) throw new Error('Missing API key for kimi.');
    try {
      const j = await get('https://api.moonshot.cn/v1/models', { Authorization: 'Bearer ' + key });
      return ids((j.data || []).map(m => m.id));
    } catch (e) {
      const j = await get('https://api.moonshot.ai/v1/models', { Authorization: 'Bearer ' + key });
      return ids((j.data || []).map(m => m.id));
    }
  }
  if (provider === 'ollama') {
    const j = await get('http://localhost:11434/api/tags');
    return ids((j.models || []).map(m => m.name));
  }
  throw new Error('Unknown provider: ' + provider + '.');
}

  if (req.url === '/api/models' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 200000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const provider = String(data.provider || '');
        const key = String(data.key || '');
        const models = await fetchProviderModels(provider, key);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(Buffer.from(JSON.stringify({ ok: true, provider: provider, models: models }), 'utf-8'));
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: sanitizeError(e.message || 'Model list failed.') })); } catch (e2) {}
      }
    });
    return;
  }

  if (req.url === '/api/chat-ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2000000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const provider = String(data.provider || '');
        const model = String(data.model || '');
        const key = String(data.key || '');
        const lang = String(data.lang || 'en');
        const messages = Array.isArray(data.messages) ? data.messages.filter(m => m && typeof m.content === 'string').slice(-40) : [];
        if (!provider || !model || !messages.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Missing provider, model, or messages.' }));
          return;
        }
        if (provider !== 'ollama' && !key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Missing API key for ' + provider + '.' }));
          return;
        }
        const text = await callChatModel(provider, model, key, chatSystemText(lang), messages);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(Buffer.from(JSON.stringify({ ok: true, text: text }), 'utf-8'));
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: sanitizeError(e.message || (e.code === 'ECONNREFUSED' ? 'Connection refused. If this is Ollama, start it with: ollama serve' : '') || 'Model call failed.') })); } catch (e2) {}
      }
    });
    return;
  }

  if (req.url.startsWith('/api/schedules/due') && req.method === 'GET') {
    const chatId = String(new URL(req.url, 'http://localhost').searchParams.get('chatId') || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, due: chatId ? dueSchedulesForChat(chatId) : [] }));
    return;
  }
  if (req.url === '/api/schedules/ack' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const r = ackSchedule(String(data.id || ''));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Bad request.' }));
      }
    });
    return;
  }
  if (req.url.startsWith('/api/schedules') && req.method === 'GET') {
    const chatId = String(new URL(req.url, 'http://localhost').searchParams.get('chatId') || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, schedules: chatId ? listSchedulesForChat(chatId) : [] }));
    return;
  }
  if (req.url === '/api/agent-runs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(Buffer.from(JSON.stringify({ ok: true, runs: listRuns() }), 'utf-8'));
    return;
  }

  if (req.url.startsWith('/api/agent-log') && req.method === 'GET') {
    try {
      const u = new URL(req.url, 'http://localhost');
      const runId = String(u.searchParams.get('runId') || '');
      if (!validRunId(runId)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid run id.' }));
        return;
      }
      const events = runId ? readLogEvents(runId) : [];
      if (!runId || !events.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'No log found for this run.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, runId: runId, events: events }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Could not read log.' }));
    }
    return;
  }

  // Agent loop for the main chat: terminal + browser tools, approval-first.
  // The key is forwarded to the provider only, never logged, never stored.
  if (req.url === '/api/agent-chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const provider = String(data.provider || '');
        const model = String(data.model || '');
        const key = String(data.key || '');
        const lang = String(data.lang || 'en');
        const chatId = String(data.chatId || '');
        const messages = normalizeAgentMessages(data.messages);
        // VISION: images sent with the chat message (data.images: [{name, dataUrl}]).
        // Validated here; stored memory-only on the run (never persisted, never logged).
        const vision = require('./vision.js');
        const visionCheck = vision.validateImages(Array.isArray(data.images) ? data.images : []);
        if (!visionCheck.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid image: ' + visionCheck.error }));
          return;
        }
        const visionImages = visionCheck.images;
        // Attachments (uploaded first via /api/upload): describe them to the
        // agent as turn context. Paths are validated to stay under uploads/.
        const fmtUpBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
        const rawAtt = Array.isArray(data.attachments) ? data.attachments : [];
        const attBlocks = [];
        for (const a of rawAtt) {
          if (!a || typeof a !== 'object') continue;
          const aKind = String(a.kind || 'file');
          const aName = String(a.name || '').slice(0, 200);
          const aFiles = (Array.isArray(a.files) ? a.files : []).filter(f => f && typeof f === 'object' && typeof f.path === 'string' && f.path.startsWith('uploads/') && f.path.indexOf('..') === -1);
          if (!aFiles.length) continue;
          if (aKind === 'folder') {
            const shown = aFiles.slice(0, 50).map(f => f.path);
            attBlocks.push('- Folder "' + aName + '" (' + aFiles.length + ' files, ' + fmtUpBytes(Number(a.size || 0)) + '): ' + shown.join(', ') + (aFiles.length > 50 ? ', ...' : ''));
          } else {
            for (const f of aFiles) attBlocks.push('- ' + String(f.name || '').slice(0, 200) + ' (' + String(f.type || 'file') + ', ' + fmtUpBytes(Number(f.size || 0)) + ') — path: ' + f.path);
          }
        }
        // VISION: image names go into the same attachment note (never data URLs).
        for (const im of visionImages) attBlocks.push('- Image "' + im.name + '" (attached image)');
        if (attBlocks.length && messages.length) {
          const visionCapable = vision.isVisionModel(provider, model);
          const block = (visionCapable && visionImages.length)
            ? '[User attached files — saved on this PC. Images attached below are sent to this vision-capable model as image parts (each provider resizes to about 800x800; send large design images as crops/sections):\n' + attBlocks.join('\n') + ']'
            : '[User attached files — saved on this PC. Text files can be read with the terminal tool; image pixels cannot be seen by the model, only filenames and paths:\n' + attBlocks.join('\n') + ']';
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'user') lastMsg.content = (lastMsg.content || '') + '\n\n' + block;
          else messages.push({ role: 'user', content: block });
        }
        if (!provider || !model || !messages.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Missing provider, model, or messages.' }));
          return;
        }
        // 7-POINTS (7) KIMI K3 PIN (code-enforced): a chat that started on a
        // Kimi K3 model cannot switch models mid-session — K3 thinking history
        // must be replayed in full (Moonshot docs: return the complete
        // assistant message unchanged in multi-turn conversations). Pins are
        // in-memory only and clear on server restart.
        if (chatId) {
          const pinned = chatModelPins[chatId];
          const newIsK3 = /^kimi-k3/i.test(model);
          const pinnedIsK3 = !!pinned && /^kimi-k3/i.test(pinned);
          if (pinned && pinned !== model && (newIsK3 || pinnedIsK3)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kimi K3 sessions cannot switch models mid-session (thinking history must be replayed in full). Start a new chat to use a different model.' }));
            return;
          }
          if (!pinned && newIsK3) chatModelPins[chatId] = model;
        }
        if (provider !== 'ollama' && !key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Missing API key for ' + provider + '.' }));
          return;
        }
        const run = { id: 'agent-' + Date.now() + '-' + (++agentRunSeq), provider: provider, model: model, key: key, lang: lang, history: messages, pendingApproval: null, recentTools: [], cancelled: false, waitingForApproval: false, waitingForPlan: false, plan: null, planApproved: false, memoryText: loadMemoryText(memoryDir()), skillIndex: loadSkillsIndex(), chatId: chatId, denyCount: 0, policy: (data.policy === 'never' ? 'never' : 'ask'), planMode: false, todos: [], visionImages: visionImages, connectorStates: sanitizeConnectorStates(data.connectorStates), providerStates: sanitizeProviderStates(data.providerStates), usage: freshUsage(), visionVerifyUsed: false, visionVerifyShots: 0, visionVerifyPhase: false, visionStrikes: {}, strikeTripped: '', strikeSecondChance: false };
        appendLogEvent(run, 'run/start', { provider: provider, model: model, lang: lang, chatId: chatId, policy: run.policy });
        appendLogEvent(run, 'turn/start', {});
        appendLogEvent(run, 'user/message', { content: (messages && messages.length ? String(messages[messages.length - 1].content || '') : ''), source: 'chat' });
        agentRuns[run.id] = run;
        visionStore[run.id] = visionImages;
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        const progress = (tool, args, thought) => { try { const s = activityStep(tool, args); res.write(JSON.stringify({ type: 'progress', step: run.step, tool: tool, label: s.label, detail: s.detail, thought: thought || '' }) + '\n'); } catch (e) {} };
        res.on('close', () => { if (!run.waitingForApproval && !run.waitingForPlan) run.cancelled = true; });
        // TOKENOPT (v1.0.15) FAST PATH - greetings / small-talk skip the full
        // agent context (no tools, no skills, no MCP list, no long history).
        // Same provider/model the user picked (never a silent model swap);
        // minimal prompt + last 4 messages only. ANY doubt routes to the
        // full agent below. A failed fast call falls through to the full
        // agent - a greeting must never fail the chat.
        {
          const lastUserMsg = (messages || []).filter(m => m && m.role === 'user').pop();
          const prevAssistantMsg = (messages || []).filter(m => m && m.role === 'assistant').pop();
          const fastDecision = tokenopt.classifyFastPath(lastUserMsg ? lastUserMsg.content : '', { hasAttachments: (visionImages && visionImages.length > 0) || (rawAtt && rawAtt.length > 0), lastAssistantEndsWithQuestion: !!(prevAssistantMsg && typeof prevAssistantMsg.content === 'string' && prevAssistantMsg.content.trim().endsWith('?')) });
          if (fastDecision.route === 'fast') {
            try {
              const fastHistory = normalizeAgentMessages(run.history).slice(-4);
              const fastText = await callChatModel(run.provider, run.model, run.key, chatSystemText(run.lang || 'en'), fastHistory, run.usage);
              const fastClean = cleanFinalText(fastText);
              console.log('[tokenopt-fast] route=fast reason=' + fastDecision.reason + ' text=' + JSON.stringify(String(lastUserMsg.content || '').slice(0, 60)));
              appendLogEvent(run, 'model/call', { step: 0, fastPath: true, reason: fastDecision.reason });
              appendLogEvent(run, 'model/reply', { step: 0, kind: 'final', final: fastClean });
              appendLogEvent(run, 'turn/end', { status: 'done', reason: 'done' });
              run.history.push({ role: 'assistant', content: fastClean });
              run.status = 'done'; saveRun(run);
              logAgentRun(memoryDir(), run.history[0] ? run.history[0].content : '', fastClean);
              delete agentRuns[run.id]; delete visionStore[run.id];
              res.end(JSON.stringify({ ok: true, status: 'done', text: fastClean, thought: '' }) + '\n');
              return;
            } catch (e) { try { console.log('[tokenopt-fast] failed, falling back to full agent: ' + (e && e.message ? String(e.message).slice(0, 120) : 'error')); } catch (e2) {} }
          } else {
            try { console.log('[tokenopt-fast] route=full reason=' + fastDecision.reason + ' text=' + JSON.stringify(String(lastUserMsg ? lastUserMsg.content : '').slice(0, 60))); } catch (e2) {}
          }
        }
        const outcome = await runAgentLoop(run, progress);
        if (outcome.status === 'cancelled') { delete agentRuns[run.id]; delete visionStore[run.id]; try { fs.unlinkSync(runFilePath(run.id)); } catch (e) {} try { fs.unlinkSync(runLogPath(run.id)); } catch (e) {} return; }
        if (outcome.status === 'need_approval') {
          run.waitingForApproval = true;
          run.status = 'waiting_approval'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'need_approval', runId: run.id, approval: outcome.approval, thought: outcome.thought || '' }) + '\n');
          return;
        }
        if (outcome.status === 'plan') {
          run.waitingForPlan = true;
          run.status = 'waiting_plan'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'plan', runId: run.id, plan: outcome.plan, thought: outcome.thought || '' }) + '\n');
          return;
        }
        run.status = (outcome.status === 'error' ? 'failed' : 'done'); saveRun(run);
        delete agentRuns[run.id]; delete visionStore[run.id];
        if (outcome.status === 'error') {
          res.end(JSON.stringify({ ok: false, error: outcome.error }) + '\n');
          return;
        }
        logAgentRun(memoryDir(), run.history[0] ? run.history[0].content : '', outcome.text);
        res.end(JSON.stringify({ ok: true, status: 'done', text: outcome.text, thought: outcome.thought || '' }) + '\n');
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: sanitizeError(e.message || (e.code === 'ECONNREFUSED' ? 'Connection refused. If this is Ollama, start it with: ollama serve' : '') || 'Model call failed.') })); } catch (e2) {}
      }
    });
    return;
  }

  // SELFDEV-START — self-development harness v1 (ADDITIVE ONLY).
  // Adds /api/selfdev/* endpoints. Does NOT modify the harness system prompt
  // text, the hardblock list, approval-gate logic, or sandbox modes.
  // Proposals land in child slices only; adopts need eval + user approval.
  const selfdev = require('./selfdev.js');
  function selfdevBody(req, res, fn) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const out = fn(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'SELFDEV_ERROR' })); } catch (e2) {}
      }
    });
  }
  if (req.url === '/api/selfdev/observe' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.observeRun(d.runId)); return; }
  if (req.url === '/api/selfdev/propose' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.propose(d.runId, d.childId, d.role, d.target, d.content)); return; }
  if (req.url === '/api/selfdev/mergecard' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.mergeCard(d.runId)); return; }
  if (req.url === '/api/selfdev/eval' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.evalProposal(d.runId, d.baseline, d.proposal)); return; }
  if (req.url === '/api/selfdev/adopt' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.adopt(d.runId, d.approved)); return; }
  if (req.url === '/api/selfdev/rollback' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.rollback(d.runId, d.rollback)); return; }
  if (req.url === '/api/selfdev/log' && req.method === 'POST') { selfdevBody(req, res, (d) => selfdev.readLog(d.runId)); return; }
  // SELFDEV-END
  // CURATOR-START — curator queue (ADDITIVE ONLY).
  // Adds /api/curator/* endpoints on top of selfdev state. The curator never
  // adopts, never rolls back, never approves, and never deletes anything:
  // archive only moves a staged proposal out of the active queue.
  const curator = require('./curator.js');
  function curatorBody(req, res, fn) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const out = fn(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'CURATOR_ERROR' })); } catch (e2) {}
      }
    });
  }
  if (req.url === '/api/curator/queue' && req.method === 'POST') { curatorBody(req, res, (d) => curator.queue()); return; }
  if (req.url === '/api/curator/review' && req.method === 'POST') { curatorBody(req, res, (d) => curator.review(d.runId)); return; }
  if (req.url === '/api/curator/archive' && req.method === 'POST') { curatorBody(req, res, (d) => curator.archive(d.runId)); return; }
  // CURATOR-END
  // CHATSTORE-START — server-side chat store (ADDITIVE ONLY).
  // Chats live as files under chats/ on this PC only (no cloud). The browser
  // treats the server as the source of truth and keeps localStorage as a
  // fallback. Main chat is never deletable (app invariant); DELETE on 'main'
  // is refused by chatstore.js. Does NOT touch SELFDEV, VISION, CURATOR, or
  // the system prompt.
  const chatstore = require('./chatstore.js');
  function chatstoreBody(req, res, fn) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 6000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const out = fn(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'CHATSTORE_ERROR' })); } catch (e2) {}
      }
    });
  }
  function chatstoreId(req) {
    const m = /^\/api\/chats\/([^\/\?]+)/.exec(req.url);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
  }
  function chatstoreSend(res, out) {
    try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); } catch (e) {}
  }
  function chatstoreSafe(res, fn) {
    try { chatstoreSend(res, fn()); } catch (e) { chatstoreSend(res, { ok: false, error: 'CHATSTORE_ERROR' }); }
  }
  if ((req.url === '/api/chats' || req.url.startsWith('/api/chats?')) && req.method === 'GET') { chatstoreSafe(res, () => chatstore.list()); return; }
  if (req.url.startsWith('/api/chats/') && req.method === 'GET') { chatstoreSafe(res, () => chatstore.get(chatstoreId(req))); return; }
  if (req.url.startsWith('/api/chats/') && req.method === 'DELETE') { chatstoreSafe(res, () => chatstore.remove(chatstoreId(req))); return; }
  if (req.url.startsWith('/api/chats/') && req.method === 'POST' && /\/delete$/.test(req.url)) { chatstoreSafe(res, () => chatstore.remove(chatstoreId(req))); return; }
  if (req.url.startsWith('/api/chats/') && req.method === 'POST') { chatstoreBody(req, res, (d) => chatstore.save(chatstoreId(req), d)); return; }
  // CHATSTORE-END
  if (req.url === '/api/agent-decide' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const runId = String(data.runId || '');
        const approved = data.approved === true;
        const run = getRunForDecision(runId, data);
        if (!run || !run.pendingApproval) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Approval run expired. Please send the message again.' }));
          return;
        }
        if (data.policy === 'never' || data.policy === 'ask') run.policy = data.policy;
        const pending = run.pendingApproval;
        run.pendingApproval = null;
        const denyReason = String(data.reason || '').slice(0, 300);
        const policyDenied = (run.policy === 'never' && approved);
        const effectiveApproved = approved && !policyDenied;
        const decidedEntry = recordApprovalDecided(run, effectiveApproved ? 'allowed' : 'denied', policyDenied ? 'policy: approvals set to Never' : denyReason);
        if (decidedEntry) appendLogEvent(run, 'approval/decided', { approvalId: decidedEntry.id, decision: decidedEntry.decision, reason: decidedEntry.reason });
        saveRun(run);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        const progress = (tool, args, thought) => { try { const s = activityStep(tool, args); res.write(JSON.stringify({ type: 'progress', step: run.step, tool: tool, label: s.label, detail: s.detail, thought: thought || '' }) + '\n'); } catch (e) {} };
        run.waitingForApproval = false;
        if (effectiveApproved) {
          run.denyCount = 0;
          if (pending.tool === 'browser_control') {
            appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'browser_control', args: pending.url });
            const r = await browserControl({ url: pending.url, actions: pending.actions || undefined, fillSelector: pending.fillSelector || undefined, fillValue: pending.fillValue || '', clickSelector: pending.clickSelector || undefined });
            pushToolResult(run, 'browser_control', pending.url, 'Tool result for browser_control (approved by user): ' + (r.ok ? ('(title: ' + r.title + ')\n' + r.text) : ('failed - ' + r.error)), r.ok);
            progress('browser_control', { url: pending.url }, run.lastThought || '');
          } else if (pending.tool === 'skill_read') {
            if (!Array.isArray(run.userApprovedSkills)) run.userApprovedSkills = [];
            if (run.userApprovedSkills.indexOf(pending.name) === -1) run.userApprovedSkills.push(pending.name);
            appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'skill_read', args: pending.name });
            const s2 = readSkill(pending.name);
            pushToolResult(run, 'skill_read', { name: pending.name }, s2.ok ? ('Tool result for skill_read ' + pending.name + ' (approved by user):\n<skill_content name="' + pending.name + '">\n' + s2.text + '\n</skill_content>') : ('Tool result for skill_read failed: ' + s2.error), s2.ok);
            progress('skill_read', { name: pending.name }, run.lastThought || '');
          } else if (pending.tool === 'skill_save') {
            appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'skill_save', args: pending.name });
            const s = saveSkill(pending.name, pending.when || '', pending.content || '');
            pushToolResult(run, 'skill_save', { name: pending.name }, 'Tool result for skill_save (approved by user): ' + (s.ok ? 'saved.' : ('refused - ' + s.error)), s.ok);
            progress('skill_save', { name: pending.name }, run.lastThought || '');
          } else if (pending.tool === 'skill_install') {
            // SKILLS-ADD (v1.0.12): chat path — install on Allow. Uses the
            // SAME installPrepared as the HTTP form (re-scan + BLOCK + conflict
            // + cap). The prepToken is consumed only on success.
            appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'skill_install', args: pending.name });
            const prep = skillAdd.peekPrepare(pending.prepToken);
            if (!prep) {
              pushToolResult(run, 'skill_install', { prepToken: pending.prepToken }, 'Tool result for skill_install (approved by user) failed: the prepared skill expired (prepares expire after 15 minutes). Call skill_prepare again to fetch it fresh.', false);
            } else {
              const s = skillAdd.installPrepared(prep, { description: pending.description || '', override: pending.override || null, allowOverwrite: !!pending.allowOverwrite }, skillsDir(), skillAdd.userSkillsDir());
              if (s.ok) skillAdd.clearPrepare(pending.prepToken);
              skillCatalogCache = { digest: '', index: '' };
              pushToolResult(run, 'skill_install', { name: pending.name }, 'Tool result for skill_install (approved by user): ' + (s.ok ? ('installed "' + s.name + '". It joins the skill catalog from the NEXT run and appears in the Skills page. Tell the user it is installed.') : ('refused - ' + (s.error || 'INSTALL_FAILED') + (s.message ? ': ' + s.message : '') + (s.scan ? ' (scan: ' + s.scan.verdict + ')' : ''))), s.ok);
            }
            progress('skill_install', { name: pending.name }, run.lastThought || '');
          } else if (pending.tool === 'mcp_call') {
            appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'mcp_call', args: pending.toolName });
            try {
              const r = await mcp.callTool(pending.server, pending.toolName, pending.args || {});
              pushToolResult(run, 'mcp_' + pending.server + '_' + pending.toolName, pending.args || {}, 'Tool result for mcp_' + pending.server + '_' + pending.toolName + ' (approved by user)' + (r.ok === false ? ' failed' : '') + ': ' + (r.text || ''), r.ok !== false);
            } catch (e) {
              pushToolResult(run, 'mcp_' + pending.server + '_' + pending.toolName, pending.args || {}, 'Tool result for mcp_' + pending.server + '_' + pending.toolName + ' failed: ' + sanitizeError(e && e.message), false);
            }
            progress('mcp_call', { tool: pending.toolName }, run.lastThought || '');
          } else if (pending.tool === 'model_switch') {
            // SMART-MODEL (2026-11-05): the user approved the switch. The frontend sends the
            // target credentials in the decide body (getRunForDecision already applied them);
            // validate here, then record the switch as a tool result and continue the task.
            const targetProvider = String(pending.provider || '');
            const targetModel = String(pending.model || '');
            const bodyKey = String(data.key || '').trim();
            const pinned = run.chatId ? chatModelPins[run.chatId] : null;
            const pinBlocks = pinned && pinned !== targetModel && (/^kimi-k3/i.test(targetModel) || /^kimi-k3/i.test(pinned));
            if (pinBlocks) {
              run.provider = String(pending.prevProvider || run.provider); run.model = String(pending.prevModel || run.model);
              appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Model switch refused: this chat is pinned to a Kimi K3 model and cannot switch models mid-session.' });
              run.history.push({ role: 'user', content: 'Tool result for model_switch failed: this chat is pinned to a Kimi K3 model and cannot switch models mid-session. Start a new chat to use a different model. Continue with the current model.' });
            } else if (targetProvider !== 'ollama' && !bodyKey) {
              run.provider = String(pending.prevProvider || run.provider); run.model = String(pending.prevModel || run.model);
              appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Model switch failed: no saved key for ' + targetProvider + '.' });
              run.history.push({ role: 'user', content: 'Tool result for model_switch failed: no saved key for ' + targetProvider + '. Tell the user to add its key in Settings, then ask again. Continue with the current model.' });
            } else {
              run.provider = targetProvider; run.model = targetModel; if (bodyKey) run.key = bodyKey;
              if (/^kimi-k3/i.test(targetModel) && run.chatId) chatModelPins[run.chatId] = targetModel;
              appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'model_switch', args: targetProvider + ' / ' + targetModel });
              pushToolResult(run, 'model_switch', { provider: targetProvider, model: targetModel }, 'Tool result for model_switch (approved by user): switched to ' + targetProvider + ' / ' + targetModel + ' for this task. Continue the task with this model.', true);
            }
            progress('model_switch', { provider: targetProvider, model: targetModel }, run.lastThought || '');
          } else {
            appendLogEvent(run, 'tool/call', { step: run.step || 0, tool: 'terminal_exec', args: pending.command });
            const result = await runTerminal(pending.command, pending.cwd === '(project folder)' ? undefined : pending.cwd, pending.timeoutMs);
            // 7-POINTS (5) POST-WRITE HOOK (code-enforced): if the model asked
            // for verification paths, check each one actually landed on disk
            // and append the result - never trust a write claim without it.
            let verifyLines = '';
            try {
              const vlist = Array.isArray(pending.verify) ? pending.verify : [];
              if (vlist.length) {
                const base = (pending.cwd && pending.cwd !== '(project folder)') ? pending.cwd : __dirname;
                verifyLines = '\n' + vlist.map(vp => {
                  try {
                    const full = path.isAbsolute(vp) ? vp : path.join(base, vp);
                    if (fs.existsSync(full)) { const st = fs.statSync(full); return 'VERIFY: ' + vp + ' exists (' + st.size + ' bytes)'; }
                    return 'VERIFY FAILED: ' + vp + ' not found';
                  } catch (e) { return 'VERIFY FAILED: ' + vp + ' (check error)'; }
                }).join('\n');
                appendLogEvent(run, 'tool/verify', { step: run.step || 0, paths: vlist, lines: verifyLines });
              }
            } catch (e) {}
            pushToolResult(run, 'terminal_exec', pending.command, 'Tool result for terminal_exec (command: ' + pending.command + ', approved by user):\n' + (result.ok ? result.output : ('ERROR: ' + result.error)) + verifyLines , result.ok);
            // VISION-VERIFY-STRIKE (approved-write path) — same rule as the loop path.
            if (!result.ok && run.visionVerifyPhase) {
              const skAppr = applyVerifyStrike(run, result.error || '');
              if (skAppr.action === 'fatal') {
                run.status = 'failed'; saveRun(run);
                delete agentRuns[run.id]; delete visionStore[run.id];
                res.end(JSON.stringify({ ok: false, error: skAppr.error }) + '\n');
                return;
              }
            }
            progress('terminal_exec', { command: pending.command }, run.lastThought || '');
          }
        } else {
          if (pending.tool === 'skill_read') {
            appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for skill_read: the user DENIED loading side-effect skill ' + (pending.name || '') + '. Do not load or follow it without asking again.' });
            run.history.push({ role: 'user', content: 'Tool result for skill_read: the user DENIED loading side-effect skill ' + (pending.name || '') + '. Do not load or follow it.' });
          } else if (pending.tool === 'skill_save') {
            appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for skill_save: the user DENIED saving skill ' + (pending.name || '') + (denyReason ? ' (reason: ' + denyReason + ')' : '') + '. Do not retry it without showing a revised draft.' });
            run.history.push({ role: 'user', content: 'Tool result for skill_save: the user DENIED saving skill ' + (pending.name || '') + '. Do not retry it without showing a revised draft.' });
          } else if (pending.tool === 'skill_install') {
            appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for skill_install: the user DENIED installing skill ' + (pending.name || '') + (denyReason ? ' (reason: ' + denyReason + ')' : '') + '. Do not retry it without showing a revised preview.' });
            run.history.push({ role: 'user', content: 'Tool result for skill_install: the user DENIED installing skill ' + (pending.name || '') + '. Do not retry it. Tell the user the skill was not installed.' });
          } else if (pending.tool === 'browser_control') {
            appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for browser_control: the user DENIED this browser fill/click' + (denyReason ? ' (reason: ' + denyReason + ')' : '') + '. Do not retry it without showing a revised plan.' });
            run.history.push({ role: 'user', content: 'Tool result for browser_control: the user DENIED this browser fill/click. Do not retry it. Explain briefly and suggest a safer alternative.' });
          } else if (pending.tool === 'mcp_call') {
            appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for mcp_' + pending.server + '_' + pending.toolName + ': the user DENIED this MCP call' + (denyReason ? ' (reason: ' + denyReason + ')' : '') + '. Do not retry it without showing a revised plan.' });
            run.history.push({ role: 'user', content: 'Tool result for mcp_' + pending.server + '_' + pending.toolName + ': the user DENIED this MCP call. Do not retry it.' });
          } else if (pending.tool === 'model_switch') {
            // SMART-MODEL (2026-11-05): the user kept the current model — restore it and continue.
            run.provider = String(pending.prevProvider || run.provider); run.model = String(pending.prevModel || run.model);
            appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for model_switch: the user kept the current model (' + run.provider + ' / ' + run.model + '). Do not ask to switch again for this task.' });
            run.history.push({ role: 'user', content: 'Tool result for model_switch: the user kept the current model (' + run.provider + ' / ' + run.model + '). Continue with it for this task; do not ask to switch again for this task.' });
          } else {
          appendLogEvent(run, 'loop/note', { step: run.step || 0, content: 'Tool result for terminal_exec: the user DENIED this command' + (policyDenied ? ' (approvals are set to Never for this session)' : (denyReason ? ' (reason: ' + denyReason + ')' : '')) + '. Do not retry it. Explain briefly and suggest a safer alternative.'  });
          run.history.push({ role: 'user', content: 'Tool result for terminal_exec: the user DENIED this command' + (policyDenied ? ' (approvals are set to Never for this session)' : (denyReason ? ' (reason: ' + denyReason + ')' : '')) + '. Do not retry it. Explain briefly and suggest a safer alternative.' });
          }
          run.denyCount = (run.denyCount || 0) + 1;
          if (run.denyCount >= 3) {
            run.status = 'done';
            saveRun(run);
            logAgentRun(memoryDir(), run.history[0] ? run.history[0].content : '', 'Stopped after 3 consecutive denials.');
            delete agentRuns[run.id]; delete visionStore[run.id];
            appendLogEvent(run, 'turn/end', { status: 'done', reason: 'denied-breaker' });
            res.end(JSON.stringify({ ok: true, status: 'done', text: 'Stopped: 3 commands denied in a row. Please rephrase the task or approve a safer step.', thought: '' }) + '\n');
            return;
          }
        }
        res.on('close', () => { if (!run.waitingForApproval && !run.waitingForPlan) run.cancelled = true; });
        const outcome = await runAgentLoop(run, progress);
        if (outcome.status === 'cancelled') { delete agentRuns[run.id]; delete visionStore[run.id]; try { fs.unlinkSync(runFilePath(run.id)); } catch (e) {} try { fs.unlinkSync(runLogPath(run.id)); } catch (e) {} return; }
        if (outcome.status === 'need_approval') {
          run.waitingForApproval = true;
          run.status = 'waiting_approval'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'need_approval', runId: run.id, approval: outcome.approval, thought: outcome.thought || '' }) + '\n');
          return;
        }
        if (outcome.status === 'plan') {
          run.waitingForPlan = true;
          run.status = 'waiting_plan'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'plan', runId: run.id, plan: outcome.plan, thought: outcome.thought || '' }) + '\n');
          return;
        }
        run.status = (outcome.status === 'error' ? 'failed' : 'done'); saveRun(run);
        delete agentRuns[run.id]; delete visionStore[run.id];
        if (outcome.status === 'error') {
          res.end(JSON.stringify({ ok: false, error: outcome.error }) + '\n');
          return;
        }
        logAgentRun(memoryDir(), run.history[0] ? run.history[0].content : '', outcome.text);
        res.end(JSON.stringify({ ok: true, status: 'done', text: outcome.text, thought: outcome.thought || '' }) + '\n');
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: sanitizeError(e.message || 'Model call failed.') })); } catch (e2) {}
      }
    });
    return;
  }

  if (req.url === '/api/agent-plan' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const runId = String(data.runId || '');
        const approved = data.approved === true;
        const run = getRunForDecision(runId, data);
        if (!run || !run.plan) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Approval run expired. Please send the message again.' }));
          return;
        }
        if (data.policy === 'never' || data.policy === 'ask') run.policy = data.policy;
        const plan = run.plan;
        run.plan = null;
        run.waitingForPlan = false;
        run.planMode = false;
        appendLogEvent(run, 'plan/decided', { approved: approved, plan: plan });
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        const progress = (tool, args, thought) => { try { const s = activityStep(tool, args); res.write(JSON.stringify({ type: 'progress', step: run.step, tool: tool, label: s.label, detail: s.detail, thought: thought || '' }) + '\n'); } catch (e) {} };
        if (approved) {
          run.planApproved = true;
          // 7-POINTS (2) SPEC.md (code-enforced): the approved plan is saved
          // as the artefact before any code write runs.
          const specPath = writeSpecFile(run, plan);
          if (specPath) { run.specPath = specPath; run.specApproved = true; appendLogEvent(run, 'spec/written', { path: specPath, plan: plan }); }
          run.history.push({ role: 'user', content: 'User approved this plan: ' + JSON.stringify(plan) + '. Now execute it step by step, one tool at a time. In each thought, say which step you are on (for example Step 2/8).' + (specPath ? ' The approved plan was saved as SPEC.md at ' + specPath + ' - build only what it says.' : '') });
        } else {
          run.history.push({ role: 'user', content: 'User did NOT approve this plan. Ask briefly what to change, or propose a simpler plan.' });
        }
        res.on('close', () => { if (!run.waitingForApproval && !run.waitingForPlan) run.cancelled = true; });
        const outcome = await runAgentLoop(run, progress);
        if (outcome.status === 'cancelled') { delete agentRuns[run.id]; delete visionStore[run.id]; try { fs.unlinkSync(runFilePath(run.id)); } catch (e) {} try { fs.unlinkSync(runLogPath(run.id)); } catch (e) {} return; }
        if (outcome.status === 'need_approval') {
          run.waitingForApproval = true;
          run.status = 'waiting_approval'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'need_approval', runId: run.id, approval: outcome.approval, thought: outcome.thought || '' }) + '\n');
          return;
        }
        if (outcome.status === 'plan') {
          run.waitingForPlan = true;
          run.status = 'waiting_plan'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'plan', runId: run.id, plan: outcome.plan, thought: outcome.thought || '' }) + '\n');
          return;
        }
        run.status = (outcome.status === 'error' ? 'failed' : 'done'); saveRun(run);
        delete agentRuns[run.id]; delete visionStore[run.id];
        if (outcome.status === 'error') {
          res.end(JSON.stringify({ ok: false, error: outcome.error }) + '\n');
          return;
        }
        logAgentRun(memoryDir(), run.history[0] ? run.history[0].content : '', outcome.text);
        res.end(JSON.stringify({ ok: true, status: 'done', text: outcome.text, thought: outcome.thought || '' }) + '\n');
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: sanitizeError(e.message || 'Model call failed.') })); } catch (e2) {}
      }
    });
    return;
  }

  if (req.url === '/api/agent-resume' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const runId = String(data.runId || '');
        let run = agentRuns[runId];
        if (!run) {
          const disk = loadRunFromDisk(runId);
          if (disk) { run = restoreRun(disk, String(data.provider || ''), String(data.model || ''), String(data.key || '')); agentRuns[runId] = run; }
        } else {
          if (data.provider) run.provider = String(data.provider);
          if (data.model) run.model = String(data.model);
          if (data.key) run.key = String(data.key);
        }
        if (!run) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Approval run expired. Please send the message again.' }));
          return;
        }
        if (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'This run already finished.' }));
          return;
        }
        run.status = 'active';
        run.waitingForApproval = false;
        run.waitingForPlan = false;
        repairLog(run);
        appendLogEvent(run, 'turn/start', { resumed: true });
        if (data.policy === 'never' || data.policy === 'ask') run.policy = data.policy;
        if (run.pendingApproval) {
          const expiredEntry = recordApprovalDecided(run, 'expired', 'run resumed without answering');
          if (expiredEntry) appendLogEvent(run, 'approval/decided', { approvalId: expiredEntry.id, decision: 'expired', reason: 'run resumed without answering' });
          run.pendingApproval = null;
          saveRun(run);
        }
        run.history.push({ role: 'user', content: 'Resumed after interruption (device or server restarted). The last step may or may not have completed - VERIFY current state with a read-only command before re-running any write command, then continue from the last completed step.' });
        appendLogEvent(run, 'user/message', { content: 'Resumed after interruption (device or server restarted). The last step may or may not have completed - VERIFY current state with a read-only command before re-running any write command, then continue from the last completed step.' , source: 'resume-verify' });
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        const progress = (tool, args, thought) => { try { const s = activityStep(tool, args); res.write(JSON.stringify({ type: 'progress', step: run.step, tool: tool, label: s.label, detail: s.detail, thought: thought || '' }) + '\n'); } catch (e) {} };
        res.on('close', () => { if (!run.waitingForApproval && !run.waitingForPlan) run.cancelled = true; });
        const outcome = await runAgentLoop(run, progress);
        if (outcome.status === 'cancelled') { delete agentRuns[run.id]; delete visionStore[run.id]; try { fs.unlinkSync(runFilePath(run.id)); } catch (e) {} try { fs.unlinkSync(runLogPath(run.id)); } catch (e) {} return; }
        if (outcome.status === 'need_approval') {
          run.waitingForApproval = true;
          run.status = 'waiting_approval'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'need_approval', runId: run.id, approval: outcome.approval, thought: outcome.thought || '' }) + '\n');
          return;
        }
        if (outcome.status === 'plan') {
          run.waitingForPlan = true;
          run.status = 'waiting_plan'; saveRun(run);
          res.end(JSON.stringify({ ok: true, status: 'plan', runId: run.id, plan: outcome.plan, thought: outcome.thought || '' }) + '\n');
          return;
        }
        run.status = (outcome.status === 'error' ? 'failed' : 'done'); saveRun(run);
        delete agentRuns[run.id]; delete visionStore[run.id];
        if (outcome.status === 'error') {
          res.end(JSON.stringify({ ok: false, error: outcome.error }) + '\n');
          return;
        }
        logAgentRun(memoryDir(), run.history[0] ? run.history[0].content : '', outcome.text);
        res.end(JSON.stringify({ ok: true, status: 'done', text: outcome.text, thought: outcome.thought || '' }) + '\n');
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: sanitizeError(e.message || 'Model call failed.') })); } catch (e2) {}
      }
    });
    return;
  }

  if (req.url === '/api/agent-cancel' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const run = agentRuns[String(data.runId || '')];
        if (run) { appendLogEvent(run, 'run/cancelled', {}); appendLogEvent(run, 'turn/end', { status: 'cancelled', reason: 'cancelled' }); run.cancelled = true; delete agentRuns[String(data.runId || '')]; }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Social direct connect v2: Discord/Slack OAuth + Telegram pairing.
  // Developer config lives ONLY in social-config.json next to server.js
  // (never in chat, never in public/, never served). Server state lives
  // in social-state.json (workspace bot tokens from Slack OAuth, guild /
  // team labels, Telegram pairing). Neither file is ever returned by
  // any endpoint, and tokens are never logged or echoed.
  function loadSocialConfig() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'social-config.json'), 'utf-8')); } catch (e) { return {}; }
  }
  function loadSocialState() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'social-state.json'), 'utf-8')); } catch (e) { return {}; }
  }
  function saveSocialState(state) {
    try { const tmp = path.join(__dirname, 'social-state.json.tmp'); fs.writeFileSync(tmp, JSON.stringify(state, null, 2)); fs.renameSync(tmp, path.join(__dirname, 'social-state.json')); } catch (e) {}
  }
  function socialStatus() {
    const cfg = loadSocialConfig(); const st = loadSocialState();
    return {
      discord: { configured: !!cfg.discordClientId, connected: !!(st.discord && st.discord.addedAt), label: (st.discord && st.discord.label) || '', discordGateway: { on: !!(typeof gatewayState !== 'undefined' && gatewayState.discord.on), reason: (typeof gatewayState !== 'undefined' && gatewayState.discord.reason) || 'not configured' }, lastPrompt: (st.discord && st.discord.lastPrompt) || null, lastReply: (st.discord && st.discord.lastReply) || null },
      slack: { configured: !!cfg.slackClientId, connected: !!(st.slack && st.slack.team), label: (st.slack && st.slack.team) || '', slackSocket: { on: !!(typeof gatewayState !== 'undefined' && gatewayState.slack.on), reason: (typeof gatewayState !== 'undefined' && gatewayState.slack.reason) || 'not configured' }, lastPrompt: (st.slack && st.slack.lastPrompt) || null, lastReply: (st.slack && st.slack.lastReply) || null },
      telegram: { configured: !!cfg.telegramBotToken, username: cfg.telegramBotUsername || '', connected: !!(st.telegram && st.telegram.linkedChatId), label: (st.telegram && st.telegram.label) || '', lastPrompt: (st.telegram && st.telegram.lastPrompt) || null, lastReply: (st.telegram && st.telegram.lastReply) || null }
    };
  }
  const socialStates = {};
  function newSocialState(platform) {
    const s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    socialStates[s] = { platform, at: Date.now() }; return s;
  }
  function socialHtml(title, body) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>RedCat</title></head><body style="font-family:sans-serif;padding:32px;"><h2>' + title + '</h2><p>' + body + '</p><p>Is tab ko band karke RedCat mein wapas jao aur Social section mein Refresh dabao.</p></body></html>';
  }
  // Telegram pairing poller (only if a bot token is configured).
  let telegramOffset = 0; let telegramPolling = false;
  async function telegramPollOnce() {
    if (telegramPolling) return; telegramPolling = true;
    try {
      const cfg = loadSocialConfig(); if (!cfg.telegramBotToken) return;
      const r = await fetch('https://api.telegram.org/bot' + cfg.telegramBotToken + '/getUpdates?timeout=0&offset=' + telegramOffset);
      const j = await r.json(); if (!j || !j.ok || !Array.isArray(j.result)) return;
      for (const u of j.result) {
        telegramOffset = u.update_id + 1;
        const msg = u.message; if (!msg || !msg.chat) continue;
        const text = String(msg.text || '').trim(); const chatId = msg.chat.id;
        const st = loadSocialState(); st.telegram = st.telegram || {};
        if (text === '/start') {
          const code = String(Math.floor(100000 + Math.random() * 900000));
          st.telegram.pairing = { code, chatId, at: Date.now() };
          saveSocialState(st);
          await fetch('https://api.telegram.org/bot' + cfg.telegramBotToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'RedCat pairing code: ' + code + '\nIs code ko RedCat ke Social section mein Telegram ke neeche dalo.' }) });
        } else if (st.telegram.linkedChatId && chatId === st.telegram.linkedChatId) {
          st.telegram.lastPrompt = { text: text.slice(0, 500), at: new Date().toISOString() };
          saveSocialState(st);
        }
      }
    } catch (e) {} finally { telegramPolling = false; }
  }
  setInterval(telegramPollOnce, 3000);
  // Telegram outbound reply (Batch 2C): only to the paired linkedChatId, never to any other chat.
  async function telegramSendToLinked(text) {
    const cfg = loadSocialConfig(); if (!cfg.telegramBotToken) return { ok: false, error: 'Telegram bot is not set up yet.' };
    const st = loadSocialState(); const linked = st.telegram && st.telegram.linkedChatId;
    if (!linked) return { ok: false, error: 'Telegram is not paired yet. Send /start first, then pair with the pairing code.' };
    try {
      const r = await fetch('https://api.telegram.org/bot' + cfg.telegramBotToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: linked, text: String(text).slice(0, 4000) }) });
      const j = await r.json();
      if (!j || !j.ok) return { ok: false, error: 'Telegram send failed.' };
      st.telegram.lastReply = { text: String(text).slice(0, 500), at: new Date().toISOString() };
      saveSocialState(st);
      return { ok: true };
    } catch (e) { return { ok: false, error: 'Telegram send failed.' }; }
  }
  // SOCIAL GATEWAY FINAL SLICE (2026-10-30): Discord Gateway + Slack Socket Mode.
  // Built-ins only (global WebSocket, fetch) — no discord.js / @slack/bolt needed.
  // Both gateways: start ONLY when tokens are configured; owner-only allowlist
  // (config discordOwnerIds / slackOwnerIds; empty = NOBODY allowed, prompts are
  // dropped, never auto-replied); incoming owner prompts are STORED as lastPrompt
  // in social-state.json and shown in /api/social/status. NO model auto-reply
  // here — that needs a key and an explicit agent run; manual send endpoints
  // below are the approved reply path (same pattern as Telegram Batch 2C).
  // Tokens are never logged, never returned by any endpoint.
  const gatewayState = {
    discord: { on: false, reason: 'not configured', botId: '' },
    slack: { on: false, reason: 'not configured', botUserId: '' }
  };
  function gatewayOwnerIds(cfg, key) {
    const v = cfg[key]; if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }
  function gatewayRecord(platform, prompt) {
    const st = loadSocialState(); st[platform] = st[platform] || {};
    st[platform].lastPrompt = { text: String(prompt.text || '').slice(0, 500), from: String(prompt.from || ''), channel: String(prompt.channel || ''), at: new Date().toISOString() };
    saveSocialState(st); return st[platform].lastPrompt;
  }
  // Pure decision logic — unit-tested without any network (see gateway test).
  function gatewayDecide(platform, msg, botId, ownerIds) {
    if (!msg || typeof msg.text !== 'string') return { action: 'ignore', reason: 'no text' };
    if (msg.fromBot) return { action: 'ignore', reason: 'own bot message' };
    if (botId && msg.from === botId) return { action: 'ignore', reason: 'own bot message' };
    if (!ownerIds || ownerIds.length === 0) return { action: 'ignore', reason: 'allowlist empty — owner IDs not set in social-config.json' };
    if (!ownerIds.includes(String(msg.from))) return { action: 'ignore', reason: 'not allowlisted' };
    return { action: 'store', reason: 'owner prompt' };
  }
  function gatewayBackoff(attempt) { return [5000, 15000, 30000, 60000][Math.min(attempt, 3)]; }
  // --- Discord Gateway (wss://gateway.discord.gg, v10) ---
  let discordWs = null, discordHb = null, discordRetry = null, discordAttempt = 0, discordSeq = null;
  function discordGatewayConfig() {
    const cfg = loadSocialConfig(); const st = loadSocialState();
    const token = cfg.discordBotToken || (st.discord && st.discord.botToken) || '';
    return { token, ownerIds: gatewayOwnerIds(cfg, 'discordOwnerIds') };
  }
  function startDiscordGateway() {
    if (discordWs || discordRetry) return;
    const { token } = discordGatewayConfig();
    if (!token) { gatewayState.discord = { on: false, reason: 'not configured', botId: '' }; return; }
    if (typeof WebSocket === 'undefined') { gatewayState.discord = { on: false, reason: 'WebSocket not available in this Node build', botId: '' }; return; }
    try {
      discordWs = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    } catch (e) { gatewayState.discord = { on: false, reason: 'connect failed', botId: '' }; scheduleDiscordRetry(); return; }
    discordWs.on('message', (data) => {
      try {
        const pkt = JSON.parse(String(data)); if (pkt.s) discordSeq = pkt.s;
        if (pkt.op === 10) {
          const interval = pkt.d && pkt.d.heartbeat_interval ? pkt.d.heartbeat_interval : 41250;
          if (discordHb) clearInterval(discordHb);
          discordHb = setInterval(() => { try { if (discordWs) discordWs.send(JSON.stringify({ op: 1, d: discordSeq })); } catch (e) {} }, interval);
          discordWs.send(JSON.stringify({ op: 2, d: { token: token, intents: 37377, properties: { os: 'windows', browser: 'redcat', device: 'redcat' } } }));
        } else if (pkt.op === 0 && pkt.t === 'READY') {
          discordAttempt = 0; gatewayState.discord = { on: true, reason: 'connected', botId: (pkt.d && pkt.d.user && pkt.d.user.id) || '' };
        } else if (pkt.op === 0 && pkt.t === 'MESSAGE_CREATE') {
          const m = pkt.d || {}; const text = String(m.content || '');
          const decision = gatewayDecide('discord', { text, from: m.author && m.author.id, fromBot: !!(m.author && m.author.bot) }, gatewayState.discord.botId, discordGatewayConfig().ownerIds);
          if (decision.action === 'store') gatewayRecord('discord', { text, from: m.author && m.author.id, channel: m.channel_id });
        } else if (pkt.op === 7 || pkt.op === 9) { try { discordWs.close(); } catch (e) {} }
      } catch (e) {}
    });
    const onDiscordEnd = () => {
      if (discordHb) { clearInterval(discordHb); discordHb = null; }
      discordWs = null; if (gatewayState.discord.on) gatewayState.discord = { on: false, reason: 'disconnected', botId: '' };
      scheduleDiscordRetry();
    };
    discordWs.on('close', onDiscordEnd); discordWs.on('error', () => {});
  }
  function scheduleDiscordRetry() {
    if (discordRetry) return; const wait = gatewayBackoff(discordAttempt++);
    gatewayState.discord.reason = 'retry in ' + (wait / 1000) + 's';
    discordRetry = setTimeout(() => { discordRetry = null; startDiscordGateway(); }, wait);
  }
  // --- Slack Socket Mode (apps.connections.open -> wss URL, envelope ack) ---
  let slackWs = null, slackRetry = null, slackAttempt = 0;
  function slackSocketConfig() {
    const cfg = loadSocialConfig(); const st = loadSocialState();
    const botToken = cfg.slackBotToken || (st.slack && st.slack.botToken) || '';
    return { botToken, appToken: cfg.slackAppToken || '', ownerIds: gatewayOwnerIds(cfg, 'slackOwnerIds') };
  }
  async function startSlackSocket() {
    if (slackWs || slackRetry) return;
    const { botToken, appToken } = slackSocketConfig();
    if (!botToken || !appToken) { gatewayState.slack = { on: false, reason: 'not configured', botUserId: '' }; return; }
    if (typeof WebSocket === 'undefined') { gatewayState.slack = { on: false, reason: 'WebSocket not available in this Node build', botUserId: '' }; return; }
    try {
      const auth = await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: 'Bearer ' + botToken } });
      const aj = await auth.json(); if (aj && aj.user_id) gatewayState.slack.botUserId = aj.user_id;
      const r = await fetch('https://slack.com/api/apps.connections.open', { method: 'POST', headers: { Authorization: 'Bearer ' + appToken, 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json(); if (!j || !j.ok || !j.url) { gatewayState.slack = { on: false, reason: 'apps.connections.open failed', botUserId: gatewayState.slack.botUserId }; scheduleSlackRetry(); return; }
      slackWs = new WebSocket(j.url);
      slackWs.on('message', (data) => {
        try {
          const env = JSON.parse(String(data));
          if (env.type === 'hello') { slackAttempt = 0; gatewayState.slack.on = true; gatewayState.slack.reason = 'connected'; return; }
          if (env.type === 'events_api' && env.payload && env.payload.event) {
            const ev = env.payload.event;
            const isMention = ev.type === 'app_mention';
            const isDm = ev.type === 'message' && ev.channel_type === 'im' && !ev.subtype && !ev.bot_id;
            if (isMention || isDm) {
              const decision = gatewayDecide('slack', { text: ev.text || '', from: ev.user, fromBot: !!ev.bot_id }, gatewayState.slack.botUserId, slackSocketConfig().ownerIds);
              if (decision.action === 'store') gatewayRecord('slack', { text: ev.text, from: ev.user, channel: ev.channel });
            }
            try { slackWs.send(JSON.stringify({ envelope_id: env.envelope_id })); } catch (e) {}
          }
        } catch (e) {}
      });
      const onSlackEnd = () => { slackWs = null; if (gatewayState.slack.on) gatewayState.slack = { on: false, reason: 'disconnected', botUserId: gatewayState.slack.botUserId }; scheduleSlackRetry(); };
      slackWs.on('close', onSlackEnd); slackWs.on('error', () => {});
    } catch (e) { gatewayState.slack = { on: false, reason: 'connect failed', botUserId: gatewayState.slack.botUserId }; scheduleSlackRetry(); }
  }
  function scheduleSlackRetry() {
    if (slackRetry) return; const wait = gatewayBackoff(slackAttempt++);
    gatewayState.slack.reason = 'retry in ' + (wait / 1000) + 's';
    slackRetry = setTimeout(() => { slackRetry = null; startSlackSocket(); }, wait);
  }
  function tryStartGateways() { startDiscordGateway(); startSlackSocket(); }
  tryStartGateways();
  setInterval(tryStartGateways, 60000);
  // Manual (approved) reply paths — mirror Telegram Batch 2C, no auto-reply.
  async function discordSendToChannel(channelId, text) {
    const { token } = discordGatewayConfig(); if (!token) return { ok: false, error: 'Discord bot is not set up yet.' };
    if (!channelId) return { ok: false, error: 'Discord channelId is required (see channel in lastPrompt).' };
    try {
      const r = await fetch('https://discord.com/api/v10/channels/' + encodeURIComponent(channelId) + '/messages', { method: 'POST', headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: String(text).slice(0, 2000) }) });
      if (!r.ok) return { ok: false, error: 'Discord send failed.' };
      const st = loadSocialState(); st.discord = st.discord || {}; st.discord.lastReply = { text: String(text).slice(0, 500), at: new Date().toISOString() }; saveSocialState(st); return { ok: true };
    } catch (e) { return { ok: false, error: 'Discord send failed.' }; }
  }
  async function slackSendToChannel(channel, text) {
    const { botToken } = slackSocketConfig(); if (!botToken) return { ok: false, error: 'Slack bot is not set up yet.' };
    if (!channel) return { ok: false, error: 'Slack channel is required (see channel in lastPrompt).' };
    try {
      const r = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: 'Bearer ' + botToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, text: String(text).slice(0, 4000) }) });
      const j = await r.json(); if (!j || !j.ok) return { ok: false, error: 'Slack send failed.' };
      const st = loadSocialState(); st.slack = st.slack || {}; st.slack.lastReply = { text: String(text).slice(0, 500), at: new Date().toISOString() }; saveSocialState(st); return { ok: true };
    } catch (e) { return { ok: false, error: 'Slack send failed.' }; }
  }
  // GET /api/memory/export — current MEMORY.md + RULES.md (dated audit files listed, not dumped)
  if (req.url === '/api/memory/export' && req.method === 'GET') {
    try {
      const dir = memoryDir();
      const read = f => { const p = path.join(dir, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
      const dated = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort() : [];
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, memory: read('MEMORY.md'), rules: read('RULES.md'), datedFiles: dated, injectedPreview: loadMemoryText(dir).slice(0, 4000) })); return;
    } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'could not export memory' })); return; }
  }
  // POST /api/memory/forget {fact} — user-initiated forget, dated audit kept
  if (req.url === '/api/memory/forget' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const s = forgetMemoryFact(memoryDir(), data.fact || '');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: s.removed, removed: s.removed }));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid request' })); }
    });
    return;
  }
  // PERSONALITY (your style) — user controls. No explanation/onboarding here by
  // design (ali explains it to users himself via video). Local only.
  // GET /api/personality — current PERSONALITY.md + settings (enabled, scope).
  if (req.url === '/api/personality' && req.method === 'GET') {
    try {
      const dir = memoryDir();
      const p = path.join(dir, 'PERSONALITY.md');
      const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : defaultPersonalityTemplate();
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, personality: content, settings: personalitySettings(dir), exists: fs.existsSync(p), injectedPreview: loadMemoryText(dir).slice(0, 4000) })); return;
    } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'could not read personality' })); return; }
  }
  // POST /api/personality {content} — user-initiated direct edit (their own edit,
  // no approval needed). Secrets are refused; an empty save is refused (use reset).
  if (req.url === '/api/personality' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const content = String(data.content || '').trim();
        if (!content) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'empty profile — use reset to restore the default' })); return; }
        if (/api[_-]?key|password|passwd|token|secret|sk-[A-Za-z0-9]|bearer/i.test(content)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'never save secrets in the personality profile' })); return; }
        fs.mkdirSync(memoryDir(), { recursive: true });
        fs.writeFileSync(path.join(memoryDir(), 'PERSONALITY.md'), content + '\n', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid request' })); }
    });
    return;
  }
  // POST /api/personality/settings {enabled, scope} — mirroring toggle + scope.
  // Off = the slice is skipped entirely; the file stays on disk, untouched.
  if (req.url === '/api/personality/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const cur = personalitySettings(memoryDir());
        const next = { enabled: (typeof data.enabled === 'boolean' ? data.enabled : cur.enabled), scope: (data.scope === 'app' || data.scope === 'discord' || data.scope === 'both' ? data.scope : cur.scope) };
        fs.mkdirSync(memoryDir(), { recursive: true });
        fs.writeFileSync(path.join(memoryDir(), 'personality-settings.json'), JSON.stringify(next, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, settings: next }));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid request' })); }
    });
    return;
  }
  // POST /api/personality/reset — restore the default template. The old profile
  // is kept as a dated backup (superseded copy), never destroyed.
  if (req.url === '/api/personality/reset' && req.method === 'POST') {
    try {
      const dir = memoryDir();
      const p = path.join(dir, 'PERSONALITY.md');
      if (fs.existsSync(p)) {
        const d = new Date();
        const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
        fs.copyFileSync(p, path.join(dir, 'PERSONALITY.md.bak-' + stamp));
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, defaultPersonalityTemplate(), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'could not reset personality' })); }
    return;
  }
  // POST /api/personality/forget {trait} — remove one trait (dated audit kept).
  if (req.url === '/api/personality/forget' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const s = forgetPersonalityTrait(memoryDir(), data.trait || '');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: s.removed, removed: s.removed }));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid request' })); }
    });
    return;
  }
  // POST /api/browser/view {url} — live browser screenshot view (read-only, no fill/click).
  // Uses headless Chromium via Playwright. Login / sign-in / checkout / payment pages are blocked.
  if (req.url === '/api/browser/view' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        let urlString = String(data.url || '').trim();
        if (!urlString) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Enter a URL or search.' })); return; }
        if (!/^https?:\/\//i.test(urlString)) {
          if (/^[^\s]+\.[^\s]+$/.test(urlString)) urlString = 'https://' + urlString;
          else urlString = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(urlString);
        }
        if (typeof isBrowserControlBlocked === 'function' && isBrowserControlBlocked(urlString, {})) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Login, sign-in, checkout and payment pages are blocked.' })); return; }
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          let viewResp = await page.goto(urlString, { waitUntil: 'domcontentloaded', timeout: 30000 });
          // DUCKDUCKGO LITE (v1.0.6): if a Lite search is 418-blocked,
          // retry once with the HTML endpoint.
          if (urlString.indexOf('https://lite.duckduckgo.com/lite/?q=') === 0) {
            let liteFailed = false;
            try { if (viewResp && viewResp.status() >= 400) liteFailed = true; } catch (e) {}
            try { const cur = page.url() || ''; if (cur.indexOf('home-error') !== -1) liteFailed = true; } catch (e) {}
            if (liteFailed) {
              const htmlUrl = 'https://html.duckduckgo.com/html/?q=' + urlString.slice('https://lite.duckduckgo.com/lite/?q='.length);
              try { await page.goto(htmlUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); urlString = htmlUrl; } catch (e) {}
            }
          }
          try { await page.waitForTimeout(1000); } catch (e) {}
          const title = await page.title().catch(() => '');
          const text = (await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 2000);
          const shot = await page.screenshot({ type: 'png' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, title, text, screenshot: 'data:image/png;base64,' + shot.toString('base64') }));
        } finally { try { await browser.close(); } catch (e) {} }
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Browser view failed.' })); }
    });
    return;
  }
  // GET /api/social/status
  if (req.url === '/api/social/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, status: socialStatus() })); return;
  }
  // DISCORD CONNECT v2 (2026-11-06): GET /api/discord/connect-url ->
  // { ok, url } — the shared RedCat bot authorize URL. The redirect
  // goes to the public relay (https://discord-relay.arexora.com/
  // discord/callback), which exchanges the code and binds the user's
  // Discord ID to this install's device token (state), so DMs are
  // routed to this PC. The device token is set by main.js in the env
  // (DISCORD_DEVICE_TOKEN); for a standalone server, fall back to
  // reading the token file from the Electron userData folder.
  // DISCORD DEVICE TOKEN (shared by /api/discord/connect-url and
  // /api/discord/whoami): set by main.js in the env; for a standalone
  // server, fall back to reading the token file from userData. The token
  // itself is NEVER sent to the frontend — it only authenticates this
  // server to the relay.
  function discordDeviceToken() {
    let deviceToken = process.env.DISCORD_DEVICE_TOKEN ? String(process.env.DISCORD_DEVICE_TOKEN).trim() : '';
    if (!deviceToken) {
      const candidates = [];
      if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'redcat', 'discord-device-token'));
      if (process.env.HOME) {
        candidates.push(path.join(process.env.HOME, '.config', 'redcat', 'discord-device-token'));
        candidates.push(path.join(process.env.HOME, 'Library', 'Application Support', 'redcat', 'discord-device-token'));
      }
      for (const f of candidates) {
        try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) { deviceToken = t; break; } } catch (e) {}
      }
    }
    return deviceToken;
  }
  // DISCORD CONNECT v2.1 (2026-11-07, v1.0.10): ?mode=dm (DEFAULT) or
  // ?mode=server. DM-only uses scope=identify ONLY (no bot scope, so
  // Discord shows NO server selection - for users who have no server and
  // only want the mobile/DM connection). The server mode keeps the old
  // scope=bot identify + permissions (adds the bot to a server). The
  // relay callback works with either scope (it only exchanges the code
  // and stores the binding/profile via /users/@me), so no relay change.
  if (req.url.split('?')[0] === '/api/discord/connect-url' && req.method === 'GET') {
    let deviceToken = discordDeviceToken();
    if (!deviceToken) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Discord device token is not available yet. Restart RedCat and try again.' })); return; }
    const q = new URL(req.url, 'http://localhost');
    const mode = (q.searchParams.get('mode') || 'dm').toLowerCase() === 'server' ? 'server' : 'dm';
    const scope = mode === 'server' ? 'bot identify' : 'identify';
    const perms = mode === 'server' ? '&permissions=117760' : '';
    const url = 'https://discord.com/oauth2/authorize?client_id=1567612015000686744&redirect_uri=' + encodeURIComponent('https://discord-relay.arexora.com/discord/callback') + '&response_type=code&scope=' + encodeURIComponent(scope) + perms + '&state=' + encodeURIComponent(deviceToken);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, url, mode })); return;
  }
  // DISCORD WHOAMI (2026-11-07, v1.0.8): GET /api/discord/whoami ->
  // { ok, bound, id, username, global_name }. Proxies the relay's
  // /discord/whoami with this install's device token (same token the
  // connect-url uses). Lets the app tell "Not connected — click + to
  // connect" apart from "Connected — send a DM to start chatting", and
  // lets the profile row show the real username + display name (the
  // authorize page shows the DISPLAY name, e.g. "Ali Ahmad", while the
  // username is "manamaliahmad" — same account, normal Discord
  // behaviour). The device token is never exposed to the frontend.
  if (req.url === '/api/discord/whoami' && req.method === 'GET') {
    (async () => {
      const sendWhoami = (obj) => { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); } catch (e) {} };
      try {
        const deviceToken = discordDeviceToken();
        if (!deviceToken) { sendWhoami({ ok: false, bound: false, error: 'Discord device token is not available yet.' }); return; }
        const ctl = new AbortController();
        const timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 5000);
        let r;
        try {
          r = await fetch('https://discord-relay.arexora.com/discord/whoami', { headers: { Authorization: 'Bearer ' + deviceToken }, signal: ctl.signal });
        } finally { clearTimeout(timer); }
        if (r.status === 401) { sendWhoami({ ok: true, bound: false }); return; }
        if (!r.ok) { sendWhoami({ ok: false, bound: false, error: 'relay error ' + r.status }); return; }
        const j = await r.json();
        sendWhoami({ ok: true, bound: !!j.bound, id: j.id || '', username: j.username || '', global_name: j.global_name || '' });
      } catch (e) {
        sendWhoami({ ok: false, bound: false, error: 'relay unreachable' });
      }
    })();
    return;
  }
  // DISCORD SEND (2026-11-07, v1.0.11, Bug 3a): POST /api/discord/send
  // { chatId, text } — forwards a message typed in a PC Discord chat to
  // the Discord DM, so the DM and the PC chat stay in sync. Forwards to
  // the relay's POST /send-dm with this install's device token; the relay
  // derives the userId from the binding (per-user isolation — a PC can
  // only send to its OWN bound Discord user). The bot sends it, so it
  // appears in the DM from RedCat (bots cannot send as the user).
  if (req.url === '/api/discord/send' && req.method === 'POST') {
    (async () => {
      const send = (obj) => { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); } catch (e) {} };
      let raw = '';
      try {
        raw = await new Promise((resolve, reject) => {
          let b = '';
          req.on('data', c => { b += c; if (b.length > 65536) req.destroy(); });
          req.on('end', () => resolve(b));
          req.on('error', reject);
        });
      } catch (e) { send({ ok: false, error: 'could not read request' }); return; }
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { send({ ok: false, error: 'bad json' }); return; }
      const chatId = String(body.chatId || '');
      const text = String(body.text || '').slice(0, 4000).trim();
      if (!/^discord-\d+$/.test(chatId)) { send({ ok: false, error: 'not a Discord chat' }); return; }
      if (!text) { send({ ok: false, error: 'empty text' }); return; }
      const deviceToken = discordDeviceToken();
      if (!deviceToken) { send({ ok: false, error: 'Discord device token is not available yet.' }); return; }
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 8000);
        let r;
        try {
          r = await fetch('https://discord-relay.arexora.com/send-dm', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + deviceToken }, body: JSON.stringify({ text }), signal: ctl.signal });
        } finally { clearTimeout(timer); }
        if (!r.ok) { send({ ok: false, error: 'relay error ' + r.status }); return; }
        send({ ok: true });
      } catch (e) { send({ ok: false, error: 'relay unreachable' }); }
    })();
    return;
  }
  // SILENT AUTO-UPDATE (2026-11-06, v1.0.5): the Settings "Check for
  // Updates" button calls these. GET /api/updates/check runs the same
  // check the app runs silently in the background (via
  // global.__redcatCheckForUpdates, set by main.js in the packaged app)
  // and returns the result. GET /api/updates/status returns the last
  // known updater state without starting a new check. On a standalone
  // dev server there is no Electron updater, so the check reports that
  // updates are handled by the desktop app.
  function redcatAppVersion() {
    try { return String(require(path.join(__dirname, '..', 'package.json')).version || ''); } catch (e) { return ''; }
  }
  if (req.url === '/api/updates/check' && req.method === 'GET') {
    (async () => {
      try {
        const fn = global.__redcatCheckForUpdates;
        if (typeof fn !== 'function') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, packaged: false, currentVersion: redcatAppVersion(), updateAvailable: false, message: 'Automatic updates run in the desktop app. This is the developer server, so there is nothing to check here.' }));
          return;
        }
        const r = await fn('manual');
        const st = global.__redcatUpdaterStatus || {};
        if (r && r.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, packaged: true, currentVersion: redcatAppVersion(), updateAvailable: !!r.updateAvailable, version: r.version || st.version || null, downloading: !!st.downloading, downloaded: !!st.downloaded, message: r.updateAvailable ? 'Update available - downloading in the background. It will install when you quit the app.' : "You're up to date." }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, packaged: true, currentVersion: redcatAppVersion(), error: (r && r.error) || 'Update check failed.', message: 'Update check failed. See updater.log for details.' }));
        }
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
      }
    })();
    return;
  }
  if (req.url === '/api/updates/status' && req.method === 'GET') {
    const st = global.__redcatUpdaterStatus || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, packaged: !!st, currentVersion: redcatAppVersion(), status: st || { lastCheck: null, updateAvailable: false, version: null, downloading: false, downloaded: false, error: null, downloadPercent: null, bytesTransferred: null, bytesTotal: null } }));
    return;
  }
  // FLOATING TOP BAR (v1.0.6) - quick prompts from the bar window.
  // The bar (floating-bar.html) POSTs a prompt here; the main app
  // (app.js) polls GET /api/quick-prompt/next and runs it through the
  // normal agent loop (sendChatMessage), then POSTs the result to
  // /api/quick-prompt/done. The bar polls GET /api/quick-prompt/status
  // to show the REAL agent state ("Working..." only while the agent is
  // actually working). main.js is notified via
  // global.__redcatOnQuickPromptDone so it can show a Notification.
  // The bar is only an input - it never approves anything; approvals
  // still appear in the main app. Single-prompt slot: the bar sends one
  // prompt at a time and waits for its result.
  // State lives on `global` so it survives across requests.
  function quickPromptState() {
    if (!global.__redcatQuickPrompt) global.__redcatQuickPrompt = { pending: null, result: null, seq: 0 };
    return global.__redcatQuickPrompt;
  }
  function floatingBarSettingsFile() {
    const base = process.env.REDCAT_USER_DATA || path.join(__dirname, 'user-data');
    return path.join(base, 'floating-bar.json');
  }
  function readFloatingBarSettings() {
    try {
      const raw = fs.readFileSync(floatingBarSettingsFile(), 'utf8');
      const j = JSON.parse(raw);
      if (j && typeof j.enabled === 'boolean') return { enabled: j.enabled };
    } catch (e) {}
    return { enabled: true }; // default ON
  }
  function writeFloatingBarSettings(enabled) {
    try {
      const p = floatingBarSettingsFile();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ enabled: !!enabled }));
      return true;
    } catch (e) { return false; }
  }
  // POST /api/quick-prompt {text} - the bar submits a prompt.
  if (req.url === '/api/quick-prompt' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const text = String(data.text || '').trim();
        if (!text) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Empty prompt.' })); return; }
        const st = quickPromptState();
        st.seq += 1;
        const id = 'qp-' + Date.now().toString(36) + '-' + st.seq;
        st.pending = { id, text, at: Date.now() };
        st.result = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Bad request.' }));
      }
    });
    return;
  }
  // GET /api/quick-prompt/next - the main app takes the pending prompt.
  if (req.url === '/api/quick-prompt/next' && req.method === 'GET') {
    const st = quickPromptState();
    if (st.pending) {
      const p = st.pending;
      st.pending = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, prompt: { id: p.id, text: p.text } }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, empty: true }));
    }
    return;
  }
  // POST /api/quick-prompt/done {id, status, text} - the main app reports
  // the outcome. status: 'done' | 'waiting' | 'error'. Notifies main.js.
  if (req.url === '/api/quick-prompt/done' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const id = String(data.id || '');
        const status = (data.status === 'waiting' || data.status === 'error') ? data.status : 'done';
        const text = String(data.text || '').slice(0, 200);
        if (!id) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Missing id.' })); return; }
        const st = quickPromptState();
        st.result = { id, status, text, at: Date.now() };
        try {
          const fn = global.__redcatOnQuickPromptDone;
          if (typeof fn === 'function') fn({ id, status, text });
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Bad request.' }));
      }
    });
    return;
  }
  // GET /api/quick-prompt/status - the bar polls for the result.
  if (req.url === '/api/quick-prompt/status' && req.method === 'GET') {
    const st = quickPromptState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: st.result }));
    return;
  }
  // GET /api/floating-bar/settings - is the bar enabled? (default ON)
  if (req.url === '/api/floating-bar/settings' && req.method === 'GET') {
    const s = readFloatingBarSettings();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, enabled: s.enabled }));
    return;
  }
  // POST /api/floating-bar/settings {enabled} - Settings toggle.
  if (req.url === '/api/floating-bar/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const enabled = data.enabled !== false;
        writeFloatingBarSettings(enabled);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, enabled }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Bad request.' }));
      }
    });
    return;
  }
  // POST /api/floating-bar/expand - the bar asks to open the main app.
  if (req.url === '/api/floating-bar/expand' && req.method === 'POST') {
    try {
      const fn = global.__redcatShowMainWindow;
      if (typeof fn === 'function') fn();
    } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // POST /api/floating-bar/dismiss - the bar asks to be hidden.
  if (req.url === '/api/floating-bar/dismiss' && req.method === 'POST') {
    try {
      const fn = global.__redcatHideFloatingBar;
      if (typeof fn === 'function') fn();
    } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // POST /api/floating-bar/move {dx, dy} - the bar asks to be moved by a delta.
  // (v1.0.7: manual JS drag; the OS drag region is not used, so the server
  // moves the bar window via the main-process global.)
  if (req.url === '/api/floating-bar/move' && req.method === 'POST') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      try {
        const j = JSON.parse(body || '{}');
        const fn = global.__redcatMoveFloatingBar;
        if (typeof fn === 'function') fn(Number(j.dx) || 0, Number(j.dy) || 0);
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  // GET /api/social/direct/:platform -> { ok, url } or setup error
  {
    const m = req.url.match(/^\/api\/social\/direct\/(discord|slack|telegram)(\?.*)?$/);
    if (m && req.method === 'GET') {
      const platform = m[1]; const cfg = loadSocialConfig();
      const redirect = (platform === 'discord' ? (cfg.discordRedirectUri || 'http://localhost:3000/api/social/callback/discord') : (cfg.slackRedirectUri || 'http://localhost:3000/api/social/callback/slack'));
      if (platform === 'telegram') {
        if (!cfg.telegramBotUsername) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Telegram bot is not set up yet. Create a bot via BotFather first and add its username to social-config.json.' })); }
        else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, url: 'https://t.me/' + cfg.telegramBotUsername })); }
        return;
      }
      const clientId = platform === 'discord' ? cfg.discordClientId : cfg.slackClientId;
      if (!clientId) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: platform + ' app is not set up yet. Create the ' + platform + ' app first and add its Client ID to social-config.json.' })); return; }
      const state = newSocialState(platform);
      let url = '';
      if (platform === 'discord') url = 'https://discord.com/oauth2/authorize?client_id=' + encodeURIComponent(clientId) + '&redirect_uri=' + encodeURIComponent(redirect) + '&response_type=code&scope=' + encodeURIComponent('bot identify') + '&permissions=68608&state=' + state;
      else url = 'https://slack.com/oauth/v2/authorize?client_id=' + encodeURIComponent(clientId) + '&scope=' + encodeURIComponent('app_mentions:read,channels:history,chat:write,groups:history,im:history,mpim:history,reactions:read') + '&redirect_uri=' + encodeURIComponent(redirect) + '&state=' + state;
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, url })); return;
    }
  }
  // GET /api/social/callback/:platform
  {
    const m = req.url.match(/^\/api\/social\/callback\/(discord|slack)(\?.*)?$/);
    if (m && req.method === 'GET') {
      (async () => {
      const platform = m[1]; const q = new URL(req.url, 'http://localhost');
      const code = q.searchParams.get('code'); const state = q.searchParams.get('state'); const guildId = q.searchParams.get('guild_id');
      const pending = state ? socialStates[state] : null;
      if (!code || !pending || pending.platform !== platform || Date.now() - pending.at > 600000) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(socialHtml('Connect failed', 'Code or session expired. Click Direct Connect in RedCat again.')); return;
      }
      delete socialStates[state];
      const cfg = loadSocialConfig(); const st = loadSocialState();
      try {
        if (platform === 'discord') {
          st.discord = { addedAt: new Date().toISOString(), guildId: guildId || '', label: guildId ? ('Server added (guild ' + guildId + ')') : 'Discord authorized' }; saveSocialState(st);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(socialHtml('Discord connected!', 'The bot has been added to your server.')); return;
        }
        const redirect = cfg.slackRedirectUri || 'http://localhost:3000/api/social/callback/slack';
        const form = new URLSearchParams({ client_id: cfg.slackClientId, client_secret: cfg.slackClientSecret, code, redirect_uri: redirect });
        const r = await fetch('https://slack.com/api/oauth.v2.access', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
        const j = await r.json();
        if (!j || !j.ok) throw new Error('slack exchange failed');
        st.slack = { team: j.team ? j.team.name : 'Slack', teamId: j.team ? j.team.id : '', botToken: j.access_token, addedAt: new Date().toISOString() }; saveSocialState(st);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(socialHtml('Slack connected!', 'The bot has been added to your workspace.')); return;
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(socialHtml('Connect failed', 'The provider did not accept the code. Check the app Client ID / redirect URL and try again.')); return;
      }
      })();
      return;
    }
  }
  // POST /api/social/telegram/pair { code }
  if (req.url === '/api/social/telegram/pair' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}'); const code = String(data.code || '').trim();
        const st = loadSocialState(); const p = st.telegram && st.telegram.pairing;
        if (!p || p.code !== code || Date.now() - p.at > 600000) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Code is wrong or expired. Send /start to the bot again.' })); return; }
        st.telegram.linkedChatId = p.chatId; st.telegram.label = 'Telegram linked'; delete st.telegram.pairing; saveSocialState(st);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, label: 'Telegram linked' }));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Pair failed.' })); }
    });
    return;
  }

  // POST /api/social/telegram/send {text} — Batch 2C reply plumbing, paired chat only.
  if (req.url === '/api/social/telegram/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const text = String(data.text || '').trim();
        if (!text) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Reply text is empty.' })); return; }
        const s = await telegramSendToLinked(text);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(s));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Send failed.' })); }
    });
    return;
  }

  // POST /api/social/discord/send + /api/social/slack/send — manual approved reply only, no auto-reply.
  if ((req.url === '/api/social/discord/send' || req.url === '/api/social/slack/send') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const out = req.url.includes('discord') ? await discordSendToChannel(data.channelId || data.channel, data.text || '') : await slackSendToChannel(data.channel || data.channelId, data.text || '');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid request' })); }
    });
    return;
  }
  // Social connection test v1: POST /api/social/test
  // Verifies a bot token against the provider's own API and returns
  // ONLY the bot/team label. The token is never logged, never stored
  // on the server, and never echoed back. Client keeps it in browser
  // localStorage like provider keys. This proves bot identity only;
  // it does NOT start a gateway, so it does not yet receive prompts.
  if (req.url === '/api/social/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const platform = String(data.platform || '');
        const token = String(data.token || '');
        if (['telegram', 'discord', 'slack', 'github', 'notion'].indexOf(platform) === -1 || token.length < 10 || token.length > 300) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid platform or token.' }));
          return;
        }
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        let label = '';
        try {
          if (platform === 'telegram') {
            const r = await fetch('https://api.telegram.org/bot' + token + '/getMe', { signal: ctl.signal });
            const j = await r.json();
            if (j && j.ok && j.result) label = (j.result.username ? '@' + j.result.username : j.result.first_name || 'Telegram bot');
            else throw new Error('bad');
          } else if (platform === 'discord') {
            const r = await fetch('https://discord.com/api/v10/users/@me', { headers: { 'Authorization': 'Bot ' + token }, signal: ctl.signal });
            const j = await r.json();
            if (r.ok && j && j.username) label = j.username;
            else throw new Error('bad');
          } else if (platform === 'github') {
            const r = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'RedCat/1.0' }, signal: ctl.signal });
            const j = await r.json();
            if (r.ok && j && (j.login || j.name)) label = j.login || j.name;
            else throw new Error('bad');
          } else if (platform === 'notion') {
            const r = await fetch('https://api.notion.com/v1/users/me', { headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28' }, signal: ctl.signal });
            const j = await r.json();
            if (r.ok && j && j.name) label = j.name;
            else throw new Error('bad');
          } else {
            const r = await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, signal: ctl.signal });
            const j = await r.json();
            if (j && j.ok) label = (j.team || 'Slack') + ' / ' + (j.user || 'bot');
            else throw new Error('bad');
          }
        } finally { clearTimeout(timer); }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, platform, label }));
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Token test failed. Check the token and try again.' })); } catch (e2) {}
      }
    });
    return;
  }

  // MCP servers v1: catalog, connect, OAuth callback, status, disconnect, test, tools.
  if (req.url === '/api/mcp/catalog' && req.method === 'GET') {
    try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, servers: mcp.catalogForUi() })); } catch (e) { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Catalog failed.' })); } catch (e2) {} }
    return;
  }
  if (req.url === '/api/mcp/status' && req.method === 'GET') {
    try {
      const out = {};
      for (const s of mcp.catalogForUi()) out[s.id] = { connected: s.connected, hasToken: s.hasToken, toolCount: s.toolCount };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, servers: out }));
    } catch (e) { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Status failed.' })); } catch (e2) {} }
    return;
  }
  if (req.url.startsWith('/api/mcp/tools') && req.method === 'GET') {
    try {
      const q = new URL(req.url, 'http://localhost');
      const id = q.searchParams.get('id') || '';
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, tools: mcp.getTools(id) }));
    } catch (e) { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Tools failed.' })); } catch (e2) {} }
    return;
  }
  if (req.url.startsWith('/api/mcp/oauth/callback') && req.method === 'GET') {
    try {
      const q = new URL(req.url, 'http://localhost');
      const code = q.searchParams.get('code') || '';
      const state = q.searchParams.get('state') || '';
      const err = q.searchParams.get('error') || '';
      if (err || !code || !state) { res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<html><body><h1>Sign-in failed</h1><p>RedCat did not receive a valid authorization code. You can close this tab and try again from RedCat.</p></body></html>'); return; }
      mcp.finishOAuth(code, state).then((r) => {
        res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(r.ok ? '<html><body><h1>Connected</h1><p>You can close this tab and return to RedCat. Your tools are now available in chat.</p></body></html>' : '<html><body><h1>Sign-in failed</h1><p>Please close this tab and try again from RedCat.</p></body></html>');
      }).catch(() => { try { res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<html><body><h1>Sign-in failed</h1></body></html>'); } catch (e2) {} });
    } catch (e) { try { res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<html><body><h1>Sign-in failed</h1></body></html>'); } catch (e2) {} }
    return;
  }
  if ((req.url === '/api/mcp/connect' || req.url === '/api/mcp/disconnect' || req.url === '/api/mcp/test') && req.method === 'POST') {
    let mcpBody = '';
    req.on('data', chunk => { mcpBody += chunk; if (mcpBody.length > 10000) req.destroy(); });
    req.on('end', async () => {
      try {
        const j = JSON.parse(mcpBody || '{}');
        if (req.url === '/api/mcp/disconnect') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(mcp.disconnect(j.id || ''))); return; }
        if (req.url === '/api/mcp/test') {
          if (!j.url) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'No URL given.' })); return; }
          try { const tools = await mcp.testRemoteUrl(j.url); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, tools })); } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Test failed: ' + String((e && e.message) || e).slice(0, 300) })); }
          return;
        }
        const r = await mcp.connect(j.id || '', j.fields || {});
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r));
      } catch (e) { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'MCP request failed.' })); } catch (e2) {} }
    });
    return;
  }
  // MCP custom server v1: POST /api/mcp/custom — the Add MCP dialog.
  // Validates (remote URL must be reachable, local command non-empty),
  // then saves to mcp-catalog.json AND the in-memory cache (via
  // mcp.addCustomEntry), so the new card renders without a restart.
  // Custom servers are tier 1 + custom:true, so they join the grid and
  // connect through the normal flow (remote auth none / stdio command).
  if (req.url === '/api/mcp/custom' && req.method === 'POST') {
    let customBody = '';
    req.on('data', chunk => { customBody += chunk; if (customBody.length > 10000) req.destroy(); });
    req.on('end', async () => {
      try {
        const j = JSON.parse(customBody || '{}');
        const name = String(j.name || '').trim().slice(0, 100);
        const transport = String(j.transport || '');
        const url = String(j.url || '').trim();
        const command = String(j.command || '').trim();
        const argsStr = String(j.args || '').trim();
        if (!name) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Enter a name.' })); return; }
        let entry = null;
        if (transport === 'remote') {
          let parsed = null;
          try { parsed = new URL(url); } catch (e) { parsed = null; }
          if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Enter a valid http(s) URL.' })); return; }
          const reachable = await mcpUrlReachable(url);
          if (!reachable) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'URL is not reachable. Check the address and try again.' })); return; }
          entry = { id: mcpSlug(name), name: name, desc: 'Custom server (unverified)', tier: 1, transport: 'remote', auth: 'none', url: url, fields: [], logo: null, custom: true, unverified: true };
        } else if (transport === 'local') {
          if (!command) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Enter the command.' })); return; }
          const args = argsStr ? argsStr.split(/\s+/) : [];
          entry = { id: mcpSlug(name), name: name, desc: 'Custom server (unverified)', tier: 1, transport: 'stdio', auth: 'none', command: command, args: args, fields: [], logo: null, custom: true, unverified: true };
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Pick a transport: remote URL or local command.' })); return;
        }
        if (!entry.id) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Name must contain a letter or number.' })); return; }
        const saved = mcp.addCustomEntry(entry);
        if (!saved.ok) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: saved.error })); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, server: saved.entry }));
      } catch (e) { try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Could not add server.' })); } catch (e2) {} }
    });
    return;
  }
  // Connector authorize test v1: POST /api/connector/test
  // Same rule as /api/social/test: verifies a user-supplied key against
  // the provider's own read-only verify/whoami API and returns ONLY a
  // label. The key is never logged, never stored on the server, and
  // never echoed back. The browser keeps it in localStorage like
  // provider keys. A passing test proves the key is valid; it does NOT
  // yet call any write API, and every write still needs approval.
  // Only direct-token platforms are listed here. Platforms that need
  // OAuth, a service-account file, Digest auth, per-database keys, or
  // an upload to verify are NOT in this table — the client shows an
  // honest "not available yet" card for those instead of faking a
  // connection.
  if (req.url === '/api/connector/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const id = String(data.id || '');
        const token = String(data.token || '');
        const sid = String(data.sid || '');
        const bearer = (t) => ({ 'Authorization': 'Bearer ' + t, 'Accept': 'application/json' });
        const specs = {
          gitlab: { url: 'https://gitlab.com/api/v4/user', headers: (t) => ({ 'PRIVATE-TOKEN': t, 'Accept': 'application/json' }), label: (j) => (j && (j.username || j.name)) || 'GitLab' },
          cloudflare: { url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', headers: bearer, label: () => 'Cloudflare (active)', verify: (j) => !!(j && j.success) },
          vercel: { url: 'https://api.vercel.com/v2/user', headers: bearer, label: (j) => (j && j.user && (j.user.username || j.user.email)) || 'Vercel' },
          netlify: { url: 'https://api.netlify.com/api/v1/user', headers: bearer, label: (j) => (j && (j.email || j.full_name)) || 'Netlify' },
          render: { url: 'https://api.render.com/v1/owners', headers: bearer, label: (j) => (j && j[0] && j[0].owner && (j[0].owner.name || j[0].owner.email)) || 'Render' },
          digitalocean: { url: 'https://api.digitalocean.com/v2/account', headers: bearer, label: (j) => (j && j.account && j.account.email) || 'DigitalOcean' },
          supabase: { url: 'https://api.supabase.com/v1/projects', headers: bearer, label: (j) => (j && j[0] && j[0].name) || 'Supabase' },
          neon: { url: 'https://console.neon.tech/api/v2/users/me', headers: bearer, label: (j) => (j && (j.email || j.name)) || 'Neon' },
          huggingface: { url: 'https://huggingface.co/api/whoami', headers: bearer, label: (j) => (j && j.name) || 'Hugging Face' },
          replicate: { url: 'https://api.replicate.com/v1/account', headers: bearer, label: (j) => (j && (j.username || j.name)) || 'Replicate' },
          sentry: { url: 'https://sentry.io/api/0/', headers: bearer, label: (j) => (j && (j.email || j.name)) || 'Sentry' },
          npm: { url: 'https://registry.npmjs.org/-/whoami', headers: bearer, label: (j) => (j && j.username) || 'npm' },
          resend: { url: 'https://api.resend.com/domains', headers: bearer, label: () => 'Resend' },
          sendgrid: { url: 'https://api.sendgrid.com/v3/user/profile', headers: bearer, label: (j) => (j && (j.email || j.username)) || 'SendGrid' },
          twilio: { url: null, headers: null, label: (j) => (j && j.friendly_name) || 'Twilio' },
          linear: { method: 'POST', url: 'https://api.linear.app/graphql', headers: bearer, body: JSON.stringify({ query: '{ viewer { id name email } }' }), label: (j) => (j && j.data && j.data.viewer && (j.data.viewer.name || j.data.viewer.email)) || 'Linear', verify: (j) => !!(j && j.data && j.data.viewer) },
          railway: { method: 'POST', url: 'https://backboard.railway.com/graphql/v2', headers: bearer, body: JSON.stringify({ query: '{ me { id email } }' }), label: (j) => (j && j.data && j.data.me && j.data.me.email) || 'Railway', verify: (j) => !!(j && j.data && j.data.me) },
          flyio: { method: 'POST', url: 'https://api.fly.io/graphql', headers: bearer, body: JSON.stringify({ query: '{ viewer { id } }' }), label: () => 'Fly.io', verify: (j) => !!(j && j.data) },
          turso: { url: 'https://api.turso.tech/v1/organizations', headers: bearer, label: (j) => (j && j[0] && j[0].slug) || 'Turso' },
          planetscale: { url: 'https://api.planetscale.com/v1/organizations', headers: bearer, label: (j) => (j && j.data && j.data[0] && j.data[0].attributes && j.data[0].attributes.name) || 'PlanetScale' },
        };
        const spec = specs[id];
        if (!spec || token.length < 10 || token.length > 1000 || (id === 'twilio' && sid.length < 10)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid connector or key.' }));
          return;
        }
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        let label = '';
        try {
          let r;
          if (id === 'twilio') {
            const basic = Buffer.from(sid + ':' + token).toString('base64');
            r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '.json', { headers: { 'Authorization': 'Basic ' + basic, 'Accept': 'application/json' }, signal: ctl.signal });
          } else {
            const opts = { headers: spec.headers(token), signal: ctl.signal };
            if (spec.method === 'POST') { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = spec.body; }
            r = await fetch(spec.url, opts);
          }
          let j = null;
          try { j = await r.json(); } catch (e) { j = null; }
          if (!r.ok) throw new Error('bad');
          if (spec.verify && !spec.verify(j)) throw new Error('bad');
          if (j && j.errors) throw new Error('bad');
          label = spec.label(j);
        } finally { clearTimeout(timer); }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, id, label }));
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Token test failed. Check the key and try again.' })); } catch (e2) {}
      }
    });
    return;
  }

  // Attachments: POST /api/upload — multipart files (images, any file, or
  // folder trees via slashed filenames). Files land under uploads/<id>/ and
  // are served back via GET /uploads/* below. Caps: 2 GB per file,
  // 2 GB per request, streamed to disk (never buffered in memory).
  // Names are sanitized per segment; '..' and separators
  // can never escape the uploads directory.
  function uploadsDir() { const d = path.join(__dirname, 'uploads'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; }
  function sanitizeUploadName(seg) {
    let s = String(seg || '').replace(/\\/g, '/');
    s = s.split('/').filter(x => x && x !== '.' && x !== '..').join('_');
    s = s.replace(/[^A-Za-z0-9._\- ]/g, '_').trim();
    if (!s || s === '.' || s === '..') s = 'file';
    return s;
  }
  if (req.url === '/api/upload' && req.method === 'POST') {
    const ct = String(req.headers['content-type'] || '');
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
    if (!bm) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Expected a multipart upload.' })); return; }
    const boundary = (bm[1] || bm[2] || '').trim();
    const MAX_FILE = 2 * 1024 * 1024 * 1024;
    const MAX_TOTAL = 2 * 1024 * 1024 * 1024;
    const delim = Buffer.from('\r\n--' + boundary);
    const firstSep = Buffer.from('--' + boundary);
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const used = new Set();
    const outFiles = [];
    let buf = Buffer.alloc(0);
    let state = 'start';
    let cur = null;
    let total = 0;
    let failed = false;
    let responded = false;
    let ended = false;
    let pending = 0;
    const cleanup = () => { try { fs.rmSync(path.join(uploadsDir(), id), { recursive: true, force: true }); } catch (e) {} };
    const failDestroy = () => {
      if (failed) return;
      failed = true;
      try { if (cur && cur.stream) cur.stream.destroy(); } catch (e) {}
      cleanup();
      try { req.destroy(); } catch (e) {}
    };
    const respond = (code, body) => {
      if (responded) return;
      responded = true;
      try { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); } catch (e) {}
    };
    const maybeRespond = () => {
      if (!ended || pending !== 0 || responded || failed) return;
      if (state !== 'done') { cleanup(); respond(500, { ok: false, error: 'Upload failed.' }); return; }
      if (!outFiles.length) { respond(400, { ok: false, error: 'No files in upload.' }); return; }
      respond(200, { ok: true, id: id, files: outFiles });
    };
    const finishPart = () => {
      if (!cur) return;
      const c = cur;
      cur = null;
      if (c.discard) return;
      outFiles.push({ name: c.segs[c.segs.length - 1], relPath: c.rel, size: c.size, type: c.contentType, url: '/uploads/' + id + '/' + c.rel.split('/').map(encodeURIComponent).join('/'), path: 'uploads/' + id + '/' + c.rel });
    };
    const writeData = (chunk) => {
      total += chunk.length;
      if (total > MAX_TOTAL) { failDestroy(); return; }
      if (!cur || cur.discard) return;
      cur.size += chunk.length;
      if (cur.size > MAX_FILE) { failDestroy(); return; }
      const ok = cur.stream.write(chunk);
      if (!ok) {
        try { req.pause(); } catch (e) {}
        cur.stream.once('drain', () => { try { req.resume(); } catch (e) {} pump(); });
      }
    };
    const pump = () => {
      try {
        while (!failed && buf.length > 0) {
          if (state === 'start') {
            const idx = buf.indexOf(firstSep);
            if (idx === -1) { if (buf.length > firstSep.length) buf = buf.slice(buf.length - firstSep.length); return; }
            buf = buf.slice(idx + firstSep.length);
            if (buf.length >= 2 && buf[0] === 45 && buf[1] === 45) { state = 'done'; buf = buf.slice(2); break; }
            if (buf.length >= 2 && buf[0] === 13 && buf[1] === 10) { buf = buf.slice(2); state = 'headers'; }
            else if (buf.length < 2) return;
            else { failDestroy(); return; }
          }
          if (state === 'afterDelim') {
            if (buf.length < 2) return;
            if (buf[0] === 45 && buf[1] === 45) { state = 'done'; buf = buf.slice(2); break; }
            if (buf[0] === 13 && buf[1] === 10) { buf = buf.slice(2); state = 'headers'; }
            else { failDestroy(); return; }
          }
          if (state === 'headers') {
            const he = buf.indexOf('\r\n\r\n');
            if (he === -1) { if (buf.length > 65536) failDestroy(); return; }
            const headers = buf.slice(0, he).toString('utf8');
            buf = buf.slice(he + 4);
            const m = /filename="([^"]*)"/.exec(headers);
            const t = /Content-Type:\s*([^\r\n;]+)/i.exec(headers);
            if (m) {
              const rawSegs = String(m[1]).replace(/\\/g, '/').split('/').filter(x => x && x !== '.' && x !== '..');
              const segs = rawSegs.map(sanitizeUploadName).filter(x => x);
              if (!segs.length) segs.push('file');
              let rel = segs.join('/');
              if (used.has(rel)) {
                const ext = path.extname(rel);
                const base = rel.slice(0, rel.length - ext.length);
                let n = 1;
                while (used.has(base + '-' + n + ext)) n++;
                rel = base + '-' + n + ext;
              }
              used.add(rel);
              const dest = path.join(uploadsDir(), id, ...rel.split('/'));
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              const stream = fs.createWriteStream(dest);
              pending++;
              stream.on('finish', () => { pending--; maybeRespond(); });
              stream.on('error', () => { if (!failed) { failed = true; cleanup(); respond(500, { ok: false, error: 'Upload failed.' }); try { req.destroy(); } catch (e) {} } });
              cur = { contentType: (t ? t[1].trim() : 'application/octet-stream'), rel: rel, segs: segs, dest: dest, stream: stream, size: 0, discard: false };
            } else {
              cur = { discard: true, size: 0 };
            }
            state = 'data';
          }
          if (state === 'data') {
            const di = buf.indexOf(delim);
            if (di === -1) {
              const keep = delim.length - 1;
              if (buf.length > keep) { const flush = buf.slice(0, buf.length - keep); buf = buf.slice(buf.length - keep); writeData(flush); if (failed) return; }
              return;
            }
            const dataPart = buf.slice(0, di);
            buf = buf.slice(di + delim.length);
            if (dataPart.length) writeData(dataPart);
            if (failed) return;
            if (cur && cur.stream) { try { cur.stream.end(); } catch (e) {} }
            finishPart();
            state = 'afterDelim';
          }
        }
      } catch (e) {
        if (!failed) { failed = true; cleanup(); respond(500, { ok: false, error: 'Upload failed.' }); try { req.destroy(); } catch (e2) {} }
      }
    };
    req.on('data', chunk => { if (failed) return; buf = Buffer.concat([buf, chunk]); pump(); });
    req.on('end', () => { if (failed) return; ended = true; maybeRespond(); });
    req.on('error', () => { if (!responded && !failed) { failed = true; cleanup(); } });
    req.on('close', () => { if (!responded && !failed && !ended) { failed = true; cleanup(); } });
    return;
  }

  // Slash commands v1 (deterministic, no model key): POST /api/slash
  if (req.url === '/api/slash' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 12000000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const result = await slashHandle(data);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(Buffer.from(JSON.stringify(result), 'utf-8'));
      } catch (e) {
        try { if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Slash command failed.' })); } catch (e2) {}
      }
    });
    return;
  }

  // Slash outputs: GET/HEAD /slash-outputs/<file> served from slash-outputs/.
  {
    const slashPath = req.url.split('?')[0];
    if (slashPath === '/slash-outputs' || slashPath.startsWith('/slash-outputs/')) {
      const outRoot = path.join(__dirname, 'slash-outputs');
      let rel = slashPath.replace(/^\/slash-outputs\/?/, '');
      try { rel = decodeURIComponent(rel); } catch (e) { rel = ''; }
      if (!rel || rel.indexOf('/') !== -1 || rel.indexOf('\\') !== -1 || !/^[A-Za-z0-9._-]+$/.test(rel)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const filePath = path.join(outRoot, rel);
      if (!filePath.startsWith(outRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp'].indexOf(ext) === -1) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      if (req.method === 'HEAD') {
        const sz = fs.statSync(filePath).size;
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': sz });
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Server Error'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
      return;
    }
  }

  // Built sites: /sites/<name>/... served from the project sites folder.
  {
    const sitesPath = req.url.split('?')[0];
    if (sitesPath === '/sites' || sitesPath.startsWith('/sites/')) {
      const sitesRoot = path.join(__dirname, 'sites');
      let rel = sitesPath.replace(/^\/sites\/?/, '');
      try { rel = decodeURIComponent(rel); } catch (e) { rel = ''; }
      let filePath = path.join(sitesRoot, rel);
      if (!filePath.startsWith(sitesRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Site not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Server Error'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
      return;
    }
  }

  // Rendered motion videos: /videos/<file> served from the project videos folder.
  {
    const videosPath = req.url.split('?')[0];
    if (videosPath === '/videos' || videosPath.startsWith('/videos/')) {
      const videosRoot = path.join(__dirname, 'videos');
      let rel = videosPath.replace(/^\/videos\/?/, '');
      try { rel = decodeURIComponent(rel); } catch (e) { rel = ''; }
      const filePath = path.join(videosRoot, rel);
      if (!filePath.startsWith(videosRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Video not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Server Error'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
      return;
    }
  }

  // Slash-command outputs: /slash-outputs/<file> served read-only.
  {
    const outPath = req.url.split('?')[0];
    if (outPath === '/slash-outputs' || outPath.startsWith('/slash-outputs/')) {
      const outRoot = path.join(__dirname, 'slash-outputs');
      let rel = outPath.replace(/^\/slash-outputs\/?/, '');
      try { rel = decodeURIComponent(rel); } catch (e) { rel = ''; }
      const filePath = path.join(outRoot, rel);
      if (!filePath.startsWith(outRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Output not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Server Error'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
      return;
    }
  }

  // Uploaded attachments: GET /uploads/<id>/<path> served from uploads/.
  {
    const upPath = req.url.split('?')[0];
    if (upPath === '/uploads' || upPath.startsWith('/uploads/')) {
      let rel = upPath.replace(/^\/uploads\/?/, '');
      try { rel = decodeURIComponent(rel); } catch (e) { rel = ''; }
      rel = rel.replace(/\\/g, '/');
      const segs = rel.split('/').filter(x => x && x !== '.' && x !== '..');
      if (!segs.length) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
      const upRoot = uploadsDir();
      const filePath = path.join(upRoot, ...segs);
      if (!filePath.startsWith(upRoot)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Access Denied'); return; }
      const UP_MIME = { '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.zip': 'application/zip' };
      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || UP_MIME[ext] || 'application/octet-stream', 'Content-Length': stats.size });
        fs.createReadStream(filePath).pipe(res);
      });
      return;
    }
  }

  // LIBRARY-START (2026-11-03): read-only Documents & Notes data.
  // Roots are allowlisted: skills/, sites/, slash-outputs/. Nothing else is
  // listed, and no write/delete route exists here. Browsing is read-only.
  if (req.url === '/api/library' && req.method === 'GET') {
    try {
      const listFiles = (root, cap) => {
        const out = [];
        const walk = (dir, rel) => {
          if (out.length >= cap) return;
          let entries = [];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
          entries.sort((a, b) => (a.name < b.name ? -1 : 1));
          for (const e of entries) {
            if (out.length >= cap) break;
            const p = path.join(dir, e.name);
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) { walk(p, r); continue; }
            if (!e.isFile()) continue;
            let st = null;
            try { st = fs.statSync(p); } catch (e2) { continue; }
            out.push({ path: r, size: st.size, mtime: st.mtime.toISOString() });
          }
        };
        walk(root, '');
        return out;
      };
      const skillDesc = (dir) => {
        try {
          const lines = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').split('\n').slice(0, 12);
          for (const ln of lines) {
            const m = ln.match(/^\s*description:\s*(.*)$/);
            if (m) {
              const v = m[1].replace(/^['"]|['"]$/g, '').trim();
              if (v && v !== '>') return v;
              return null;
            }
          }
        } catch (e) {}
        return null;
      };
      const siteTitle = (dir) => {
        try {
          const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
          const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          const t = m ? m[1].trim() : '';
          if (t) return t;
        } catch (e) {}
        return null;
      };
      const skillsRoot = path.join(__dirname, 'skills');
      const sitesRoot = path.join(__dirname, 'sites');
      const outRoot = path.join(__dirname, 'slash-outputs');
      const skills = [];
      try {
        for (const s of skillAdd.listSkills(skillsRoot, skillAdd.userSkillsDir())) {
          skills.push({ name: s.name, description: s.description, mtime: s.mtime, files: s.files, origin: s.origin, source: s.source, enabled: s.enabled, hasSource: s.hasSource, installedAt: s.installedAt });
        }
      } catch (e) {}
      const sites = [];
      try {
        for (const d of fs.readdirSync(sitesRoot, { withFileTypes: true }).filter(x => x.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const dir = path.join(sitesRoot, d.name);
          let mt = null;
          try { mt = fs.statSync(dir).mtime.toISOString(); } catch (e) {}
          const previewPath = path.join(PUBLIC_DIR, 'assets', 'artefact-previews', d.name + '.png');
          sites.push({ name: d.name, title: siteTitle(dir) || d.name, url: '/sites/' + encodeURIComponent(d.name) + '/', mtime: mt, preview: fs.existsSync(previewPath) ? '/assets/artefact-previews/' + encodeURIComponent(d.name) + '.png' : null, files: listFiles(dir, 200) });
        }
      } catch (e) {}
      const outputs = [];
      try {
        for (const f of fs.readdirSync(outRoot, { withFileTypes: true }).filter(x => x.isFile()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const p = path.join(outRoot, f.name);
          let st = null;
          try { st = fs.statSync(p); } catch (e2) { continue; }
          outputs.push({ name: f.name, size: st.size, mtime: st.mtime.toISOString(), url: '/slash-outputs/' + encodeURIComponent(f.name) });
        }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, skills: skills, sites: sites, outputs: outputs }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'LIBRARY_ERROR' }));
    }
    return;
  }
  // LIBRARY-DELETE: artefacts page Select -> Delete. Names are validated
  // (no path traversal) and must be existing sites/ folders. Also removes
  // the matching artefact preview image when present.
  if (req.url === '/api/library/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const names = (JSON.parse(body).names || []).filter(n => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(n));
        const sitesRoot = path.join(__dirname, 'sites');
        const deleted = [];
        for (const n of names) {
          const dir = path.join(sitesRoot, n);
          if (!dir.startsWith(sitesRoot)) continue;
          if (!fs.existsSync(dir)) continue;
          fs.rmSync(dir, { recursive: true, force: true });
          try { fs.rmSync(path.join(PUBLIC_DIR, 'assets', 'artefact-previews', n + '.png'), { force: true }); } catch (e) {}
          deleted.push(n);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, deleted: deleted }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'DELETE_ERROR' }));
      }
    });
    return;
  }
  // LIBRARY-END

  // SKILLS-ADD (v1.0.12): Add Skill flow — GitHub link, file upload, pasted
  // text. Prepare (fetch + validate + scan) -> preview -> Install (approval).
  // User-installed skills live in <userData>/skills (survive app updates).
  // The deterministic scan is skill-add.js (skill-scan Step 2 catalog).
  // Install re-scans server-side — the enforcement point, never the client.
  function skillAddJson(res, obj) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }
  function skillAddReadBody(req, cap, cb) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > cap) req.destroy(); });
    req.on('end', () => {
      try { cb(null, JSON.parse(body || '{}')); }
      catch (e) { cb(new Error('BAD_JSON')); }
    });
    req.on('error', () => cb(new Error('BODY_ERROR')));
  }
  if (req.url === '/api/skills/prepare' && req.method === 'POST') {
    skillAddReadBody(req, skillAdd.MAX_BODY, async (err, body) => {
      if (err) return skillAddJson(res, { ok: false, error: 'BAD_REQUEST' });
      try {
        const method = String(body.method || '');
        let prep = null;
        if (method === 'github') {
          if (!body.url) return skillAddJson(res, { ok: false, error: 'A GitHub URL is required.' });
          prep = await skillAdd.fetchGithubSkill(body.url);
        } else if (method === 'paste') {
          prep = skillAdd.prepareFromText(body.text || '', body.fileName || '');
        } else if (method === 'upload') {
          if (body.zipBase64) prep = skillAdd.prepareFromZip(body.zipBase64);
          else if (body.content) prep = skillAdd.prepareFromText(body.content, body.fileName || '');
          else return skillAddJson(res, { ok: false, error: 'No file content received.' });
        } else {
          return skillAddJson(res, { ok: false, error: 'Unknown method.' });
        }
        if (!prep || !prep.ok) return skillAddJson(res, { ok: false, error: prep.error || 'PREPARE_FAILED', tried: prep.tried || [] });
        return skillAddJson(res, skillAdd.prepareResult(prep, skillsDir(), skillAdd.userSkillsDir()));
      } catch (e) {
        return skillAddJson(res, { ok: false, error: 'PREPARE_ERROR' });
      }
    });
    return;
  }
  if (req.url === '/api/skills/install' && req.method === 'POST') {
    skillAddReadBody(req, skillAdd.MAX_BODY, (err, body) => {
      if (err) return skillAddJson(res, { ok: false, error: 'BAD_REQUEST' });
      try {
        // Shared install (same function the chat skill_install tool calls):
        // re-scans exactly what will be installed, enforces BLOCK, conflicts,
        // and the 30-skill cap. The frontend sends the files it got from
        // /prepare; the chat path sends a prepToken instead (see skill_install).
        const result = skillAdd.installPrepared(
          { name: body.name, description: body.description, files: Array.isArray(body.files) ? body.files : [], source: body.source || null },
          { description: body.description, override: body.override || null, allowOverwrite: !!body.allowOverwrite },
          skillsDir(), skillAdd.userSkillsDir()
        );
        if (!result.ok) return skillAddJson(res, result);
        skillCatalogCache = { digest: '', index: '' };
        return skillAddJson(res, result);
      } catch (e) {
        return skillAddJson(res, { ok: false, error: 'INSTALL_ERROR' });
      }
    });
    return;
  }
  if (req.url === '/api/skills/toggle' && req.method === 'POST') {
    skillAddReadBody(req, 10000, (err, body) => {
      if (err) return skillAddJson(res, { ok: false, error: 'BAD_REQUEST' });
      const done = skillAdd.setSkillEnabled(body.name, body.enabled !== false && body.enabled !== 'false');
      if (!done.ok) return skillAddJson(res, { ok: false, error: done.error });
      skillCatalogCache = { digest: '', index: '' };
      return skillAddJson(res, { ok: true, name: done.name, enabled: done.enabled });
    });
    return;
  }
  if (req.url === '/api/skills/delete' && req.method === 'POST') {
    skillAddReadBody(req, 10000, (err, body) => {
      if (err) return skillAddJson(res, { ok: false, error: 'BAD_REQUEST' });
      const done = skillAdd.deleteSkill(skillAdd.userSkillsDir(), skillsDir(), body.name);
      if (!done.ok) return skillAddJson(res, { ok: false, error: done.error });
      skillCatalogCache = { digest: '', index: '' };
      return skillAddJson(res, { ok: true, name: body.name, removed: done.removed });
    });
    return;
  }
  if (req.url === '/api/skills/update' && req.method === 'POST') {
    skillAddReadBody(req, 10000, async (err, body) => {
      if (err) return skillAddJson(res, { ok: false, error: 'BAD_REQUEST' });
      try {
        const name = skillAdd.cleanSkillName(body.name);
        if (!name) return skillAddJson(res, { ok: false, error: 'Invalid skill name.' });
        const meta = skillAdd.skillsMeta();
        const entry = meta[name];
        if (!entry || !entry.source || !entry.source.url || entry.source.type !== 'github') {
          return skillAddJson(res, { ok: false, error: 'NO_SOURCE', message: 'This skill has no GitHub source to re-fetch. Re-add it with a link, file, or pasted text.' });
        }
        const prep = await skillAdd.fetchGithubSkill(entry.source.url);
        if (!prep || !prep.ok) return skillAddJson(res, { ok: false, error: prep.error || 'UPDATE_FAILED', tried: prep.tried || [] });
        const result = skillAdd.prepareResult(prep, skillsDir(), skillAdd.userSkillsDir());
        if (!result.ok) return skillAddJson(res, { ok: false, error: result.error });
        const cur = skillAdd.listSkills(skillsDir(), skillAdd.userSkillsDir()).find(s => s.name === name);
        result.isUpdate = true;
        result.previousFiles = cur ? cur.files.map(f => f.path) : [];
        return skillAddJson(res, result);
      } catch (e) {
        return skillAddJson(res, { ok: false, error: 'UPDATE_ERROR' });
      }
    });
    return;
  }

  // BROWSER-START — in-app browser API (see browser.js).
  if (req.url.startsWith('/api/browser/')) {
    browserSystem.handle(req, res);
    return;
  }
  // BROWSER-END

  // POST-AUTH REDIRECT (2026-11-05, v2.45): after the user authorizes the
  // shared RedCat bot on Discord, Discord redirects to /discord-connected.
  // The page tells them Discord is connected and links back to the app.
  if (req.url.split('?')[0] === '/discord-connected') {
    const pagePath = path.join(PUBLIC_DIR, 'discord-connected.html');
    fs.readFile(pagePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Static file serving
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // No SPA fallback: unknown paths return 404 so dead links never look alive.
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Handle video range streaming for MP4
    if (ext === '.mp4') {
      const range = req.headers.range;
      const fileSize = stats.size;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
        return;
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes'
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    fs.readFile(filePath, (err3, data) => {
      if (err3) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

// On startup, a run left 'active' means the server died mid-run: it is resumable.
try {
  if (fs.existsSync(runsDir())) {
    fs.readdirSync(runsDir()).filter(f => f.endsWith('.json')).forEach(f => {
      try {
        const p = path.join(runsDir(), f);
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (d && d.status === 'active') { d.status = 'interrupted'; fs.writeFileSync(p, JSON.stringify(d), 'utf8'); }
      } catch (e) {}
    });
  }
} catch (e) {}


// If the port is busy, do not crash with an uncaught EADDRINUSE. The
// packaged app picks a free port before starting (see main.js), so this
// is only a safety net for a race. Log the error; the app shows a clean
// message instead of a crash dialog.
server.on('error', (err) => {
  console.error('RedCat server failed to listen:', err && err.message ? err.message : err);
});
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 RedCat XOX Interface is running on localhost!`);
  console.log(`👉 URL: http://localhost:${PORT}`);
  console.log(`👉 Web Interface & API ready for live interaction`);
  console.log(`=======================================================`);
  // CHAT BACKUP (2026-11-07, v1.0.8): export all chats to
  // <userData>/backups/chats-YYYY-MM-DD.jsonl on startup and daily
  // (chatstore keeps the last 7). The user's chats are their memory —
  // there must always be a copy outside the live files.
  try {
    const out = require('./chatstore.js').backupChats();
    if (out && out.ok) console.log('Chat backup written:', out.file, '(' + out.chats + ' chats)');
  } catch (e) { console.log('Chat backup failed:', e && e.message ? e.message : e); }
  try {
    const t = setInterval(() => { try { require('./chatstore.js').backupChats(); } catch (e) {} }, 24 * 60 * 60 * 1000);
    if (t && t.unref) t.unref();
  } catch (e) {}
});
