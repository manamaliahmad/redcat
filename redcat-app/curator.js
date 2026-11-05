'use strict';
// curator.js — RedCat CURATOR queue (ADDITIVE module, CURATOR-tagged).
// Staged proposals: propose -> user approval -> adopt/archive, NEVER delete.
// Reuses selfdev state files (selfdev/<runId>-state.json) and the selfdev
// mergeCard for review. Adopt and rollback stay selfdev endpoints: the
// curator never adopts or rolls back by itself, and never approves anything.
// Standing rules and memory files are never touched by the curator: it only
// reads selfdev state files and writes its own archive flag + audit log.
// Nothing is ever deleted: an archived proposal keeps its state file, its
// slice file, and its log entries on disk.

const fs = require('fs');
const path = require('path');
const selfdev = require('./selfdev.js');

const PROJECT_ROOT = __dirname;
const SELFDEV_DIR = path.join(PROJECT_ROOT, 'selfdev');
const CURATOR_LOG = path.join(SELFDEV_DIR, 'curator-log.jsonl');

function cleanId(v) { return String(v || '').replace(/[^A-Za-z0-9\-]/g, '').slice(0, 128); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function loadState(runId) {
  const p = path.join(SELFDEV_DIR, runId + '-state.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function saveState(runId, st) {
  ensureDir(SELFDEV_DIR);
  fs.writeFileSync(path.join(SELFDEV_DIR, runId + '-state.json'), JSON.stringify(st, null, 2), 'utf8');
}

function audit(runId, entry) {
  ensureDir(SELFDEV_DIR);
  fs.appendFileSync(CURATOR_LOG, JSON.stringify({ t: new Date().toISOString(), runId: runId, ...entry }) + '\n', 'utf8');
}

// Status is authoritative in the curator: selfdev propose() resets status
// but knows nothing of the curator archived flag, so a re-proposal after an
// archive must read as staged again. The flag is kept only for traceability.
function toItem(st) {
  return {
    runId: st.runId,
    childId: st.childId || null,
    target: st.proposal.target,
    sliceFile: st.proposal.sliceFile,
    status: st.status,
    archived: st.status === 'archived',
    eval: st.eval || null,
    approved: !!st.approved,
    adopted: !!st.adopted
  };
}

// Queue: every selfdev state file, split staged / adopted / archived /
// rolled_back. A rolled-back proposal is history, never staged again: it
// must not be presented as actionable (adopting it again needs a fresh
// propose + eval + approval cycle, not a queue click).
function queue() {
  if (!fs.existsSync(SELFDEV_DIR)) return { ok: true, staged: [], adopted: [], archived: [], rolled_back: [], total: 0 };
  const files = fs.readdirSync(SELFDEV_DIR).filter(function (f) { return /-state\.json$/.test(f); });
  const staged = [];
  const adopted = [];
  const archived = [];
  const rolledBack = [];
  for (const f of files) {
    const st = loadState(f.replace(/-state\.json$/, ''));
    if (!st || !st.proposal) continue;
    const item = toItem(st);
    if (st.status === 'archived') archived.push(item);
    else if (st.status === 'rolled_back') rolledBack.push(item);
    else if (st.adopted) adopted.push(item);
    else staged.push(item);
  }
  return { ok: true, staged: staged, adopted: adopted, archived: archived, rolled_back: rolledBack, total: staged.length + adopted.length + archived.length + rolledBack.length };
}

// Review: selfdev merge card + readiness. Reports only — never approves.
function review(rawRunId) {
  const runId = cleanId(rawRunId);
  const card = selfdev.mergeCard(runId);
  if (!card.ok) return card;
  const st = loadState(runId);
  const evalDone = !!(st && st.eval);
  const evalImproved = !!(st && st.eval && st.eval.newPass >= st.eval.oldPass);
  const userApproved = !!(st && st.approved);
  return {
    ok: true,
    runId: runId,
    card: card,
    readiness: { evalDone: evalDone, evalImproved: evalImproved, userApproved: userApproved, adoptReady: evalImproved && userApproved },
    recommendation: evalImproved ? 'eval improved — adopt ONLY after the user approves on the merge card' : 'eval not improved or missing — do NOT adopt'
  };
}

// Archive: a staged proposal leaves the active queue but its state file,
// slice file, and log entries REMAIN on disk. Adopted proposals cannot be
// archived (use rollback to undo an adopt); rolled-back proposals are
// history, not staged. Nothing is ever deleted.
function archive(rawRunId) {
  const runId = cleanId(rawRunId);
  const st = loadState(runId);
  if (!st || !st.proposal) return { ok: false, error: 'NO_PROPOSAL' };
  if (st.status === 'adopted' || st.adopted) {
    audit(runId, { action: 'archive-refused', reason: 'adopted-use-rollback' });
    return { ok: false, denied: true, error: 'ADOPTED_CANNOT_ARCHIVE_USE_ROLLBACK' };
  }
  if (st.status === 'archived') return { ok: false, error: 'ALREADY_ARCHIVED' };
  if (st.status !== 'proposed') return { ok: false, error: 'NOT_STAGED' };
  st.archived = true;
  st.status = 'archived';
  saveState(runId, st);
  audit(runId, { action: 'archive', target: st.proposal.target });
  return { ok: true, runId: runId, target: st.proposal.target, status: 'archived' };
}

module.exports = { queue: queue, review: review, archive: archive };
