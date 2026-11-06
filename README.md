# RedCat

**RedCat is a beginner-first AI agent that runs on your own PC.** You add your own API key, and RedCat does the work for you — building websites, researching, writing, coding, and more — while asking for your approval before it takes any consequential action.

- **Website:** https://redcat.arexora.com
- **Community:** https://discord.gg/4r8NwtnFB
- **License:** MIT — see [LICENSE](LICENSE)

> RedCat is free and open source. Your chats, your memory, and your API keys stay on your PC. A new user starts from zero — no data is ever shared between users.

---

## What RedCat is

Most AI agents are built for developers. RedCat is built for everyone else. There is no terminal, no Docker, no configuration file to edit. You download the app, paste an API key, and start chatting. RedCat runs locally on your computer, and the model you choose (from your own key) does the thinking.

You stay in control. RedCat proposes, you approve. Nothing consequential happens without your say-so.

---

## How it works

RedCat is a desktop app (Electron) with a local server on your PC. When you open the app, the main process (`main.js`) starts the local server (`server.js`) on a free port and opens the app window against it. The server is the agent: it holds your chats, your memory, your skills, and your connectors, and it talks to the AI model using your API key.

The agent works in a loop:

1. **Understand.** The model receives your message, plus your memory (preferences, past work, standing rules) and the list of skills and tools it has.
2. **Act.** The model replies with one step at a time, as JSON — either a tool call (`{thought, tool, args}`) or a final answer (`{thought, final}`). The server runs the tool and hands the real result back to the model.
3. **Verify.** The agent checks the result against real output (a file, a page, a command result) before it reports back. It does not invent facts.
4. **Approve.** Anything consequential — running a command, changing a file, posting somewhere, installing something — waits for your approval. You allow it, or you reject it and the work stops.
5. **Remember.** After a run, the agent writes what it learned about you and what it did into its local memory, so the next run starts smarter.

Your chats are stored on disk as one JSON file per chat, with a persistent record of the chats you deleted (so a deleted chat never comes back). Your API key is read from Settings on your PC and sent only to the provider you chose. The Discord bot, the browser panel, and the MCP connectors all go through this same local server — nothing bypasses it.

---

## Features

### Agent + tools

RedCat works in a loop: it understands your request, breaks it into steps, calls the right tools, verifies the result against real output, and reports back. It does not invent facts — it checks them with real tool output first. If something fails, the failure is shown to you, never hidden.

### Skills

RedCat has a library of reusable skills — website building, deep research, video, code review, and more. The agent chooses the right skill for the task. Skills are plain files the agent reads and applies, so new skills can be added and reviewed before they are used.

### Memory — it remembers, and it gets better

RedCat remembers what it did for you and what you prefer, and it updates its own memory automatically. Your preferences, your corrections, and your past work are all there the next time you open the app. This is the feature RedCat is built around: every run makes the next one better.

### Personality — it learns how you talk

RedCat builds a style profile from how you actually talk — your language, your tone, your sentence length — and adapts its replies to match. You can view and edit the profile, turn style-mirroring off, or reset it at any time in Settings.

### Discord — chat with RedCat from Discord

Connect RedCat to Discord once, then chat with it from a Discord DM or your server. The bot answers in the language you write in. Approvals still wait on your PC. Your API key never leaves your PC — only the prompt and the reply travel to Discord.

### Browser panel

RedCat has a built-in browser it can use to read live pages, research a topic, and — only with your approval — interact with a website. You log in to sites yourself in the panel; RedCat never sees your password.

### MCP + connectors — one-click Connect

RedCat connects to a catalog of 145 services — Notion, GitHub, Slack, Linear, and many more. Where the service supports it, you click Connect, sign in, and allow — that is all. Services that need manual setup stay guided, step by step. RedCat never shows a fake Connect button.

### Research — real sources, then a website

Ask RedCat to research something and it searches the web, reads the actual pages in its browser panel, cross-checks two or more independent sources, and answers with the evidence and the source names. It never invents a source, a number, or a quote. At the end of a big task, it builds you a clean, minimal website artifact containing all the findings and all the sources, with links.

### Video loading card

When the app opens, a short muted looping video plays on a loading card with a real loading bar tied to the actual startup stages — server starting, connecting, ready. There is no fake delay. If the server is already up, the app opens immediately.

### Auto-updates

RedCat checks GitHub Releases for a newer version and notifies you. A download starts only after you accept it. The update check is silent when it fails, so the app keeps working.

### Local-first privacy

Your chats, your memory, your personality profile, and your API keys live on your PC and nowhere else. There is no central server that stores your data. A fresh install starts completely empty. When you install RedCat, you get a clean app — never someone else's data.

### Approval-first security

RedCat asks before it acts. Running a command, changing a file, posting somewhere, or installing something all wait for your approval. You can reject any action, and a rejection stops the work — it is never retried silently. API keys and tokens are kept on your PC and never written into code, chat, or logs.

---

## Install

Download RedCat from the [Releases page](https://github.com/manamaliahmad/redcat/releases) and choose the installer for your platform:

| Platform | Installer |
|----------|-----------|
| Windows | `RedCat-Setup-1.0.2.exe` |
| macOS | `RedCat-1.0.2-arm64.dmg` |
| Linux | `RedCat-1.0.2.AppImage` or `redcat_1.0.2_amd64.deb` |

macOS and Linux builds are produced automatically by GitHub Actions on each release and attached to the same release.

**System requirements:** Windows 10 or later, macOS, or a modern Linux distribution. No terminal, no Docker, no extra setup.

---

## Use

1. **Install** RedCat from the Releases page.
2. **Add your API key.** Open Settings, pick a provider (for example OpenRouter, Gemini, DeepSeek, Groq, Claude, or OpenAI), pick a model, and paste your key. Your key is stored only on your PC. Free options exist — for example, OpenRouter offers free models.
3. **Chat.** Type what you want in the app, or DM the RedCat bot on Discord. RedCat will work through the task step by step.
4. **Approve.** When RedCat proposes a consequential action, an approval card appears. Allow it to continue, or reject it to stop.

That is all. Download, add a key, use.

---

## Build your own — extend RedCat

RedCat is MIT-licensed and built to be extended. The pieces are plain files, not hidden machinery, so you can read them, change them, and build your own agent or features on top.

### Add a skill

A skill is a plain Markdown file under `skills/` that tells the agent when to use it and how. Create a folder `skills/<your-skill>/` with a `SKILL.md` describing the task, the steps, and the tools to use. The agent reads the skill and applies it when the task matches. Skills are reviewed before they are used — a scan gate returns BLOCK, REVIEW, or ALLOW — so a skill you add is checked before the agent trusts it.

### Add a connector (MCP)

Connectors live in `mcp.js` with the catalog in `mcp-catalog.json`. A connector entry describes a remote MCP server: its URL, how to connect (OAuth with Dynamic Client Registration where the vendor supports it, an API key, or anonymous access), and the tools it exposes. Add an entry, restart, and the service appears on the Connectors page with a real Connect button. Services that need manual setup stay guided — never a fake one-click.

### Add a tool to the agent loop

The agent loop is in `server.js`. A tool is a function the server can run and a name the model can call in its JSON (`{thought, tool, args}`). Add the tool, list it in the model's tool inventory, and the model can call it. Keep tools small, verifiable, and approval-gated when they change anything outside the app.

### Change the agent's character

The agent's personality is defined in `character.md` — the tone it uses, how sharp or playful it is, and the hard rules it never breaks (for example, it never does illegal work and never helps the user do wrong work). Edit that file to change how the agent speaks. The safety rules are separate from the character and are not overridden by it.

### Run from source and build

```bash
npm install
npm run dist-win     # Windows installer (NSIS)
```

The macOS and Linux builds are produced by the GitHub Actions workflow in `.github/workflows/build.yml` on each release. To run the server directly for development, start `server.js` with Node and open the app against it — the app window loads from the local server, so a code change to the server is a restart away.

---

## Contribute

Contributions are open to everyone. Fork the repo, create a branch, and submit a pull request. Every pull request is merged **only after the maintainer reviews and approves it** — there is no auto-merge and no merge without approval. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## License

RedCat is released under the MIT License. See [LICENSE](LICENSE) for the full text.

---

<p align="center">
  <img src="bannerimage.png" alt="RedCat — your AI agent" width="640">
</p>
