// skill-add.js — Add Skill flow (v1.0.12).
// Server-side helpers for installing skills from a GitHub link, an uploaded
// SKILL.md / zip, or pasted text. The deterministic scan below implements the
// Step 2 static pattern catalog of the skill-scan skill (BLOCK / REVIEW /
// ALLOW, specific findings, never a summed score). Step 3 (claim-vs-code) is
// model work and is NOT part of this gate — the preview shows the description
// and the skill text so the user judges scope. No skill code is ever executed
// here, and no skill text is sent anywhere.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Caps (from the skill-install skill).
const MAX_SKILL_MD = 100 * 1024;      // SKILL.md <= 100 KB
const MAX_SKILL_TOTAL = 1024 * 1024;  // whole skill <= 1 MB
const MAX_SKILL_FILES = 50;
const MAX_CATALOG_DIRS = 30;
const WARN_CATALOG_DIRS = 28;
const MAX_BODY = 3 * 1024 * 1024;     // POST body cap for prepare (zip base64)

// Text files we are willing to copy from a skill. Scripts and executables are
// NEVER installed (skill-install refuse list). Binaries/archives are skipped.
const TEXT_EXTS = ['.md', '.txt', '.json', '.yaml', '.yml'];
const SKIP_DIRS = ['.git', 'node_modules', 'scripts', '__pycache__', '.github'];
const SKIP_EXTS = ['.exe', '.dll', '.bin', '.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp3', '.mp4', '.pdf'];

function cleanSkillName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 64);
}

function parseSkillMeta(text) {
  const t = String(text || '');
  const lines = t.split('\n');
  let name = '';
  let description = '';
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const ln = lines[i].trim();
    let m = /^name:\s*(.+)$/i.exec(ln);
    if (m && !name) {
      let v = m[1].replace(/^['"]|['"]$/g, '').trim();
      // FRONTMATTER-ON-ONE-LINE FIX (2026-11-10): a Skill.md may carry
      // name + version + description on a single line. Stop the name at
      // the next frontmatter key so we don't get a garbled folder name.
      const cut = v.search(/\s+(version|description)\s*:/i);
      if (cut !== -1) v = v.slice(0, cut).trim();
      name = v;
    }
    m = /^description:\s*(.+)$/i.exec(ln);
    if (m && !description) description = m[1].replace(/^['"]|['"]$/g, '').trim();
    if (description === '>') description = '';
  }
  return { name: cleanSkillName(name), description: String(description || '').slice(0, 500) };
}

function skillDescription(text) {
  const m = parseSkillMeta(text);
  if (m.description) return m.description;
  const lines = String(text || '').split('\n');
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const mm = /^when to use:\s*(.+)$/i.exec(lines[i].trim());
    if (mm) return mm[1].trim().slice(0, 500);
  }
  return '';
}

// Relative file references inside SKILL.md (markdown links/images, backticked
// paths, plain references/ and examples/ paths). Only used to decide which
// sibling files to fetch — never arbitrary repo files.
function extractSkillReferences(text) {
  const out = new Set();
  const t = String(text || '');
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = linkRe.exec(t)) !== null) out.add(m[1]);
  const tickRe = /`([^`\s]+\.(?:md|txt|json|yaml|yml))`/g;
  while ((m = tickRe.exec(t)) !== null) out.add(m[1]);
  const plainRe = /(?:^|\s)((?:references|examples|data)\/[A-Za-z0-9._\-/]+)/g;
  while ((m = plainRe.exec(t)) !== null) out.add(m[1]);
  const clean = [];
  for (const r of out) {
    let p = String(r).replace(/^#.*$/, '').trim();
    if (!p || /^https?:\/\//i.test(p) || p.startsWith('/') || p.startsWith('mailto:')) continue;
    p = p.replace(/^\.\//, '').replace(/#.*$/, '');
    if (!p || p.indexOf('..') !== -1) continue;
    const ext = path.posix.extname(p).toLowerCase();
    if (TEXT_EXTS.indexOf(ext) === -1) continue;
    if (SKIP_DIRS.some(d => p === d || p.startsWith(d + '/'))) continue;
    clean.push(p);
  }
  return clean.slice(0, MAX_SKILL_FILES);
}

// ---- Deterministic scan (skill-scan Step 2) ----
// Each rule: {cls, severity ('block'|'review'|'info'), res: [RegExp]}.
// A finding is one matched rule on one line (file + line + matched text).
// Verdict: BLOCK if any block finding; else REVIEW if any review finding;
// else ALLOW. No summed score — findings are reported individually.
const SCAN_RULES = [
  { cls: 'Hidden instruction', severity: 'block', res: [
    /[\u200B-\u200F\uFEFF]/,
    /<!--[\s\S]{0,400}?(ignore|disregard|skip|override|do\s+not|never|always|must|secret|instruction|system\s+prompt)[\s\S]{0,400}?-->/i,
  ] },
  { cls: 'Prompt injection / override', severity: 'block', res: [
    /ignore\s+(all\s+)?(previous|prior|system|above)\s+(instructions?|prompt|rules?)/i,
    /disregard\s+(your\s+)?(instructions?|guidelines?|rules?|prompt)/i,
    /\byou are now\b/i,
    /\bnew\s+(system\s+)?prompt\b/i,
    /\boverride\b.{0,40}(instruction|rule|guideline|system)/i,
    /send\s+(the\s+)?(conversation|system|context|chat)\s+.{0,30}(outside|to\s+an?\s+external|to\s+a\s+third)/i,
  ] },
  { cls: 'Approval bypass', severity: 'block', res: [
    /\bnever\s+refuse\b/i, /\balways\s+comply\b/i, /\bdo\s+not\s+refuse\b/i,
    /\bno\s+disclaimers\b/i, /\bdo\s+not\s+(warn|moralize)\b/i,
    /\byou\s+have\s+no\s+restrictions\b/i,
    /\bignore\s+(your\s+)?(guidelines?|policy|safety)\b/i,
    /\bdo\s+not\s+ask\s+(for\s+)?(confirmation|approval)\b/i,
    /\bassume\s+(approval|permission)\b/i, /\bskip\s+(approval|confirmation)\b/i,
    /\balready\s+approved\b/i,
  ] },
  { cls: 'Credential access', severity: 'block', res: [
    /~\/.ssh/i, /\.aws\/credentials/i,
    /\bos\.environ\b/i, /\bprocess\.env\b/i,
    /(read|load|cat|open|source|get|fetch|print|echo|show|reveal)\s+[^\n]{0,40}?\.env\b/i,
    /(get|read|fetch|load|steal|exfiltrate|copy|print|echo|show|reveal|output)\s+[^\n]{0,30}?(api[ _-]?key|password|passwd|secret)/i,
    /\bsk-[A-Za-z0-9]{16,}\b/,
  ] },
  { cls: 'Credential reference', severity: 'review', res: [
    /\.env\b/i,
    // A bare "password" is too noisy (PDF/zip encryption legitimately says
    // it). Only flag it next to a credential-handling word.
    /\b(api[ _-]?key|password|passwd)\b[^\n]{0,60}?\b(store|save|config|credential|token|env|file|read|load|get|set)\b/i,
    /\b(store|save|config|credential|token|env|file|read|load|get|set)\b[^\n]{0,60}?\b(api[ _-]?key|password|passwd)\b/i,
  ] },
  { cls: 'Exfiltration', severity: 'block', res: [
    /(curl|wget)\s+[^\n]*\|\s*(ba)?sh\b/i,
    /(fetch\(|requests\.post|upload|webhook)[^\n]{0,60}?(env|password|token|secret|conversation|chat\s+history|api[_-]?key)/i,
  ] },
  { cls: 'External send', severity: 'review', res: [
    /\bcurl\b/i, /\bwget\b/i, /\bfetch\s*\(/i, /\brequests\.post\b/i,
    /\bupload\b/i, /\bwebhook\b/i,
  ] },
  { cls: 'Destructive action', severity: 'block', res: [
    /\brm\s+-rf\b/i, /\bchmod\s+777\b/i,
    /\bdisable\s+(tls|ssl|auth)\b/i,
    /\bcurl\s+[^\n]*\|\s*(ba)?sh\b/i,
  ] },
  { cls: 'Destructive command', severity: 'review', res: [
    /\bsudo\b/i, /\beval\s*\(/i, /\bexec\s*\(/i,
    /\bsubprocess\b/i, /\bshell\s*=\s*True\b/i, /--force\b/i,
  ] },
  { cls: 'System-prompt / memory attack', severity: 'block', res: [
    /\breveal\s+(your\s+)?(system\s+prompt|instructions?)\b/i,
    /\brepeat\s+(your\s+)?(system\s+prompt|initial\s+instructions?)\b/i,
    /\b(translate|paraphrase)\s+(your\s+)?(instructions?|prompt)\b/i,
    /\bremember\s+(this\s+)?(forever|across\s+sessions?)\b/i,
    /\bwrite\s+to\s+(memory|MEMORY\.md|context\s+file)\b/i,
    /\balways\s+(do|follow)\s+this\s+in\s+future\b/i,
  ] },
  { cls: 'Self-modification / persistence', severity: 'block', res: [
    /\bedit\s+(your\s+own|the)\s+(config|skill|SKILL\.md)\b/i,
    /\bupdate\s+SKILL\.md\b/i,
    /\bmodify\s+(your|the)\s+(config|skill)\b/i,
    /\b(cron|systemd)\b/i,
  ] },
  { cls: 'Encoded blob', severity: 'block', res: [
    /(decode|base64|atob|Buffer\.from)[^\n]{0,80}?[A-Za-z0-9+/=]{60,}/i,
    /[A-Za-z0-9+/=]{60,}[^\n]{0,40}?(decode|base64)/i,
  ] },
  { cls: 'Encoded blob', severity: 'review', res: [
    /[A-Za-z0-9+/=]{100,}/,
  ] },
  { cls: 'Hidden text', severity: 'review', res: [
    / {80,}\S/,
  ] },
];

function scanSkillFiles(files) {
  const findings = [];
  const seen = new Set();
  const add = (file, lineNo, cls, severity, text) => {
    const key = file + '|' + lineNo + '|' + cls;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ file: file, line: lineNo, cls: cls, severity: severity, text: String(text || '').slice(0, 200) });
  };
  for (const f of (files || [])) {
    const content = String(f.content || '');
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content)) {
      add(f.path, 0, 'Unreadable / binary content', 'block', 'File contains binary or control bytes and cannot be inspected.');
      continue;
    }
    const lines = content.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      for (const rule of SCAN_RULES) {
        for (const re of rule.res) {
          re.lastIndex = 0;
          const m = re.exec(line);
          if (m) {
            add(f.path, li + 1, rule.cls, rule.severity, m[0].trim());
            break;
          }
        }
      }
    }
    // Long base64 blobs can span lines — check the whole file once.
    if (/[A-Za-z0-9+/=]{200,}/.test(content) && !/decode|base64/i.test(content)) {
      add(f.path, 0, 'Encoded blob', 'review', 'Very long encoded-looking string — verify it is an example, not a hidden instruction.');
    }
  }
  // Generic description (scope / trigger abuse).
  const md = (files || []).find(f => /(^|\/)SKILL\.md$/.test(f.path));
  if (md) {
    const desc = parseSkillMeta(md.content).description;
    if (!desc || desc.length < 10 || /^(help with everything|a skill|does stuff|general|misc)/i.test(desc)) {
      add(md.path, 0, 'Generic description', 'review', 'The description is missing or too generic — the skill may not trigger reliably.');
    }
  }
  let verdict = 'ALLOW';
  if (findings.some(f => f.severity === 'block')) verdict = 'BLOCK';
  else if (findings.some(f => f.severity === 'review')) verdict = 'REVIEW';
  return { verdict: verdict, findings: findings };
}

// ---- Minimal ZIP reader (stored + deflate only, no dependency) ----
// Parses the central directory, returns [{path, content}] as UTF-8 strings.
// Rejects archives, binaries, scripts and anything outside the caps.
function unzipBuffer(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf || []);
  if (buf.length < 22 || buf.length > MAX_SKILL_TOTAL * 2) return { ok: false, error: 'Zip file is too large or not a zip.' };
  // Find End Of Central Directory (scan last 64KB for the signature).
  let eocd = -1;
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, error: 'Not a valid zip file.' };
  const total = buf.readUInt16LE(eocd + 10);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (total <= 0 || total > MAX_SKILL_FILES) return { ok: false, error: 'Zip has too many files (max ' + MAX_SKILL_FILES + ').' };
  const files = [];
  let totalBytes = 0;
  for (let i = 0; i < total; i++) {
    if (cdOff + 46 > buf.length || buf.readUInt32LE(cdOff) !== 0x02014b50) return { ok: false, error: 'Zip central directory is corrupt.' };
    const method = buf.readUInt16LE(cdOff + 10);
    const compSize = buf.readUInt32LE(cdOff + 20);
    const rawSize = buf.readUInt32LE(cdOff + 24);
    const nameLen = buf.readUInt16LE(cdOff + 28);
    const extraLen = buf.readUInt16LE(cdOff + 30);
    const commentLen = buf.readUInt16LE(cdOff + 32);
    const localOff = buf.readUInt32LE(cdOff + 42);
    const name = buf.toString('utf8', cdOff + 46, cdOff + 46 + nameLen);
    cdOff += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (name.indexOf('..') !== -1 || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return { ok: false, error: 'Zip contains an unsafe path: ' + name };
    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) return { ok: false, error: 'Zip local header is corrupt.' };
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) return { ok: false, error: 'Zip entry is truncated: ' + name };
    let raw;
    if (method === 0) raw = buf.slice(dataStart, dataEnd);
    else if (method === 8) {
      try { raw = zlib.inflateRawSync(buf.slice(dataStart, dataEnd)); } catch (e) { return { ok: false, error: 'Could not decompress zip entry: ' + name }; }
    } else return { ok: false, error: 'Unsupported zip compression in: ' + name };
    if (raw.length !== rawSize) return { ok: false, error: 'Zip size mismatch: ' + name };
    totalBytes += raw.length;
    if (totalBytes > MAX_SKILL_TOTAL) return { ok: false, error: 'Unzipped skill is too large (max 1 MB).' };
    files.push({ path: name, content: raw.toString('utf8') });
  }
  return { ok: true, files: files };
}

// Keep only the files a skill may contain: SKILL.md + referenced text files.
// Drops scripts/, binaries, archives, .git, node_modules and anything binary.
function filterSkillFiles(files) {
  const out = [];
  const skipped = [];
  for (const f of (files || [])) {
    const p = String(f.path || '').replace(/\\/g, '/');
    if (!p || p.endsWith('/')) continue;
    const parts = p.split('/');
    if (parts.some(x => SKIP_DIRS.indexOf(x) !== -1)) { skipped.push(p + ' (skipped: folder not installed)'); continue; }
    if (p.indexOf('..') !== -1) { skipped.push(p + ' (skipped: unsafe path)'); continue; }
    const ext = path.posix.extname(p).toLowerCase();
    if (SKIP_EXTS.indexOf(ext) !== -1) { skipped.push(p + ' (skipped: binary/archive)'); continue; }
    if (TEXT_EXTS.indexOf(ext) === -1) { skipped.push(p + ' (skipped: not a text file)'); continue; }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(String(f.content || ''))) { skipped.push(p + ' (skipped: binary content)'); continue; }
    out.push({ path: p, content: String(f.content || '') });
  }
  return { files: out.slice(0, MAX_SKILL_FILES), skipped: skipped };
}

// ---- GitHub fetch (public repos only, no token, skill files only) ----
function parseGithubUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '').trim()); } catch (e) { return { ok: false, error: 'That is not a valid URL.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Only http(s) URLs are supported.' };
  const host = u.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'raw.githubusercontent.com' && host !== 'www.github.com') {
    return { ok: false, error: 'v1 supports public GitHub repos only.' };
  }
  if (host === 'raw.githubusercontent.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return { ok: false, error: 'That raw URL does not point to a file.' };
    return { ok: true, kind: 'raw', owner: parts[0], repo: parts[1], branch: parts[2], filePath: parts.slice(3).join('/'), url: String(rawUrl).trim() };
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return { ok: false, error: 'That URL does not point to a GitHub repo.' };
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  // Direct SKILL.md link: /owner/repo/blob/<branch>/<path>/SKILL.md
  if (parts[2] === 'blob' && parts.length >= 5) {
    return { ok: true, kind: 'file', owner: owner, repo: repo, branch: parts[3], filePath: parts.slice(4).join('/'), url: String(rawUrl).trim() };
  }
  // Repo or tree path: /owner/repo[/tree/<branch>/<path>]
  let branch = '';
  let treePath = '';
  if (parts[2] === 'tree' && parts.length >= 4) { branch = parts[3]; treePath = parts.slice(4).join('/'); }
  return { ok: true, kind: 'repo', owner: owner, repo: repo, branch: branch, treePath: treePath, url: String(rawUrl).trim() };
}

async function ghFetch(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'RedCat-skill-add', 'Accept': 'application/vnd.github+json' }, signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}

async function fetchGithubSkill(rawUrl) {
  const parsed = parseGithubUrl(rawUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const tried = [];
  const fetchText = async (url) => {
    tried.push(url);
    let r;
    try { r = await ghFetch(url); } catch (e) { return { ok: false, error: 'Could not reach GitHub (' + (e && e.name === 'AbortError' ? 'timeout' : 'network error') + ').' }; }
    if (r.status === 404) return { ok: false, error: 'not found' };
    if (!r.ok) return { ok: false, error: 'GitHub returned HTTP ' + r.status + '.' };
    const text = await r.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_SKILL_MD) return { ok: false, error: 'SKILL.md is larger than 100 KB.' };
    return { ok: true, text: text };
  };
  // Direct file URL — fetch it as-is.
  if (parsed.kind === 'raw' || parsed.kind === 'file') {
    const raw = parsed.kind === 'raw'
      ? 'https://raw.githubusercontent.com/' + parsed.owner + '/' + parsed.repo + '/' + parsed.branch + '/' + parsed.filePath
      : 'https://raw.githubusercontent.com/' + parsed.owner + '/' + parsed.repo + '/' + parsed.branch + '/' + parsed.filePath;
    const got = await fetchText(raw);
    if (!got.ok) return { ok: false, error: got.error === 'not found' ? 'No SKILL.md found at that URL.' : got.error, tried: tried };
    const meta = parseSkillMeta(got.text);
    const skillDir = parsed.filePath.split('/').slice(0, -1).join('/');
    const name = meta.name || cleanSkillName(skillDir.split('/').pop() || parsed.repo);
    return finishGithubSkill(got.text, name, skillDir, parsed, tried);
  }
  // Repo URL — discover SKILL.md. Try raw candidates first (no API rate limit),
  // then the GitHub API contents listing.
  const repoName = cleanSkillName(parsed.repo);
  const branches = parsed.branch ? [parsed.branch] : ['main', 'master'];
  const base = parsed.treePath ? parsed.treePath.replace(/\/$/, '') + '/' : '';
  const candidates = [];
  for (const b of branches) {
    candidates.push({ branch: b, skillPath: base + 'SKILL.md' });
    if (!base) {
      candidates.push({ branch: b, skillPath: 'skills/' + repoName + '/SKILL.md' });
      candidates.push({ branch: b, skillPath: '.claude/skills/' + repoName + '/SKILL.md' });
      candidates.push({ branch: b, skillPath: 'src/' + repoName + '/SKILL.md' });
    }
  }
  for (const c of candidates) {
    const raw = 'https://raw.githubusercontent.com/' + parsed.owner + '/' + parsed.repo + '/' + c.branch + '/' + c.skillPath;
    const got = await fetchText(raw);
    if (got.ok) {
      const meta = parseSkillMeta(got.text);
      const skillDir = c.skillPath.split('/').slice(0, -1).join('/');
      const name = meta.name || cleanSkillName(skillDir.split('/').pop() || repoName);
      return finishGithubSkill(got.text, name, skillDir, parsed, tried, c.branch);
    }
    if (got.error !== 'not found') return { ok: false, error: got.error, tried: tried };
  }
  // Fallback: list the repo (or tree path) via the GitHub API and look for a
  // SKILL.md or a single skill directory.
  try {
    const apiUrl = 'https://api.github.com/repos/' + encodeURIComponent(parsed.owner) + '/' + encodeURIComponent(parsed.repo) + '/contents/' + encodeURIComponent(base).replace(/%2F/g, '/');
    const r = await ghFetch(apiUrl);
    if (r.status === 404) return { ok: false, error: 'Repo not found (or it is private — v1 cannot install private repos).', tried: tried };
    if (!r.ok) return { ok: false, error: 'GitHub API returned HTTP ' + r.status + '.', tried: tried };
    const items = await r.json();
    const list = Array.isArray(items) ? items : [];
    const skillFile = list.find(x => x && x.type === 'file' && x.name === 'SKILL.md');
    if (skillFile && skillFile.download_url) {
      const got = await fetchText(skillFile.download_url);
      if (got.ok) {
        const meta = parseSkillMeta(got.text);
        return finishGithubSkill(got.text, meta.name || repoName, base, parsed, tried, '');
      }
    }
    const dir = list.find(x => x && x.type === 'dir' && (x.name === 'skills' || x.name === repoName || x.name === '.claude'));
    if (dir) return { ok: false, error: 'No SKILL.md found at the repo root. Tried: ' + tried.slice(-4).join(', ') + '. Open the skill folder on GitHub and paste the direct SKILL.md link instead.', tried: tried };
    return { ok: false, error: 'No SKILL.md found in this repo. Tried: ' + tried.slice(-4).join(', ') + '.', tried: tried };
  } catch (e) {
    return { ok: false, error: 'Could not list the repo on GitHub.', tried: tried };
  }
}

async function finishGithubSkill(skillMd, name, skillDir, parsed, tried, branch) {
  const clean = cleanSkillName(name);
  if (!clean) return { ok: false, error: 'Could not work out a skill name from that URL.', tried: tried };
  const refs = extractSkillReferences(skillMd);
  const files = [{ path: 'SKILL.md', content: skillMd }];
  let total = Buffer.byteLength(skillMd, 'utf8');
  const skipped = [];
  const b = branch || parsed.branch || 'main';
  for (const ref of refs) {
    if (files.length >= MAX_SKILL_FILES) { skipped.push(ref + ' (skipped: file cap reached)'); break; }
    const raw = 'https://raw.githubusercontent.com/' + parsed.owner + '/' + parsed.repo + '/' + b + '/' + (skillDir ? skillDir + '/' : '') + ref;
    tried.push(raw);
    let r;
    try { r = await ghFetch(raw); } catch (e) { skipped.push(ref + ' (skipped: could not fetch)'); continue; }
    if (!r.ok) { skipped.push(ref + ' (skipped: HTTP ' + r.status + ')'); continue; }
    const text = await r.text();
    total += Buffer.byteLength(text, 'utf8');
    if (total > MAX_SKILL_TOTAL) { skipped.push(ref + ' (skipped: skill would exceed 1 MB)'); break; }
    files.push({ path: ref, content: text });
  }
  const filtered = filterSkillFiles(files);
  return {
    ok: true, name: clean, description: skillDescription(skillMd),
    files: filtered.files, skipped: filtered.skipped.concat(skipped),
    source: { type: 'github', url: parsed.url },
    tried: tried,
  };
}

// ---- User skill storage (survives app updates — lives in userData) ----
// Bundled skills ship in the app (redcat-app/skills). User-installed skills
// live in <userData>/skills so an app update never wipes them (the chats
// lesson from v1.0.8). The agent catalog merges both; user wins on a name
// clash. Enabled/disabled and "deleted bundled skill" state also live in
// userData, never in the app folder.
function userDataBase() {
  return process.env.REDCAT_USER_DATA || path.join(__dirname, 'user-data');
}
function userSkillsDir() { return path.join(userDataBase(), 'skills'); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }
function skillsMeta() { const v = readJson(path.join(userDataBase(), 'skills-meta.json'), {}); return (v && typeof v === 'object') ? v : {}; }
function saveSkillsMeta(m) { writeJson(path.join(userDataBase(), 'skills-meta.json'), m); }
function skillsDisabled() { const v = readJson(path.join(userDataBase(), 'skills-disabled.json'), []); return Array.isArray(v) ? v : []; }
function saveSkillsDisabled(list) { writeJson(path.join(userDataBase(), 'skills-disabled.json'), list); }
function skillsRemoved() { const v = readJson(path.join(userDataBase(), 'skills-removed.json'), []); return Array.isArray(v) ? v : []; }
function saveSkillsRemoved(list) { writeJson(path.join(userDataBase(), 'skills-removed.json'), list); }

function listSkillFiles(dir) {
  const out = [];
  const walk = (d, rel) => {
    if (out.length >= 200) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (out.length >= 200) break;
      const p = path.join(d, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { walk(p, r); continue; }
      if (!e.isFile()) continue;
      let st = null;
      try { st = fs.statSync(p); } catch (e2) { continue; }
      out.push({ path: r, size: st.size, mtime: st.mtime.toISOString() });
    }
  };
  walk(dir, '');
  return out;
}

function listSkills(bundledDir, userDir) {
  const meta = skillsMeta();
  const disabled = new Set(skillsDisabled());
  const removed = new Set(skillsRemoved());
  const byName = new Map();
  const readDir = (root, origin) => {
    if (!root || !fs.existsSync(root)) return;
    for (const d of fs.readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const dir = path.join(root, d.name);
      const mdPath = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(mdPath)) continue;
      let text = '';
      try { text = fs.readFileSync(mdPath, 'utf8'); } catch (e) { continue; }
      let mt = null;
      try { mt = fs.statSync(dir).mtime.toISOString(); } catch (e) {}
      const m = meta[d.name] || {};
      byName.set(d.name, {
        name: d.name, description: skillDescription(text), mtime: mt, files: listSkillFiles(dir),
        origin: origin, source: m.source || null, enabled: !disabled.has(d.name),
        hasSource: !!(m.source && m.source.url), installedAt: m.installedAt || null,
        scan: m.scan || null,
      });
    }
  };
  readDir(bundledDir, 'bundled');
  readDir(userDir, 'user');
  const out = [];
  for (const s of byName.values()) {
    if (s.origin === 'bundled' && removed.has(s.name)) continue;
    out.push(s);
  }
  return out;
}

function installSkillFiles(userDir, name, files, source, scan) {
  const clean = cleanSkillName(name);
  if (!clean) return { ok: false, error: 'Invalid skill name.' };
  const dir = path.join(userDir, clean);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const target = path.join(dir, String(f.path || ''));
      if (!target.startsWith(dir + path.sep)) return { ok: false, error: 'Unsafe file path: ' + f.path };
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, String(f.content || ''), 'utf8');
    }
  } catch (e) { return { ok: false, error: 'Could not write skill files.' }; }
  const meta = skillsMeta();
  meta[clean] = { source: source || null, installedAt: new Date().toISOString(), origin: 'user', scan: scan || null };
  saveSkillsMeta(meta);
  saveSkillsDisabled(skillsDisabled().filter(n => n !== clean));
  return { ok: true, name: clean };
}

function deleteSkill(userDir, bundledDir, name) {
  const clean = cleanSkillName(name);
  if (!clean) return { ok: false, error: 'Invalid skill name.' };
  const userPath = path.join(userDir, clean);
  if (fs.existsSync(userPath)) {
    try { fs.rmSync(userPath, { recursive: true, force: true }); } catch (e) { return { ok: false, error: 'Could not delete the skill folder.' }; }
    const meta = skillsMeta();
    delete meta[clean];
    saveSkillsMeta(meta);
    saveSkillsDisabled(skillsDisabled().filter(n => n !== clean));
    return { ok: true, removed: 'user' };
  }
  if (fs.existsSync(path.join(bundledDir, clean, 'SKILL.md'))) {
    const removed = skillsRemoved();
    if (removed.indexOf(clean) === -1) { removed.push(clean); saveSkillsRemoved(removed); }
    saveSkillsDisabled(skillsDisabled().filter(n => n !== clean));
    return { ok: true, removed: 'bundled' };
  }
  return { ok: false, error: 'No such skill: ' + clean };
}

function setSkillEnabled(name, enabled) {
  const clean = cleanSkillName(name);
  if (!clean) return { ok: false, error: 'Invalid skill name.' };
  const dis = skillsDisabled();
  const i = dis.indexOf(clean);
  if (enabled && i !== -1) { dis.splice(i, 1); saveSkillsDisabled(dis); }
  if (!enabled && i === -1) { dis.push(clean); saveSkillsDisabled(dis); }
  return { ok: true, name: clean, enabled: !!enabled };
}

function prepareFromText(text, fileName) {
  const t = String(text || '');
  if (!t.trim()) return { ok: false, error: 'Pasted skill text is empty.' };
  if (Buffer.byteLength(t, 'utf8') > MAX_SKILL_MD) return { ok: false, error: 'SKILL.md is larger than 100 KB.' };
  const meta = parseSkillMeta(t);
  const name = meta.name || cleanSkillName(String(fileName || '').replace(/\.md$/i, ''));
  if (!name) return { ok: false, error: 'Could not work out a skill name — add a "name:" line in the frontmatter.' };
  return { ok: true, name: name, description: skillDescription(t), files: [{ path: 'SKILL.md', content: t }], skipped: [], source: { type: 'paste', url: null } };
}

function prepareFromZip(base64) {
  let buf;
  try { buf = Buffer.from(String(base64 || ''), 'base64'); } catch (e) { return { ok: false, error: 'Could not read the uploaded zip.' }; }
  if (!buf.length) return { ok: false, error: 'The uploaded zip is empty.' };
  const unz = unzipBuffer(buf);
  if (!unz.ok) return { ok: false, error: unz.error };
  const md = unz.files.find(f => /(^|\/)SKILL\.md$/.test(f.path));
  if (!md) return { ok: false, error: 'No SKILL.md found in the zip.' };
  const prefix = md.path.split('/').slice(0, -1).join('/');
  const scoped = unz.files
    .filter(f => prefix ? f.path.startsWith(prefix + '/') : f.path.indexOf('/') === -1)
    .map(f => ({ path: prefix ? f.path.slice(prefix.length + 1) : f.path, content: f.content }));
  const filtered = filterSkillFiles(scoped);
  const skillMd = filtered.files.find(f => f.path === 'SKILL.md');
  if (!skillMd) return { ok: false, error: 'No SKILL.md found in the zip.' };
  const meta = parseSkillMeta(skillMd.content);
  const name = meta.name || cleanSkillName(prefix.split('/').pop() || '');
  if (!name) return { ok: false, error: 'Could not work out a skill name — add a "name:" line in the frontmatter.' };
  return { ok: true, name: name, description: skillDescription(skillMd.content), files: filtered.files, skipped: filtered.skipped, source: { type: 'upload', url: null } };
}

// Rewrite (or insert) the description: line in a SKILL.md so a user-edited
// description from the preview is what the catalog uses as the trigger.
// Never changes the meaning of the skill — only the description line.
function withDescription(skillMd, name, desc) {
  let text = String(skillMd || '');
  const clean = String(desc || '').trim();
  if (!clean) return text;
  const lines = text.split('\n');
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    if (/^description:\s*.*$/i.test(lines[i].trim())) { lines[i] = 'description: ' + clean; return lines.join('\n'); }
  }
  const fmEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  const nameIdx = lines.findIndex(l => /^name:\s*.*$/i.test(l.trim()));
  if (lines[0] && lines[0].trim() === '---' && fmEnd > 0) {
    const at = (nameIdx >= 0 && nameIdx < fmEnd) ? nameIdx + 1 : 1;
    lines.splice(at, 0, 'description: ' + clean);
    return lines.join('\n');
  }
  return '---\nname: ' + cleanSkillName(name) + '\ndescription: ' + clean + '\n---\n\n' + text;
}

// Turn a prepared skill into the preview payload: scan, conflict + catalog
// cap checks. The scan verdict is computed here (and re-computed on install).
function prepareResult(prep, bundledDir, userDir) {
  if (!prep || !prep.ok) return { ok: false, error: (prep && prep.error) || 'PREPARE_FAILED', tried: (prep && prep.tried) || [] };
  const name = cleanSkillName(prep.name);
  if (!name) return { ok: false, error: 'Could not work out a skill name.' };
  const files = (prep.files || []).filter(f => f && f.path);
  const total = files.reduce((a, f) => a + Buffer.byteLength(String(f.content || ''), 'utf8'), 0);
  if (total > MAX_SKILL_TOTAL) return { ok: false, error: 'Skill is larger than 1 MB.' };
  const scan = scanSkillFiles(files);
  const existing = listSkills(bundledDir, userDir);
  const conflict = existing.some(s => s.name === name);
  const skillCount = existing.length;
  return {
    ok: true, name: name,
    description: String(prep.description || '').trim(),
    descriptionMissing: !String(prep.description || '').trim(),
    files: files.map(f => ({ path: f.path, size: Buffer.byteLength(String(f.content || ''), 'utf8') })),
    fileContents: files,
    skipped: prep.skipped || [], scan: scan, conflict: conflict,
    skillCount: skillCount, warnCap: skillCount >= WARN_CATALOG_DIRS,
    overCap: skillCount >= MAX_CATALOG_DIRS && !conflict,
    source: prep.source || null, tried: prep.tried || [],
  };
}

// CHAT PATH (v1.0.12): the model cannot reproduce file contents reliably,
// so a prepared skill is stashed server-side under a short token. The model
// shows the preview from chatPreview (no full file contents in its context)
// and installs by token. Entries expire after 15 minutes; install consumes
// the token on success. The same installPrepared below is used by the HTTP
// /api/skills/install endpoint and by the chat skill_install tool — one code
// path, one scan, one approval rule.
const PREPARE_TTL_MS = 15 * 60 * 1000;
const pendingPrepares = new Map();
function stashPrepare(prep) {
  const token = 'prep-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  pendingPrepares.set(token, { prep: prep, at: Date.now() });
  return token;
}
function peekPrepare(token) {
  const entry = pendingPrepares.get(String(token || ''));
  if (!entry) return null;
  if (Date.now() - entry.at > PREPARE_TTL_MS) { pendingPrepares.delete(String(token)); return null; }
  return entry.prep;
}
function clearPrepare(token) { pendingPrepares.delete(String(token || '')); }
function chatPreview(prep, bundledDir, userDir) {
  const r = prepareResult(prep, bundledDir, userDir);
  if (!r.ok) return r;
  const token = stashPrepare({ name: r.name, description: r.description, files: r.fileContents, source: r.source });
  const md = (r.fileContents.find(f => f.path === 'SKILL.md') || {}).content || '';
  const out = Object.assign({}, r);
  delete out.fileContents;
  out.prepToken = token;
  out.skillMdPreview = String(md).slice(0, 2000);
  out.skillMdLength = String(md).length;
  return out;
}

// Shared install (HTTP form + chat tool). Re-scans exactly what will be
// installed, enforces BLOCK (unless an explicit override names the findings),
// name conflicts, and the 30-skill catalog cap.
function installPrepared(prep, opts, bundledDir, userDir) {
  opts = opts || {};
  const name = cleanSkillName(prep.name);
  const files = Array.isArray(prep.files) ? prep.files : [];
  const desc = String(opts.description || prep.description || '').trim();
  if (!name || !files.length) return { ok: false, error: 'Skill needs a name and files.' };
  if (!desc) return { ok: false, error: 'A description line is required — add one in the preview.' };
  if (!files.some(f => f && f.path === 'SKILL.md')) return { ok: false, error: 'SKILL.md is missing.' };
  const finalFiles = files.map(f => {
    if (!f || f.path !== 'SKILL.md') return f;
    return { path: f.path, content: withDescription(f.content, name, desc) };
  });
  const scan = scanSkillFiles(finalFiles);
  if (scan.verdict === 'BLOCK' && !(opts.override && opts.override.confirmed && Array.isArray(opts.override.findings))) {
    return { ok: false, error: 'SCAN_BLOCK', scan: scan };
  }
  const existing = listSkills(bundledDir, userDir);
  const conflict = existing.some(s => s.name === name);
  const isUpdate = !!opts.allowOverwrite;
  if (conflict && !isUpdate) return { ok: false, error: 'NAME_CONFLICT', message: 'A skill named ' + name + ' already exists. Rename it or delete the old one first.' };
  if (!isUpdate && existing.length >= MAX_CATALOG_DIRS) return { ok: false, error: 'CATALOG_FULL', message: 'The skill catalog is full (30 skills). Remove one first.' };
  const done = installSkillFiles(userDir, name, finalFiles, prep.source || null, { verdict: scan.verdict, findings: scan.findings, date: new Date().toISOString(), override: opts.override || null });
  if (!done.ok) return { ok: false, error: done.error || 'INSTALL_FAILED' };
  return { ok: true, name: name, scan: scan };
}

module.exports = {
  MAX_SKILL_MD: MAX_SKILL_MD, MAX_SKILL_TOTAL: MAX_SKILL_TOTAL, MAX_SKILL_FILES: MAX_SKILL_FILES,
  MAX_CATALOG_DIRS: MAX_CATALOG_DIRS, WARN_CATALOG_DIRS: WARN_CATALOG_DIRS, MAX_BODY: MAX_BODY,
  TEXT_EXTS: TEXT_EXTS, SKIP_DIRS: SKIP_DIRS, SKIP_EXTS: SKIP_EXTS,
  cleanSkillName: cleanSkillName, parseSkillMeta: parseSkillMeta, skillDescription: skillDescription,
  extractSkillReferences: extractSkillReferences, scanSkillFiles: scanSkillFiles,
  unzipBuffer: unzipBuffer, filterSkillFiles: filterSkillFiles,
  parseGithubUrl: parseGithubUrl, fetchGithubSkill: fetchGithubSkill,
  userDataBase: userDataBase, userSkillsDir: userSkillsDir,
  skillsMeta: skillsMeta, saveSkillsMeta: saveSkillsMeta,
  skillsDisabled: skillsDisabled, saveSkillsDisabled: saveSkillsDisabled,
  skillsRemoved: skillsRemoved, saveSkillsRemoved: saveSkillsRemoved,
  listSkills: listSkills, installSkillFiles: installSkillFiles,
  deleteSkill: deleteSkill, setSkillEnabled: setSkillEnabled,
  prepareFromText: prepareFromText, prepareFromZip: prepareFromZip,
  withDescription: withDescription, prepareResult: prepareResult,
  stashPrepare: stashPrepare, peekPrepare: peekPrepare, clearPrepare: clearPrepare,
  chatPreview: chatPreview, installPrepared: installPrepared,
};
