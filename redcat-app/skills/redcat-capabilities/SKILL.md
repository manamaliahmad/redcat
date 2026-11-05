# RedCat capabilities and connections

description: When the user asks what RedCat can do, what it can connect to, or how to connect it to any platform (Discord, Telegram, Slack, GitHub, Gmail, Notion, or any other service), read this skill first and answer from it — never guess a connection from general knowledge.

## How to answer a connection question

1. Read this skill, find the platform below, and state its REAL status first:
   works now, needs user setup, or not built yet.
2. Give the exact next step for that status. No vague "we can build a
   script" answers when a built-in path already exists.
3. If a platform is not listed here, say its status is unknown, and check
   the app's Social panel, Connectors panel, or the project's
   `social-config.json` file before answering. Never invent a connection.
4. Never ask the user for a token, password, or API key in chat, and never
   repeat or store one in chat, code, or a site folder. Tokens go only to
   the PC's `social-config.json` file or the browser's localStorage,
   through the app's own Connect/Authorize flows.

## Built-in capabilities (no setup needed)

- Chat and agent work: the agent plans first, then uses tools — terminal,
  browser read, browser control (Playwright), web search, deep read,
  memory, schedules, and subagents for multi-part tasks. Approval-first:
  every write, send, or delete asks the user before it runs.
- Slash commands (no API key needed): `/qr`, `/resize`, `/rembg`,
  `/scrape`, `/research`. For `/rembg` and `/resize`, attach an image
  first with the + button.
- Attachments: any file type — the + button (Photos & files), a whole
  folder, paste, or drag & drop onto the app. Limits: max 10 attachments
  per message, 50 MB per file, 200 MB total. The agent gets file paths;
  text files can be read with the terminal tool. The model does NOT see
  image pixels, only filenames and paths.
- Websites: the world-class-website skill builds world-class sites
  (direction first, verify loop, optional guided Cloudflare Pages go-live).
- Videos: the topic-to-video skill (script approval first, then voice,
  then video) and the motion-video skill.
- Memory: dated notes the agent never forgets unless the user asks it to
  forget; forgetting stops search and injection but the dated files stay
  on disk.
- Browser panel: read a page (title, text, screenshot) without leaving
  the app. Login, sign-in, checkout, and payment are blocked there.
- Skills themselves: the agent learns new procedures as skills
  (skill_save), always approval-gated.

## Social connections (each needs user setup)

### Discord — shared RedCat bot, one-click Connect

- Discord is connected through the shared RedCat bot — the user does NOT
  create a bot, does NOT open the Developer Portal, and NEVER pastes a
  bot token. The bot is already set up; the user only authorizes it.
- When the user asks how to connect Discord, your reply MUST end with
  this exact line, alone on its own line, with nothing else on that line:
  [CONNECT:mcp:discord]
  The app turns that line into a real Connect button. Write the
  explanation first, then that marker line last. Your explanation MUST
  include these three sentences: (1) "Click Connect, sign in with
  Discord, and authorize — the RedCat bot appears in your Discord and
  you chat with it in a direct message (DM)." (2) "The bot is shared
  and already set up — no token, no app, no Developer Portal work is
  needed." (3) "You and the PC do NOT need to be on the same network —
  from anywhere, just the PC needs to be ON, and you can command it
  through Discord."
- Then explain in plain English: (1) Click Connect, sign in with
  Discord, and authorize — the RedCat bot appears in your Discord, and
  you send it a message in a direct message (DM) and get the reply
  there. (2) The bot is shared and already set up — no token, no app,
  no Developer Portal work is needed from you. (3) You and the PC do
  NOT need to be on the same network — from anywhere, just the PC needs
  to be ON, and you can command it through Discord. (4) The reply also
  appears in the RedCat desktop app as a "Discord — <name>" chat, so
  the same conversation has two faces: the DM and the desktop.
- The bot's own API key never leaves the PC — only your prompt and the
  reply travel to Discord. Approvals still wait on the PC: if a task
  needs approval, the bot tells you to approve it on the PC.
- Never ask the user to create a Discord app or bot, enable an intent,
  or paste a token — that was the old own-app flow and it is gone.

### Telegram — built-in, needs the user's bot

- The user creates a bot with BotFather, puts its token into
  `social-config.json`, and pairs their own chat with the `/start`
  pairing code. One bot owned by the user; one pairing code per user.

### Slack — built-in, needs the user's app

- The user creates a Slack app with Socket Mode, puts the `xapp-` token
  and the owner's member ID into `social-config.json`. Owner-only, same
  manual-send rule as Discord: no model auto-reply.

### GitHub — Social panel test

- Connect with a classic personal access token (read:user) through the
  Social panel's test. After the test passes, the token stays in the
  browser's localStorage. A GitHub OAuth app is NOT registered yet, so
  do not promise one-click GitHub OAuth.

### Gmail — NOT working yet, do not promise it

- Gmail shows an OAuth-pending card only: no token input, no Authorize
  button. The Google sign-in (OAuth) flow code is NOT built yet, and no
  Google client ID exists for RedCat. Never claim Gmail sending or
  reading works. The honest answer is: OAuth app + flow code are future
  work; email outreach stays blocked until then.

### Notion — Social panel test

- Connect with an Internal Integration token through the Social panel's
  test. After the test passes, the token stays in the browser's
  localStorage.

### WhatsApp — NOT a RedCat channel

- Never offer WhatsApp as a RedCat channel. The user rejected it for
  sensitivity reasons. WhatsApp is only the user's channel to Muse.

## Direct-token connectors (Connectors panel)

These 20 platforms connect through the Connectors panel: the user enters
a key, the server verifies it against the provider's own read-only
verify API, and only on success is the token saved in the browser's
localStorage and the item moved to Connected. On failure the item stays
Available — never fake Connected.

GitLab, Cloudflare, Vercel, Netlify, Railway, Render, Fly.io,
DigitalOcean, Supabase, Neon, Turso, PlanetScale, Resend, SendGrid,
Twilio, Hugging Face, Replicate, Sentry, Linear, npm.

## Not-yet connectors (no Authorize button, with the reason)

- AWS: needs SigV4 signing, not a plain key check.
- Firebase: needs a service-account file, not a key.
- MongoDB Atlas: needs Digest auth, not a plain key check.
- Upstash: keys are per-database (a URL plus a token), not one account key.
- PyPI: upload-only verification, no read-only check exists.

## Browser connection — built-in, never disconnects

The Browser is built into RedCat. Its remove button does not exist
because it can never disconnect.

## What RedCat cannot do (never claim these)

- No WhatsApp channel (see above).
- No Gmail send or read until the OAuth flow is built.
- No Slack auto-reply (manual send only). Discord DOES reply in DMs through the shared RedCat bot.
- No auto-posting or auto-publishing anywhere without the user's
  explicit yes.
- No seeing image pixels (see Attachments above).
- No training its own frontier brain: RedCat runs provider models
  (by API key) or local models (via Ollama). Renting a GPU hosts a
  model; it does not create a proprietary brain like ChatGPT's.
- No skipping approval: approval-first and the safety hardblock live in
  the engine, not in skills. No skill and no prompt can override them.

## Customization by prompt (the user customizes RedCat itself)

The user CAN change RedCat's behaviour by prompting it, two ways:

1. A new skill: the user asks for a new capability or procedure, the
   agent drafts the skill, shows it, and installs it through skill_save
   ONLY after the user's approval.
2. A standing rule: the user states a lasting preference or constraint,
   and the agent records it as a prospective rule (RULES.md).

What prompting can never change: approval-first, the safety hardblock,
and per-user data isolation. If the user asks to disable approval or
safety, refuse and explain that those live in the engine, not in skills.

## Verification (how the agent answers)

When answering a connection question, the reply must name: (1) the
connection, (2) its status from this skill (works now / needs setup /
not built), (3) the exact next step. If the status is not in this
skill, say so plainly and check the Social panel, the Connectors panel,
or `social-config.json` — never fill the gap with a guess.
