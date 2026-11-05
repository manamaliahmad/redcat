// analyze-site.js — deterministic reference-site reader (NOT model work).
// Reads ONE public URL and outputs structured design data + screenshots.
// It never logs in, never downloads the site's images/assets, never copies
// CSS/HTML/copy verbatim. Output goes to a run folder, never to sites/.
//
// Usage: node analyze-site.js <url> [outDir]
//   outDir default: runs/refflow/<host>-<yyyymmdd-hhmmss>
// Exit codes: 0 = ok (warnings allowed), 1 = error, 2 = refused
//   (robots.txt disallows the path, or a login/auth page was detected).
//
// What it captures per viewport (desktop 1440x900, mobile 400x800):
//   step-by-step scroll screenshots (animations get a short settle wait),
//   computed fonts, colours, spacing/radius common values, section list,
//   script URLs + globals-based library detection (three.js, GSAP, Lenis,
//   Framer Motion), canvas presence, motion sampling (transform/opacity
//   at top / middle / bottom scroll positions).
//
// Hardening (production, not a sketch):
//   - per-step timeouts everywhere; no unbounded networkidle wait
//   - total page height capped (12000px) and screenshots capped (20/viewport),
//     so infinite-scroll pages cannot hang it
//   - robots.txt is honoured (User-agent: * rules, prefix + wildcard match)
//   - login/auth pages are refused, never submitted or bypassed
//   - only ~3 requests per reference page: robots.txt + 2 viewport loads
//   - no asset downloads: screenshots + computed data only

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const VERSION = 'analyze-site-1.0.0';
const MAX_HEIGHT = 12000;
const MAX_SHOTS = 20;
const STEP = 700;
const SETTLE_MS = 600;
const GOTO_TIMEOUT = 30000;
const ROBOTS_TIMEOUT = 10000;

function log(msg) { console.log('[analyze-site] ' + msg); }

function fetchText(url, timeoutMs) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'RedCat-analyze-site/1.0 (+research-only)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve({ status: res.statusCode, body: '' });
        res.resume();
        return;
      }
      let body = '';
      res.on('data', (c) => { if (body.length < 200000) body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.on('error', () => resolve({ status: 0, body: '' }));
  });
}

// Minimal robots.txt matcher: User-agent * (and *) groups, Allow/Disallow.
// Returns true when the path is DISALLOWED.
function robotsDisallows(robotsBody, urlPath) {
  if (!robotsBody) return false;
  const lines = robotsBody.split(/\r?\n/).map((l) => l.trim());
  let inGroup = false;
  let groupApplies = false;
  let bestLen = -1;
  let disallowed = false;
  const matchRule = (pattern) => {
    if (pattern === '') return -1;
    // Convert robots wildcard: * -> .*, $ -> end anchor.
    let re = '^';
    for (const ch of pattern) {
      if (ch === '*') re += '.*';
      else if (ch === '$') re += '$';
      else re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
    const m = urlPath.match(new RegExp(re));
    return m ? pattern.length : -1;
  };
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = (rawKey || '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      inGroup = true;
      groupApplies = groupApplies || value === '*' || value === '';
      if (value !== '*' && value !== '') {
        // A new named group starts; keep groupApplies only if * was seen.
        // (Simplification: * rules apply to all crawlers, which is the
        // conservative, correct reading for a research reader.)
      }
    } else if (inGroup && groupApplies && (key === 'disallow' || key === 'allow')) {
      const len = matchRule(value);
      if (len >= 0 && len >= bestLen) {
        bestLen = len;
        disallowed = key === 'disallow';
      }
    }
  }
  return disallowed;
}

function urlIsLoginish(finalUrl) {
  try {
    const u = new URL(finalUrl);
    return /(^|\/)(login|signin|sign-in|auth|account\/login|session)([\/?#]|$)/i.test(u.pathname);
  } catch (e) { return false; }
}

// A page is a login page when its URL or title says so, or when a
// password field dominates a thin page. A content page that merely
// HAS a login form (header sign-in, members box) is NOT refused —
// that would block most marketing pages. It proceeds with a warning.
function loginVerdict(probe) {
  if (urlIsLoginish(probe.finalUrl)) return { refused: true, reason: 'login-url' };
  if (/log\s?in|sign\s?in|sign up|register/i.test(probe.title || '')) return { refused: true, reason: 'login-title' };
  if (probe.hasPassword && !probe.contentRich) return { refused: true, reason: 'password-dominated-page' };
  if (probe.hasPassword) return { refused: false, warning: 'login form present on a content page — proceeding, no login attempted' };
  return { refused: false };
}

async function captureViewport(browser, url, vp, outDir) {
  const page = await browser.newPage({ viewport: vp });
  const shots = [];
  const errors = [];
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
    const status = resp ? resp.status() : 0;
    // Bounded wait for webfonts; never hang on networkidle.
    await page.evaluate(() => Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((r) => setTimeout(r, 5000)),
    ])).catch(() => {});
    await page.waitForTimeout(800);

    const probe = await page.evaluate(() => {
      const sections = document.querySelectorAll('section, header, footer, main, article').length;
      const textLen = document.body ? document.body.innerText.length : 0;
      return {
        hasPassword: !!document.querySelector('input[type=password]'),
        title: document.title || '',
        contentRich: sections >= 3 || textLen > 2000,
        finalUrl: location.href,
      };
    }).catch(() => ({ hasPassword: false, title: '', contentRich: false, finalUrl: page.url() }));
    const verdict = loginVerdict(probe);
    if (verdict.refused) {
      return { viewport: vp, refused: 'login-page:' + verdict.reason, finalUrl: probe.finalUrl, status, shots, errors };
    }
    const vpWarnings = verdict.warning ? [verdict.warning] : [];

    const totalHeight = await page.evaluate(() => document.body ? document.body.scrollHeight : 0);
    const cappedHeight = Math.min(totalHeight || 0, MAX_HEIGHT);
    const shotDir = path.join(outDir, 'shots');
    fs.mkdirSync(shotDir, { recursive: true });

    // Tag up to 12 prominent visible elements for motion sampling.
    await page.evaluate(() => {
      const cands = [];
      document.querySelectorAll('h1, h2, img, section, header, [class*=card], [class*=hero]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 20) cands.push(el);
      });
      cands.slice(0, 12).forEach((el, i) => { el.setAttribute('data-rf-idx', String(i)); });
    }).catch(() => {});

    const sampleMotion = async () => page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-rf-idx]').forEach((el) => {
        const cs = getComputedStyle(el);
        out.push({ idx: el.getAttribute('data-rf-idx'), tag: el.tagName, transform: cs.transform, opacity: cs.opacity });
      });
      return out;
    }).catch(() => []);

    const positions = [];
    for (let y = 0; y < cappedHeight; y += STEP) {
      positions.push(y);
      if (positions.length >= MAX_SHOTS) break;
    }
    if (positions.length === 0) positions.push(0);
    const motionSamples = [];
    for (let i = 0; i < positions.length; i++) {
      const y = positions[i];
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(SETTLE_MS);
      const name = vp.name + '-' + y + '.png';
      await page.screenshot({ path: path.join(shotDir, name) });
      shots.push(name);
      // Motion samples at first, middle, last positions only.
      if (i === 0 || i === Math.floor(positions.length / 2) || i === positions.length - 1) {
        motionSamples.push({ at: y, elements: await sampleMotion() });
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

    const data = await page.evaluate(() => {
      const cs = (el) => getComputedStyle(el);
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      };
      const h1 = document.querySelector('h1');
      const h2 = document.querySelector('h2');
      const btn = document.querySelector('button, a[class*=btn], a[class*=button]');
      const link = document.querySelector('a[href]');
      // Bounded computed-style sampling for colours / spacing / radii.
      const colourCounts = {};
      const padCounts = {};
      const radiusCounts = {};
      const gapCounts = {};
      let sampled = 0;
      document.querySelectorAll('body *').forEach((el) => {
        if (sampled >= 300) return;
        if (!vis(el)) return;
        sampled++;
        const s = cs(el);
        const bump = (map, v) => { if (v) map[v] = (map[v] || 0) + 1; };
        bump(colourCounts, s.color);
        if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(colourCounts, s.backgroundColor);
        bump(padCounts, s.padding);
        bump(radiusCounts, s.borderRadius);
        if (s.gap && s.gap !== 'normal') bump(gapCounts, s.gap);
      });
      const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => ({ value: v, count: c }));
      // Declared :root custom properties, same-origin sheets only.
      const rootVars = {};
      try {
        for (const sheet of document.styleSheets) {
          let rules = null;
          try { rules = sheet.cssRules; } catch (e) { rules = null; }
          if (!rules) continue;
          for (const rule of rules) {
            if (rule.selectorText && rule.selectorText.includes(':root') && rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--')) rootVars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch (e) { /* cross-origin sheets are skipped by design */ }
      const fontLinks = [];
      document.querySelectorAll('link[href]').forEach((l) => {
        const href = l.getAttribute('href') || '';
        if (/fonts\.(googleapis|gstatic)|font/i.test(href)) fontLinks.push(href);
      });
      const sections = [];
      document.querySelectorAll('section, header, footer, nav, main, article').forEach((s) => {
        if (!vis(s)) return;
        sections.push({
          tag: s.tagName,
          id: s.id || null,
          cls: (s.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3),
          height: s.offsetHeight,
          text: (s.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
          images: s.querySelectorAll('img').length,
        });
      });
      const scriptSrcs = [];
      document.querySelectorAll('script[src]').forEach((s) => { const src = s.getAttribute('src'); if (src) scriptSrcs.push(src); });
      // Library detection must also cover ES-module sites: import maps
      // and inline module scripts never appear in script[src], and
      // module builds do not set window.THREE. We scan import keys and
      // a bounded slice of inline script text for library NAMES only —
      // no code is copied into the output, only true/false flags.
      const importKeys = [];
      document.querySelectorAll('script[type=importmap]').forEach((s) => {
        try {
          const j = JSON.parse(s.textContent || '{}');
          if (j.imports) importKeys.push(...Object.keys(j.imports));
        } catch (e) { /* malformed import map: ignore */ }
      });
      let inlineHints = '';
      document.querySelectorAll('script:not([src])').forEach((s) => {
        inlineHints += '\n' + (s.textContent || '').slice(0, 4000);
      });
      const hay = scriptSrcs.join('\n') + '\n' + importKeys.join('\n') + inlineHints;
      const libs = {
        threejs: !!window.THREE || /three(\.min)?\.js/i.test(hay) || /from\s+['"]three['"]/i.test(hay) || importKeys.some((k) => k === 'three' || k.indexOf('three/') === 0),
        gsap: !!window.gsap || /gsap/i.test(hay),
        lenis: !!window.Lenis || /lenis/i.test(hay),
        framerMotion: /framer-motion|framer/i.test(hay),
      };
      const pick = (el) => el ? {
        fontFamily: cs(el).fontFamily, fontSize: cs(el).fontSize,
        fontWeight: cs(el).fontWeight, letterSpacing: cs(el).letterSpacing,
        color: cs(el).color, lineHeight: cs(el).lineHeight,
      } : null;
      return {
        title: document.title,
        h1: pick(h1), h2: pick(h2), button: pick(btn), link: pick(link),
        body: document.body ? { bg: cs(document.body).backgroundColor, color: cs(document.body).color } : null,
        rootVars, fontLinks,
        coloursTop: top(colourCounts, 12),
        paddingTop: top(padCounts, 8),
        radiusTop: top(radiusCounts, 8),
        gapTop: top(gapCounts, 8),
        sections: sections.slice(0, 60),
        scriptSrcs: scriptSrcs.slice(0, 80),
        libs,
        hasCanvas: !!document.querySelector('canvas'),
      };
    });

    // Motion verdict: did any sampled element change transform/opacity?
    let motionDetected = false;
    const motionChanged = [];
    if (motionSamples.length >= 2) {
      const first = motionSamples[0].elements;
      const last = motionSamples[motionSamples.length - 1].elements;
      first.forEach((f) => {
        const l = last.find((x) => x.idx === f.idx);
        if (l && (l.transform !== f.transform || l.opacity !== f.opacity)) {
          motionDetected = true;
          motionChanged.push({ idx: f.idx, tag: f.tag, from: { transform: f.transform, opacity: f.opacity }, to: { transform: l.transform, opacity: l.opacity } });
        }
      });
    }

    return {
      viewport: vp, finalUrl: probe.finalUrl, status, shots,
      totalHeight, cappedHeight, truncated: totalHeight > MAX_HEIGHT,
      data, motion: { detected: motionDetected, changed: motionChanged, samples: motionSamples.length },
      errors, warnings: vpWarnings,
    };
  } catch (e) {
    errors.push(String((e && e.message) || e));
    return { viewport: vp, error: String((e && e.message) || e), shots, errors };
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//i.test(url)) {
    console.error('Usage: node analyze-site.js <https-url> [outDir]');
    process.exit(1);
  }
  let outDir = process.argv[3];
  if (!outDir) {
    const host = new URL(url).hostname.replace(/[^a-z0-9]+/gi, '-');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    outDir = path.join('runs', 'refflow', host + '-' + stamp);
  }
  fs.mkdirSync(outDir, { recursive: true });

  // robots.txt: honour User-agent * rules for this exact path.
  const origin = new URL(url).origin;
  const urlPath = new URL(url).pathname;
  const robots = await fetchText(origin + '/robots.txt', ROBOTS_TIMEOUT);
  if (robots.body && robotsDisallows(robots.body, urlPath)) {
    const report = { tool: VERSION, url, refused: 'robots-txt', at: new Date().toISOString(), notDone: ['no assets downloaded', 'no CSS/HTML copied', 'no login attempted'] };
    fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(report, null, 2));
    console.log('ANALYZE_REFUSED robots-txt ' + outDir);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await captureViewport(browser, url, { name: 'desktop', width: 1440, height: 900 }, outDir);
    const mobile = await captureViewport(browser, url, { name: 'mobile', width: 400, height: 800 }, outDir);
    if (desktop.refused || mobile.refused) {
      const report = { tool: VERSION, url, refused: desktop.refused || mobile.refused, at: new Date().toISOString(), notDone: ['no assets downloaded', 'no CSS/HTML copied', 'no login attempted'] };
      fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(report, null, 2));
      console.log('ANALYZE_REFUSED ' + (desktop.refused || mobile.refused) + ' ' + outDir);
      process.exit(2);
    }
    const failed = [desktop, mobile].filter((v) => v.error);
    const report = {
      tool: VERSION, url, at: new Date().toISOString(),
      viewports: { desktop, mobile },
      warnings: failed.map((v) => v.viewport.name + ': ' + v.error).concat(desktop.warnings || [], mobile.warnings || []),
      notDone: ['no assets downloaded', 'no CSS/HTML copied', 'no login attempted', 'no pixel-diff verification'],
      notes: 'Screenshots + computed data only. Motion is sampled qualitatively (transform/opacity at 3 scroll positions); keyframe timelines and shader code are never extracted.',
    };
    fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(report, null, 2));
    console.log('ANALYZE_OK ' + outDir + ' desktopShots=' + desktop.shots.length + ' mobileShots=' + mobile.shots.length + ' warnings=' + report.warnings.length);
    process.exit(failed.length === 2 ? 1 : 0);
  } finally {
    await browser.close().catch(() => {});
  }
})().catch((e) => { console.error('ANALYZE_ERROR ' + ((e && e.message) || e)); process.exit(1); });
