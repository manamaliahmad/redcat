// check.js — production check for the depth-portrait-scroll template.
// Serves template/dist over local HTTP (Vite module builds do not run
// from file://), then runs Playwright checks:
//   desktop: canvas renders, portrait centred, FPS estimate, scroll run
//   mobile:  no horizontal overflow, portrait centred
//   fallback: WebGL contexts nulled -> fallback image visible, no errors
// Usage: node check.js [distDir]
//   distDir default: ../template/dist (relative to this script).
// Exit 0 = pass, 1 = fail. Writes check-report.json next to the recipe.
// FPS: reported always; warn below 20, fail below 5 (effectively frozen).
// Any console error, any overflow, or an off-centre portrait fails.

const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');

const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'template', 'dist');
const reportPath = path.join(__dirname, '..', 'check-report.json');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.resolve(distDir, '.' + urlPath);
      if (!file.startsWith(path.resolve(distDir))) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('CHECK_FAIL dist missing: ' + distDir + ' — run npm run build first');
    process.exit(1);
  }
  const server = await serve();
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port + '/';
  const failures = [];
  const warnings = [];
  const report = { dist: distDir, base, checks: {} };
  const browser = await chromium.launch({ headless: true });
  try {
    // ---- Desktop run ----
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const canvasBox = await page.evaluate(() => {
        const c = document.querySelector('#portrait-canvas');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 100 };
      });
      const wrapCentre = await page.evaluate(() => {
        const w = document.querySelector('#portrait-wrap');
        if (!w) return null;
        const r = w.getBoundingClientRect();
        return { cx: r.x + r.width / 2, vw: window.innerWidth };
      });
      const centred = wrapCentre
        ? Math.abs(wrapCentre.cx - wrapCentre.vw / 2) <= wrapCentre.vw * 0.10
        : false;
      const fps = await page.evaluate(() => new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 2000) requestAnimationFrame(tick);
          else resolve(Math.round(frames / 2));
        };
        requestAnimationFrame(tick);
      }));
      // Scroll run: stepwise to the bottom, watching for new errors.
      const height = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < height; y += 700) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: path.join(__dirname, '..', 'shot-desktop-end.png') });
      await ctx.close();
      report.checks.desktop = { canvasVisible: !!(canvasBox && canvasBox.visible), centred, fps, consoleErrors: errors };
      if (!canvasBox || !canvasBox.visible) failures.push('desktop: canvas did not render');
      if (!centred) failures.push('desktop: portrait not centred');
      if (errors.length) failures.push('desktop: console errors: ' + errors.join(' | '));
      if (fps < 5) failures.push('desktop: fps too low (' + fps + ')');
      else if (fps < 20) warnings.push('desktop: fps low (' + fps + ') — software GL on this PC');
    }
    // ---- Mobile run ----
    {
      const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
      const wrapCentre = await page.evaluate(() => {
        const w = document.querySelector('#portrait-wrap');
        if (!w) return null;
        const r = w.getBoundingClientRect();
        return { cx: r.x + r.width / 2, vw: window.innerWidth };
      });
      const centred = wrapCentre
        ? Math.abs(wrapCentre.cx - wrapCentre.vw / 2) <= wrapCentre.vw * 0.10
        : false;
      await page.screenshot({ path: path.join(__dirname, '..', 'shot-mobile-top.png') });
      await ctx.close();
      report.checks.mobile = { scrollWidth: overflow, centred, consoleErrors: errors };
      if (overflow > 401) failures.push('mobile: horizontal overflow (' + overflow + 'px)');
      if (!centred) failures.push('mobile: portrait not centred');
      if (errors.length) failures.push('mobile: console errors: ' + errors.join(' | '));
    }
    // ---- Fallback run (WebGL blocked deterministically) ----
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = function () { return null; };
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const fb = await page.evaluate(() => {
        const img = document.querySelector('#portrait-fallback');
        if (!img) return { present: false };
        const r = img.getBoundingClientRect();
        const style = getComputedStyle(img);
        return { present: true, visible: r.width > 50 && style.display !== 'none', noWebglClass: document.body.classList.contains('no-webgl') };
      });
      await ctx.close();
      report.checks.fallback = { fallback: fb, consoleErrors: errors };
      if (!fb.present || !fb.visible || !fb.noWebglClass) failures.push('fallback: fallback image not shown when WebGL is blocked');
      if (errors.length) failures.push('fallback: console errors: ' + errors.join(' | '));
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  report.failures = failures;
  report.warnings = warnings;
  report.pass = failures.length === 0;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(report.pass ? 'CHECK_PASS' : 'CHECK_FAIL', JSON.stringify({ failures, warnings, desktop: report.checks.desktop, mobile: report.checks.mobile, fallback: report.checks.fallback }));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => { console.log('CHECK_FAIL exception: ' + ((e && e.message) || e)); process.exit(1); });
