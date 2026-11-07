// RedCat desktop app (Electron).
// Startup flow: show the video loading card (splash.html — the
// redcat-code-loading.mp4 video, muted + looping, with a REAL loading bar)
// while the local RedCat server starts. When the server answers, load the
// home page. If the server never starts, show the error on the card.
// Progress is stage-based: each stage completes when a real event happens
// (server starting, server responding, page loading). No timer, no fake
// delay — if the server is already up, the app opens immediately.
//
// PORT (2026-11-05, EADDRINUSE fix): the local server prefers port 3000,
// but if 3000 is already in use (for example the developer server is
// running on this PC, or a second copy of the app is open), the app picks
// the next free port instead of crashing. The window always loads the
// port the server actually bound to. A second instance gets its own free
// port and never crashes with EADDRINUSE.
const { app, BrowserWindow, globalShortcut, Notification, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const { fork } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

// FIRST-RUN + UPDATE FLAGS (2026-11-05): persistent marker files in the
// app's userData folder. 'first-run-done' means the app has opened once
// (first launch finished). 'pending-update' means a new version was
// downloaded and the NEXT launch is an update launch (show the card
// with update progress). These gate the Electron splash window; the
// renderer's web overlay has its own matching localStorage flags
// ('redcat-first-run-done' / 'redcat-updating' + the ?updating=1 URL
// param). Both must agree: first launch / update launch shows the
// card, a normal open skips it entirely.
function flagPaths() {
  const dir = app.getPath('userData');
  return {
    dir,
    firstRunDone: path.join(dir, 'first-run-done'),
    pendingUpdate: path.join(dir, 'pending-update')
  };
}
function isFirstRunDone() {
  try { return fs.existsSync(flagPaths().firstRunDone); } catch (e) { return false; }
}
function isUpdatePending() {
  try { return fs.existsSync(flagPaths().pendingUpdate); } catch (e) { return false; }
}
function markFirstRunDone() {
  try {
    const p = flagPaths();
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.firstRunDone, '');
  } catch (e) {}
}
function markPendingUpdate() {
  try {
    const p = flagPaths();
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.pendingUpdate, '');
  } catch (e) {}
}
function clearPendingUpdate() {
  try { fs.unlinkSync(flagPaths().pendingUpdate); } catch (e) {}
}

// DISCORD POLLER (bundled, 2026-11-06): the Discord gateway poller runs
// as a child process of the app, so the user never starts it manually.
// It auto-starts when RedCat starts, auto-restarts if it crashes, and
// stops when the app quits. The poller only ever sees its own user's
// Discord jobs: it authenticates with a per-install device token, and
// the relay resolves that token to the user's Discord ID (per-user
// isolation — one user's jobs never reach another user's PC).
// The device token is a random UUID stored in userData. It is NOT a
// secret the user manages — it just identifies this install to the relay
// so jobs are routed to the right PC. It is never shown in the UI.
// PUBLIC_RELAY_URL is the relay's public HTTPS address. Until that relay
// is live, the poller falls back to the SSH tunnel (legacy mode) when
// DISCORD_SSH_HOST / DISCORD_SSH_KEY are set (dev PC only); end users
// never have those set, so they only ever use the public relay.
const PUBLIC_RELAY_URL = 'https://discord-relay.arexora.com';
function discordDeviceToken() {
  const dir = app.getPath('userData');
  const file = path.join(dir, 'discord-device-token');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch (e) {}
  const token = crypto.randomUUID();
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, token); } catch (e) {}
  return token;
}
function pollerScriptPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app.asar.unpacked', 'redcat-app', 'poller.js');
  return path.join(__dirname, 'redcat-app', 'poller.js');
}
let pollerChild = null;
let pollerStopping = false;
let pollerRestarts = 0;
let pollerLastStart = 0;
function startPoller(serverPort) {
  if (pollerStopping) return;
  const script = pollerScriptPath();
  if (!fs.existsSync(script)) return; // poller not bundled (older build) — skip silently
  const userData = app.getPath('userData');
  const env = Object.assign({}, process.env, {
    REDCAT_URL: 'http://127.0.0.1:' + serverPort,
    RELAY_URL: PUBLIC_RELAY_URL,
    DISCORD_DEVICE_TOKEN: discordDeviceToken(),
    POLLER_LOG_DIR: userData,
    // Legacy SSH fallback (dev PC only; end users never have these set).
    SSH_HOST: process.env.DISCORD_SSH_HOST || '',
    SSH_KEY: process.env.DISCORD_SSH_KEY || '',
    SSH_USER: process.env.DISCORD_SSH_USER || 'ubuntu',
  });
  try {
    pollerChild = fork(script, [], { env, silent: true });
    pollerLastStart = Date.now();
    pollerChild.on('exit', () => {
      pollerChild = null;
      if (pollerStopping) return;
      // Auto-restart on crash (with backoff). If it ran for over a minute,
      // reset the counter — it was healthy, this was a one-off.
      if (Date.now() - pollerLastStart > 60000) pollerRestarts = 0;
      pollerRestarts += 1;
      if (pollerRestarts > 10) return; // give up after 10 quick restarts
      const delay = Math.min(5000 * pollerRestarts, 60000);
      setTimeout(() => { if (!pollerStopping) startPoller(serverPort); }, delay);
    });
    pollerChild.on('error', () => {});
  } catch (e) {}
}
function stopPoller() {
  pollerStopping = true;
  if (pollerChild) {
    try { pollerChild.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => { try { if (pollerChild) pollerChild.kill('SIGKILL'); } catch (e) {} }, 5000);
    pollerChild = null;
  }
}

// Window/taskbar icon: use a real PNG. The redcatlogo.png file is JPEG
// bytes despite its name, which does not reliably render as a window icon,
// so prefer the real PNG copy (redcat-icon.png). The installed exe icon is
// set separately by electron-builder from icon.ico.
function windowIconPath() {
  const png = path.join(__dirname, 'redcat-app', 'public', 'assets', 'redcat-icon.png');
  if (fs.existsSync(png)) return png;
  const logo = path.join(__dirname, 'redcat-app', 'public', 'assets', 'redcatlogo.png');
  if (fs.existsSync(logo)) return logo;
  return undefined;
}

// Find a free port, preferring `startPort`. Tries startPort, then
// startPort+1, ... up to maxTries. Returns the free port number, or 0 if
// none could be verified (the caller falls back to startPort in that case;
// the server's error handler then logs instead of crashing).
function pickFreePort(startPort, maxTries) {
  return new Promise((resolve) => {
    let port = startPort;
    let tries = 0;
    (function tryPort() {
      const tester = net.createServer();
      tester.once('error', (err) => {
        try { tester.close(); } catch (e) {}
        if (err && err.code === 'EADDRINUSE' && tries < maxTries) {
          tries += 1;
          port += 1;
          tryPort();
        } else {
          resolve(0);
        }
      });
      tester.once('listening', () => {
        const free = tester.address().port;
        tester.close(() => resolve(free));
      });
      tester.listen(port);
    })();
  });
}

function waitForServer(url, timeoutMs, onWaiting) {
  const start = Date.now();
  let waitingReported = false;
  return new Promise((resolve) => {
    (function check() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          resolve(false);
        } else {
          if (!waitingReported && typeof onWaiting === 'function') {
            waitingReported = true;
            onWaiting();
          }
          setTimeout(check, 500);
        }
      });
    })();
  });
}

async function createWindow(serverPort) {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'RedCat',
    autoHideMenuBar: true,
    icon: windowIconPath(),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  // FLOATING BAR (v1.0.6): keep a reference to the main window so the
  // bar can be shown/hidden with it and the app can be restored from a
  // notification. `win` is created here (not stored) in older code.
  mainWin = win;
  serverPortForBar = serverPort;
  // Minimize -> show the bar (if enabled). Restore/focus -> hide it
  // again. Closed -> destroy the bar so it cannot keep the app alive
  // (window-all-closed quits the app).
  win.on('minimize', () => { showFloatingBar(); });
  win.on('restore', () => { hideFloatingBar(); });
  win.on('focus', () => { hideFloatingBar(); });
  win.on('closed', () => { destroyFloatingBar(); mainWin = null; });

  // FIRST-RUN + UPDATE RULE (2026-11-05): the video card (splash) shows
  // ONLY on the first launch after a fresh install and while an update
  // is being applied. A normal open skips it entirely, and a renderer
  // reload (Ctrl+Shift+R) never re-loads splash.html, so it cannot
  // re-appear on refresh.
  const firstRunDone = isFirstRunDone();
  const isUpdate = isUpdatePending();
  const showSplash = !firstRunDone || isUpdate;
  // The renderer reads ?updating=1 and shows its own card with update
  // progress; otherwise it uses its localStorage first-run flag.
  const baseUrl = 'http://localhost:' + serverPort + '/' + (isUpdate ? '?updating=1' : '');
  // When the main workspace page finishes loading, the launch is done:
  // record first-run done and clear any pending-update flag, so the
  // NEXT normal open skips the card. If the page never loads (server
  // down), the flags stay unset, so the next launch shows the card
  // (and the error) again instead of silently skipping it.
  const markLaunchDone = () => { markFirstRunDone(); clearPendingUpdate(); };

  if (!showSplash) {
    // Normal open: no card. Wait for the server, then load the home
    // page directly.
    await waitForServer(baseUrl, 30000, () => {});
    win.webContents.once('did-finish-load', markLaunchDone);
    win.loadURL(baseUrl);
    return;
  }

  // First launch or update launch: show the video card immediately —
  // the server may take a few seconds, and on an update the card shows
  // the update progress.
  await win.loadFile(path.join(__dirname, 'splash.html'));
  const setSplash = (pct, status) => {
    try {
      win.webContents.executeJavaScript(
        'window.setSplashProgress && window.setSplashProgress(' + JSON.stringify(pct) + ', ' + JSON.stringify(status) + ');'
      ).catch(() => {});
    } catch (e) {}
  };
  setSplash(15, isUpdate ? 'Updating RedCat' : 'Starting RedCat server');

  const ok = await waitForServer(baseUrl, 30000, () => {
    setSplash(30, isUpdate ? 'Applying update' : 'Waiting for server');
  });
  if (ok) {
    setSplash(60, isUpdate ? 'Update ready - loading workspace' : 'Server ready - loading workspace');
    win.webContents.once('did-finish-load', markLaunchDone);
    win.loadURL(baseUrl);
  } else {
    try {
      win.webContents.executeJavaScript(
        'window.setSplashError && window.setSplashError("RedCat server did not start. Close the app and reopen it.");'
      ).catch(() => {});
    } catch (e) {}
  }
}

// FLOATING TOP BAR (v1.0.6)
// A red bar with the three cat Lottie animations (yellow, red, blue)
// and a white pill chat box ("Give me task"). It appears at the
// top-center of the screen when the main window is minimized, and hides
// when the main window is restored/focused. Ctrl+Space summons it from
// anywhere. It is only an input: the prompt goes to the same agent loop
// the main app uses (via the local server, /api/quick-prompt), and a
// Notification tells the user when the reply is ready. Approvals still
// happen in the main app only - the bar never approves anything.
// The bar page (floating-bar.html) is served by the local server, so
// there is no IPC/preload - the bar talks to the server over HTTP, and
// the server calls back into the globals set in app.whenReady below.
let mainWin = null;
let barWin = null;
let serverPortForBar = null;

function floatingBarLog(message) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'floating-bar.log'), '[' + new Date().toISOString() + '] ' + message + '\n');
  } catch (e) {}
}
function floatingBarSettingsPath() {
  return path.join(app.getPath('userData'), 'floating-bar.json');
}
function isFloatingBarEnabled() {
  try {
    const raw = fs.readFileSync(floatingBarSettingsPath(), 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j.enabled === 'boolean') return j.enabled;
  } catch (e) {}
  return true; // default ON
}

function createFloatingBar() {
  if (barWin && !barWin.isDestroyed()) return barWin;
  if (!serverPortForBar) { floatingBarLog('createFloatingBar: no server port'); return null; }
  floatingBarLog('createFloatingBar: creating bar window (port ' + serverPortForBar + ')');
  const primary = screen.getPrimaryDisplay();
  const work = primary.workArea;
  const BAR_W = 640, BAR_H = 190;
  const x = Math.round(work.x + (work.width - BAR_W) / 2);
  const y = work.y + 10;
  barWin = new BrowserWindow({
    width: BAR_W,
    height: BAR_H,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  barWin.on('closed', () => { barWin = null; });
  barWin.loadURL('http://localhost:' + serverPortForBar + '/floating-bar.html');
  barWin.webContents.once('did-finish-load', () => {
    try { barWin.webContents.executeJavaScript("window.dispatchEvent(new Event('redcat-bar-shown'));").catch(() => {}); } catch (e) {}
  });
  return barWin;
}

function showFloatingBar() {
  try {
    floatingBarLog('showFloatingBar: minimize event, enabled=' + isFloatingBarEnabled() + ', mainMinimized=' + (mainWin && !mainWin.isDestroyed() ? mainWin.isMinimized() : 'no-main'));
    if (!isFloatingBarEnabled()) { floatingBarLog('showFloatingBar: disabled, skip'); return; }
    if (!mainWin || mainWin.isDestroyed()) { floatingBarLog('showFloatingBar: no main window'); return; }
    const bw = createFloatingBar();
    if (!bw || bw.isDestroyed()) { floatingBarLog('showFloatingBar: bar window not created'); return; }
    if (bw.isVisible()) { floatingBarLog('showFloatingBar: already visible'); return; }
    // showInactive: visible without stealing focus from what the user
    // is doing. The bar is an input they can click when ready.
    bw.showInactive();
    floatingBarLog('showFloatingBar: bar shown');
    try { bw.webContents.executeJavaScript("window.dispatchEvent(new Event('redcat-bar-shown'));").catch(() => {}); } catch (e) {}
  } catch (e) {}
}

function hideFloatingBar() {
  try {
    if (barWin && !barWin.isDestroyed() && barWin.isVisible()) { barWin.hide(); floatingBarLog('hideFloatingBar: bar hidden'); }
  } catch (e) {}
}

function destroyFloatingBar() {
  try {
    if (barWin && !barWin.isDestroyed()) barWin.destroy();
  } catch (e) {}
  barWin = null;
}

function focusFloatingBar() {
  try {
    if (!isFloatingBarEnabled()) return;
    const bw = createFloatingBar();
    if (!bw || bw.isDestroyed()) return;
    if (!bw.isVisible()) bw.show();
    bw.focus();
    try { bw.webContents.executeJavaScript("var i=document.getElementById('barInput'); if(i) i.focus();").catch(() => {}); } catch (e) {}
  } catch (e) {}
}

function registerFloatingBarShortcut() {
  try {
    const ok = globalShortcut.register('CommandOrControl+Space', () => { focusFloatingBar(); });
    if (!ok) {
      const ok2 = globalShortcut.register('Alt+Space', () => { focusFloatingBar(); });
      if (!ok2) console.log('[floating-bar] could not register a global shortcut (Ctrl+Space and Alt+Space are both taken)');
      else console.log('[floating-bar] global shortcut: Alt+Space (Ctrl+Space was taken)');
    } else {
      console.log('[floating-bar] global shortcut: Ctrl+Space');
    }
  } catch (e) { console.log('[floating-bar] shortcut registration failed: ' + (e && e.message ? e.message : e)); }
}

// SILENT AUTO-UPDATE (2026-11-06, v1.0.5)
// The update downloads in the background (no notification, no click),
// installs automatically when the user quits the app, and the NEXT
// launch shows the "Updating RedCat" video card. Every updater event
// is written to updater.log in userData (and to the console) - an
// updater error is NEVER swallowed silently again (that silent failure
// is why v1.0.1 never showed an update notification).
const UPDATER_LOG_FILE = 'updater.log';
function updaterLog(message) {
  const line = '[' + new Date().toISOString() + '] ' + message + '\n';
  try { console.log('[updater] ' + message); } catch (e) {}
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, UPDATER_LOG_FILE), line);
  } catch (e) {}
}
// Last known updater state. Shared with the local server through
// global.__redcatUpdaterStatus so the Settings "Check for Updates"
// button can show the result. Only its properties are ever mutated
// (never reassigned), so the global reference stays current.
let updaterState = { lastCheck: null, updateAvailable: false, version: null, downloading: false, downloaded: false, error: null, downloadPercent: null, bytesTransferred: null, bytesTotal: null };
let updaterCheckRunning = false;
let updaterLastLoggedPct = -1;
// Numeric semver comparison: true only if `latest` is strictly newer
// than `current` (1.0.10 > 1.0.9, 1.0.5 > 1.0.4). A plain string
// comparison (latest !== current) wrongly treats an OLDER release as an
// update - that is the bug this fixes.
function isNewerVersion(latest, current) {
  const pa = String(latest || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(current || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let k = 0; k < len; k++) {
    const a = pa[k] || 0, b = pb[k] || 0;
    if (a !== b) return a > b;
  }
  return false;
}
async function triggerUpdateCheck(source) {
  if (updaterCheckRunning) return { ok: true, inProgress: true, state: updaterState };
  updaterCheckRunning = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result && result.updateInfo ? result.updateInfo : null;
    const latest = info && info.version ? String(info.version) : '';
    const current = app.getVersion();
    updaterState.lastCheck = new Date().toISOString();
    updaterState.error = null;
    if (latest && isNewerVersion(latest, current)) {
      updaterState.updateAvailable = true;
      updaterState.version = latest;
      updaterLog('update available: ' + latest + ' (current ' + current + ') - downloading in background');
      return { ok: true, updateAvailable: true, version: latest, state: updaterState };
    }
    updaterState.updateAvailable = false;
    updaterState.version = latest || current;
    updaterLog('no update available (current ' + current + ', latest ' + (latest || 'unknown') + ')');
    return { ok: true, updateAvailable: false, version: updaterState.version, state: updaterState };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    updaterState.error = msg;
    updaterState.lastCheck = new Date().toISOString();
    updaterLog('update check FAILED: ' + msg);
    return { ok: false, error: msg, state: updaterState };
  } finally {
    updaterCheckRunning = false;
  }
}
function setupSilentAutoUpdate() {
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => { updaterLog('checking for update'); });
    autoUpdater.on('update-available', (info) => {
      updaterState.updateAvailable = true;
      updaterState.version = info && info.version ? String(info.version) : null;
      updaterState.downloadPercent = 0;
      updaterState.bytesTransferred = 0;
      updaterState.bytesTotal = 0;
      updaterLog('update available: ' + (updaterState.version || 'unknown') + ' - downloading in background');
    });
    autoUpdater.on('update-not-available', (info) => {
      updaterState.updateAvailable = false;
      updaterState.version = info && info.version ? String(info.version) : null;
      updaterLog('no update available (latest ' + (updaterState.version || 'unknown') + ')');
    });
    autoUpdater.on('download-progress', (p) => {
      updaterState.downloading = true;
      const pct = Math.round((p && p.percent) || 0);
      updaterState.downloadPercent = pct;
      updaterState.bytesTransferred = (p && p.transferred) || 0;
      updaterState.bytesTotal = (p && p.total) || 0;
      if (pct === 100 || pct - updaterLastLoggedPct >= 10 || updaterLastLoggedPct < 0) {
        updaterLastLoggedPct = pct;
        updaterLog('downloading update: ' + pct + '% (' + ((p && p.transferred) || 0) + '/' + ((p && p.total) || 0) + ' bytes)');
      }
    });
    autoUpdater.on('update-downloaded', (info) => {
      updaterState.downloading = false;
      updaterState.downloaded = true;
      updaterState.downloadPercent = 100;
      updaterState.version = info && info.version ? String(info.version) : updaterState.version;
      updaterLog('update downloaded: ' + (updaterState.version || 'unknown') + ' - will install on quit');
      markPendingUpdate();
    });
    autoUpdater.on('error', (err) => {
      const msg = err && err.message ? err.message : String(err);
      updaterState.error = msg;
      updaterState.downloading = false;
      updaterLog('updater ERROR: ' + msg);
    });
    // Expose the check + status to the local server so the Settings UI
    // "Check for Updates" button can trigger a check and show the result.
    global.__redcatCheckForUpdates = triggerUpdateCheck;
    global.__redcatUpdaterStatus = updaterState;
    // First check 15s after startup (never slows the launch), then every
    // 4 hours while the app is running, so a release published while the
    // app is open still downloads in the background.
    setTimeout(() => { triggerUpdateCheck('startup'); }, 15000);
    setInterval(() => { triggerUpdateCheck('periodic'); }, 4 * 60 * 60 * 1000);
    updaterLog('silent auto-update enabled (current ' + app.getVersion() + ')');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    updaterState.error = msg;
    updaterLog('updater setup FAILED: ' + msg);
  }
}

app.whenReady().then(async () => {
  // Pick a free port BEFORE starting the server, so the packaged server
  // never crashes with EADDRINUSE when 3000 is already in use.
  let port = await pickFreePort(3000, 20);
  if (!port) port = 3000; // last resort: let the server try 3000 (its error handler logs instead of crashing)
  process.env.PORT = String(port);
  // DISCORD CONNECT v2 (2026-11-06): the server needs this install's
  // device token for /api/discord/connect-url (state), so it is set in
  // the env before the server loads. Same token the poller uses.
  process.env.DISCORD_DEVICE_TOKEN = discordDeviceToken();
  // BROWSER PROFILE (2026-11-06, v1.0.4): the in-app browser keeps its
  // Chromium profile in userData (a real writable folder). The browser
  // used to build the profile path from its own folder (__dirname),
  // which is inside resources/app.asar in the packaged app - a read-only
  // file - so starting the browser failed with ENOTDIR. Setting the env
  // var here makes the packaged app use userData; dev keeps working
  // because browser.js falls back to __dirname when it is unset.
  process.env.REDCAT_BROWSER_PROFILE = path.join(app.getPath('userData'), 'browser-profile');
  // FLOATING BAR (v1.0.6): the server stores the bar's enabled flag in
  // userData (floating-bar.json) so main.js and the server share it.
  process.env.REDCAT_USER_DATA = app.getPath('userData');
  require('./redcat-app/server.js');
  // FLOATING BAR (v1.0.6): callbacks the server uses for the bar.
  // When a quick prompt finishes, show a Notification; clicking it
  // restores the main window with the reply. The bar never approves.
  global.__redcatOnQuickPromptDone = (result) => {
    try {
      const status = result && result.status ? result.status : 'done';
      let body = 'Reply ready \u2014 click to open';
      if (status === 'waiting') body = 'Needs your input \u2014 click to open';
      else if (status === 'error') body = 'Something went wrong \u2014 click to open';
      const note = new Notification({ title: 'RedCat', body: body });
      note.on('click', () => {
        try {
          if (mainWin && !mainWin.isDestroyed()) {
            if (mainWin.isMinimized()) mainWin.restore();
            mainWin.show();
            mainWin.focus();
          }
          hideFloatingBar();
        } catch (e) {}
      });
      note.show();
    } catch (e) {}
  };
  global.__redcatShowMainWindow = () => {
    try {
      if (mainWin && !mainWin.isDestroyed()) {
        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
      }
      hideFloatingBar();
    } catch (e) {}
  };
  global.__redcatHideFloatingBar = () => { hideFloatingBar(); };
  // MANUAL DRAG (v1.0.7): move the floating bar by (dx, dy). The bar page
  // posts here on mousemove while dragging (no OS drag region is used).
  global.__redcatMoveFloatingBar = (dx, dy) => {
    try {
      if (barWin && !barWin.isDestroyed()) {
        const b = barWin.getBounds();
        barWin.setBounds({ x: b.x + (dx || 0), y: b.y + (dy || 0), width: b.width, height: b.height });
      }
    } catch (e) {}
  };

  startPoller(port);
  createWindow(port);
  // SILENT AUTO-UPDATE (2026-11-06, v1.0.5): background download, install
  // on quit, "Updating RedCat" card on the next launch. No notification,
  // no click. See setupSilentAutoUpdate() above.
  setupSilentAutoUpdate();
  // FLOATING BAR (v1.0.6): Ctrl+Space (Alt+Space fallback) summons it.
  registerFloatingBarShortcut();
});

app.on('before-quit', stopPoller);

app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (e) {} });

app.on('window-all-closed', () => {
  app.quit();
});
