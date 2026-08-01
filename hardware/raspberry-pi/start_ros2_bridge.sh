#!/usr/bin/env bash
# start_ros2_bridge.sh — professional wrapper to start ROS 2 bridge services via systemd.
#
# Usage:
#   bash ~/stairbot_firmware/start_ros2_bridge.sh [mapping|localization]
#

set -euo pipefail

SLAM_MODE="${1:-mapping}"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${GREEN}[start_ros2_bridge]${NC} $*"; }
warn() { echo -e "${YELLOW}[start_ros2_bridge]${NC} ⚠  $*"; }
err()  { echo -e "${RED}[start_ros2_bridge]${NC} ✗  $*" >&2; }

if [[ "$SLAM_MODE" != "mapping" && "$SLAM_MODE" != "localization" ]]; then
  err "Unknown mode '$SLAM_MODE'. Use: mapping | localization"
  exit 1
fi

# Ensure micro_ros_agent is running
if ! pgrep -f micro_ros_agent &>/dev/null; then
  err "micro_ros_agent is not running. Please start the ROS 2 navigation stack first:"
  err "  bash ~/stairbot_firmware/start_nav.sh"
  exit 1
fi

# Write/update SLAM_MODE in the .env file if it exists
ENV_FILE="/home/spigen/stairdoc-bridge/.env"
if [[ -f "$ENV_FILE" ]]; then
  log "Setting SLAM_MODE=$SLAM_MODE in $ENV_FILE"
  # Replace or append SLAM_MODE
  if grep -q "^SLAM_MODE=" "$ENV_FILE"; then
    sudo sed -i "s/^SLAM_MODE=.*/SLAM_MODE=$SLAM_MODE/" "$ENV_FILE"
  else
    echo "SLAM_MODE=$SLAM_MODE" | sudo tee -a "$ENV_FILE" >/dev/null
  fi
fi

log "Starting stairdoc-ros2-bridge via systemd..."
sudo systemctl start stairdoc-ros2-bridge.service

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}ROS 2 bridge stack started via systemd${NC}"
echo "Check status:"
echo "  systemctl status stairdoc-ros2-bridge.service"
echo "  systemctl status stairdoc-ros2-sensors.service"
echo "Monitor logs:"
echo "  journalctl -u stairdoc-ros2-bridge.service -f"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
