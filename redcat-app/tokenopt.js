// tokenopt.js — RedCat v1.0.15 token optimizations (Hermes patterns, adapted).
// Pure helpers, no I/O except reading SKILL.md index text passed in by the
// caller. No prompt wording is changed here. No API keys, no secrets.
//   1. Prompt caching structure — applyCacheControl(): Anthropic-style
//      cache_control breakpoints (system prompt + rolling last 3 messages,
//      Hermes "system_and_3") for Claude-family models only. Other providers
//      get their inputs back unchanged; DeepSeek benefits from the byte-stable
//      prefix produced by moving the timestamp to the end of the system
//      prompt in server.js (content identical, order changed).
//   2. Fast path / lazy router — classifyFastPath(): greetings and small-talk
//      only. Conservative by design: ANY doubt routes to the full agent.
//   3. Lazy skills — matchSkillsForTask(): keyword match on the skill index;
//      full SKILL.md loads only on a clear match. No match = index stays and
//      the model loads via skill_read as before (safe fallback).
//   4. History compaction — compactHistory(): deterministic, extractive.
//      Protects the first user message + last 10 messages in full, summarizes
//      the middle (facts / decisions / open tasks). Never touches disk.
//      On any failure it returns the full history unchanged.
//   5. MCP catalog compaction lives in inventory.js (compact index lines).
// Token counts here are ESTIMATES (chars / 4). The only real token counts
// are the provider's own usage fields, already captured in server.js.

const TOKENOPT_VERSION = '1.0.15';

function estimateTokens(text) {
  try { return Math.ceil(String(text || '').length / 4); } catch (e) { return 0; }
}

// ---------------------------------------------------------------------------
// 2. Fast path / lazy router (conservative — a misrouted task is a failure)
// ---------------------------------------------------------------------------

// Exact greetings / small-talk, after lower-casing, trimming, stripping a
// leading/trailing "redcat" and trailing punctuation. Anything not on this
// list is NOT fast-pathed by the exact match below.
const FAST_EXACT = new Set([
  'hello', 'hi', 'hey', 'hii', 'heyy', 'heyyy',
  'salam', 'salaam', 'assalam o alaikum', 'assalamu alaikum', 'assalamualaikum',
  'walaikum assalam', 'walaikum salam',
  'good morning', 'good afternoon', 'good evening', 'good night',
  'kya haal hai', 'kya haal he', 'kya haal hain', 'kya haal chaal hai',
  'aur sunao', 'kya ho raha hai',
  'how are you', 'how are u', 'how r u', "how's it going", 'hows it going',
  'whats up', "what's up", 'whatsup', 'sup',
  'thanks', 'thank you', 'thanks a lot', 'thank you so much', 'shukriya',
  'bye', 'goodbye', 'good bye',
  'ok', 'okay', 'theek hai', 'theek he', 'acha', 'acha theek hai',
  'great', 'nice', 'awesome', 'cool', 'wow', 'lol', 'haha', 'hehe',
  'good', 'fine', 'all good', 'i am fine', "i'm fine", "i'm good", 'im good',
  'take care', 'see you', 'welcome', 'no problem'
]);

// Words that always mean "this is a real task, not small-talk". Checked
// against the normalized text with word boundaries.
const TASK_WORD_RE = /\b(build|make|create|write|explain|search|find|open|run|check|fix|show|code|website|site|file|folder|image|photo|video|audio|download|upload|install|deploy|send|post|schedule|remind|buy|price|order|email|password|api|key|model|skill|mcp|connect|discord|github|test|debug|error|bug|token|help|please|can you|could you|tell me|what is|what are|what's|why|how do|how can|how to|how does|when|where|which|who)\b/;

// Code / URL / path / number signals — never small-talk.
const NON_CHAT_RE = /(https?:|www\.|\.(com|net|io|org|pk)\b|uploads\/|[{}\[\]<>;\\=]|```|`[^`]+`|\b\d{3,}\b)/;

function classifyFastPath(text, opts) {
  const o = opts || {};
  const raw = String(text || '');
  if (!raw.trim()) return { route: 'full', reason: 'empty message' };
  if (o.hasAttachments) return { route: 'full', reason: 'message has attachments' };
  if (o.hasPlan) return { route: 'full', reason: 'a plan is active' };
  // If the assistant's last turn asked a question, a bare "ok" / "yes" style
  // reply may be an answer to it — the full agent must handle that.
  if (o.lastAssistantEndsWithQuestion) return { route: 'full', reason: 'assistant asked a question last turn' };
  let t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  // Strip a leading/trailing "redcat" address ("redcat, hello" / "hello redcat").
  t = t.replace(/^redcat[,\s]+/, '').replace(/[,\s]+redcat$/, '').trim();
  // Emoji-only acknowledgement (e.g. a wave) is small-talk.
  if (/^[\p{Emoji}\s.,!?'’]+$/u.test(t) && t.replace(/[\s.,!?'’]/g, '').length > 0 && raw.trim().length <= 10) {
    return { route: 'fast', reason: 'emoji-only acknowledgement' };
  }
  t = t.replace(/[.!?…]+$/g, '').replace(/,+$/g, '').trim();
  if (!t) return { route: 'full', reason: 'no words after cleanup' };
  const words = t.split(' ').filter(Boolean);
  if (words.length > 6) return { route: 'full', reason: 'more than 6 words' };
  if (NON_CHAT_RE.test(t)) return { route: 'full', reason: 'contains URL, code, path, or number' };
  if (TASK_WORD_RE.test(t)) return { route: 'full', reason: 'contains a task word' };
  if (FAST_EXACT.has(t)) return { route: 'fast', reason: 'exact greeting/small-talk match: "' + t + '"' };
  return { route: 'full', reason: 'not a known greeting/small-talk phrase' };
}

// ---------------------------------------------------------------------------
// 3. Lazy skills — keyword match on the compact index
// ---------------------------------------------------------------------------

const SKILL_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'into', 'that',
  'this', 'when', 'how', 'what', 'please', 'can', 'you', 'your', 'redcat',
  'use', 'using', 'used', 'your', 'their', 'there', 'here', 'about', 'into'
]);

function parseSkillIndex(skillIndex) {
  const out = [];
  String(skillIndex || '').split('\n').forEach((line) => {
    const m = /^-\s+([A-Za-z0-9-]+):\s*(.*)$/.exec(line.trim());
    if (m) out.push({ name: m[1], description: m[2] || '' });
  });
  return out;
}

function stemWord(w) {
  // Light singular stemming so "websites" in a description matches the
  // user's "website" (and vice versa). Applied to both sides, so it can
  // never match a word that is not really there.
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function skillWords(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !SKILL_STOPWORDS.has(w)).map(stemWord);
}

// Score: name-phrase hit +3; each name token present +2; each distinctive
// description word present +1 (capped at +3). A skill matches only with
// score >= 4 AND at least one name token hit — one shared word is never
// enough. Returns at most 2 skills, best score first.
function matchSkillsForTask(text, skillIndex) {
  try {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const lower = ' ' + raw.toLowerCase().replace(/\s+/g, ' ') + ' ';
    // "/skillname ..." always loads that skill (mirrors resolveSlashSkill).
    const slash = /^\/([A-Za-z0-9-]+)\b/.exec(raw.trim());
    const skills = parseSkillIndex(skillIndex);
    if (slash) {
      const hit = skills.filter((s) => s.name === slash[1]);
      if (hit.length) return [{ name: hit[0].name, score: 99 }];
    }
    const textWords = new Set(skillWords(raw));
    if (!textWords.size) return [];
    const scored = [];
    for (const s of skills) {
      const nameTokens = s.name.split(/[-_]/).filter((w) => w.length >= 3).map(stemWord);
      let score = 0;
      let nameHits = 0;
      if (lower.indexOf(' ' + s.name.replace(/[-_]/g, ' ') + ' ') !== -1) score += 3;
      for (const tok of nameTokens) {
        if (textWords.has(tok)) { score += 2; nameHits += 1; }
      }
      if (!nameHits) continue;
      const descWords = new Set(skillWords(s.description));
      let descHits = 0;
      descWords.forEach((w) => { if (textWords.has(w)) descHits += 1; });
      score += Math.min(3, descHits);
      if (score >= 4) scored.push({ name: s.name, score: score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 2);
  } catch (e) { return []; }
}

// ---------------------------------------------------------------------------
// 4. History compaction — deterministic, extractive, disk never touched
// ---------------------------------------------------------------------------

const SUMMARY_KEYWORDS = /decision|decided|fact|remember|todo|task|next step|plan|agreed|will do|open|pending|important|note:|must|should|deadline|price|rs\.?\s?\d/i;
const COMPACT_MAX_TOKENS = 8000; // estimated tokens; Hermes tail is ~20K, RedCat keeps the tail small
const COMPACT_TAIL_KEEP = 10;    // last 10 messages stay in full
const COMPACT_SUMMARY_MAX_CHARS = 1500;

function compactHistory(messages, opts) {
  const original = Array.isArray(messages) ? messages : [];
  const fail = (reason) => ({ messages: original, compacted: false, reason: reason || 'fallback to full history' });
  try {
    const o = opts || {};
    const maxTokens = o.maxTokens || COMPACT_MAX_TOKENS;
    const tailKeep = o.tailKeep || COMPACT_TAIL_KEEP;
    if (original.length <= 12) return Object.assign(fail('history short, no compaction needed'), { compacted: false });
    const totalTokens = original.reduce((n, m) => n + estimateTokens(m && m.content ? m.content : ''), 0);
    if (totalTokens <= maxTokens) return Object.assign(fail('history under token budget, no compaction needed'), { compacted: false });
    const firstUserIdx = original.findIndex((m) => m && m.role === 'user');
    if (firstUserIdx === -1) return fail('no user message to protect');
    const head = original[firstUserIdx];
    const tail = original.slice(-tailKeep);
    const tailStart = original.length - tailKeep;
    const middle = original.filter((m, i) => i !== firstUserIdx && i < tailStart);
    if (!middle.length) return fail('nothing between head and tail to compact');
    // Extractive summary: keyword lines first, then the first line of each
    // middle user message (the request itself), capped and de-duplicated.
    const lines = [];
    const seen = new Set();
    const pushLine = (prefix, line) => {
      const clean = String(line || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      lines.push(prefix + clean);
    };
    middle.forEach((m) => {
      if (!m || typeof m.content !== 'string') return;
      const who = m.role === 'user' ? 'User: ' : 'Assistant: ';
      m.content.split('\n').forEach((line) => {
        if (SUMMARY_KEYWORDS.test(line)) pushLine(who, line);
      });
    });
    middle.forEach((m) => {
      if (!m || m.role !== 'user' || typeof m.content !== 'string') return;
      const first = m.content.split('\n').filter((l) => l.trim())[0];
      if (first) pushLine('User asked: ', first);
    });
    let summary = lines.join('\n').slice(0, COMPACT_SUMMARY_MAX_CHARS);
    if (!summary) summary = '(Older messages contained no extractable facts, decisions, or open tasks.)';
    const userCount = middle.filter((m) => m && m.role === 'user').length;
    const asstCount = middle.length - userCount;
    const summaryMsg = '[Earlier conversation summary — context only, already discussed, not a new request. '
      + 'Facts, decisions, and open tasks preserved. Compressed ' + middle.length + ' older messages ('
      + userCount + ' user, ' + asstCount + ' assistant) into this summary; the full history is still saved on disk.]\n' + summary;
    const compacted = [head, { role: 'user', content: summaryMsg }].concat(tail);
    const compactedTokens = compacted.reduce((n, m) => n + estimateTokens(m && m.content ? m.content : ''), 0);
    return {
      messages: compacted,
      compacted: true,
      reason: 'history over budget',
      originalTokens: totalTokens,
      compactedTokens: compactedTokens,
      droppedCount: middle.length,
      summaryChars: summary.length
    };
  } catch (e) {
    return fail('compaction error: ' + (e && e.message ? String(e.message).slice(0, 120) : 'error'));
  }
}

// ---------------------------------------------------------------------------
// 1. Prompt caching — Anthropic-style cache_control breakpoints
// ---------------------------------------------------------------------------

function isClaudeFamily(provider, model) {
  if (provider === 'claude') return true;
  return /claude/i.test(String(model || ''));
}

// Hermes "system_and_3": breakpoint 1 = system prompt, breakpoints 2-4 =
// the rolling last 3 non-system messages. Only Claude-family models get
// cache_control (native Anthropic API or OpenRouter). Every other provider
// gets its inputs back byte-for-byte unchanged.
function applyCacheControl(provider, model, systemText, messages) {
  try {
    if (!isClaudeFamily(provider, model)) return { system: systemText, messages: messages };
    const system = (typeof systemText === 'string' && systemText)
      ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
      : systemText;
    const out = (Array.isArray(messages) ? messages : []).map((m) => (m && typeof m === 'object' ? Object.assign({}, m) : m));
    let marked = 0;
    for (let i = out.length - 1; i >= 0 && marked < 3; i--) {
      const m = out[i];
      if (!m || m.role === 'system') continue;
      if (typeof m.content === 'string' && m.content) {
        m.content = [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }];
        marked += 1;
      }
    }
    return { system: system, messages: out };
  } catch (e) {
    return { system: systemText, messages: messages };
  }
}

module.exports = {
  TOKENOPT_VERSION: TOKENOPT_VERSION,
  estimateTokens: estimateTokens,
  classifyFastPath: classifyFastPath,
  matchSkillsForTask: matchSkillsForTask,
  parseSkillIndex: parseSkillIndex,
  compactHistory: compactHistory,
  applyCacheControl: applyCacheControl,
  isClaudeFamily: isClaudeFamily,
  COMPACT_MAX_TOKENS: COMPACT_MAX_TOKENS,
  COMPACT_TAIL_KEEP: COMPACT_TAIL_KEEP
};
