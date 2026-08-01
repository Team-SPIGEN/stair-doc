<h1 align="center">🤖 Stair-Doc</h1>

<p align="center">
  <strong>Autonomous Stair-Climbing Delivery Robot — Control &amp; Monitoring PWA</strong>
</p>

<p align="center">
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#-architecture"><strong>Architecture</strong></a> ·
  <a href="#-quick-start"><strong>Quick Start</strong></a> ·
  <a href="#-deployment"><strong>Deployment</strong></a> ·
  <a href="#-robot-pi-integration"><strong>Pi Integration</strong></a> ·
  <a href="#-keyboard-shortcuts"><strong>Shortcuts</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1-black?logo=next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" />
  <img src="https://img.shields.io/badge/PWA-Installable-5A0FC8" />
  <img src="https://img.shields.io/badge/ROS2-Humble-22314E" />
</p>

---

## ✨ Features

| Area           | Feature                                                                        |
| -------------- | ------------------------------------------------------------------------------ |
| **Real-time**  | Live robot telemetry via Socket.IO — battery, speed, LIDAR pose                |
| **Navigation** | Virtual joystick (NippleJS) + WASD keyboard + voice commands                   |
| **Delivery**   | Full CRUD delivery queue with RFID-gated container unlock                      |
| **Camera**     | Live MJPEG stream from Raspberry Pi Camera v1.3                                |
| **Analytics**  | 6-chart dashboard — delivery trends, floor heatmap, battery, RFID, stair-climb |
| **PWA**        | Installable on iOS/Android, offline delivery queue, push notifications         |
| **Safety**     | Hold-Space emergency stop + floating E-STOP button on every page               |
| **Voice**      | Web Speech API — "go to floor 3", "emergency stop", "delivery status"          |
| **Security**   | JWT auth, role-based nav (operator / recipient / admin), RFID management       |

---

## 🏗 Architecture

```
┌──────────────────────┐  WebSocket/MQTT  ┌────────────────────┐  REST/WS  ┌─────────────────┐
│   Raspberry Pi 4     │ ───────────────► │  FastAPI Backend   │ ◄───────► │  Next.js PWA    │
│  ├─ ROS2 Humble      │  robot_telemetry │  (Railway)         │           │  (Vercel)       │
│  ├─ 2D LIDAR SLAM    │  lidar_map       │  ├─ Socket.IO      │           │  ├─ Dashboard   │
│  ├─ RFID RC522       │  rfid_scan       │  ├─ PostgreSQL     │           │  ├─ Navigation  │
│  ├─ Pi Camera v1.3   │  camera_frame    │  ├─ JWT Auth       │           │  ├─ Camera      │
│  ├─ INMP441 Mic      │  delivery_update │  └─ Push (VAPID)   │           │  ├─ Deliveries  │
│  ├─ MG90S/MG995      │ ◄───────────────│  robot_command     │           │  └─ Analytics   │
│  └─ Load Cells       │                  └────────────────────┘           └─────────────────┘
└──────────────────────┘
```

### Monorepo Structure

```
stair-doc/
├── apps/
│   ├── web/          # Next.js 16 + Tailwind + shadcn/ui (PWA)
│   ├── api/          # FastAPI + Socket.IO + in-memory stores
│   └── docs/         # Mintlify documentation
└── packages/
    ├── eslint-config/
    └── typescript-config/
```

---

## 🚀 Quick Start

### Prerequisites

- Node ≥ 20, pnpm ≥ 9
- Python ≥ 3.10, Poetry

### Install

```bash
git clone https://github.com/your-org/stair-doc
cd stair-doc
pnpm install
```

### Frontend (`apps/web`)

```bash
cp apps/web/.env.local.example apps/web/.env.local
# Edit NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY

pnpm dev --filter web        # http://localhost:3000
```

### Backend (`apps/api`)

```bash
cd apps/api
cp .env.example .env         # set JWT_SECRET_KEY, ROBOT_BRIDGE_TOKEN, VAPID_* keys
poetry install
poetry run uvicorn src.main:app --reload --port 8000
# Swagger UI → http://localhost:8000/docs
```

### Full monorepo dev

```bash
pnpm dev        # starts web + api concurrently via Turborepo
```

---

## 📦 Deployment

### Frontend → Vercel

1. Import the repo; set **Root Directory** to `apps/web`
2. Add environment variables:
   - `NEXT_PUBLIC_API_URL` → Railway backend URL
   - `NEXT_PUBLIC_SOCKET_URL` → same as API URL
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → from VAPID key generation
3. Production frontend builds fail fast if `NEXT_PUBLIC_API_URL` is missing, so the live app never falls back to `localhost`
4. `apps/web/vercel.json` handles security headers, service worker cache rules, and PWA manifest content-type automatically

### Backend → Railway

1. Create a Railway project and connect the repo; set **Root Directory** to `apps/api`
2. `apps/api/railway.toml` is auto-detected (nixpacks build, uvicorn start, `/health` healthcheck)
3. Set env vars before switching to production:
   - `ENVIRONMENT=production`
   - `JWT_SECRET_KEY` → unique random value, at least 32 characters
   - `DEMO_USER_PASSWORD` → temporary non-default password for the demo users
   - `ROBOT_BRIDGE_TOKEN` → unique random bridge token, at least 16 characters
   - `CORS_ORIGINS` → deployed Vercel origin, for example `https://your-app.vercel.app`
   - `SOCKET_CORS_ORIGINS` → deployed Vercel origin plus the deployed Railway API origin used by the Pi bridge
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_MAILTO`

The API intentionally fails startup in `ENVIRONMENT=production` if the JWT secret,
demo password, bridge token, or CORS origin still use unsafe defaults.

### VAPID Key Generation

```bash
cd apps/api
python -c "
import py_vapid
v = py_vapid.Vapid()
v.generate_keys()
print('Public:', v.public_key)
print('Private:', v.private_key)
"
```

---

## 🤖 Robot Pi Integration

See **[hardware/INTEGRATION.md](hardware/INTEGRATION.md)** for the complete wiring guide.

### Destination autonomous navigation

The Navigation page **Autonomous Mode** sends Nav2 goals by Destination name — not floor, and **not** over UART.

1. Enter a **Destination** (room id or alias from [`maps/locations.json`](maps/locations.json)).
2. The API looks up map-frame `x`, `y`, `yaw` (radians), case-insensitive on `id` + `aliases`.
3. If unknown → clear UI/API error; **no goal is sent**.
4. If known and the Pi `ros2_bridge` is registered → API emits `navigate_to` with the pose → Pi calls Nav2 `NavigateToPose`.

```json
{
  "rooms": [
    {
      "id": "ids_lab",
      "aliases": ["IDS Lab", "ids lab"],
      "x": 21.425,
      "y": 7.835,
      "yaw": 0.0,
      "frame_id": "map",
      "map": "stairbot_room_map"
    }
  ]
}
```

Copy `maps/locations.json` to `~/maps/locations.json` on the Pi (or set `STAIRDOC_LOCATIONS_FILE`). Floor selection is disabled (Coming soon).

### Manual drive via `/cmd_vel` (same ROS stack)

Joystick / WASD / arrows publish `geometry_msgs/Twist` on `/cmd_vel` through:

`Web → Socket.IO → ros2_bridge.py → /cmd_vel → micro_ros_agent → ESP`

- Max-speed slider scales Twist magnitude; release / idle / E-Stop publish zero Twist.
- E-Stop also cancels any active Nav2 goal.
- **Servo sweeps** are disabled in UI (Coming soon — no ROS servo API). Door unlock servo on the Pi GPIO still works via sensors-only companion.

### Operator note — one stack for Manual + Auto

```bash
# On the Pi (required for BOTH Manual and Destination):
bash ~/stairbot_firmware/start_nav.sh          # micro_ros_agent on /dev/sensors/esp32
bash ~/stairbot_firmware/start_ros2_bridge.sh localization
# or: sudo systemctl start stairdoc-ros2-bridge
```

Do **not** start UART `stairdoc-bridge` against the ESP port. Switching Manual ↔ Autonomous does not require restarting the agent.

### UART ESP motor bridge — disabled (evidence)

| Former call site | Replacement |
|------------------|-------------|
| `bridge.py` serial `f/b/l/r/s` for joystick | `ros2_bridge` → `/cmd_vel` |
| `NAV_TO_BT` / `bt_command` on drive actions | Omitted from API payloads |
| UI “ESP32 serial / Pi Bridge” motor gate | ROS relay + micro-ROS status |
| Servo UI `u/d/v/e` over UART | Disabled — Coming soon (needs ROS servo API) |
| `stairdoc-bridge.service` (UART motor) | Disabled by `install_service.sh` |

**Not removed (blocker):** `bridge.py` **sensors-only** (`ESP32_ENABLED=false`) still runs RFID RC522, door GPIO servo, camera upload, optional Vosk. It never opens `/dev/sensors/esp32`. Full deletion of `bridge.py` would break those features until they are rehosted.

### Quick start

```bash
# 1. Run API + PWA (see Getting Started above)

# 2. On the Raspberry Pi — ROS stack (Manual + Destination)
#    bash start_nav.sh && bash start_ros2_bridge.sh localization

# 3. Optional sensors-only (RFID/camera) — never opens ESP serial
#    sudo systemctl start stairdoc-ros2-sensors
```

The Pi bridge registers via Socket.IO, forwards navigation commands, and pushes live telemetry to the app.

### Socket.IO events

| Direction | Event | Purpose |
|-----------|-------|---------|
| Pi → API | `bridge_register` | Register as `robot-001` |
| Pi → API | `bridge_telemetry` | Live sensor data from ESP32 |
| API → Pi | `bridge_command` | Forward joystick/E-stop commands |
| App → API | `navigation_command` | Manual/autonomous control |
| App → API | `robot_command` | Emergency stop |

### RFID RC522 (SPI)

```python
import requests
from mfrc522 import SimpleMFRC522

reader = SimpleMFRC522()
tag_id, _ = reader.read()
requests.post(
    "https://your-api.railway.app/api/v1/rfid/authorize",
    json={"tag_id": str(tag_id), "robot_id": "robot-001"},
)
```

Numeric tag UIDs are auto-normalized to `RFID-{uid}`.

### Ultrasonic obstacle display (no LIDAR required)

The bridge converts ESP32 ultrasonic readings into a pseudo-LIDAR scan for the navigation page. Real LIDAR/SLAM can be added later via the `bridge_lidar` event.

---

## ⌨️ Keyboard Shortcuts

Active on every page — suppressed while typing in inputs.

| Key                  | Action                                                    |
| -------------------- | --------------------------------------------------------- |
| `Space` (hold 0.8 s) | **Emergency stop** — sends `emergency_stop` to the robot |
| `R`                  | Refresh robot status                                      |
| `N`                  | Go to Navigation                                          |
| `C`                  | Go to Camera feed                                         |
| `D`                  | Go to Deliveries                                          |
| `V`                  | Toggle voice commands                                     |
| `?`                  | Show shortcut help toast                                  |
| `Esc`                | Close modal / stop listening                              |

---

## 🧪 Testing

```bash
# Frontend type-check + lint
cd apps/web && pnpm lint

# Backend
cd apps/api && poetry run pytest tests/ -v
```

---

## 📊 Lighthouse Targets

| Metric         | Target         |
| -------------- | -------------- |
| Performance    | ≥ 90           |
| Accessibility  | ≥ 95           |
| Best Practices | ≥ 95           |
| SEO            | ≥ 90           |
| PWA            | ✅ Installable |

---

## 📄 License

MIT — see [LICENCE](./LICENCE)
