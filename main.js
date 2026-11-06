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
const { app, BrowserWindow } = require('electron');
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
  require('./redcat-app/server.js');
  startPoller(port);
  createWindow(port);
  // AUTO-UPDATE (2026-11-05, v1.0.0): check GitHub releases for a newer
  // version and notify the user. Runs in the background 15s after startup
  // so it never slows the launch. A failed check (no internet, no release
  // yet) is silent — the app keeps working. Download starts only after
  // the user accepts the notification (autoDownload is off).
  try {
    autoUpdater.autoDownload = false;
    autoUpdater.on('error', () => {});
    // UPDATE (2026-11-05): when a new version finishes downloading and
    // is ready to install, record it so the NEXT launch (after the
    // restart) shows the video card with update progress while the
    // update is applied. The flag is cleared when that launch's main
    // page finishes loading (see createWindow).
    autoUpdater.on('update-downloaded', () => { markPendingUpdate(); });
    setTimeout(() => { try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) {} }, 15000);
  } catch (e) {}
});

app.on('before-quit', stopPoller);

app.on('window-all-closed', () => {
  app.quit();
});
