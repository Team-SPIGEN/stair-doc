#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/spigen/stairdoc-bridge"
SERVICE_BRIDGE="/etc/systemd/system/stairdoc-bridge.service"
SERVICE_SENSORS="/etc/systemd/system/stairdoc-ros2-sensors.service"
SERVICE_ROS2_BRIDGE="/etc/systemd/system/stairdoc-ros2-bridge.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this on the Raspberry Pi with sudo:"
  echo "  sudo bash install_service.sh"
  exit 1
fi

mkdir -p "$APP_DIR"
chown -R spigen:spigen "$APP_DIR"

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown spigen:spigen "$APP_DIR/.env"
  echo "Created $APP_DIR/.env from .env.example. Check STAIRDOC_API_URLS before reboot."
fi

# Install dependencies
sudo -u spigen python3 -m pip install --user --break-system-packages -r "$APP_DIR/requirements.txt" || \
sudo -u spigen python3 -m pip install --user -r "$APP_DIR/requirements.txt"

sudo -u spigen python3 -m pip install --user --break-system-packages RPi.GPIO mfrc522 || \
sudo -u spigen python3 -m pip install --user RPi.GPIO mfrc522 || true

# 1. DEPRECATED — UART ESP motor bridge (disabled; unit kept for explicit opt-in only)
# Manual + Auto now require micro_ros_agent + ros2_bridge. Do NOT enable this unit.
cat > "$SERVICE_BRIDGE" <<'EOF'
[Unit]
Description=Stair-Doc UART ESP Bridge (DEPRECATED — do not enable)
After=network-online.target
Wants=network-online.target
Conflicts=stairdoc-ros2-bridge.service stairdoc-ros2-sensors.service

[Service]
Type=simple
User=spigen
WorkingDirectory=/home/spigen/stairdoc-bridge
Environment=PYTHONUNBUFFERED=1
Environment=ESP32_ENABLED=false
Environment=BRIDGE_MODE=sensors_only
ExecStart=/usr/bin/python3 /home/spigen/stairdoc-bridge/bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 2. Sensors-only Service (RFID/Camera/Voice via REST — never opens ESP serial)
cat > "$SERVICE_SENSORS" <<'EOF'
[Unit]
Description=Stair-Doc Raspberry Pi Sensors (RFID/Camera/Voice — no ESP serial)
After=network-online.target
Wants=network-online.target
Conflicts=stairdoc-bridge.service

[Service]
Type=simple
User=spigen
WorkingDirectory=/home/spigen/stairdoc-bridge
Environment=PYTHONUNBUFFERED=1
Environment=ESP32_ENABLED=false
Environment=BRIDGE_MODE=sensors_only
ExecStart=/usr/bin/python3 /home/spigen/stairdoc-bridge/bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 3. ROS2 Socket.IO Bridge Relay (Manual /cmd_vel + Destination NavigateToPose)
cat > "$SERVICE_ROS2_BRIDGE" <<'EOF'
[Unit]
Description=Stair-Doc ROS2 Socket.IO Relay (/cmd_vel + Nav2)
After=network-online.target
Wants=network-online.target stairdoc-ros2-sensors.service
Requires=stairdoc-ros2-sensors.service
Conflicts=stairdoc-bridge.service

[Service]
Type=simple
User=spigen
WorkingDirectory=/home/spigen/stairdoc-bridge
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/bash -c "source /opt/ros/humble/setup.bash && source /home/spigen/micro_ros_ws/install/setup.bash && python3 /home/spigen/stairdoc-bridge/ros2_bridge.py"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Disable old deprecated service names if they exist
systemctl disable --now full1.service 2>/dev/null || true
systemctl disable --now spigen-bridge.service 2>/dev/null || true

# Disable UART motor bridge; enable ROS stack (sensors + ros2 relay)
systemctl disable --now stairdoc-bridge.service 2>/dev/null || true
systemctl enable stairdoc-ros2-sensors.service
systemctl enable stairdoc-ros2-bridge.service

echo
echo "Stair-Doc services installed."
echo
echo "UART ESP motor bridge (stairdoc-bridge) is DISABLED."
echo "Manual joystick and Destination Nav2 both use:"
echo "  1) micro_ros_agent on /dev/sensors/esp32  (start_nav.sh)"
echo "  2) sudo systemctl start stairdoc-ros2-bridge"
echo
echo "Sensors-only (RFID/camera/door GPIO) runs as stairdoc-ros2-sensors"
echo "and never opens the ESP serial port."
echo
