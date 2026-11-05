// selfdev.js — RedCat SELF-DEVELOPMENT harness v1 (ADDITIVE module, SELFDEV-tagged).
// SCOPE: observe a run -> propose an improvement into a child slice -> parent merge
// card -> eval proof -> adopt only on (new >= old AND user approval) -> rollback.
// HARD RULES (never change in this file):
//  - NEVER modifies the harness system prompt text, the hardblock list, the
//    approval-gate logic, or sandbox modes. This module only ADDS endpoints.
//  - NEVER writes outside its allowed places: observation notes go to selfdev/
//    (own log dir), proposals go to runs/<runId>/slices/<childId>/ only, adopts
//    go only to non-sensitive project-relative targets.
//  - A proposal touching hardblock/approval code, or a sensitive destination
//    (server.js, *.env*, credentials, *.pem/*.key, ~/.ssh, package.json),
//    is auto-DENIED and logged as a safety refusal. No override path exists.
//  - Mock tests prove the LOOP only. Eval counts here are deterministic
//    artifact checks (not model-quality scores).
'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const RUNS_DIR = path.join(PROJECT_ROOT, 'runs');
const SELFDEV_DIR = path.join(PROJECT_ROOT, 'selfdev');
const MAX_PROPOSAL_BYTES = 512 * 1024;

function cleanId(v) { return String(v || '').replace(/[^A-Za-z0-9\-]/g, '').slice(0, 128); }

const SENSITIVE_RES = [
  /(^|[\\/])server\.js$/i,
  /\.env/i,
  /credentials/i,
  /\.pem$/i,
  /\.key$/i,
  /\.ssh/i,
  /(^|[\\/])package\.json$/i,
];

function isSensitiveTarget(target) {
  const t = String(target || '');
  if (SENSITIVE_RES.some(re => re.test(t))) return true;
  if (/hardblock/i.test(t) || /approval/i.test(t)) return true; // safety-code touch
  return false;
}

function isProjectRelative(target) {
  const t = String(target || '');
  if (!t || path.isAbsolute(t)) return false;
  if (t.split(/[\\/]/).includes('..')) return false;
  return true;
}

function sliceDir(runId, childId) { return path.join(RUNS_DIR, runId, 'slices', childId); }
function statePath(runId) { return path.join(SELFDEV_DIR, runId + '-state.json'); }
function logPath() { return path.join(SELFDEV_DIR, 'selfdev-log.jsonl'); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function loadState(runId) {
  const p = statePath(runId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
function saveState(runId, st) {
  ensureDir(SELFDEV_DIR);
  fs.writeFileSync(statePath(runId), JSON.stringify(st, null, 2), 'utf8');
}
function audit(runId, entry) {
  ensureDir(SELFDEV_DIR);
  const line = JSON.stringify({ t: new Date().toISOString(), runId: runId, ...entry }) + '\n';
  fs.appendFileSync(logPath(), line, 'utf8');
}
function appendRunEvent(runId, entry) {
  try {
    const p = path.join(RUNS_DIR, runId + '.jsonl');
    fs.appendFileSync(p, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n', 'utf8');
  } catch (e) { /* run-log append is best-effort; the audit log is authoritative */ }
}

// (a) OBSERVATION — read-only over the run log; writes ONLY into selfdev/.
function observeRun(rawRunId) {
  const runId = cleanId(rawRunId);
  if (!runId) return { ok: false, error: 'RUN_ID_REQUIRED' };
  const file = path.join(RUNS_DIR, runId + '.jsonl');
  if (!fs.existsSync(file)) return { ok: false, error: 'RUN_NOT_FOUND' };
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let failed = 0, denied = 0, corrections = 0, toolEvents = 0;
  for (const l of lines) {
    let ev = null;
    try { ev = JSON.parse(l); } catch (e) { continue; }
    const s = JSON.stringify(ev);
    if (ev.ok === false || /(failed|failure|error)/i.test(s)) failed++;
    if (/denied/i.test(s)) denied++;
    if (/correction/i.test(s)) corrections++;
    if (ev.tool || /tool\/call/.test(s)) toolEvents++;
  }
  const steps = lines.length;
  const note = [
    '# Self-dev observation — run ' + runId,
    '',
    '- events in run log: ' + steps,
    '- failed/error signals: ' + failed,
    '- denied signals: ' + denied,
    '- user-correction signals: ' + corrections,
    '- tool-call events: ' + toolEvents,
    '- step waste: ' + (steps > 20 ? 'HIGH (' + steps + ' events)' : 'normal (' + steps + ' events)'),
    '- note: this file lives in selfdev/ only; it never writes into skills/ or server.js.',
    ''
  ].join('\n');
  ensureDir(SELFDEV_DIR);
  const noteFile = runId + '-observation.md';
  fs.writeFileSync(path.join(SELFDEV_DIR, noteFile), note, 'utf8');
  audit(runId, { action: 'observe', noteFile, steps, failed, denied, corrections, toolEvents });
  return { ok: true, runId, noteFile, summary: { steps, failed, denied, corrections, toolEvents } };
}

// (b) PROPOSAL — explore-role child only; slice-only write, code-enforced.
function propose(rawRunId, rawChildId, role, target, content) {
  const runId = cleanId(rawRunId);
  const childId = cleanId(rawChildId);
  if (!runId || !childId) return { ok: false, error: 'RUN_AND_CHILD_REQUIRED' };
  if (role !== 'explore') {
    audit(runId, { action: 'propose-denied', reason: 'role-not-explore', role: String(role || '') });
    return { ok: false, denied: true, error: 'PROPOSALS_ONLY_FROM_EXPLORE_CHILD' };
  }
  if (!isProjectRelative(target)) {
    audit(runId, { action: 'propose-denied', reason: 'target-not-project-relative', target: String(target || '').slice(0, 200) });
    return { ok: false, denied: true, error: 'TARGET_NOT_PROJECT_RELATIVE' };
  }
  if (isSensitiveTarget(target)) {
    audit(runId, { action: 'safety-refusal', reason: 'sensitive-target', target: String(target).slice(0, 200) });
    return { ok: false, denied: true, error: 'SENSITIVE_DESTINATION_DENIED' };
  }
  const text = String(content || '');
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_PROPOSAL_BYTES) {
    return { ok: false, error: 'PROPOSAL_EMPTY_OR_TOO_LARGE' };
  }
  const dir = sliceDir(runId, childId);
  const full = path.join(dir, 'proposal.md');
  if (!full.startsWith(dir + path.sep)) return { ok: false, denied: true, error: 'SLICE_ESCAPE_DENIED' };
  ensureDir(dir);
  try {
    if (fs.lstatSync(dir).isSymbolicLink()) return { ok: false, denied: true, error: 'SLICE_SYMLINK_DENIED' };
    if (fs.existsSync(full) && fs.lstatSync(full).isSymbolicLink()) return { ok: false, denied: true, error: 'SLICE_SYMLINK_DENIED' };
  } catch (e) {}
  fs.writeFileSync(full, text, 'utf8');
  const st = loadState(runId) || { runId: runId, status: 'none' };
  st.status = 'proposed';
  st.childId = childId;
  st.proposal = { target: String(target), sliceFile: 'runs/' + runId + '/slices/' + childId + '/proposal.md', bytes: Buffer.byteLength(text, 'utf8') };
  st.eval = null; st.approved = false; st.adopted = false; st.previous = null;
  saveState(runId, st);
  audit(runId, { action: 'propose', childId, target: String(target), sliceFile: st.proposal.sliceFile, bytes: st.proposal.bytes });
  appendRunEvent(runId, { type: 'selfdev/propose', childId, target: String(target), sliceFile: st.proposal.sliceFile });
  return { ok: true, runId, childId, sliceFile: st.proposal.sliceFile, status: 'proposed' };
}

// (c) PARENT MERGE CARD — shown before any adopt; never auto-approves.
function mergeCard(rawRunId) {
  const runId = cleanId(rawRunId);
  const st = loadState(runId);
  if (!st || !st.proposal) return { ok: false, error: 'NO_PROPOSAL' };
  return {
    ok: true, runId, status: st.status, proposal: st.proposal,
    evalPlan: 'Rerun the fixed selfdev check set (non-empty, has-verify-section, has-approval-note, no-sensitive-strings) on baseline vs proposal. Adopt ONLY if newPass >= oldPass AND the user approves on this card.',
    eval: st.eval || null, approved: !!st.approved, adopted: !!st.adopted,
    safety: 'Sensitive destinations (server.js, *.env*, credentials, *.pem/*.key, ~/.ssh, package.json, hardblock/approval code) are auto-DENIED with no override.'
  };
}

// (d) EVAL PROOF — fixed deterministic artifact checks; counts recorded, not invented.
const EVAL_CHECKS = [
  { id: 'non-empty', test: (t) => t.trim().length > 200 },
  { id: 'has-verify-section', test: (t) => /verif/i.test(t) },
  { id: 'has-approval-note', test: (t) => /approval/i.test(t) },
  { id: 'no-sensitive-strings', test: (t) => !/hardblock|rm -rf|do not ask for confirmation/i.test(t) },
];
function runEvalChecks(text) {
  const results = EVAL_CHECKS.map(c => ({ id: c.id, pass: !!c.test(text) }));
  return { total: results.length, pass: results.filter(r => r.pass).length, results };
}
function evalProposal(rawRunId, baselineRel, proposalRel) {
  const runId = cleanId(rawRunId);
  const st = loadState(runId);
  if (!st || !st.proposal) return { ok: false, error: 'NO_PROPOSAL' };
  if (!isProjectRelative(baselineRel) || !isProjectRelative(proposalRel)) return { ok: false, error: 'EVAL_PATH_NOT_PROJECT_RELATIVE' };
  const baseFull = path.join(PROJECT_ROOT, baselineRel);
  const propFull = path.join(PROJECT_ROOT, proposalRel);
  if (!baseFull.startsWith(PROJECT_ROOT) || !propFull.startsWith(PROJECT_ROOT)) return { ok: false, error: 'EVAL_PATH_ESCAPE' };
  if (!fs.existsSync(baseFull) || !fs.existsSync(propFull)) return { ok: false, error: 'EVAL_FILE_MISSING' };
  const oldC = runEvalChecks(fs.readFileSync(baseFull, 'utf8'));
  const newC = runEvalChecks(fs.readFileSync(propFull, 'utf8'));
  st.eval = { oldPass: oldC.pass, oldTotal: oldC.total, newPass: newC.pass, newTotal: newC.total, oldResults: oldC.results, newResults: newC.results };
  saveState(runId, st);
  audit(runId, { action: 'eval', oldPass: oldC.pass, oldTotal: oldC.total, newPass: newC.pass, newTotal: newC.total });
  appendRunEvent(runId, { type: 'selfdev/eval', oldPass: oldC.pass, oldTotal: oldC.total, newPass: newC.pass, newTotal: newC.total });
  return { ok: true, runId, eval: st.eval };
}

// Adopt gate: approval AND eval-new >= eval-old AND non-sensitive target.
function adopt(rawRunId, approved) {
  const runId = cleanId(rawRunId);
  const st = loadState(runId);
  if (!st || !st.proposal) return { ok: false, error: 'NO_PROPOSAL' };
  if (approved !== true) {
    audit(runId, { action: 'adopt-refused', reason: 'approval-required' });
    return { ok: false, denied: true, error: 'ADOPT_REQUIRES_APPROVAL' };
  }
  if (!st.eval) {
    audit(runId, { action: 'adopt-refused', reason: 'eval-missing' });
    return { ok: false, denied: true, error: 'EVAL_REQUIRED_BEFORE_ADOPT' };
  }
  if (st.eval.newPass < st.eval.oldPass) {
    audit(runId, { action: 'adopt-refused', reason: 'eval-not-improved', eval: st.eval });
    return { ok: false, denied: true, error: 'EVAL_NOT_IMPROVED' };
  }
  if (isSensitiveTarget(st.proposal.target) || !isProjectRelative(st.proposal.target)) {
    audit(runId, { action: 'safety-refusal', reason: 'sensitive-target-at-adopt', target: st.proposal.target });
    return { ok: false, denied: true, error: 'SENSITIVE_DESTINATION_DENIED' };
  }
  const sliceFull = path.join(RUNS_DIR, runId, 'slices', st.childId, 'proposal.md');
  if (!fs.existsSync(sliceFull)) return { ok: false, error: 'PROPOSAL_FILE_MISSING' };
  const content = fs.readFileSync(sliceFull, 'utf8');
  const targetFull = path.join(PROJECT_ROOT, st.proposal.target);
  if (!targetFull.startsWith(PROJECT_ROOT)) return { ok: false, denied: true, error: 'TARGET_ESCAPE' };
  st.previous = { target: st.proposal.target, existed: fs.existsSync(targetFull), content: fs.existsSync(targetFull) ? fs.readFileSync(targetFull, 'utf8') : null };
  ensureDir(path.dirname(targetFull));
  fs.writeFileSync(targetFull, content, 'utf8');
  st.status = 'adopted'; st.approved = true; st.adopted = true;
  saveState(runId, st);
  audit(runId, { action: 'adopt', target: st.proposal.target });
  appendRunEvent(runId, { type: 'selfdev/adopt', target: st.proposal.target });
  return { ok: true, runId, target: st.proposal.target, status: 'adopted' };
}

// (e) ROLLBACK — one flag restores the previous version.
function rollback(rawRunId, flag) {
  const runId = cleanId(rawRunId);
  const st = loadState(runId);
  if (!st || st.status !== 'adopted' || !st.previous) return { ok: false, error: 'NOTHING_TO_ROLLBACK' };
  if (flag !== true) {
    audit(runId, { action: 'rollback-refused', reason: 'flag-required' });
    return { ok: false, denied: true, error: 'ROLLBACK_FLAG_REQUIRED' };
  }
  const targetFull = path.join(PROJECT_ROOT, st.previous.target);
  if (!targetFull.startsWith(PROJECT_ROOT)) return { ok: false, denied: true, error: 'TARGET_ESCAPE' };
  if (st.previous.existed) fs.writeFileSync(targetFull, st.previous.content, 'utf8');
  else { try { fs.unlinkSync(targetFull); } catch (e) {} }
  st.status = 'rolled_back'; st.adopted = false;
  saveState(runId, st);
  audit(runId, { action: 'rollback', target: st.previous.target });
  appendRunEvent(runId, { type: 'selfdev/rollback', target: st.previous.target });
  return { ok: true, runId, target: st.previous.target, status: 'rolled_back' };
}

function readLog(rawRunId) {
  const runId = cleanId(rawRunId);
  const p = logPath();
  if (!fs.existsSync(p)) return { ok: true, runId, entries: [] };
  const entries = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(e => e && e.runId === runId);
  return { ok: true, runId, entries };
}

module.exports = { observeRun, propose, mergeCard, evalProposal, adopt, rollback, readLog };
