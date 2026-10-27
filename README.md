# RedCat — Your desktop cat that actually works

![RedCat logo](assets/logo.jpg)

RedCat is a free, open-source desktop companion. A cute red cat lives on your
desktop, chats with you, and — with your approval — actually does things on
your PC: runs terminal commands, opens apps, organizes files, and connects to
your Gmail and other everyday tools.

**Local-first. BYOK. No server of ours in the middle.**

- You bring your own API key (OpenAI-compatible endpoint, or a local model
  via Ollama). Your key is stored in your OS keychain, never in a file, never
  sent anywhere except the AI endpoint you chose.
- Everything runs on your PC. Commands run locally, with an approval card for
  anything that writes, deletes, or changes state.
- Default language: English. Talk to RedCat in any language and it answers in
  that language.
- Website (coming soon): https://redcat.arexora.com

## What v0.3 does

Everything in v0.2, plus:

- **Tool catalog — one click, no commands.** Verified servers only, built
  into the Connect tab: Files, Memory, Time, Thinking, Web search (Brave),
  Browser (Microsoft's Playwright MCP), Notion, GitHub, Zapier. A non-tech
  user enables one with a button — no JSON config, no command line. Nothing
  here is fake: the GitHub entry is honestly labeled as the archived
  reference server (it still runs; the maintained successor needs Docker).
- **Sessions — everything gets its own.** Every MCP server runs as its own
  long-lived session: its own process, its own state, started/stopped from
  the catalog. A crash in one server touches nothing else. Chats are
  sessions too: switch between conversations, each keeps its own history.
  Remote servers (Zapier) keep their own session id.
- **Agent mode — reasoning + tool use.** Turn Agent mode on in chat and the
  model thinks step by step (💭 shown), calls read-only tools itself
  (inbox, files, web, browser reads), and STOPS at anything that writes:
  a send, a delete, a click that submits — that comes back as a proposal
  on an approval card. Nothing writes without your yes. The agent loop
  works with any model (JSON actions, no vendor lock-in).
- **Browser use.** The Browser catalog entry lets the model drive a real
  browser: open pages, read content, fill forms, screenshot. The window
  stays visible, so you watch it work.
- **Remote MCP (Streamable HTTP).** Zapier MCP connects by URL — 9,000+
  apps, 30,000+ actions as tools you pick at mcp.zapier.com. That pool
  alone crosses 100+ tools the moment you connect a few apps.

## What v0.2 does

Everything in v0.1, plus:

- **Pipelines** — multi-step agent workflows. Built-ins: Morning briefing
  (inbox → summary) and Inbox zero digest. Build your own: steps chain with
  `{{prev}}` (previous step's output feeds the next). Running a pipeline is
  your approval for its steps; the blocklist still refuses destructive
  commands.
- **MCP servers (the universal connector)** — add any MCP server by command
  (stdio) and RedCat lists + calls its tools. One integration opens 100+
  tools: Zapier MCP, Notion, GitHub, Slack, and every other MCP server —
  no per-service code needed.
- **Claude provider** — pick OpenAI-compatible or Claude (Anthropic) in
  Settings. Claude key is stored separately in the OS keychain.
- **Zapier** — trigger any Zap from a webhook URL, from chat or a pipeline.
- **Connector catalog** — Gmail (OAuth), Zapier, MCP, plus Calendar, Drive,
  GitHub, Slack, Notion slots (native OAuth in v0.3; MCP covers most of them
  today).

## What v0.1 did

- Floating red-cat pet window (transparent, always on top, draggable),
  with blink, idle, thinking, working, and happy states
- Chat window: talk to the cat, ask it to run things
- Safe terminal: read-only commands run instantly; write/delete commands
  show an approval card first; dangerous commands are blocklisted
- BYOK settings: endpoint, model, key (keychain-stored)
- Connectors screen: Gmail via your own Google OAuth client (desktop/PKCE
  flow), plus Calendar, Drive, and GitHub slots ready for v0.2
- System tray icon: show/hide pet, open chat, quit

## Quick start (Windows, macOS, Linux)

Prerequisites (one-time, free): [Node.js 20+](https://nodejs.org) and
[Rust](https://rustup.rs) (via rustup).

- **Windows:** WebView2 is already included in Windows 10/11.
- **macOS:** install Xcode Command Line Tools once:
  `xcode-select --install`.
- **Linux:** install the Tauri system dependencies first (see the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)) —
  on Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev
  librsvg2-dev patchelf`.

Then, on any OS:

```sh
npm install
npm run tauri dev      # run the app in development
npm run tauri build    # build: .exe (Windows), .dmg/.app (macOS),
                       # .deb/.AppImage (Linux) -> src-tauri/target/release/
```

## Downloads

Every tagged release (`v0.1.0`, …) automatically builds all three
platforms via GitHub Actions — Windows `.exe`, macOS `.dmg` (Apple
Silicon), and Linux binaries — see `.github/workflows/build.yml`.
Download from the repo's **Releases** page, or from
https://redcat.arexora.com when the site is live.

> Note: early builds are unsigned, so Windows SmartScreen will show an
> "Unknown publisher" prompt (click "More info" → "Run anyway"), and macOS
> Gatekeeper will block the first open (right-click the app → "Open").
> Code signing + notarization are planned once the project has users.

## Safety model (the whole point)

1. The agent can **read** freely (list files, check status, read logs).
2. Anything that **writes, deletes, installs, or sends** shows you an
   approval card with the exact command. Nothing runs until you say yes.
3. A blocklist refuses destructive patterns outright (`rm -rf /`,
   `format`, `mkfs`, `del /s`, …) even if approved by mistake.
4. Your API key and Gmail tokens live in the OS keychain, not in config
   files, not in chat logs.
5. The agent only talks to the endpoint you configured. No telemetry, no
   analytics, no account.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the agent loop, the approval
system, and the roadmap.

## Project layout

```
src/                 # Frontend: pet, chat, connectors, settings (plain HTML/CSS/JS)
src-tauri/           # Rust backend: windows, tray, safe shell, keychain, Gmail OAuth
  src/main.rs        # All backend commands
  tauri.conf.json    # App config: main window + transparent pet window
.github/workflows/   # CI: builds Windows .exe + Linux binary on every release tag
```

## License

MIT. See LICENSE.
