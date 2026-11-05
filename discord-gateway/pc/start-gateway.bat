@echo off
REM RedCat Discord gateway - PC side. Double-click to start the poller.
REM It keeps the SSH tunnel to the Oracle VM up and relays Discord prompts
REM to the RedCat agent on this PC. Keep this window open; Ctrl+C to stop.
cd /d C:\Users\HOME\redcat-discord-gateway
node poller.js
pause
