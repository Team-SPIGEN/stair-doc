#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/spigen/stairdoc-bridge"
SERVICE_FILE="/etc/systemd/system/stairdoc-bridge.service"

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

sudo -u spigen python3 -m pip install --user --break-system-packages -r "$APP_DIR/requirements.txt" || \
sudo -u spigen python3 -m pip install --user -r "$APP_DIR/requirements.txt"

sudo -u spigen python3 -m pip install --user --break-system-packages RPi.GPIO mfrc522 || \
sudo -u spigen python3 -m pip install --user RPi.GPIO mfrc522 || true

cat > "$SERVICE_FILE" <<'EOF'
[Unit]
Description=Stair-Doc Raspberry Pi Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=spigen
WorkingDirectory=/home/spigen/stairdoc-bridge
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /home/spigen/stairdoc-bridge/bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl disable --now full1.service 2>/dev/null || true
systemctl disable --now spigen-bridge.service 2>/dev/null || true
systemctl enable --now stairdoc-bridge.service

echo
echo "Stair-Doc bridge installed."
echo "Check status with:"
echo "  systemctl status stairdoc-bridge.service --no-pager"
echo "  journalctl -u stairdoc-bridge.service -n 100 --no-pager"
