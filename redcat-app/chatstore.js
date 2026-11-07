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
const os = require('os');
// CHATS IN userData (2026-11-07, v1.0.6): chats must live in userData so an
// app update/reinstall never touches them. The packaged app sets
// REDCAT_USER_DATA (main.js) to app.getPath('userData'); the dev server
// (no env var) keeps using chats/ next to server.js. Same pattern as the
// v1.0.4 browser-profile fix (REDCAT_BROWSER_PROFILE).
const DIR = process.env.REDCAT_USER_DATA
  ? path.join(process.env.REDCAT_USER_DATA, 'chats')
  : path.join(__dirname, 'chats');
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
// MIGRATION (2026-11-07, v1.0.6; REWRITTEN 2026-11-07, v1.0.8): on first
// run after the move to userData, adopt chats that still live in an old
// location into userData/chats/ so NO user's old chat is lost. The v1.0.6
// migration only checked app.asar.unpacked/redcat-app/chats — which never
// had chats (the old code wrote inside app.asar, which is unwritable) —
// so it found nothing and the user's real chats stayed invisible. v1.0.8
// checks ALL legacy locations:
//   (a) <install>/resources/app.asar.unpacked/redcat-app/chats
//   (b) the dev/workshop dir ~/Desktop/redcat/chats (where ali's real
//       chats live — adopted when userData is empty/fresh)
//   (c) chats/ next to server.js (dev-server layout)
// Rules (Hermes principles: disk is truth, never delete, never overwrite
// good data): a legacy file is copied only when the userData file is
// MISSING or has ZERO messages and the legacy copy has >0 messages; a
// userData file with >0 messages is NEVER overwritten. __meta__.json is
// merged (max counters, union of tombstones) across all sources. Legacy
// files are left in place as a backup; nothing is ever deleted. Deleted
// (tombstoned) chats are never migrated back. Runs when this module loads
// and on list/get/save; after the first successful pass it is a no-op.
function legacyDirs() {
  const dirs = [];
  if (process.env.REDCAT_USER_DATA && process.execPath) {
    try { dirs.push(path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'redcat-app', 'chats')); } catch (e) {}
  }
  try { dirs.push(path.join(os.homedir(), 'Desktop', 'redcat', 'chats')); } catch (e) {}
  dirs.push(path.join(__dirname, 'chats'));
  const out = [];
  dirs.forEach(function (d) { if (d && d !== DIR && out.indexOf(d) === -1) out.push(d); });
  return out;
}
function readChatFile(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) { return null; }
}
function messageCount(data) {
  return data && Array.isArray(data.history) ? data.history.length : 0;
}
function readMetaFrom(file) {
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    const deleted = Array.isArray(m.deleted) ? m.deleted.filter(function (x) { return typeof x === 'string' && x; }) : [];
    return { counter: typeof m.counter === 'number' ? m.counter : 0, agentCounter: typeof m.agentCounter === 'number' ? m.agentCounter : 0, deleted: deleted };
  } catch (e) { return { counter: 0, agentCounter: 0, deleted: [] }; }
}
let migrationDone = false;
function migrateLegacyChats() {
  if (migrationDone) return;
  try {
    const sources = legacyDirs();
    if (!sources.length) { migrationDone = true; return; }
    // Merge __meta__.json across userData + all legacy sources FIRST, so
    // tombstones are known before any file is copied (a deleted chat must
    // never come back through migration).
    let merged = readMeta();
    let metaChanged = false;
    sources.forEach(function (dir) {
      try {
        const lm = path.join(dir, '__meta__.json');
        if (!fs.existsSync(lm)) return;
        const legacy = readMetaFrom(lm);
        const before = JSON.stringify(merged);
        merged.counter = Math.max(merged.counter, legacy.counter);
        merged.agentCounter = Math.max(merged.agentCounter, legacy.agentCounter);
        merged.deleted = Array.from(new Set([].concat(merged.deleted || [], legacy.deleted || []).filter(function (x) { return typeof x === 'string' && x; }))).slice(0, MAX_DELETED);
        if (JSON.stringify(merged) !== before) metaChanged = true;
      } catch (e) {}
    });
    const deletedSet = new Set(merged.deleted || []);
    let anySource = false;
    sources.forEach(function (dir) {
      if (!fs.existsSync(dir)) return;
      anySource = true;
      let files = [];
      try { files = fs.readdirSync(dir); } catch (e) { files = []; }
      files.forEach(function (f) {
        if (!f.endsWith('.json') || f === '__meta__.json') return;
        const id = f.slice(0, -5);
        if (!safeId(id) || deletedSet.has(id)) return;
        const src = path.join(dir, f);
        const dst = path.join(DIR, f);
        const legacyData = readChatFile(src);
        if (!legacyData || messageCount(legacyData) === 0) return;
        if (fs.existsSync(dst)) {
          // Empty-file-doesn't-block: a 0-message userData file is replaced
          // by the legacy copy. A userData file with >0 messages is NEVER
          // overwritten (the user's newer data always wins).
          const currentData = readChatFile(dst);
          if (currentData && messageCount(currentData) > 0) return;
        }
        try { ensureDir(); fs.copyFileSync(src, dst); } catch (e) {}
      });
    });
    if (anySource && metaChanged) writeMeta(merged.counter, merged.agentCounter, merged.deleted);
    migrationDone = true;
  } catch (e) {}
}
migrateLegacyChats();
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
  migrateLegacyChats();
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
  migrateLegacyChats();
  const safe = safeId(id);
  if (!safe) return { ok: false, error: 'INVALID_ID' };
  if (isDeleted(safe)) return { ok: false, error: 'DELETED' };
  const f = fileFor(safe);
  if (!f || !fs.existsSync(f)) return { ok: false, error: 'NOT_FOUND' };
  try { return { ok: true, chat: JSON.parse(fs.readFileSync(f, 'utf8')) }; }
  catch (e) { return { ok: false, error: 'CHATSTORE_ERROR' }; }
}
function save(id, data) {
  migrateLegacyChats();
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
  // EMPTY-NEW (2026-11-07, v1.0.8): never CREATE a file with an empty
  // history. A fresh load pushes an empty Main chat to the server; if no
  // file exists yet that empty save CREATED an empty main.json (08:12 on
  // 7 Nov), which then blocked future migration. A chat file is only
  // created when it has >=1 message. Exception: a Discord profile row
  // (id discord-*, data.profile === true, sent ONLY by the PC poller when
  // the relay reports a bound user) may be created empty, so the profile
  // shows in the sidebar before the first DM. The anti-wipe above still
  // blocks an empty overwrite of a non-empty file.
  const targetFile = fileFor(safe);
  if (targetFile && !fs.existsSync(targetFile) && data.history.length === 0) {
    if (!(data.profile === true && safe.indexOf('discord-') === 0)) {
      return { ok: false, error: 'EMPTY_NEW' };
    }
  }
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
// BACKUP (2026-11-07, v1.0.8): automatic JSONL export of every chat
// (one JSON object per line: a {type:'meta'} line, then one full chat
// object per line) to <userData>/backups/chats-YYYY-MM-DD.jsonl. Called
// on server startup and daily (see server.js). Keeps the last 7 daily
// files. Never deletes chat files — only prunes old backup files.
function backupChats() {
  try {
    migrateLegacyChats();
    const backupDir = path.join(path.dirname(DIR), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const now = new Date();
    const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const file = path.join(backupDir, 'chats-' + stamp + '.jsonl');
    const meta = readMeta();
    const lines = [JSON.stringify({ type: 'meta', exportedAt: now.toISOString(), counter: meta.counter, agentCounter: meta.agentCounter, deleted: meta.deleted })];
    const listing = list();
    (listing.chats || []).forEach(function (item) {
      try {
        const got = get(item.id);
        if (got && got.ok && got.chat) lines.push(JSON.stringify(got.chat));
      } catch (e) {}
    });
    fs.writeFileSync(file + '.tmp', lines.join('\n') + '\n', 'utf8');
    fs.renameSync(file + '.tmp', file);
    try {
      const kept = fs.readdirSync(backupDir).filter(function (f) { return /^chats-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f); }).sort();
      while (kept.length > 7) { const old = kept.shift(); try { fs.unlinkSync(path.join(backupDir, old)); } catch (e) {} }
    } catch (e) {}
    return { ok: true, file: file, chats: lines.length - 1 };
  } catch (e) {
    return { ok: false, error: 'BACKUP_FAILED' };
  }
}
module.exports = { list, get, save, remove, backupChats };
