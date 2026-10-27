# RedCat architecture

## The idea in one line

A pet with hands: the cuteness of a desktop companion, the capability of a
local AI agent, the safety of an approval-first design.

## Agent loop (v0.1)

```
User message
  -> intent router (local, no AI call needed for simple cases):
       "open X" / "run ..." / "list ..."  -> tool proposal
       anything else                      -> chat completion
  -> if the proposal writes/deletes/sends: show approval card, wait
  -> execute locally (Rust backend, std::process, 30s timeout)
  -> result returns to chat as a message, pet reacts (working -> happy)
```

v0.2 upgrades the router to real tool-calling: the model receives a tool
schema (run_command, open_app, read_file, gmail_search, gmail_send) and its
tool calls go through the same approval gate. The approval gate never moves
— it sits between the model and the OS, not inside the prompt.

## Safety model

| Action class | Behavior |
|---|---|
| Read-only shell (dir, ls, echo, git status, ipconfig, …) | Runs immediately, output shown |
| Write / delete / install / network-send | Approval card with the exact command |
| Blocklisted patterns (rm -rf /, format, mkfs, del /s /q, shutdown, …) | Refused outright, even if the user clicked approve before |
| API key, Gmail tokens | OS keychain only (`keyring` crate); the frontend never sees them |

Why this matters: the biggest open-source agents in this space (OpenClaw,
Hermes) all had security scares from over-broad permissions. RedCat's
differentiator is not more power — it is power with a visible leash.

## Connectors

- **Gmail (v0.1, real):** desktop OAuth (PKCE) with the user's *own* Google
  Cloud client ID — the BYOK philosophy applied to Google. Flow: app builds
  the auth URL → user signs in in their browser → pastes the code back →
  backend exchanges it (PKCE, no client secret on disk) → tokens in the
  keychain → `gmail_list` reads the inbox. Scopes are read-only by default;
  send scope is a separate, explicit opt-in.
- **Calendar, Drive, GitHub (v0.2):** same pattern — user's own OAuth app,
  tokens in keychain, read first, write behind approval.
- **Local models (v0.2):** Ollama endpoint option, so the whole loop can
  run with no cloud call at all.

## Windows

- Main window: chat + connectors + settings (900×640).
- Pet window: transparent, frameless, always-on-top, 140×140, draggable,
  skipped from the taskbar. The system tray icon is the taskbar presence
  (Windows does not allow live widgets inside the taskbar itself).
- First target is Windows (the primary user base). The same Tauri codebase
  builds for macOS and Linux with no frontend changes.

## Website

`redcat.arexora.com` (Cloudflare Pages, free): landing page + download
buttons. The `.exe` itself is served from GitHub Releases (primary) with a
Cloudflare R2 mirror (free egress). DNS: CNAME `redcat` → the Pages
project domain.

## Roadmap

- **v0.1 (shipped scaffold):** pet + tray + chat + BYOK + safe terminal +
  Gmail connect. Foundation, not a demo — every command is real.
- **v0.2:** pipelines, MCP client (stdio), Claude provider,
  Zapier webhook triggers, connector catalog. Design untouched by request —
  functionality first, design direction comes from the owner at the end.
- **v0.3 (this version):** verified tool catalog (one-click, non-tech),
  per-server sessions, agent reasoning loop with approval-gated writes,
  remote MCP (Streamable HTTP) for Zapier, chat sessions, Playwright
  browser use.
- **v0.4:** native Calendar/Drive/GitHub/Slack/Notion OAuth, persistent
  MCP processes for stateful servers (done in v0.3 for stdio), visual
  pipeline builder (no JSON), Claude Code CLI login option, native
  function-calling for models that support it, signed installer,
  auto-updates.

## Research findings (merged 2026-10-27 — OpenMausBot, Hermes Agent, OpenClaw)

Studied from public READMEs, official docs, and architecture write-ups.
These findings shape v0.2; v0.1 already follows the safety parts.

**Steal 1 — Hermes's approval ladder.** Regex detection of dangerous
commands + modes (smart/manual/off) + once/session/always approvals + a
hardline denylist that even "yolo" cannot override + unattended-default-deny.
RedCat v0.2 adopts: the "always" choice writes to an allowlist file, and an
"approvals suggest" view mines history into allowlist proposals.

**Steal 2 — OpenClaw's tray as a live status + approval surface.** Its
menu-bar/tray icon shows what the agent is doing right now (exec/file/tool
badges) with one-click approvals. RedCat's pet should embody this: the cat's
face/bubble *is* the status indicator and the approval card — not a separate
window the user must go find. Shell allowlist entries are keyed on resolved
binary paths; narrow "safe bins" (cut/uniq/head/tail/wc) auto-run only in
stdin-only mode.

**Steal 3 — Progressive-disclosure skills + review-screen import.**
`SKILL.md` + YAML frontmatter, index-only in the prompt, full procedure on
demand, curator lifecycle (Hermes) — combined with MausBot's rule that
imported packs arrive with connections off and routines paused until the user
approves. That gives RedCat safe extensibility from day one.

**Avoid 1 — Don't delegate the brain or the keys.** MausBot outsources its
loop to vendor CLIs and its app auth to Composio (hosted broker); OpenClaw
has no built-in Gmail at all — only DIY skills and hosted wrappers. Each
handoff is a place where tokens and scope control leak out of the app.
RedCat owns its loop, does direct Google OAuth (localhost redirect, minimal
scopes: `gmail.readonly` by default, `gmail.modify` only if sending is
enabled), and stores tokens in the OS keychain — never plaintext config,
never a broker by default. (Caution from an independent MausBot review:
keys reportedly in plaintext `config.json` despite "write-only" UI claims —
hidden-from-UI is not encrypted-at-rest. RedCat does not repeat this.)

**Avoid 2 — Don't ship a cosmetic pet or an unsafe default.** Hermes's pets
prove a floating pet is loved — and that a purely decorative one wastes the
best interaction surface. OpenClaw's history (unsandboxed skills, a ClawHub
supply-chain CVE, conflicting default-approval accounts) proves "powerful by
default" becomes a security story told about you, not by you. RedCat's pet
*is* the agent (status + approvals in the bubble), skills are off-by-default
and reviewable, and there is no one-click "don't ask me again about
everything" mode.

**Gmail gap (RedCat's onboarding edge).** OpenClaw has no one-click Gmail;
Hermes routes it through its hosted Connectors gateway or MCP OAuth; MausBot
through Composio. RedCat's direct desktop OAuth (PKCE, localhost redirect,
user's own client ID) is simpler and more private than all three — keep it.

## v0.2 implementation notes

- **MCP client (`src-tauri/src/mcp.rs`):** JSON-RPC 2.0 over stdio —
  `initialize` → `notifications/initialized` → `tools/list` / `tools/call`,
  20s timeout, child killed after each call. Fresh process per call keeps
  v0.2 simple and leak-free; stateful servers (multi-turn sessions) need the
  persistent-process client planned for v0.3.
- **Pipelines:** stored in the app-data dir (`pipelines.json`); two
  built-ins ship in code. Steps: `gmail_list`, `chat`, `run_command`,
  `mcp_call`, `zapier`. `{{prev}}` substitution chains outputs. A pipeline
  run is the user's approval for its steps — but the blocklist still
  refuses destructive patterns, and `run_command` steps never bypass it.
- **Providers:** OpenAI-compatible (any endpoint + model) and Claude
  (Anthropic Messages API, fixed URL). Keys are separate keychain entries
  (`api_key`, `anthropic_api_key`); the frontend never sees either.
- **"Login with Claude", honestly scoped:** Anthropic offers no consumer
  OAuth login that substitutes for an API key, so RedCat does not fake one.
  v0.2 = Claude provider + key. A Claude Code CLI login option (reusing the
  CLI's own OAuth session, like MausBot does) is a v0.3 item if wanted.
- **Zapier:** webhook triggers today (paste a Catch Hook URL, fire it from
  chat or a pipeline) + full Zapier MCP server support through the MCP
  panel (all Zapier actions as tools, no extra code).

## v0.3 implementation notes

- **Sessions (`src-tauri/src/mcp.rs`):** one server = one `Session` — a
  long-lived child process with a writer thread, a reader thread, and a
  per-session id counter, held in a process-wide map behind a Mutex.
  `start_session` handshakes once; later calls reuse it. `stop_session`
  kills that process only. No session is ever started twice, and a dead
  server cannot poison another server's state. Remote servers keep their
  session id in a separate map (`mcp_remote.rs`) and re-initialize once on
  a 404.
- **Agent loop (`agent_run`):** JSON-action loop, max 6 steps, works with
  any model. Inventory is built live from the user's enabled servers, so
  the model only "knows" tools that really exist. Read-like tools run;
  write-like tools (name-matched: send/create/post/click/type/fill/…)
  and non-read-only shell commands return as proposals. The loop never
  executes a write. Observations are truncated to 2,000 chars per step so
  a huge tool output cannot blow up the context.
- **Remote MCP (`src-tauri/src/mcp_remote.rs`):** Streamable HTTP POSTs
  with `Accept: application/json, text/event-stream`, SSE body parsing,
  `Mcp-Session-Id` capture and replay. SSE-only endpoints are refused
  with a plain error telling the user to use the Streamable HTTP URL.
- **Catalog (`src/catalog.json`):** every entry was checked against
  live sources on 2026-10-27 before shipping. Current official reference
  servers (filesystem, memory, time, sequential-thinking) are labeled as
  such; archived ones (GitHub) are labeled as archived with their
  successor named; Brave Search uses Brave's official successor package;
  the browser entry is Microsoft's official `@playwright/mcp`; Notion is
  Notion's official `@notionhq/notion-mcp-server`; Zapier is remote-only
  (no stdio exists). No entry is invented, and no tool count is claimed
  beyond what the sources support: Playwright alone exposes a few dozen
  browser tools, Notion's server turns its whole API into tools, and
  Zapier's pool is 30,000+ actions — 100+ tools is crossed by enabling a
  few apps, not by padding the list.
