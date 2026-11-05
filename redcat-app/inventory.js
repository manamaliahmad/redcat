// inventory.js — LIVE connectors + MCP inventory for the model prompt.
// ADDITIVE ONLY, mirrors the adopt.js pattern: built fresh per model call
// from live state, never a hardcoded list in the prompt text.
//
// MCP part: mcp.catalogForUi() — live sessions + tokens file, so names,
// categories and connected/tool states are always current.
// Connector/social part: the catalogue below (source of truth for ids/names
// is public/app.js availableList + socialList — update this list if those
// change). Connected state for connectors/social CANNOT come from the
// server: their tokens live in the browser only (localStorage keys
// redcat_connector_tokens_v1 / redcat_social_tokens_v1). The chat client
// sends the currently-saved id lists with each /api/agent-chat request and
// they arrive here as connectorStates. If the client sends none, states
// read "not connected (browser state unknown)".
const mcp = require('./mcp.js');

// id, name, what — kept in the same order as the Connectors page lists.
const CONNECTORS = [
  { id: 'gitlab', name: 'GitLab', what: 'code hosting, repos, CI/CD (token)' },
  { id: 'cloudflare', name: 'Cloudflare', what: 'domains, DNS, CDN, workers (token)' },
  { id: 'vercel', name: 'Vercel', what: 'web hosting and deployments (token)' },
  { id: 'netlify', name: 'Netlify', what: 'web hosting and deployments (token)' },
  { id: 'railway', name: 'Railway', what: 'app hosting (token)' },
  { id: 'render', name: 'Render', what: 'app hosting (token)' },
  { id: 'flyio', name: 'Fly.io', what: 'app hosting (token)' },
  { id: 'digitalocean', name: 'DigitalOcean', what: 'cloud servers and apps (token)' },
  { id: 'supabase', name: 'Supabase', what: 'Postgres + auth + storage backend (token)' },
  { id: 'neon', name: 'Neon', what: 'serverless Postgres (token)' },
  { id: 'turso', name: 'Turso', what: 'edge SQLite (token)' },
  { id: 'planetscale', name: 'PlanetScale', what: 'MySQL platform (token)' },
  { id: 'mongodb', name: 'MongoDB Atlas', what: 'MongoDB cloud (authorize not available yet)' },
  { id: 'firebase', name: 'Firebase', what: 'Google app backend (authorize not available yet)' },
  { id: 'upstash', name: 'Upstash', what: 'serverless Redis/Kafka (authorize not available yet)' },
  { id: 'aws', name: 'AWS', what: 'Amazon cloud (authorize not available yet)' },
  { id: 'resend', name: 'Resend', what: 'transactional email (token)' },
  { id: 'sendgrid', name: 'SendGrid', what: 'transactional email (token)' },
  { id: 'twilio', name: 'Twilio', what: 'SMS and voice (token)' },
  { id: 'huggingface', name: 'Hugging Face', what: 'AI models and datasets (token)' },
  { id: 'replicate', name: 'Replicate', what: 'AI model runs (token)' },
  { id: 'sentry', name: 'Sentry', what: 'error tracking (token)' },
  { id: 'linear', name: 'Linear', what: 'issue tracking (token)' },
  { id: 'npm', name: 'npm', what: 'JavaScript packages (token)' },
  { id: 'pypi', name: 'PyPI', what: 'Python packages (authorize not available yet)' },
];

const SOCIAL = [
  { id: 'telegram', name: 'Telegram', what: 'BotFather bot token' },
  { id: 'slack', name: 'Slack', what: 'bot token (Slack API app)' },
  { id: 'github', name: 'GitHub', what: 'personal access token' },
  { id: 'gmail', name: 'Gmail', what: 'Google sign-in (OAuth) — not set up yet' },
  { id: 'notion', name: 'Notion', what: 'internal integration token' },
];

function buildInventoryText(connectorStates) {
  const states = connectorStates || {};
  const connOn = new Set(Array.isArray(states.connectors) ? states.connectors : []);
  const socOn = new Set(Array.isArray(states.social) ? states.social : []);
  const browserKnown = Array.isArray(states.connectors) && Array.isArray(states.social);
  let out = 'LIVE INVENTORY — every connector and MCP RedCat has right now (built fresh for this reply from the live catalog and the browser token lists; never answer from memory, always from this list):\n';
  out += 'MCP SERVERS (Connectors page, grid = one-click Connect, manual = Setup steps only, never a fake Connect button):\n';
  let servers = [];
  try { servers = mcp.catalogForUi() || []; } catch (e) { servers = []; }
  for (const s of servers) {
    const state = s.connected
      ? 'connected (' + s.toolCount + ' tools)'
      : (s.hasToken ? 'token saved, not connected' : 'not connected');
    const kind = s.tier === 1 ? 'one-click' : 'setup-required';
    out += '- ' + s.name + ' [mcp:' + s.id + '] — ' + state + ' · ' + (s.category || '') + ' · ' + kind + (s.community ? ' · community' : '') + '\n';
  }
  out += 'CONNECTORS (token cards on the Connectors page; the button opens the same authorize dialog as the page):\n';
  for (const c of CONNECTORS) {
    const state = connOn.has(c.id) ? 'connected (browser token saved)' : (browserKnown ? 'not connected' : 'not connected (browser state unknown)');
    out += '- ' + c.name + ' [connector:' + c.id + '] — ' + state + ' · ' + c.what + '\n';
  }
  out += 'SOCIAL (gateway cards on the Connectors page; the button opens the same authorize dialog as the page):\n';
  for (const c of SOCIAL) {
    const state = socOn.has(c.id) ? 'connected (browser token saved)' : (browserKnown ? 'not connected' : 'not connected (browser state unknown)');
    out += '- ' + c.name + ' [social:' + c.id + '] — ' + state + ' · ' + c.what + '\n';
  }
  out += 'RULES: (1) When the user asks what you have, answer ONLY from this list — names plus connected state, never invent an entry. '
    + '(2) When the user asks to connect one, or picks one after you list them, end your reply with one marker line per entry, exactly in this form and nothing else on that line: [CONNECT:mcp:<id>] for a one-click MCP entry, [CONNECT:connector:<id>] for a connector, [CONNECT:social:<id>] for a social entry. Use ONLY ids listed above. '
    + 'NEVER emit a marker for a setup-required (tier 2) MCP entry — for those, tell the user to open its section on the Connectors page and follow its Setup steps. '
    + 'The app turns each marker into a real button in the chat; clicking it runs the SAME Connect flow as the Connectors page (same endpoint, same OAuth sign-in + Allow by the user, one at a time). '
    + 'NEVER claim an entry is connected until the user has clicked and signed in — the button, not your words, performs the connection. '
    + 'DISCORD: Discord is the shared RedCat bot — a one-click MCP entry [mcp:discord], NOT a social token flow. When the user asks how to connect Discord, your reply MUST end with this exact line, alone on its own line, with nothing else on that line: [CONNECT:mcp:discord] — the app turns that line into a real Connect button. Write the explanation first, then that marker line last. Your explanation MUST include these three sentences: (1) "Click Connect, sign in with Discord, and authorize — the RedCat bot appears in your Discord and you chat with it in a direct message (DM)." (2) "The bot is shared and already set up — no token, no app, no Developer Portal work is needed." (3) "You and the PC do NOT need to be on the same network — from anywhere, just the PC needs to be ON, and you can command it through Discord." Never ask the user to create a Discord app or bot, enable an intent, or paste a token.\n';
  return out;
}

module.exports = { buildInventoryText, CONNECTORS, SOCIAL };
