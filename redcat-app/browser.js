// browser.js — RedCat in-app browser system (v3, 2026-11-05).
//
// EMBEDDED panel browser: the engine runs headless on the user's own PC and
// renders ONLY inside the RedCat Browser panel (screenshot live view). Start
// never opens a tab or a window anywhere — there is no external window, ever.
// The panel IS the visible browser: the user clicks, types and scrolls inside
// the panel, and searches run inside the panel. A web page cannot embed a
// browser engine directly (iframes are blocked by Google/Discord/etc.), so
// the panel view + headless engine is the embedded approach for the web app.
// A native Electron BrowserView embed would need the app to run in Electron;
// that is a separate shell decision, not silently imposed here.
//
// v3 adds, all inside the panel: (a) input forwarding — mouse move, click,
// double-click, wheel and keyboard (including Ctrl/Shift combos) mapped to
// page coordinates from the server-confirmed viewport, with a fresh
// screenshot bypass (?fresh=1) so clicks and typing show up promptly;
// (b) scroll metrics — scrollinfo/scrollto drive the panel's right-side
// scrollbar (wheel, thumb drag, track click); (c) IN-PANEL TABS — several
// Playwright pages in the one persistent context; switching tabs never
// reloads or loses the other tabs; closing the last tab leaves a blank
// state (engine still running) and a new tab reopens from it; Stop stops
// the whole browser, not one tab; agent actions apply to the active tab.
//
// Engine: installed Google Chrome when present (channel 'chrome'), else the
// bundled Playwright Chromium. Persistent context in browser-profile/ on
// this PC only — sessions/cookies never leave the PC, never uploaded.
// The agent never sees a password: the user types logins in the panel.
// Taking control never approves anything; sensitive actions always wait for
// an explicit approval bound to their id.
const fs = require('fs');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, 'browser-profile');
const SENSITIVE_KINDS = new Set(['send', 'publish', 'buy', 'delete', 'submit', 'permission-change']);
const KEY_ALLOW = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
  'Control+A', 'Control+C', 'Control+V', 'Control+X', 'Control+Backspace', 'Control+Delete',
  'Control+ArrowLeft', 'Control+ArrowRight', 'Control+ArrowUp', 'Control+ArrowDown',
  'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+Home', 'Shift+End']);

let context = null;
let tabs = []; // [{ id, page, url, title }] — in-panel tabs, one Playwright page each
let activeTabId = null;
let nextTab = 1;
let state = 'idle'; // idle | starting | working | user-control
let currentUrl = '';
let currentTitle = '';
let currentViewport = { width: 1280, height: 800 };
let lastShot = null;
let lastShotAt = 0;
let lastShotUrl = '';
let lastShotTabId = null;
let queued = []; // routine agent actions waiting for hand-back
let approvedQueued = []; // sensitive actions approved while in control
let pending = []; // sensitive approvals waiting for a decision
let log = [];
let nextId = 1;

function pushLog(event, detail) {
  log.push({ t: new Date().toISOString(), event: event, detail: String(detail || '') });
  if (log.length > 200) log.shift();
}

function clampViewport(w, h) {
  const width = Math.max(320, Math.min(1920, Math.floor(Number(w) || 1280)));
  const height = Math.max(240, Math.min(1200, Math.floor(Number(h) || 800)));
  return { width: width, height: height };
}

function activeTab() {
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].id === activeTabId) return tabs[i];
  }
  return null;
}

function activePage() {
  const t = activeTab();
  return t ? t.page : null;
}

function makeTab(pg) {
  return { id: 'tab-' + (nextTab++), page: pg, url: '', title: '' };
}

async function createTab(makeActive) {
  const pg = await context.newPage();
  try { await pg.setViewportSize(currentViewport); } catch (e) {}
  const tab = makeTab(pg);
  tab.url = 'about:blank';
  tabs.push(tab);
  if (makeActive) {
    activeTabId = tab.id;
    currentUrl = tab.url;
    currentTitle = '';
  }
  return tab;
}

function publicStatus(extra) {
  return Object.assign({
    ok: true,
    state: state,
    url: currentUrl,
    title: currentTitle,
    viewport: currentViewport,
    canAgentAct: state === 'working',
    queued: queued.length,
    pending: pending.map(function (p) {
      return { id: p.id, kind: p.kind, detail: p.detail, selector: p.selector || '', url: p.url };
    }),
    running: !!context,
    engineApi: 2,
    tabs: tabs.map(function (t) { return { id: t.id, url: t.url, title: t.title }; }),
    activeTabId: activeTabId
  }, extra || {});
}

function refreshState() {
  try {
    if (!context) {
      if (tabs.length || activeTabId) { tabs = []; activeTabId = null; }
      return;
    }
    const wasActive = activeTabId;
    const before = tabs.length;
    tabs = tabs.filter(function (t) {
      try { return !t.page.isClosed(); } catch (e) { return false; }
    });
    if (tabs.length !== before) {
      if (!tabs.find(function (t) { return t.id === wasActive; })) {
        if (tabs.length) {
          const nt = tabs[tabs.length - 1];
          activeTabId = nt.id;
          currentUrl = nt.url;
          currentTitle = nt.title;
        } else {
          activeTabId = null;
          currentUrl = '';
          currentTitle = '';
        }
      }
    }
    // No tabs left: distinguish a live session in blank state (context
    // answers) from a dead browser (context calls throw) — only the dead
    // one resets to idle. Closing the last tab must NOT kill the session.
    if (tabs.length === 0) {
      try { context.pages(); }
      catch (e) {
        context = null;
        activeTabId = null;
        queued = [];
        state = 'idle';
        currentUrl = '';
        currentTitle = '';
        pushLog('browser-closed-by-user', 'Browser context closed directly.');
      }
    }
  } catch (e) { /* treat as closed on next read */ }
}

async function syncMeta() {
  const p = activePage();
  if (!p) return;
  try {
    const u = p.url();
    const t = await Promise.race([
      p.title(),
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 3000); })
    ]);
    const tab = activeTab();
    if (tab) tab.url = u;
    currentUrl = u;
    if (t !== null) {
      if (tab) tab.title = t;
      currentTitle = t;
    }
  } catch (e) {}
}

async function runRoutine(action) {
  const p = activePage();
  if (!p) throw new Error('NO_TAB');
  if (action.type === 'navigate') {
    await p.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await syncMeta();
    pushLog('agent-navigate', action.url);
    return { ok: true, url: currentUrl };
  }
  if (action.type === 'click') {
    await p.click(action.selector, { timeout: 10000 });
    await syncMeta();
    pushLog('agent-click', action.selector);
    return { ok: true, url: currentUrl };
  }
  throw new Error('UNKNOWN_ACTION');
}

async function runSensitive(item) {
  const p = activePage();
  if (!p) throw new Error('NO_TAB');
  if (item.selector) {
    await p.click(item.selector, { timeout: 10000 });
    await syncMeta();
  }
  pushLog('sensitive-executed', item.kind + ' #' + item.id + (item.detail ? ' ' + item.detail : ''));
  return { ok: true, executed: item.id };
}

async function runQueued() {
  const approved = approvedQueued.splice(0, approvedQueued.length);
  for (const item of approved) {
    try { await runSensitive(item); }
    catch (e) { pushLog('sensitive-failed', '#' + item.id + ' ' + String(e.message || e).split('\n')[0].slice(0, 160)); }
  }
  const jobs = queued.splice(0, queued.length);
  for (const job of jobs) {
    try { await runRoutine(job); }
    catch (e) { pushLog('queued-failed', job.type + ' ' + String(e.message || e).split('\n')[0].slice(0, 160)); }
  }
}

function isLockError(msg) {
  return /locked|already in use|already running/i.test(msg);
}

async function startBrowser(opts) {
  refreshState();
  if (context) {
    await syncMeta();
    return publicStatus({ already: true });
  }
  state = 'starting';
  try {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
    const { chromium } = require('playwright');
    const viewport = clampViewport(opts && opts.width, opts && opts.height);
    // Always headless: the panel is the only visible browser. No window, ever.
    const base = {
      headless: true,
      viewport: viewport,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled']
    };
    try {
      context = await chromium.launchPersistentContext(PROFILE_DIR, Object.assign({ channel: 'chrome' }, base));
    } catch (e) {
      if (isLockError(String(e && e.message ? e.message : e))) throw e;
      context = await chromium.launchPersistentContext(PROFILE_DIR, base);
    }
    const existing = context.pages();
    if (existing.length) {
      tabs = existing.map(function (pg) { return makeTab(pg); });
    } else {
      tabs = [makeTab(await context.newPage())];
    }
    activeTabId = tabs[0].id;
    currentViewport = viewport;
    for (let i = 0; i < tabs.length; i++) {
      try { await tabs[i].page.setViewportSize(viewport); } catch (e) {}
    }
    state = 'working';
    const url = opts && typeof opts.url === 'string' ? opts.url.trim() : '';
    if (url && /^https?:\/\//.test(url)) {
      try { await activePage().goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
      catch (e) { pushLog('start-navigate-failed', url); }
    }
    await syncMeta();
    pushLog('browser-started', 'headless-embedded ' + viewport.width + 'x' + viewport.height + ' ' + (currentUrl || ''));
    return publicStatus({});
  } catch (e) {
    context = null;
    tabs = [];
    activeTabId = null;
    state = 'idle';
    const msg = String(e && e.message ? e.message : e);
    if (isLockError(msg)) {
      return { ok: false, error: 'BROWSER_LOCKED', detail: 'Close the existing RedCat browser window and try again.' };
    }
    pushLog('browser-start-failed', msg.split('\n')[0].slice(0, 200));
    return { ok: false, error: 'BROWSER_START_FAILED', detail: msg.split('\n')[0].slice(0, 200) };
  }
}

async function stopBrowser() {
  try { if (context) await context.close(); } catch (e) {}
  context = null;
  tabs = [];
  activeTabId = null;
  queued = [];
  approvedQueued = [];
  pending = [];
  // lastShot is deliberately KEPT (not cleared): an image load started from
  // a just-stale status during Stop must not 409 in the console. The panel
  // hides the image when idle, and the next Start recaptures because tab
  // ids are fresh, so the kept bytes are never shown as a live view.
  currentUrl = '';
  currentTitle = '';
  state = 'idle';
  pushLog('browser-stopped', 'Browser closed by Stop. Profile kept on disk.');
  return publicStatus({});
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = '';
    req.on('data', function (c) { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', function () {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const u = req.url.split('?')[0];
  try {
    if (u === '/api/browser/status' && req.method === 'GET') {
      refreshState();
      if (context) await syncMeta();
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/log' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, log: log.slice(-100) });
    }
    // PANEL TEXT (2026-11-05, v2.46): the agent reads the panel browser's
    // active page as text (title + visible text). The panel screenshot is
    // for the human eye; the agent needs text to reason about the page.
    if (u === '/api/browser/text' && req.method === 'GET') {
      refreshState();
      const p = activePage();
      if (!context || !p || p.isClosed()) {
        return sendJson(res, 409, { ok: false, error: context ? 'NO_TABS' : 'BROWSER_NOT_RUNNING' });
      }
      await syncMeta();
      let text = '';
      try {
        text = await Promise.race([
          p.evaluate(function () { return (document.body ? document.body.innerText : '') || ''; }),
          new Promise(function (resolve) { setTimeout(function () { resolve(''); }, 5000); })
        ]);
      } catch (e) { text = ''; }
      return sendJson(res, 200, { ok: true, url: currentUrl, title: currentTitle, text: String(text || '').slice(0, 8000) });
    }
    if (u === '/api/browser/screenshot' && req.method === 'GET') {
      refreshState();
      const p = activePage();
      // No live view right now (engine idle, or blank state after the last
      // tab closed): serve the last shot if one exists, so an image load
      // started from a just-stale status does not 409 in the console. The
      // panel hides the image in both states, so these bytes are never
      // shown; the next Start recaptures because tab ids are fresh.
      if (!context || !p || p.isClosed()) {
        if (lastShot) {
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
          return res.end(lastShot);
        }
        return sendJson(res, 409, { ok: false, error: context ? 'NO_TABS' : 'BROWSER_NOT_RUNNING' });
      }
      await syncMeta();
      const fresh = /(^|[?&])fresh=1(&|$)/.test(req.url);
      const now = Date.now();
      if (fresh || !lastShot || now - lastShotAt > 800 || lastShotUrl !== currentUrl || lastShotTabId !== activeTabId) {
        lastShot = await p.screenshot({ type: 'jpeg', quality: 70 });
        lastShotAt = now;
        lastShotUrl = currentUrl;
        lastShotTabId = activeTabId;
      }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
      return res.end(lastShot);
    }
    if (u === '/api/browser/start' && req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, await startBrowser(body));
    }
    if (u === '/api/browser/stop' && req.method === 'POST') {
      await readBody(req);
      return sendJson(res, 200, await stopBrowser());
    }
    if (u === '/api/browser/take-control' && req.method === 'POST') {
      await readBody(req);
      refreshState();
      if (state !== 'working') return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      state = 'user-control';
      pushLog('take-control', 'User took control. Agent actions queue.');
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/done' && req.method === 'POST') {
      await readBody(req);
      refreshState();
      if (state !== 'user-control') return sendJson(res, 409, { ok: false, error: 'NOT_IN_CONTROL' });
      state = 'working';
      pushLog('hand-back', 'User handed back with Done. Queued actions resume.');
      await runQueued();
      await syncMeta();
      return sendJson(res, 200, publicStatus({}));
    }
    // USER panel actions: the user driving the embedded browser. These work
    // in working AND user-control states (they ARE the user), and never need
    // approval — approval gates agent actions, not the user's own input.
    if (u === '/api/browser/go' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      const url = String(body.url || '');
      if (!/^https?:\/\//.test(url)) return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await syncMeta();
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/viewport' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      currentViewport = clampViewport(body.width, body.height);
      for (let i = 0; i < tabs.length; i++) {
        try { await tabs[i].page.setViewportSize(currentViewport); } catch (e) {}
      }
      if (tabs.length) lastShot = null;
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/pointer' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      const x = Math.max(0, Math.min(currentViewport.width - 1, Math.floor(Number(body.x) || 0)));
      const y = Math.max(0, Math.min(currentViewport.height - 1, Math.floor(Number(body.y) || 0)));
      if (body.dblclick === true) await p.mouse.dblclick(x, y);
      else await p.mouse.click(x, y);
      lastShot = null;
      let focused = null;
      try {
        focused = await Promise.race([
          p.evaluate(function () {
            const el = document.activeElement;
            if (!el) return null;
            const tag = (el.tagName || '').toLowerCase();
            const type = (el.getAttribute && el.getAttribute('type')) || '';
            const editable = !!(el.isContentEditable || tag === 'textarea' || tag === 'select' || (tag === 'input' && type !== 'button' && type !== 'submit' && type !== 'checkbox' && type !== 'radio'));
            return { tag: tag, type: type, editable: editable };
          }),
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 3000); })
        ]);
      } catch (e) {}
      await syncMeta();
      return sendJson(res, 200, publicStatus({ focused: focused }));
    }
    if (u === '/api/browser/move' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      const x = Math.max(0, Math.min(currentViewport.width - 1, Math.floor(Number(body.x) || 0)));
      const y = Math.max(0, Math.min(currentViewport.height - 1, Math.floor(Number(body.y) || 0)));
      await p.mouse.move(x, y);
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/keyboard' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      if (typeof body.text === 'string' && body.text.length > 0) {
        await p.keyboard.type(body.text.slice(0, 200));
      } else if (typeof body.key === 'string' && KEY_ALLOW.has(body.key)) {
        await p.keyboard.press(body.key);
      } else {
        return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
      }
      lastShot = null;
      await syncMeta();
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/wheel' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      const dy = Math.max(-5000, Math.min(5000, Math.floor(Number(body.deltaY) || 0)));
      await p.mouse.wheel(0, dy);
      lastShot = null;
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/scrollinfo' && req.method === 'GET') {
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      let info = null;
      try {
        info = await Promise.race([
          p.evaluate(function () {
            const de = document.documentElement;
            return { scrollX: window.scrollX || 0, scrollY: window.scrollY || 0, scrollWidth: de ? de.scrollWidth : 0, scrollHeight: de ? de.scrollHeight : 0, innerWidth: window.innerWidth || 0, innerHeight: window.innerHeight || 0 };
          }),
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 3000); })
        ]);
      } catch (e) { return sendJson(res, 409, { ok: false, error: 'NO_TABS' }); }
      if (!info) return sendJson(res, 409, { ok: false, error: 'SCROLL_TIMEOUT' });
      return sendJson(res, 200, Object.assign({ ok: true }, info));
    }
    if (u === '/api/browser/scrollto' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const p = activePage();
      if (!p || p.isClosed()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      const x = Math.max(0, Math.floor(Number(body.x) || 0));
      const y = Math.max(0, Math.floor(Number(body.y) || 0));
      try { await p.evaluate(function (pos) { window.scrollTo(pos.x, pos.y); }, { x: x, y: y }); } catch (e) {}
      lastShot = null;
      return sendJson(res, 200, publicStatus({ scrolledTo: { x: x, y: y } }));
    }
    if (u === '/api/browser/tab/new' && req.method === 'POST') {
      await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const tab = await createTab(true);
      pushLog('tab-new', tab.id);
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/tab/close' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const id = String(body.id || '');
      const idx = tabs.findIndex(function (t) { return t.id === id; });
      if (idx < 0) return sendJson(res, 404, { ok: false, error: 'NO_TAB' });
      const wasActive = tabs[idx].id === activeTabId;
      try { await tabs[idx].page.close(); } catch (e) {}
      tabs.splice(idx, 1);
      if (wasActive) {
        if (tabs.length) {
          const nt = tabs[Math.min(idx, tabs.length - 1)];
          activeTabId = nt.id;
          currentUrl = nt.url;
          currentTitle = nt.title;
        } else {
          activeTabId = null;
          currentUrl = '';
          currentTitle = '';
        }
      }
      pushLog('tab-closed', id);
      return sendJson(res, 200, publicStatus({}));
    }
    if (u === '/api/browser/tab/switch' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const id = String(body.id || '');
      const tab = tabs.find(function (t) { return t.id === id; });
      if (!tab) return sendJson(res, 404, { ok: false, error: 'NO_TAB' });
      activeTabId = tab.id;
      currentUrl = tab.url;
      currentTitle = tab.title;
      await syncMeta();
      pushLog('tab-switched', id);
      return sendJson(res, 200, publicStatus({}));
    }
    if ((u === '/api/browser/navigate' || u === '/api/browser/click') && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (state === 'user-control') {
        const job = u.endsWith('/navigate')
          ? { type: 'navigate', url: String(body.url || '') }
          : { type: 'click', selector: String(body.selector || '') };
        if ((job.type === 'navigate' && !/^https?:\/\//.test(job.url)) || (job.type === 'click' && !job.selector)) {
          return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
        queued.push(job);
        pushLog('agent-queued', job.type + ' ' + (job.url || job.selector));
        return sendJson(res, 200, publicStatus({ queued: true }));
      }
      if (state !== 'working') return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      if (!activePage()) return sendJson(res, 409, { ok: false, error: 'NO_TABS' });
      const job = u.endsWith('/navigate')
        ? { type: 'navigate', url: String(body.url || '') }
        : { type: 'click', selector: String(body.selector || '') };
      if ((job.type === 'navigate' && !/^https?:\/\//.test(job.url)) || (job.type === 'click' && !job.selector)) {
        return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
      }
      const out = await runRoutine(job);
      return sendJson(res, 200, publicStatus(out));
    }
    if (u === '/api/browser/action' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      if (!context) return sendJson(res, 409, { ok: false, error: 'BROWSER_NOT_RUNNING' });
      const kind = String(body.kind || '');
      if (!SENSITIVE_KINDS.has(kind)) return sendJson(res, 400, { ok: false, error: 'BAD_KIND' });
      const item = {
        id: nextId++,
        kind: kind,
        selector: String(body.selector || ''),
        detail: String(body.detail || '').slice(0, 300),
        url: currentUrl
      };
      pending.push(item);
      pushLog('approval-requested', kind + ' #' + item.id + (item.detail ? ' ' + item.detail : ''));
      return sendJson(res, 200, { ok: true, needsApproval: true, id: item.id });
    }
    if (u === '/api/browser/approve' && req.method === 'POST') {
      const body = await readBody(req);
      refreshState();
      const id = Number(body.id);
      const idx = pending.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return sendJson(res, 404, { ok: false, error: 'APPROVAL_NOT_FOUND' });
      const item = pending.splice(idx, 1)[0];
      if (body.decision === 'reject') {
        pushLog('approval-rejected', item.kind + ' #' + item.id + ' (never executed)');
        return sendJson(res, 200, publicStatus({ rejected: item.id }));
      }
      if (body.decision !== 'approve') return sendJson(res, 400, { ok: false, error: 'BAD_DECISION' });
      const ap = activePage();
      if (state === 'working' && ap && !ap.isClosed()) {
        const out = await runSensitive(item);
        await syncMeta();
        return sendJson(res, 200, publicStatus(out));
      }
      approvedQueued.push(item);
      pushLog('approval-approved-queued', item.kind + ' #' + item.id + ' (runs on Done)');
      return sendJson(res, 200, publicStatus({ approvedQueued: item.id }));
    }
    return sendJson(res, 404, { ok: false, error: 'BROWSER_ROUTE_NOT_FOUND' });
  } catch (e) {
    pushLog('browser-error', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 200));
    try { return sendJson(res, 200, { ok: false, error: 'BROWSER_ERROR' }); } catch (e2) {}
  }
}

module.exports = { handle: handle, status: publicStatus };
