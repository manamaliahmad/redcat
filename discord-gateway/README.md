# RedCat Discord gateway

Chat with RedCat from Discord. The bot lives in your Discord DM (and, if you invite it, your server), and every reply comes from the RedCat agent running on your own PC.

## How it works

```
Discord user  →  Discord (bot RedCat)  →  relay on a small VPS  →  SSH tunnel
→  poller on your PC  →  RedCat agent on your PC (localhost:3000)  →  reply back
```

- **The bot** (`vm/gateway.js`, discord.js) runs on a small always-free VPS under systemd (`redcat-gateway.service`). It receives DMs and @-mentions, queues them on a tiny local relay (HTTP on `127.0.0.1:8080`), and posts replies back.
- **The poller** (`pc/poller.js`, Node) runs on your PC. It keeps an SSH tunnel to the VPS, pulls queued jobs from the relay, calls the RedCat agent on your PC, and posts the reply back. It also mirrors the prompt and the reply into a Discord chat inside the RedCat desktop app.
- **Your API key never leaves your PC.** The poller reads the key from RedCat Settings on your PC and calls the provider from the PC. The VPS only ever carries text — the prompt and the reply.

## Files

| File | What it is |
|------|-----------|
| `vm/gateway.js` | The Discord bot + relay (runs on the VPS). |
| `vm/package.json` | Bot dependencies (discord.js, @napi-rs/canvas for the welcome card). |
| `vm/redcat-gateway.service` | systemd unit for the bot on the VPS. |
| `vm/setup-vm.sh` | One-time VPS setup (Node, the service, the relay). |
| `vm/test-canvas.js` | Checks the welcome-card image rendering. |
| `pc/poller.js` | The PC poller + SSH tunnel + agent calls + mirroring. |
| `pc/test-relay.js` | Checks the relay is reachable from the PC. |
| `pc/start-gateway.bat` | Starts the poller on the PC (after a reboot). |
| `pc/deploy-vm.bat` | Copies a new `gateway.js` to the VPS and restarts the service. |

## Setup (developer)

1. Create a Discord application + bot in the Discord Developer Portal, enable the **Message Content Intent**, and note the bot token and client ID.
2. On a VPS (any small Linux VM works — the reference deployment is an Oracle Always Free E2 Micro), copy `vm/` to `~/redcat-gateway/`, run `setup-vm.sh`, put the bot token in `~/redcat-gateway/.env` as `DISCORD_TOKEN=...`, and start the service.
3. On your PC, copy `pc/` somewhere (for example `C:\redcat-discord-gateway\`), set the SSH key/host in the environment or in `poller.js` defaults, and run `start-gateway.bat`.
4. Invite the bot with the OAuth2 authorize URL (`scope=bot`, permissions `117760` = View Channel + Send Messages + Read Message History + Attach Files + Embed Links). The bot joins a server via that link; a DM opens from the bot's profile.
5. Send the bot a DM. The poller picks it up, the agent on your PC answers, and the reply appears in the DM — and mirrored in the RedCat desktop app.

## Notes

- The bot's own icon is set in the Discord Developer Portal (it is not part of this code).
- The welcome card (a join card in `#welcome`) needs the **Server Members Intent** enabled in the Portal; without it the bot stays online but the card is dormant.
- The relay keeps jobs for 35 minutes; a still-working note is sent after 5 minutes. The agent timeout is 10 minutes.
- Replies follow the user's message language by real detection (Roman Urdu → Roman Urdu, English → English, Urdu script → Urdu script). All bot/platform strings are English.
- Approvals still wait on the PC. A command from Discord that needs approval shows the approval in Discord and on the PC; allowing from either approves both.

## License

MIT — see the repo root `LICENSE`.
