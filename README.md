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

### Quick start

```bash
# 1. Run API + PWA (see Getting Started above)

# 2. Flash the ESP32
# Open hardware/esp32/stairdoc_robot_usb_bt/stairdoc_robot_usb_bt.ino
# in Arduino IDE and flash it to the ESP32.

# 3. On the Raspberry Pi
cd hardware/raspberry-pi
cp .env.example .env   # set STAIRDOC_API_URLS to the Mac/API IP
pip install -r requirements.txt
python bridge.py
```

The Pi bridge registers via Socket.IO, forwards navigation commands to the ESP32, and pushes live telemetry to the app.

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
