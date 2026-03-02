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
next-fast-turbo/
├── apps/
│   ├── web/          # Next.js 16 + Tailwind + shadcn/ui (PWA)
│   ├── api/          # FastAPI + Pydantic + PostgreSQL
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
cp .env.example .env         # set SUPABASE_URL, SECRET_KEY, VAPID_* keys
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
2. Add environment variables as Vercel secrets:
   - `NEXT_PUBLIC_API_URL` → Railway backend URL
   - `NEXT_PUBLIC_SOCKET_URL` → same as API URL
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → from VAPID key generation
3. `apps/web/vercel.json` handles security headers, service worker cache rules, and PWA manifest content-type automatically

### Backend → Railway

1. Create a Railway project and connect the repo; set **Root Directory** to `apps/api`
2. `apps/api/railway.toml` is auto-detected (nixpacks build, uvicorn start, `/health` healthcheck)
3. Set env vars: `SUPABASE_URL`, `SECRET_KEY`, `VAPID_PRIVATE_KEY`, `CORS_ORIGINS`

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

### ROS2 → WebSocket Bridge

```bash
# On the Pi
pip install python-socketio requests
```

```python
import socketio
sio = socketio.Client()
sio.connect("https://your-api.railway.app")

def odom_callback(msg):
    sio.emit("robot_telemetry", {
        "robotId": "pi-001",
        "location": {
            "x": msg.pose.pose.position.x,
            "y": msg.pose.pose.position.y,
            "speed": msg.twist.twist.linear.x,
        },
        "battery": {"level": 85, "isCharging": False},
    })
```

### RFID RC522 (SPI)

```python
from mfrc522 import SimpleMFRC522
import requests

reader = SimpleMFRC522()
while True:
    tag_id, _ = reader.read()
    requests.post("https://your-api.railway.app/api/v1/rfid/scan",
                  json={"tag_id": str(tag_id), "robot_id": "pi-001"})
```

### SLAM (SLAM Toolbox)

```bash
ros2 launch slam_toolbox online_async_launch.py \
  slam_params_file:=./config/mapper_params_online_async.yaml
```

The SLAM pose is forwarded to the frontend via the `lidar_map` Socket.IO event.

---

## ⌨️ Keyboard Shortcuts

Active on every page — suppressed while typing in inputs.

| Key                  | Action                                                    |
| -------------------- | --------------------------------------------------------- |
| `Space` (hold 0.8 s) | **Emergency stop** — sends `emergency_stop` to all robots |
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
