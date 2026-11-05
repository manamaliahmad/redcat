#!/usr/bin/env bash
# RedCat Discord gateway — VM setup. Run on the Oracle VM as ubuntu.
# Installs Node 22 LTS (if needed), installs deps, enables + starts systemd.
# The .env file (DISCORD_TOKEN) must already be at /home/ubuntu/redcat-gateway/.env
# BEFORE this script starts the service.
set -euo pipefail
cd /home/ubuntu/redcat-gateway

if [ ! -f .env ]; then
  echo "FATAL: .env missing at /home/ubuntu/redcat-gateway/.env — copy it first, then re-run."
  exit 1
fi
chmod 600 .env

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node 22 LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "node: $(node -v)  npm: $(npm -v)"

echo "Installing dependencies (discord.js)..."
npm install --omit=dev --no-audit --no-fund

echo "Installing systemd unit..."
sudo cp redcat-gateway.service /etc/systemd/system/redcat-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable redcat-gateway
sudo systemctl restart redcat-gateway
sleep 4
sudo systemctl status redcat-gateway --no-pager | head -25
echo "--- recent gateway logs ---"
sudo journalctl -u redcat-gateway --no-pager -n 30 | tail -30
