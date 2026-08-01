#!/usr/bin/env bash
# stop_ros2_bridge.sh — professional wrapper to restore standalone bridge mode via systemd.
#
# Usage:
#   bash ~/stairbot_firmware/stop_ros2_bridge.sh
#

set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
log()  { echo -e "${GREEN}[stop_ros2_bridge]${NC} $*"; }

log "Restoring standalone bridge mode via systemd..."
sudo systemctl start stairdoc-bridge.service

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Restored to STANDALONE mode${NC} (ESP32 serial + full Socket.IO)"
echo "Check status:"
echo "  systemctl status stairdoc-bridge.service --no-pager"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
