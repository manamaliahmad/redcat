// RedCat Discord gateway — VM side.
// One Node process: a tiny local relay (127.0.0.1:8080) + the Discord bot.
// The bot takes prompts from DMs, @-mentions in server channels, and (optionally)
// dedicated channels, enqueues them on the relay, and delivers the PC's reply.
// It also posts a premium welcome card in #welcome when a member joins
// (needs the Server Members Intent + Attach Files / Embed Links in #welcome).
// The PC poller (pc/poller.js) pulls jobs from the relay, asks the RedCat agent
// on the PC, and posts replies back. No RedCat code is touched.
// The relay stays up even if the Discord login fails (the bot retries the
// login in-process every 30s), so queued prompts are never wiped by a restart.
// Env (from .env, loaded by systemd EnvironmentFile):
//   DISCORD_TOKEN        (required) bot token for RedCat#9302
//   RELAY_PORT           (default 8080)
//   DISCORD_CHANNEL_IDS  (optional) comma-separated channel IDs where EVERY
//                        message is a prompt (no @-mention needed). Default off.

const http = require('http');
const { Client, GatewayIntentBits, ChannelType, ActivityType, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');

// Welcome card image rendering (@napi-rs/canvas, prebuilt — no native build).
// If it cannot load, the bot falls back to a rich embed for join cards.
let CanvasLib = null;
try { CanvasLib = require('@napi-rs/canvas'); } catch (e) { CanvasLib = null; }

const TOKEN = process.env.DISCORD_TOKEN || '';
const RELAY_PORT = parseInt(process.env.RELAY_PORT || '8080', 10);
const DEDICATED_CHANNELS = (process.env.DISCORD_CHANNEL_IDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const RESULT_POLL_MS = 2000;
const STILL_WORKING_MS = 5 * 60 * 1000;   // 5 min: send a "still working" note once
const RESULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min: give up on a reply
const JOB_TTL_MS = 35 * 60 * 1000;
const LOGIN_RETRY_MS = 30000;

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- relay ---
const jobs = new Map(); // jobId -> job
const queue = [];       // jobIds in arrival order
let seq = 0;

function newJob(userId, userName, channelId, guildId, text, source) {
  const jobId = 'job-' + Date.now().toString(36) + '-' + (++seq);
  const job = { jobId, userId, userName, channelId, guildId, text, source,
    status: 'queued', reply: '', createdAt: Date.now() };
  jobs.set(jobId, job);
  queue.push(jobId);
  return job;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > limit) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

const relay = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') {
      let queued = 0, claimed = 0, done = 0;
      for (const j of jobs.values()) { if (j.status === 'queued') queued++; else if (j.status === 'claimed') claimed++; else if (j.status === 'done') done++; }
      return send(200, { ok: true, queued, claimed, done, uptimeSec: Math.floor(process.uptime()) });
    }
    if (req.method === 'POST' && url.pathname === '/enqueue') {
      const body = JSON.parse(await readBody(req, 65536) || '{}');
      const text = String(body.text || '').slice(0, 4000).trim();
      if (!text) return send(400, { ok: false, error: 'empty text' });
      const job = newJob(String(body.userId || ''), String(body.userName || ''),
        String(body.channelId || ''),
        body.guildId ? String(body.guildId) : null, text, String(body.source || 'dm'));
      log('enqueue', job.jobId, job.source, 'user', job.userId, job.userName || '');
      return send(201, { ok: true, jobId: job.jobId });
    }
    if (req.method === 'GET' && url.pathname === '/next') {
      const id = queue.find((qid) => { const j = jobs.get(qid); return j && j.status === 'queued'; });
      if (!id) { res.writeHead(204); return res.end(); }
      const job = jobs.get(id);
      job.status = 'claimed';
      return send(200, { jobId: job.jobId, userId: job.userId, userName: job.userName,
        channelId: job.channelId,
        guildId: job.guildId, text: job.text, source: job.source });
    }
    if (req.method === 'POST' && url.pathname === '/complete') {
      const body = JSON.parse(await readBody(req, 262144) || '{}');
      const job = jobs.get(String(body.jobId || ''));
      if (!job) return send(404, { ok: false, error: 'unknown job' });
      job.status = 'done';
      job.reply = String(body.reply || '');
      log('complete', job.jobId, 'reply chars', job.reply.length);
      return send(200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/result/')) {
      const job = jobs.get(url.pathname.slice('/result/'.length));
      if (!job) return send(404, { ok: false, error: 'unknown job' });
      return send(200, { ok: true, status: job.status, reply: job.status === 'done' ? job.reply : '' });
    }
    return send(404, { ok: false, error: 'not found' });
  } catch (e) {
    log('relay error', e.message);
    try { send(500, { ok: false, error: 'relay error' }); } catch (_) {}
  }
});

relay.listen(RELAY_PORT, '127.0.0.1', () => {
  log('relay listening on 127.0.0.1:' + RELAY_PORT);
  log('welcome card: ' + (CanvasLib ? 'image (canvas)' : 'embed fallback (canvas unavailable)'));
  if (!TOKEN) {
    log('FATAL: DISCORD_TOKEN is empty — set it in /home/ubuntu/redcat-gateway/.env and restart the service.');
    process.exit(1);
  }
  loginLoop();
});

// Expire old jobs so memory stays flat on a 1GB box.
setInterval(() => {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.createdAt > JOB_TTL_MS) { jobs.delete(id); const qi = queue.indexOf(id); if (qi >= 0) queue.splice(qi, 1); }
  }
}, 5 * 60 * 1000);

// ------------------------------------------------------------------ bot ---
function splitMessage(text, max) {
  const chunks = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.length ? chunks : ['(khaali jawab)'];
}

async function relayJson(path, method, body) {
  const r = await fetch('http://127.0.0.1:' + RELAY_PORT + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error('relay ' + r.status);
  return r.json();
}

async function waitForReply(jobId, channel) {
  const started = Date.now();
  let warned = false;
  for (;;) {
    let st;
    try { st = await relayJson('/result/' + jobId, 'GET'); }
    catch (e) { await new Promise((r) => setTimeout(r, RESULT_POLL_MS)); continue; }
    if (st && st.status === 'done') return st.reply || '';
    if (!warned && Date.now() - started > STILL_WORKING_MS) {
      warned = true;
      try { await channel.send('Working on your reply — I will send it as soon as it is ready.'); } catch (_) {}
    }
    if (Date.now() - started > RESULT_TIMEOUT_MS) return null;
    await new Promise((r) => setTimeout(r, RESULT_POLL_MS));
  }
}

// ------------------------------------------------------- welcome card ---
// Premium welcome card for new members joining the server, posted in the
// #welcome channel (found by name). Image card first (canvas); if the image
// cannot be built or sent, falls back to a rich embed. Never fakes data:
// the avatar, name and member count all come from the real member object.
async function buildWelcomeCard(member, name, count) {
  if (!CanvasLib) return null;
  const { createCanvas, loadImage } = CanvasLib;
  const W = 1200, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#15151a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, H - 10, W, 10);
  const ax = 140, ay = H / 2, ar = 95;
  let avatar = null;
  try {
    const url = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('avatar status ' + r.status);
    avatar = await loadImage(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    log('welcome avatar fetch failed', e.message);
    avatar = null;
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
  } else {
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 100px "DejaVu Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name || '?').slice(0, 1).toUpperCase(), ax, ay + 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.strokeStyle = '#e5484d';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 4, 0, Math.PI * 2);
  ctx.stroke();
  const displayName = String(name || 'friend').slice(0, 24);
  const maxTextW = W - 280 - 40;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px "DejaVu Sans", sans-serif';
  ctx.fillText('Welcome to RedCat', 280, 150);
  let nameSize = 56;
  ctx.font = 'bold ' + nameSize + 'px "DejaVu Sans", sans-serif';
  while (nameSize > 30 && ctx.measureText(displayName).width > maxTextW) {
    nameSize -= 4;
    ctx.font = 'bold ' + nameSize + 'px "DejaVu Sans", sans-serif';
  }
  ctx.fillStyle = '#e5484d';
  ctx.fillText(displayName, 280, 230);
  ctx.fillStyle = '#b0b0b8';
  ctx.font = '36px "DejaVu Sans", sans-serif';
  ctx.fillText('You are member #' + count, 280, 300);
  return canvas.encode('png');
}

async function sendWelcomeCard(member) {
  const guild = member.guild;
  let channel = null;
  try {
    const channels = await guild.channels.fetch();
    for (const [, ch] of channels) {
      if (ch && ch.type === ChannelType.GuildText && ch.name && ch.name.toLowerCase().includes('welcome')) { channel = ch; break; }
    }
  } catch (e) {
    log('welcome channel lookup failed', e.message);
  }
  if (!channel) {
    log('welcome card skipped: no #welcome channel found in guild', guild.id);
    return;
  }
  const count = guild.memberCount || 0;
  const name = member.displayName || (member.user && member.user.username) || 'friend';
  const mention = member.user ? '<@' + member.user.id + '>' : '';
  let image = null;
  try {
    image = await buildWelcomeCard(member, name, count);
  } catch (e) {
    log('welcome card build failed', e.message);
    image = null;
  }
  try {
    if (image) {
      const file = new AttachmentBuilder(image, { name: 'welcome.png' });
      await channel.send({ content: mention, files: [file] });
      log('welcome card posted (image) for', member.user.id, 'in', channel.id);
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xe5484d)
        .setTitle('Welcome to RedCat!')
        .setDescription('Welcome, ' + name + ' — we are glad you are here.')
        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
        .setFooter({ text: 'You are member #' + count });
      await channel.send({ content: mention, embeds: [embed] });
      log('welcome card posted (embed) for', member.user.id, 'in', channel.id);
    }
  } catch (e) {
    log('welcome card send failed', e.message);
  }
}

let currentClient = null;

function createBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent, // privileged: must be ON in Portal (Bot -> Privileged Gateway Intents)
      // GuildMembers INTENT REMOVED (2026-11-05): the bot must stay online.
      // It needs the Portal toggle (Server Members Intent) to log in with it,
      // and until that toggle is done the bot would stay offline. The welcome
      // card handler is still in the code below — to turn it on later: turn ON
      // Server Members Intent in the Portal, re-add
      // GatewayIntentBits.GuildMembers here, redeploy, restart.
    ],
    // Partials.Channel is REQUIRED for DM messageCreate events: DM channels
    // are not cached, so without it the bot never sees DM messages at all.
    partials: [Partials.Channel],
  });
  currentClient = client;

  client.once('ready', () => {
    log('Logged in as ' + client.user.tag + ' (' + client.user.id + ')');
    try { client.user.setActivity('DMs and @mentions', { type: ActivityType.Listening }); } catch (_) {}
  });

  const seenMessages = new Set();
  client.on('messageCreate', async (msg) => {
    try {
      if (msg.author.bot) return;
      if (seenMessages.has(msg.id)) return;
      seenMessages.add(msg.id);
      if (seenMessages.size > 5000) { const first = seenMessages.values().next().value; seenMessages.delete(first); }

      const isDM = msg.channel.type === ChannelType.DM;
      const mentioned = msg.mentions.has(client.user);
      const dedicated = !!msg.guildId && DEDICATED_CHANNELS.includes(msg.channelId);
      if (!isDM && !mentioned && !dedicated) return;

      const source = isDM ? 'dm' : (mentioned ? 'mention' : 'channel');
      let text = msg.content || '';
      if (mentioned) text = text.replace(/<@!?\d+>/g, '').trim();

      if (!text) {
        // No content arrived: almost always the Message Content intent is off.
        log('empty content from', msg.author.id, 'source', source, '- Message Content intent may be OFF in the Portal');
        try {
          await msg.channel.send('I cannot see your message — turn ON the bot\'s "Message Content Intent" in the Discord Portal (Bot -> Privileged Gateway Intents).');
        } catch (_) {}
        return;
      }

      let job;
      try {
        job = await relayJson('/enqueue', 'POST', {
          userId: msg.author.id, userName: msg.author.username || '',
          channelId: msg.channel.id,
          guildId: msg.guildId || null, text, source,
        });
      } catch (e) {
        log('enqueue failed', e.message);
        try { await msg.channel.send('Cannot reach the relay — check the poller and tunnel on the PC, then send it again.'); } catch (_) {}
        return;
      }

      try { await msg.channel.sendTyping(); } catch (_) {}
      const reply = await waitForReply(job.jobId, msg.channel);
      if (reply === null) {
        try { await msg.channel.send('No reply from the PC in 30 minutes — is the PC on and the poller running? Send it again.'); } catch (_) {}
        return;
      }
      for (const chunk of splitMessage(reply, 1900)) {
        try { await msg.channel.send(chunk); } catch (e) { log('discord send failed', e.message); break; }
      }
    } catch (e) {
      log('messageCreate error', e.message);
    }
  });

  // Welcome card: when a member joins, post the premium card in #welcome.
  // Needs the GuildMembers intent (Portal: Server Members Intent).
  client.on('guildMemberAdd', async (member) => {
    try {
      if (member.user && member.user.bot) return; // do not welcome bots
      await sendWelcomeCard(member);
    } catch (e) {
      log('guildMemberAdd error', e.message);
    }
  });

  client.on('error', (e) => log('discord client error', e.message));
  client.on('shardError', (e) => log('discord shard error', e.message));
  return client;
}

// Login retries in-process (relay stays up the whole time). A failed login
// (e.g. disallowed intents) no longer kills the process or wipes the queue.
async function loginLoop() {
  for (;;) {
    const bot = createBot();
    try {
      await bot.login(TOKEN);
      log('Discord login ok — bot is connected.');
      return;
    } catch (e) {
      log('Discord login failed:', e.message);
      log('If this says "disallowed intents", turn ON Message Content Intent in the Discord Portal (Bot -> Privileged Gateway Intents). Retrying in 30s — the relay stays up.');
      try { bot.destroy(); } catch (_) {}
      await new Promise((r) => setTimeout(r, LOGIN_RETRY_MS));
    }
  }
}

process.on('SIGTERM', () => { try { if (currentClient) currentClient.destroy(); } catch (_) {} process.exit(0); });
process.on('SIGINT', () => { try { if (currentClient) currentClient.destroy(); } catch (_) {} process.exit(0); });
