'use strict';
// vision-verify.js — RedCat VISION VERIFY loop + 3-STRIKE rule + VIDEO FRAMES
// (ADDITIVE module).
// Wired into server.js with the ADOPT/INVENTORY pattern: a require + one hook
// line in agentSystemText (SYSTEM_BLOCK below), dispatch blocks for the
// vision_verify and video_frames tools, and strike hooks on terminal_exec
// error paths. The base system-prompt text is untouched.
//
// CAPS (documented, all enforced in code):
//  - WEBSITES (vision_verify): max 4 shots — desktop + 400px-mobile, at TOP and
//    BOTTOM scroll positions each. The 4-cap is vision.js MAX_IMAGES: the whole
//    website shot set must fit one provider-friendly image batch. If a page
//    does not scroll, only the top shot is taken (no duplicate image). Shots
//    are viewport JPEGs (quality 80); providers resize to about 800x800.
//  - IMAGES (user-attached, pre-existing vision.js path, verified here):
//    max 4 per chat message (vision.js MAX_IMAGES, validated at intake).
//    They attach to vision-capable models as native image parts for the run's
//    lifetime; text-only models get filenames + the "pixels cannot be seen"
//    note instead. Memory-only (see below).
//  - VIDEOS (video_frames): 1 frame/sec, max 4 frames. Videos up to 4s give
//    one frame per second; longer videos get 4 frames spread evenly across
//    the duration (so the model sees the whole arc, not just the opening).
//    Frames are scaled to 768px wide, JPEG quality 80, and carry timestamps.
//    The 4-cap matches vision.js MAX_IMAGES so one video batch always passes
//    validation. (Raising MAX_IMAGES is a future option, not done here.)
//
// Safety / memory rules (same as vision.js):
//  - Screenshots and video frames live ONLY in the server visionStore
//    (memory). They are attached to exactly one model call, then consumed
//    (removed by name prefix: verify-* and video-frame-*).
//    They are NEVER written to run files, logs, chats, or disk. Video frames
//    are extracted via ffmpeg image2pipe (stdout buffers, split on JPEG
//    markers) — no temp frame files are ever created.
//  - Strike state on the run holds error STRINGS only (no images, no keys).
//  - vision_verify URLs are restricted to localhost:3000 site URLs;
//    video_frames paths are restricted to files inside the project folder.
//  - Both tools are read-only (screenshots of a local site, frame sampling
//    of a local file), so no approval is needed, like browser_read.

var vision = null;
function visionLib() {
  if (!vision) vision = require('./vision.js');
  return vision;
}

var SYSTEM_BLOCK = 'VISION VERIFY (after you build a site, use it once): {"tool": "vision_verify", "args": {"url": "http://localhost:3000/sites/<name>/"}} — the harness captures desktop + 400px-mobile screenshots at top and bottom scroll positions (max 4 shots). Vision models receive them as image parts: list only the layout, overflow, contrast, and readability issues you can actually see, then fix them in ONE pass and deliver. Text-only models receive scripted overflow + console checks instead (you cannot see pixels). VIDEO FRAMES: {"tool": "video_frames", "args": {"path": "uploads/<file>.mp4"}} — the harness samples up to 4 frames (1 fps, evenly spaced for longer videos) and sends them as image parts with timestamps. After a successful verify, a second vision_verify call is refused. 3-STRIKE RULE: if the same error appears 3 times in the verify/fix loop, stop that approach and try ONE different approach; if that also fails, report the exact error and stop.';

function isLocalSiteUrl(url) {
  var u = String(url || '').trim();
  if (/\s/.test(u)) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1):3000\//i.test(u);
}

function normalizeStrikeError(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// Pure 3-strike state machine. state = { strikes: {err: count}, tripped: err, secondChance: bool }.
// Returns { action: 'none'|'trip'|'fatal', error, count, state }.
//  - count < 3: 'none' (keep going).
//  - count === 3: 'trip' (abandon this approach, ONE different approach allowed).
//  - any error after a trip: 'fatal' (report the exact NEW error, end the run).
// Different errors are counted separately; empty errors never strike.
function noteStrike(state, rawError) {
  var st = state || {};
  var strikes = (st.strikes && typeof st.strikes === 'object') ? st.strikes : {};
  var err = normalizeStrikeError(rawError);
  var base = { strikes: strikes, tripped: st.tripped || '', secondChance: !!st.secondChance };
  if (!err) return { action: 'none', error: '', count: 0, state: base };
  if (st.tripped) {
    return { action: 'fatal', error: err, count: strikes[err] || 0, state: { strikes: strikes, tripped: st.tripped, secondChance: true } };
  }
  var count = (strikes[err] || 0) + 1;
  strikes[err] = count;
  if (count >= 3) {
    return { action: 'trip', error: err, count: count, state: { strikes: strikes, tripped: err, secondChance: false } };
  }
  return { action: 'none', error: err, count: count, state: base };
}

// Run-level glue: reads/writes strike state on the run object, logs the exact
// error to the run log, and pushes the trip note into the model loop.
// logEvent(type, data) and pushNote(text) are supplied by the caller (server.js
// binds them to appendLogEvent + run.history; tests pass recording fakes).
function applyStrike(run, rawError, logEvent, pushNote) {
  var state = { strikes: (run.visionStrikes && typeof run.visionStrikes === 'object') ? run.visionStrikes : {}, tripped: run.strikeTripped || '', secondChance: !!run.strikeSecondChance };
  var r = noteStrike(state, rawError);
  run.visionStrikes = r.state.strikes;
  run.strikeTripped = r.state.tripped;
  run.strikeSecondChance = r.state.secondChance;
  try { logEvent('vision/strike', { step: run.step || 0, error: r.error, count: r.count, action: r.action }); } catch (e) {}
  if (r.action === 'trip') {
    try { pushNote('STOP — the same error has appeared 3 times in this verify/fix loop: "' + r.error + '". Abandon this approach. Try ONE different approach. If that approach also fails, the run ends and the exact error is reported to the user.'); } catch (e) {}
  }
  return r;
}

function formatChecks(checks) {
  if (!checks) return 'no scripted checks ran.';
  var parts = [];
  ['desktop', 'mobile'].forEach(function (k) {
    var c = checks[k] || { overflow: [], consoleErrors: [] };
    parts.push(k + ': horizontal overflow elements: ' + (c.overflow.length ? c.overflow.join('; ') : 'none') + '; console errors: ' + (c.consoleErrors.length ? c.consoleErrors.join('; ') : 'none'));
  });
  return parts.join(' | ') + ' Note: you cannot see pixels — these scripted checks are the only visual evidence.';
}

// Capture desktop + 400px-mobile screenshots (JPEG, quality 80, memory-only).
// opts.checks=true also runs scripted overflow + console-error checks per viewport.
// Returns { ok, shots: [{name, dataUrl}], checks, measured: {desktop:{innerWidth}, mobile:{innerWidth}} }
// or { ok:false, error }. Never writes anything to disk.
// Capture desktop + 400px-mobile screenshots at TOP and BOTTOM scroll
// positions (max 4 shots; a viewport that does not scroll yields only its top
// shot). opts.checks=true also runs scripted overflow + console-error checks
// once per viewport (document-wide, scroll-independent).
// Returns { ok, shots: [{name, dataUrl}], checks, measured } or { ok:false, error }.
// measured = { desktop: { innerWidth, positions: [{name, scrollY}] }, mobile: {...} }.
// Never writes anything to disk; shots are memory-only data URLs.
async function captureVerifyShots(url, opts) {
  var wantChecks = !!(opts && opts.checks);
  var browser = null;
  try {
    var chromium = require('playwright').chromium;
    browser = await chromium.launch({ headless: true });
    var viewports = [
      { key: 'desktop', name: 'verify-desktop', width: 1280, height: 720 },
      { key: 'mobile', name: 'verify-mobile', width: 400, height: 800 }
    ];
    var shots = [];
    var checks = wantChecks ? {} : null;
    var measured = {};
    for (var i = 0; i < viewports.length; i++) {
      var vp = viewports[i];
      var page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      try {
        var consoleErrors = [];
        page.on('console', function (m) { try { if (m.type() === 'error' && consoleErrors.length < 5) consoleErrors.push(String(m.text()).slice(0, 200)); } catch (e) {} });
        page.on('pageerror', function (e) { try { if (consoleErrors.length < 5) consoleErrors.push('PAGEERROR: ' + String((e && e.message) || e).slice(0, 200)); } catch (e2) {} });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForTimeout(1000); } catch (e) {}
        var dims = await page.evaluate(function () {
          var de = document.documentElement;
          var maxScroll = Math.max(0, (de ? de.scrollHeight : 0) - window.innerHeight);
          return { innerWidth: window.innerWidth, maxScroll: maxScroll };
        }).catch(function () { return { innerWidth: 0, maxScroll: 0 }; });
        if (wantChecks) {
          var overflow = await page.evaluate(function () {
            var out = [];
            var docW = document.documentElement ? document.documentElement.clientWidth : window.innerWidth;
            var els = document.querySelectorAll('body *');
            for (var j = 0; j < els.length && out.length < 10; j++) {
              try {
                var el = els[j];
                if (el.scrollWidth > docW + 1) {
                  var cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).join('.') : '';
                  out.push((el.tagName || '').toLowerCase() + (el.id ? '#' + el.id : '') + cls + ' (scrollWidth ' + el.scrollWidth + ' > viewport ' + docW + ')');
                }
              } catch (e) {}
            }
            return out;
          }).catch(function () { return []; });
          checks[vp.key] = { overflow: overflow, consoleErrors: consoleErrors };
        }
        var positions = [{ suffix: 'top', y: 0 }];
        if (dims.maxScroll > 0) positions.push({ suffix: 'bottom', y: dims.maxScroll });
        measured[vp.key] = { innerWidth: dims.innerWidth, positions: [] };
        for (var p = 0; p < positions.length; p++) {
          var pos = positions[p];
          try { await page.evaluate(function (yy) { window.scrollTo(0, yy); }, pos.y); } catch (e) {}
          try { await page.waitForTimeout(500); } catch (e) {}
          var scrollY = await page.evaluate(function () { return window.scrollY; }).catch(function () { return pos.y; });
          var buf = await page.screenshot({ type: 'jpeg', quality: 80 });
          var shotName = vp.name + '-' + pos.suffix;
          shots.push({ name: shotName, dataUrl: 'data:image/jpeg;base64,' + buf.toString('base64') });
          measured[vp.key].positions.push({ name: shotName, scrollY: scrollY });
        }
      } finally { try { await page.close(); } catch (e) {} }
    }
    return { ok: true, shots: shots, checks: checks, measured: measured };
  } catch (e) {
    return { ok: false, error: 'Screenshot capture failed: ' + String((e && e.message) || e).slice(0, 300) };
  } finally { try { if (browser) await browser.close(); } catch (e) {} }
}

// vision_verify tool handler (called from the server.js dispatch block).
// State machine (all flags on the run object; images only in visionStore):
//  - run.visionVerifyPhase: set on the first valid verify call. From then on,
//    terminal_exec errors in this run feed the strike machine.
//  - run.visionVerifyUsed: set ONLY on a successful verify (shots attached, or
//    scripted checks delivered). After that, further calls are refused: the
//    model's findings feed exactly ONE fix pass.
//  - run.strikeTripped: set when one error hits 3 strikes. From then on,
//    vision_verify is closed (try something else, not the same call again);
//    the next terminal_exec error ends the run reporting the exact error.
// ctx: { visionStore, pushToolResult, onProgress, captureFn, isVisionModel,
//        validateImages, applyStrike }.
// Returns { action: 'continue' } or { action: 'fatal', error } (strike fatal:
// the caller ends the run reporting the exact error).
async function handleVisionVerify(run, args, ctx) {
  var url = String((args && args.url) || '').trim();
  if (run.visionVerifyUsed) {
    ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify failed: vision_verify was already used successfully once in this run. Use the findings from the first verify to fix, then deliver.', false);
    return { action: 'continue' };
  }
  if (run.strikeTripped) {
    ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify failed: vision_verify is closed for this run because the same error appeared 3 times. Try a different approach instead of calling vision_verify again.', false);
    return { action: 'continue' };
  }
  if (!isLocalSiteUrl(url)) {
    ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify failed: url must be a localhost:3000 site URL, for example http://localhost:3000/sites/<name>/ .', false);
    return { action: 'continue' };
  }
  run.visionVerifyPhase = true;
  var visionCapable = false;
  try { visionCapable = !!ctx.isVisionModel(run.provider, run.model); } catch (e) { visionCapable = false; }
  var cap = null;
  try { cap = await ctx.captureFn(url, { checks: !visionCapable }); } catch (e) { cap = { ok: false, error: String((e && e.message) || e).slice(0, 300) }; }
  if (!cap || !cap.ok) {
    var capErr = (cap && cap.error) || 'Screenshot capture failed.';
    ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify failed: ' + capErr, false);
    var sk = null;
    try { sk = ctx.applyStrike(run, capErr); } catch (e) { sk = null; }
    if (sk && sk.action === 'fatal') return { action: 'fatal', error: sk.error };
    return { action: 'continue' };
  }
  if (visionCapable) {
    var v = null;
    try { v = ctx.validateImages(cap.shots); } catch (e) { v = { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
    if (!v || !v.ok) {
      var imgErr = 'invalid screenshot image: ' + ((v && v.error) || 'unknown');
      ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify failed: ' + imgErr, false);
      var skImg = null;
      try { skImg = ctx.applyStrike(run, imgErr); } catch (e) { skImg = null; }
      if (skImg && skImg.action === 'fatal') return { action: 'fatal', error: skImg.error };
      return { action: 'continue' };
    }
    if (!Array.isArray(ctx.visionStore[run.id])) ctx.visionStore[run.id] = [];
    for (var s = 0; s < v.images.length; s++) ctx.visionStore[run.id].push({ name: v.images[s].name, dataUrl: v.images[s].dataUrl });
    run.visionVerifyShots = v.images.length;
    run.visionVerifyUsed = true;
    ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify: desktop + 400px-mobile screenshots of ' + url + ' are attached as image parts to this message. Look at them and list only the layout, overflow, contrast, and readability issues you can actually see (do not invent issues you cannot see). Then fix those issues in ONE pass and deliver. Do not call vision_verify again.', true);
  } else {
    run.visionVerifyUsed = true;
    ctx.pushToolResult(run, 'vision_verify', args, 'Tool result for vision_verify (scripted checks only — you cannot see pixels): ' + formatChecks(cap.checks) + ' Fix what the checks found in ONE pass, then deliver. Do not call vision_verify again.', true);
  }
  if (ctx.onProgress) { try { ctx.onProgress('vision_verify', args, run.lastThought || ''); } catch (e) {} }
  return { action: 'continue' };
}

// Remove verify shots and video frames from the memory store by name prefix
// (called after the model call they were attached to, so they are sent
// exactly once). User-attached images (any other name) are never touched.
function consumeVerifyShots(run, visionStore) {
  try {
    var store = visionStore ? visionStore[run.id] : null;
    if (!Array.isArray(store)) return;
    for (var i = store.length - 1; i >= 0; i--) {
      var nm = store[i] && store[i].name;
      if (typeof nm === 'string' && (nm.indexOf('verify-') === 0 || nm.indexOf('video-frame-') === 0)) store.splice(i, 1);
    }
    run.visionVerifyShots = 0;
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// VIDEO FRAMES — sampled frames via ffmpeg image2pipe (memory-only).
// ---------------------------------------------------------------------------

var MAX_VIDEO_FRAMES = 4;
var MAX_VIDEO_BYTES = 500 * 1024 * 1024;
var VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'];

// Split concatenated JPEG buffers (ffmpeg image2pipe output) on SOI/EOI markers.
// Pure function: no disk, no processes. Returns Buffer[] (possibly empty).
function splitJpegs(buf) {
  var out = [];
  if (!buf || !buf.length) return out;
  var start = -1;
  for (var i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && start === -1) start = i;
    if (buf[i] === 0xFF && buf[i + 1] === 0xD9 && start !== -1) {
      out.push(buf.slice(start, i + 2));
      start = -1;
    }
  }
  return out;
}

// Sampling rule (documented cap): 1 frame/sec, max 4 frames.
//  - duration unknown/<=0: 1 frame at 0s.
//  - duration <= 4s: 1 fps, count = min(4, floor(duration) + 1).
//  - duration > 4s: 4 frames spread evenly (fps = 4 / duration).
// Timestamps are seconds rounded to 1 decimal. Pure function.
function videoSampling(durationSec) {
  var d = Number(durationSec);
  if (!d || d <= 0) return { fps: 1, count: 1, timestamps: [0] };
  if (d <= 4) {
    var c = Math.min(MAX_VIDEO_FRAMES, Math.floor(d) + 1);
    var ts = [];
    for (var i = 0; i < c; i++) ts.push(i);
    return { fps: 1, count: c, timestamps: ts };
  }
  var fps = MAX_VIDEO_FRAMES / d;
  var ts2 = [];
  for (var k = 0; k < MAX_VIDEO_FRAMES; k++) ts2.push(Math.round((k / fps) * 10) / 10);
  return { fps: fps, count: MAX_VIDEO_FRAMES, timestamps: ts2 };
}

// Default command runner: execFile (no shell), stdout as Buffer.
// encoding:'buffer' is REQUIRED: JPEG bytes must never pass through UTF-8
// decoding (it corrupts SOI/EOI markers and breaks splitJpegs).
// Returns { ok, stdout, stderr, error }. Overridable in tests via deps.
function defaultRunCmd(cmd, args, opts) {
  return new Promise(function (resolve) {
    var cp = null;
    try { cp = require('child_process'); } catch (e) { resolve({ ok: false, stdout: null, stderr: '', error: 'child_process unavailable' }); return; }
    cp.execFile(cmd, args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: (opts && opts.timeoutMs) || 120000 }, function (err, stdout, stderr) {
      if (err) resolve({ ok: false, stdout: stdout || null, stderr: String(stderr || ''), error: String((err && err.message) || err).slice(0, 300) });
      else resolve({ ok: true, stdout: stdout, stderr: String(stderr || ''), error: '' });
    });
  });
}

// Probe video duration in seconds with ffprobe (null when unknowable).
async function probeDuration(videoPath, runCmd) {
  try {
    var r = await runCmd('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath], { timeoutMs: 30000 });
    if (!r.ok) return null;
    var txt = Buffer.isBuffer(r.stdout) ? r.stdout.toString('utf8') : String(r.stdout || '');
    var v = parseFloat(txt.trim());
    return (isFinite(v) && v > 0) ? v : null;
  } catch (e) { return null; }
}

// Resolve + validate a video path. Relative paths resolve under projectDir;
// absolute paths must stay inside projectDir. Extension + size enforced.
// Returns { ok, path } or { ok:false, error }. Pure fs checks, no execution.
function resolveVideoPath(rawPath, projectDir) {
  try {
    var fs = require('fs');
    var path = require('path');
    var raw = String(rawPath || '').trim();
    if (!raw) return { ok: false, error: 'video path is empty.' };
    var full = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectDir, raw);
    var root = path.resolve(projectDir);
    var inside = process.platform === 'win32'
      ? full.toLowerCase().indexOf(root.toLowerCase() + path.sep) === 0 || full.toLowerCase() === root.toLowerCase()
      : (full.indexOf(root + path.sep) === 0 || full === root);
    if (!inside) return { ok: false, error: 'video path must stay inside the project folder.' };
    var ext = path.extname(full).toLowerCase();
    if (VIDEO_EXTS.indexOf(ext) === -1) return { ok: false, error: 'unsupported video extension "' + ext + '". Use: ' + VIDEO_EXTS.join(', ') + '.' };
    var st = null;
    try { st = fs.statSync(full); } catch (e) { return { ok: false, error: 'video file not found: ' + raw.slice(0, 200) }; }
    if (!st.isFile()) return { ok: false, error: 'video path is not a file.' };
    if (st.size > MAX_VIDEO_BYTES) return { ok: false, error: 'video file is too large (max 500 MB).' };
    return { ok: true, path: full };
  } catch (e) { return { ok: false, error: 'video path check failed: ' + String((e && e.message) || e).slice(0, 200) }; }
}

// Extract sampled frames (memory-only, no temp files).
// deps: { runCmd, ffmpeg, ffprobe } — ffmpeg/ffprobe default to PATH names.
// Returns { ok, frames: [{name, dataUrl, timestamp}], duration, fps, timestamps }
// or { ok:false, error }.
async function extractVideoFrames(videoPath, deps) {
  var runCmd = (deps && deps.runCmd) || defaultRunCmd;
  var ffmpeg = (deps && deps.ffmpeg) || 'ffmpeg';
  var ffprobe = (deps && deps.ffprobe) || 'ffprobe';
  try {
    var duration = await probeDuration(videoPath, function (cmd, args, opts) {
      return runCmd(cmd === 'ffprobe' ? ffprobe : cmd, args, opts);
    });
    var samp = videoSampling(duration);
    var vf = 'fps=' + samp.fps + ',scale=768:-1';
    var r = await runCmd(ffmpeg, ['-v', 'error', '-i', videoPath, '-vf', vf, '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], { timeoutMs: 120000 });
    if (!r.ok) {
      var msg = String(r.error || '').slice(0, 300);
      if (/ENOENT/i.test(msg)) return { ok: false, error: 'ffmpeg not found on PATH. Install ffmpeg or put it on PATH, then retry.' };
      return { ok: false, error: 'ffmpeg frame extraction failed: ' + msg };
    }
    var bufs = splitJpegs(Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(String(r.stdout || ''), 'binary'));
    if (!bufs.length) return { ok: false, error: 'ffmpeg produced no frames for this video.' };
    var frames = [];
    var n = Math.min(bufs.length, samp.count, MAX_VIDEO_FRAMES);
    for (var i = 0; i < n; i++) {
      var ts = samp.timestamps[i] !== undefined ? samp.timestamps[i] : 0;
      frames.push({ name: 'video-frame-' + ts + 's', dataUrl: 'data:image/jpeg;base64,' + bufs[i].toString('base64'), timestamp: ts });
    }
    return { ok: true, frames: frames, duration: duration, fps: samp.fps, timestamps: frames.map(function (f) { return f.timestamp; }) };
  } catch (e) {
    return { ok: false, error: 'video frame extraction failed: ' + String((e && e.message) || e).slice(0, 300) };
  }
}

// video_frames tool handler (called from the server.js dispatch block).
// Unlike vision_verify: no used-once rule (different videos may be sampled in
// one run) and no strike phase (a failed extraction is an error result, not a
// verify-loop error; maxSteps bounds retries). Frames attach to the NEXT model
// call only, then consumeVerifyShots removes them by name prefix.
// ctx: { visionStore, pushToolResult, onProgress, isVisionModel, validateImages,
//        extractFn, projectDir }.
// Returns { action: 'continue' } always (no fatal path for this tool).
async function handleVideoFrames(run, args, ctx) {
  var rawPath = String((args && args.path) || '').trim();
  var resolved = resolveVideoPath(rawPath, ctx.projectDir);
  if (!resolved.ok) {
    ctx.pushToolResult(run, 'video_frames', args, 'Tool result for video_frames failed: ' + resolved.error, false);
    return { action: 'continue' };
  }
  var ext = null;
  try { ext = await ctx.extractFn(resolved.path); } catch (e) { ext = { ok: false, error: String((e && e.message) || e).slice(0, 300) }; }
  if (!ext || !ext.ok) {
    ctx.pushToolResult(run, 'video_frames', args, 'Tool result for video_frames failed: ' + ((ext && ext.error) || 'extraction failed.'), false);
    return { action: 'continue' };
  }
  var v = null;
  try { v = ctx.validateImages(ext.frames.map(function (f) { return { name: f.name, dataUrl: f.dataUrl }; })); } catch (e) { v = { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
  if (!v || !v.ok) {
    ctx.pushToolResult(run, 'video_frames', args, 'Tool result for video_frames failed: invalid video frame image: ' + ((v && v.error) || 'unknown'), false);
    return { action: 'continue' };
  }
  var tsList = ext.frames.map(function (f) { return f.timestamp + 's'; }).join(', ');
  var visionCapable = false;
  try { visionCapable = !!ctx.isVisionModel(run.provider, run.model); } catch (e) { visionCapable = false; }
  if (visionCapable) {
    if (!Array.isArray(ctx.visionStore[run.id])) ctx.visionStore[run.id] = [];
    for (var s = 0; s < v.images.length; s++) ctx.visionStore[run.id].push({ name: v.images[s].name, dataUrl: v.images[s].dataUrl });
    ctx.pushToolResult(run, 'video_frames', args, 'Tool result for video_frames: ' + v.images.length + ' sampled frames from the video are attached as image parts to this message, in order, at timestamps: ' + tsList + '. Describe what happens in the video across these frames (do not invent content between frames).', true);
  } else {
    ctx.pushToolResult(run, 'video_frames', args, 'Tool result for video_frames (timestamps only — you cannot see pixels): the video was sampled at ' + tsList + ' (' + v.images.length + ' frames, not attached for text-only models). Work from filenames, paths, and any other evidence, then deliver.', true);
  }
  if (ctx.onProgress) { try { ctx.onProgress('video_frames', args, run.lastThought || ''); } catch (e) {} }
  return { action: 'continue' };
}

module.exports = { SYSTEM_BLOCK: SYSTEM_BLOCK, isLocalSiteUrl: isLocalSiteUrl, normalizeStrikeError: normalizeStrikeError, noteStrike: noteStrike, applyStrike: applyStrike, formatChecks: formatChecks, captureVerifyShots: captureVerifyShots, handleVisionVerify: handleVisionVerify, consumeVerifyShots: consumeVerifyShots, visionLib: visionLib, MAX_VIDEO_FRAMES: MAX_VIDEO_FRAMES, MAX_VIDEO_BYTES: MAX_VIDEO_BYTES, VIDEO_EXTS: VIDEO_EXTS, splitJpegs: splitJpegs, videoSampling: videoSampling, defaultRunCmd: defaultRunCmd, probeDuration: probeDuration, resolveVideoPath: resolveVideoPath, extractVideoFrames: extractVideoFrames, handleVideoFrames: handleVideoFrames };
