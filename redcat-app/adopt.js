'use strict';
// adopt.js — RedCat ADOPT slice (ADDITIVE module, ADOPT-tagged).
// Pure helpers for adopt.md: the path is FIXED (project-root adopt.md);
// callers can never supply a path, so path escapes are impossible.
// Reads never throw (missing file = empty). Writes are approval-gated:
// appendEntry and amendEntry REFUSE unless approved === true, so the
// model can never edit adopt.md directly — only the harness writes,
// only after user approval.

const fs = require('fs');
const path = require('path');

const ADOPT_PATH = path.join(__dirname, 'adopt.md');
const SECTIONS = ['Adopted', 'Rejected', 'Pending review'];
const MAX_READ = 20000;

function readRaw() {
  try {
    if (!fs.existsSync(ADOPT_PATH)) return '';
    return fs.readFileSync(ADOPT_PATH, 'utf8');
  } catch (e) { return ''; }
}

// Raw text of one ## section (without its heading line), or ''.
function sectionText(raw, section) {
  const lines = String(raw || '').split('\n');
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '## ' + section) { start = i + 1; continue; }
    if (start !== -1 && t.startsWith('## ')) { end = i; break; }
  }
  if (start === -1) return '';
  return lines.slice(start, end).join('\n').trim();
}

function readAdopted() {
  return sectionText(readRaw(), 'Adopted');
}

function readRejected() {
  return sectionText(readRaw(), 'Rejected');
}

// Adopted + Rejected sections with headings, for model-visible injection.
// Missing file = '' (never crash). Capped so context stays bounded.
function readFull() {
  const raw = readRaw();
  if (!raw) return '';
  const a = sectionText(raw, 'Adopted');
  const r = sectionText(raw, 'Rejected');
  let out = '';
  if (a) out += '## Adopted\n' + a + '\n';
  if (r) out += '\n## Rejected\n' + r + '\n';
  return out.trim().slice(0, MAX_READ);
}

// Parse one entry bullet line into {id, date, rule, reason, evidence}.
// Format: - **ID** (YYYY-MM-DD) — Rule: ... Reason: ... Evidence: ...
function parseEntryLine(line) {
  const m = /^-\s*\*\*([A-Za-z0-9_-]+)\*\*\s*\((\d{4}-\d{2}-\d{2})\)\s*—\s*Rule:\s*([\s\S]*)$/.exec(String(line || '').trim());
  if (!m) return null;
  const rest = m[3];
  const ri = rest.indexOf('Reason:');
  const ei = rest.indexOf('Evidence:');
  if (ri === -1 || ei === -1 || ei <= ri) return null;
  const rule = rest.slice(0, ri).trim();
  const reason = rest.slice(ri + 7, ei).trim();
  const evidence = rest.slice(ei + 9).trim();
  if (!rule || !reason || !evidence) return null;
  return { id: m[1], date: m[2], rule: rule, reason: reason, evidence: evidence };
}

function parseAll(raw) {
  const out = [];
  String(raw || '').split('\n').forEach(l => {
    const e = parseEntryLine(l);
    if (e) out.push(e);
  });
  return out;
}

function validateEntry(e) {
  if (!e || typeof e !== 'object') return 'ENTRY_NOT_OBJECT';
  if (!/^[A-Za-z0-9_-]+$/.test(String(e.id || ''))) return 'BAD_ID';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) return 'BAD_DATE';
  if (!String(e.rule || '').trim()) return 'MISSING_RULE';
  if (!String(e.reason || '').trim()) return 'MISSING_REASON';
  if (!String(e.evidence || '').trim()) return 'MISSING_EVIDENCE';
  return '';
}

function formatEntry(e) {
  return '- **' + e.id + '** (' + e.date + ') — Rule: ' + String(e.rule).trim() + ' Reason: ' + String(e.reason).trim() + ' Evidence: ' + String(e.evidence).trim();
}

function writeAtomic(text) {
  const tmp = ADOPT_PATH + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, ADOPT_PATH);
}

// Insert a pre-formatted bullet line at the end of one section in lines[].
function appendEntryRaw(lines, section, bullet) {
  let head = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '## ' + section) { head = i; continue; }
    if (head !== -1 && t.startsWith('## ')) { end = i; break; }
  }
  if (head === -1) return { ok: false, error: 'SECTION_NOT_FOUND' };
  let at = end;
  while (at > head + 1 && !lines[at - 1].trim()) at--;
  lines.splice(at, 0, bullet);
  return { ok: true };
}

// Insert an entry at the end of one section. Approval-gated.
function appendEntry(section, entry, approved) {
  if (approved !== true) return { ok: false, error: 'ADOPT_REQUIRES_APPROVAL' };
  if (SECTIONS.indexOf(section) === -1) return { ok: false, error: 'BAD_SECTION' };
  const bad = validateEntry(entry);
  if (bad) return { ok: false, error: bad };
  const raw = readRaw();
  if (!raw) return { ok: false, error: 'ADOPT_FILE_MISSING' };
  if (parseAll(raw).some(e => e.id === entry.id)) return { ok: false, error: 'DUPLICATE_ID' };
  const lines = raw.split('\n');
  const res = appendEntryRaw(lines, section, formatEntry(entry));
  if (!res.ok) return res;
  try { writeAtomic(lines.join('\n')); } catch (e) { return { ok: false, error: 'WRITE_FAILED' }; }
  return { ok: true, id: entry.id, section: section };
}

// Move entry <id> to Rejected, add a new Adopted entry (id + '-v2', '-v3',
// ... as needed). Approval-gated. The moved entry keeps its original text
// with an amendment note appended to its evidence.
function amendEntry(id, newRule, reason, approved) {
  if (approved !== true) return { ok: false, error: 'ADOPT_REQUIRES_APPROVAL' };
  if (!/^[A-Za-z0-9_-]+$/.test(String(id || ''))) return { ok: false, error: 'BAD_ID' };
  if (!String(newRule || '').trim()) return { ok: false, error: 'MISSING_RULE' };
  if (!String(reason || '').trim()) return { ok: false, error: 'MISSING_REASON' };
  const raw = readRaw();
  if (!raw) return { ok: false, error: 'ADOPT_FILE_MISSING' };
  const lines = raw.split('\n');
  let found = -1;
  let foundEntry = null;
  let foundSection = '';
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('## ')) { cur = t.slice(3).trim(); continue; }
    const e = parseEntryLine(lines[i]);
    if (e && e.id === id) { found = i; foundEntry = e; foundSection = cur; break; }
  }
  if (found === -1) return { ok: false, error: 'NOT_FOUND' };
  if (foundSection === 'Rejected') return { ok: false, error: 'ALREADY_REJECTED' };
  const today = new Date();
  const stamp = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const taken = new Set(parseAll(raw).map(e => e.id));
  let n = 2;
  let newId = id + '-v' + n;
  while (taken.has(newId)) { n++; newId = id + '-v' + n; }
  const moved = formatEntry({
    id: foundEntry.id,
    date: foundEntry.date,
    rule: foundEntry.rule,
    reason: foundEntry.reason,
    evidence: foundEntry.evidence + ' Amended ' + stamp + ': superseded by ' + newId + '.'
  });
  lines.splice(found, 1);
  const r1 = appendEntryRaw(lines, 'Rejected', moved);
  if (!r1.ok) return r1;
  const newEntry = { id: newId, date: stamp, rule: String(newRule).trim(), reason: String(reason).trim(), evidence: 'Amends ' + id + ' on ' + stamp + '.' };
  const r2 = appendEntryRaw(lines, 'Adopted', formatEntry(newEntry));
  if (!r2.ok) return r2;
  try { writeAtomic(lines.join('\n')); } catch (e) { return { ok: false, error: 'WRITE_FAILED' }; }
  return { ok: true, oldId: id, newId: newId };
}

module.exports = { ADOPT_PATH: ADOPT_PATH, SECTIONS: SECTIONS, readRaw: readRaw, readAdopted: readAdopted, readRejected: readRejected, readFull: readFull, parseEntryLine: parseEntryLine, parseAll: parseAll, validateEntry: validateEntry, formatEntry: formatEntry, appendEntry: appendEntry, amendEntry: amendEntry };
