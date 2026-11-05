// chatstore.js — server-side chat store (local files only, no cloud).
// One JSON file per chat under chats/. The browser treats the server as the
// source of truth and keeps localStorage only as a fallback. Main chat is
// never deletable (app invariant), so DELETE on 'main' is refused by code.
//
// TOMBSTONE (2026-11-05): deleted chat IDs are recorded persistently in
// __meta__.json (the "deleted" list) and NEVER come back. A deleted chat is
// refused on save (so a stale browser localStorage re-sync cannot recreate
// it), hidden from list/get, and returned to the frontend so the browser can
// purge it from localStorage too. The tombstone survives server restarts.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'chats');
const META_FILE = path.join(DIR, '__meta__.json');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DELETED = 500;
function ensureDir() { try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {} }
function safeId(id) {
  const s = String(id || '');
  if (!s || s.length > 128) return null;
  if (!/^[A-Za-z0-9_\-]+$/.test(s)) return null;
  if (s === '__meta__') return null;
  return s;
}
function fileFor(id) {
  const f = path.resolve(DIR, id + '.json');
  if (!f.startsWith(DIR + path.sep)) return null;
  return f;
}
function readMeta() {
  try {
    const m = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    const deleted = Array.isArray(m.deleted) ? m.deleted.filter(x => typeof x === 'string' && x) : [];
    return { counter: typeof m.counter === 'number' ? m.counter : 0, agentCounter: typeof m.agentCounter === 'number' ? m.agentCounter : 0, deleted: deleted };
  } catch (e) { return { counter: 0, agentCounter: 0, deleted: [] }; }
}
function writeMeta(counter, agentCounter, deleted) {
  try {
    ensureDir();
    const d = Array.isArray(deleted) ? deleted.filter(x => typeof x === 'string' && x).slice(0, MAX_DELETED) : [];
    fs.writeFileSync(META_FILE, JSON.stringify({ counter: counter, agentCounter: agentCounter, deleted: d }));
  } catch (e) {}
}
function isDeleted(id) {
  if (!id) return false;
  return readMeta().deleted.indexOf(id) !== -1;
}
function addDeleted(id) {
  const safe = safeId(id);
  if (!safe || safe === 'main') return false;
  const meta = readMeta();
  if (meta.deleted.indexOf(safe) !== -1) return true;
  meta.deleted.push(safe);
  writeMeta(meta.counter, meta.agentCounter, meta.deleted);
  return true;
}
function deriveTitle(data) {
  if (typeof data.title === 'string' && data.title.trim()) return data.title.slice(0, 200);
  const h = Array.isArray(data.history) ? data.history : [];
  const first = h.find(m => m && m.role === 'user' && (typeof m.content === 'string' || typeof m.text === 'string'));
  if (first) {
    const t = String(first.content || first.text).replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 80);
  }
  return data.id === 'main' ? 'Main chat' : 'New chat';
}
function list() {
  ensureDir();
  const meta = readMeta();
  const deletedSet = new Set(meta.deleted);
  let files = [];
  try { files = fs.readdirSync(DIR); } catch (e) { files = []; }
  const out = [];
  files.forEach(f => {
    if (!f.endsWith('.json') || f === '__meta__.json') return;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if (!data || !data.id || deletedSet.has(data.id)) return;
      out.push({ id: data.id, title: data.title || 'New chat', updatedAt: data.updatedAt || 0, messageCount: Array.isArray(data.history) ? data.history.length : 0 });
    } catch (e) {}
  });
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { ok: true, chats: out, counter: meta.counter, agentCounter: meta.agentCounter, deleted: meta.deleted };
}
function get(id) {
  const safe = safeId(id);
  if (!safe) return { ok: false, error: 'INVALID_ID' };
  if (isDeleted(safe)) return { ok: false, error: 'DELETED' };
  const f = fileFor(safe);
  if (!f || !fs.existsSync(f)) return { ok: false, error: 'NOT_FOUND' };
  try { return { ok: true, chat: JSON.parse(fs.readFileSync(f, 'utf8')) }; }
  catch (e) { return { ok: false, error: 'CHATSTORE_ERROR' }; }
}
function save(id, data) {
  const safe = safeId(id);
  if (!safe) return { ok: false, error: 'INVALID_ID' };
  if (isDeleted(safe)) return { ok: false, error: 'DELETED' };
  if (!data || typeof data !== 'object' || !Array.isArray(data.history)) return { ok: false, error: 'INVALID_MESSAGES' };
  for (const m of data.history) {
    if (!m || typeof m !== 'object' || typeof m.role !== 'string') return { ok: false, error: 'INVALID_MESSAGES' };
    if (typeof m.content !== 'string' && typeof m.text !== 'string') return { ok: false, error: 'INVALID_MESSAGES' };
  }
  // ANTI-WIPE (2026-11-05): never let an empty chat overwrite a non-empty
  // one. A stale frontend (fresh profile, failed server fetch) can POST an
  // empty Main chat and wipe the user's memory (the Main chat IS the user's
  // memory). If the stored chat has messages and the incoming one has none,
  // refuse the save and keep the stored version.
  try {
    const existing = get(safe);
    if (existing && existing.ok && existing.chat && Array.isArray(existing.chat.history) && existing.chat.history.length > 0 && data.history.length === 0) {
      return { ok: false, error: 'EMPTY_OVERWRITE' };
    }
  } catch (e) {}
  const entry = { id: safe, title: deriveTitle({ id: safe, title: data.title, history: data.history }), html: typeof data.html === 'string' ? data.html : '', history: data.history, updatedAt: Date.now() };
  if (data.kind === 'agent') {
    entry.kind = 'agent';
    entry.colorIndex = data.colorIndex || 0;
    entry.providerId = data.providerId || '';
    entry.chatModel = data.chatModel || '';
    entry.customChatModel = data.customChatModel || '';
    entry.browser = data.browser || null;
  }
  const json = JSON.stringify(entry);
  if (Buffer.byteLength(json, 'utf8') > MAX_BYTES) return { ok: false, error: 'TOO_LARGE' };
  ensureDir();
  const f = fileFor(safe);
  if (!f) return { ok: false, error: 'INVALID_ID' };
  try { fs.writeFileSync(f + '.tmp', json); fs.renameSync(f + '.tmp', f); }
  catch (e) { return { ok: false, error: 'CHATSTORE_ERROR' }; }
  if (typeof data.counter === 'number' || typeof data.agentCounter === 'number') {
    const meta = readMeta();
    writeMeta(typeof data.counter === 'number' ? data.counter : meta.counter, typeof data.agentCounter === 'number' ? data.agentCounter : meta.agentCounter, meta.deleted);
  }
  return { ok: true, id: safe, messageCount: entry.history.length, updatedAt: entry.updatedAt };
}
function remove(id) {
  const safe = safeId(id);
  if (!safe) return { ok: false, error: 'INVALID_ID' };
  if (safe === 'main') return { ok: false, error: 'MAIN_NOT_DELETABLE' };
  addDeleted(safe);
  const f = fileFor(safe);
  if (!f || !fs.existsSync(f)) return { ok: true, deleted: false };
  try { fs.unlinkSync(f); return { ok: true, deleted: true }; }
  catch (e) { return { ok: false, error: 'CHATSTORE_ERROR' }; }
}
module.exports = { list, get, save, remove };
