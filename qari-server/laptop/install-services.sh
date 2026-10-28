#!/usr/bin/env bash
# Run once on the laptop: sudo bash ~/qari/systemd/install-services.sh
# Replaces the hand-started copies with three systemd services that start on boot and restart
# if they crash: qari-llama (the model), qari-gateway (limits + CORS), qari-tunnel (qari.nushud.com).
set -euo pipefail

# Stop copies started by hand during setup (the [x] trick stops pkill matching this script itself).
pkill -f "[l]lama-server -m /home/dave/qari/models" || true
pkill -f "[q]ari/gateway.py" || true
pkill -f "[c]loudflared --no-autoupdate tunnel --config /home/dave/qari/tunnel.yml" || true
sleep 2

cp /home/dave/qari/systemd/qari-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now qari-llama.service qari-gateway.service qari-tunnel.service
sleep 5
systemctl is-active qari-llama.service qari-gateway.service qari-tunnel.service
