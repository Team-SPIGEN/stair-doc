# Stair-Doc Hardware Integration Guide

This guide connects your **ESP32 robot controller**, **Raspberry Pi** (RFID, door servo, camera, voice), and the **Stair-Doc web application**.

## Architecture

```
┌─────────────────┐     Socket.IO / REST      ┌──────────────────┐
│  Web PWA        │ ◄──────────────────────────►│  FastAPI Backend │
│  (phone/PC)     │                             │  (apps/api)      │
└─────────────────┘                             └────────┬─────────┘
                                                         │
                                              bridge_register
                                              bridge_telemetry
                                              bridge_command
                                                         │
                                                ┌────────▼─────────┐
                                                │  Raspberry Pi    │
                                                │  bridge.py       │
                                                └───┬──────────┬───┘
                                    UART/USB/BT   │          │ GPIO
                                                ┌─▼──┐    ┌──▼──────────┐
                                                │ESP32│    │ RFID, servo │
                                                │robot│    │ camera, LED │
                                                └────┘    └─────────────┘
```

## Step 1 — Deploy / run the application

### Backend (FastAPI)

```bash
cd apps/api
cp .env.example .env
# Optional: set ROBOT_BRIDGE_TOKEN for production
poetry install
poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (PWA)

```bash
cd apps/web
pnpm install
pnpm dev
# Open http://localhost:3000
```

Set `NEXT_PUBLIC_SOCKET_URL=http://<your-api-host>:8000` if the API is not on localhost.

---

## Step 2 — Flash / update ESP32 firmware

Use the complete USB + Bluetooth sketch when flashing the ESP32:

```text
hardware/esp32/stairdoc_robot_usb_bt/stairdoc_robot_usb_bt.ino
```

It keeps the team's motor, servo, ultrasonic, bump, and MPU6050 logic, then adds:

- USB serial commands from the Raspberry Pi bridge
- Bluetooth commands for direct testing
- one-line JSON telemetry for the Stair-Doc API/PWA

If you need to merge into another teammate's sketch instead, see `hardware/esp32/telemetry_additions.ino` and add:

1. `emitJsonTelemetry()` function
2. Call it every 1 second in `loop()` after reading sensors
3. USB `Serial.available()` command handling

The command characters stay the same: `f/b/l/r/s/u/d/v/e`.

### ESP32 ↔ Pi physical connection

| Method | Wiring | Pi config |
|--------|--------|-----------|
| **USB serial** (recommended) | ESP32 USB → Pi USB | `ESP32_SERIAL_PORT=/dev/sensors/esp32` when LIDAR is also connected |
| **UART** | ESP32 TX→Pi RX, RX→TX, GND | `ESP32_SERIAL_PORT=/dev/ttyAMA0` |
| **Bluetooth** | Pair "StairdocRobot" | `ESP32_CONNECTION=bluetooth`, `rfcomm bind` |

---

## Step 3 — Update Raspberry Pi code

Replace your standalone access-control script with the unified bridge:

```bash
cd hardware/raspberry-pi
cp .env.example .env
# Edit API URL, serial port, GPIO pins
pip install -r requirements.txt
# On Pi only: pip install RPi.GPIO mfrc522
python bridge.py
```

### What changed from your original Pi script

| Before | After (bridge.py) |
|--------|-------------------|
| Local `AUTHORIZED_TAGS` list | `POST /api/v1/rfid/authorize` — app is source of truth, with `LOCAL_AUTHORIZED_TAGS` as an offline fallback |
| Photos saved locally only | Uploaded to `/api/v1/camera/photos` → visible in PWA gallery |
| Vosk voice local only | Optional: POST `/api/v1/voice/command` (PWA voice also works) |
| No robot connection | Forwards app commands to ESP32, pushes live telemetry |

### Your RFID tags are pre-registered

These hardware tag UIDs are already in the API:

- `432745742349` → `RFID-432745742349`
- `805223990738` → `RFID-805223990738`
- `1023250728362` → `RFID-1023250728362`

The API accepts both raw numeric IDs and `RFID-` prefixed IDs.

### Voice commands (Pi Vosk — optional)

If you keep Vosk on the Pi, map phrases to the app API:

| Your phrase | App understands |
|-------------|-----------------|
| "unlock door" | ✅ (added) |
| "open door" | ✅ (added) |
| "open container" | ✅ |
| "emergency stop" | ✅ |
| "go to floor 3" | ✅ |

Or use the PWA built-in Web Speech voice control (no Pi Vosk needed).

---

## Step 4 — Verify the connection

### 1. Bridge registration

When `bridge.py` runs, you should see:

```
[Socket.IO] Connected to http://...
[Socket.IO] Register: {'ok': True, 'robot_id': 'robot-001', ...}
```

Check via API:

```bash
curl http://localhost:8000/api/v1/robot/bridge/status
```

### 2. Live telemetry in PWA

Open the dashboard — `robot-001` should show real sensor values from the Pi bridge when connected.

### 3. Navigation controls

Open **Navigation** → use joystick or arrow keys → ESP32 motors should move.

The Pi bridge re-sends movement commands every 3 seconds (ESP32 10s timeout).

### 4. RFID unlock

Tap a registered tag → door servo unlocks → photo uploads → event appears in PWA RFID logs.

### 5. Emergency stop

Press Space (hold 0.8s) in the PWA → sends `emergency_stop` → Pi sends `s` to ESP32.

---

## Socket.IO protocol reference

### Pi → Backend (emit)

| Event | Payload |
|-------|---------|
| `bridge_register` | `{ robot_id, token? }` |
| `bridge_telemetry` | `{ robot_id, status, lock_status, sensors, battery, location }` |
| `bridge_lidar` | `{ robot_id, points: [{angle, distance}] }` (optional) |

### Backend → Pi (listen)

| Event | Payload |
|-------|---------|
| `bridge_command` | `{ action, robot_id, bt_command, speed?, target_floor? }` |
| `bridge_register_ack` | `{ ok, robot_id, message }` |

### App → Backend (existing)

| Event | Maps to ESP32 |
|-------|---------------|
| `navigation_command` forward | `f` |
| `navigation_command` backward | `b` |
| `navigation_command` left | `l` |
| `navigation_command` right | `r` |
| `navigation_command` stop | `s` |
| `robot_command` emergency_stop | `s` |

---

## Destination autonomous navigation (Nav2 / micro-ROS)

Autonomous Mode on `/navigation` navigates to a **named Destination** on the current map.
Manual Mode uses the **same** ROS stack (`/cmd_vel` via micro_ros_agent).

### Flow

```
Manual:  Web joystick → Socket.IO → ros2_bridge → /cmd_vel → micro_ros_agent → ESP
Auto:    Web Destination → locations.json → navigate_to → NavigateToPose
```

**UART ESP motor bridge is disabled.** Do not run `stairdoc-bridge` against `/dev/sensors/esp32`.

### Prerequisites on the Pi

1. `micro_ros_agent` owns `/dev/sensors/esp32` (exactly one owner)
2. Nav2 + AMCL for Destination (localization mode)
3. `ros2_bridge.py` registered to the API (`start_ros2_bridge.sh` / systemd)
4. Optional: `stairdoc-ros2-sensors` for RFID/camera/door GPIO (never opens ESP serial)

### Mode separation

| Feature | Transport |
|---------|-----------|
| Manual joystick / WASD | `ros2_bridge` → `/cmd_vel` |
| Destination → Nav2 | `ros2_bridge` → `NavigateToPose` |
| Chassis servo sweeps (u/d/v/e) | **Disabled** — Coming soon (needs ROS servo API) |
| RFID / camera / door GPIO | `bridge.py` sensors-only (`ESP32_ENABLED=false`) |

Switching Manual ↔ Autonomous does **not** require stopping the agent or reclaiming the ESP port.

---

## LIDAR / mapping

**No LIDAR hardware is required.** The navigation page shows:

- **Simulated** LIDAR when no bridge is connected
- **Ultrasonic pseudo-scan** when the bridge sends `front_distance_cm`, `rear_distance_cm`, etc.

To add real LIDAR later: emit `bridge_lidar` from the Pi with `{angle, distance}` points.

---

## Environment variables

### Backend (`apps/api/.env`)

```env
ENVIRONMENT=production
JWT_SECRET_KEY=your-random-jwt-secret
DEMO_USER_PASSWORD=your-temporary-demo-login-password
ROBOT_BRIDGE_TOKEN=your-secret-token
CORS_ORIGINS=https://your-frontend.example.com
SOCKET_CORS_ORIGINS=https://your-frontend.example.com,https://your-api.example.com
BRIDGE_STALE_SECONDS=15
```

### Pi (`hardware/raspberry-pi/.env`)

See `hardware/raspberry-pi/.env.example`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| PWA shows no live data | Ensure `bridge.py` is running and registered |
| Robot stops after 10s | Bridge re-sends commands — check `COMMAND_REPEAT_SEC=3` |
| RFID denied in app | Register tag via PWA or use pre-registered hardware UIDs |
| ESP32 not receiving commands | Flash `stairdoc_robot_usb_bt.ino`, use a data USB cable, then check `ls /dev/ttyUSB* /dev/ttyACM*` |
| Bluetooth not working | `bluetoothctl pair`, then `sudo rfcomm bind 0 <MAC> 1` |
| Photos not in gallery | Check API URL in Pi `.env`, ensure `/camera/photos` is reachable |

---

## Quick start checklist

- [ ] API running on port 8000
- [ ] PWA running on port 3000
- [ ] ESP32 flashed with `stairdoc_robot_usb_bt.ino`
- [ ] ESP32 connected to Pi (USB, UART, or Bluetooth)
- [ ] `bridge.py` running on Pi with correct `.env`
- [ ] Dashboard shows live telemetry for robot-001
- [ ] Navigation joystick moves the robot
- [ ] RFID tag unlocks door and appears in app logs
