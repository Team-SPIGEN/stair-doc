"""Socket.IO server for real-time robot telemetry.

Emits `robot_telemetry` events every 2 seconds with live-ish mock data.
Supports per-robot subscriptions and emergency stop commands.
"""

import asyncio
import random
from datetime import datetime
from typing import Any

import socketio

from src.schemas.robot import (
    BatteryResponse,
    LocationResponse,
    LockStatus,
    RobotStatus,
    SensorsResponse,
)

# ── Socket.IO Server ─────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# ASGI app to mount alongside FastAPI
socket_app = socketio.ASGIApp(sio, socketio_path="/socket.io")

# ── Shared State ─────────────────────────────────────────────────────────

# Mutable robot state that evolves over time
_robot_state: list[dict[str, Any]] = [
    {
        "id": "robot-001",
        "name": "StairBot Alpha",
        "serial_number": "SB-001-2024",
        "status": RobotStatus.DELIVERING,
        "lock_status": LockStatus.LOCKED,
        "floor": 3, "building": "Building A", "room": "305",
        "x": 65.0, "y": 40.0,
        "battery_level": 78, "is_charging": False,
        "voltage": 25.6, "temperature": 32.0,
        "estimated_minutes": 156,
        "speed": 1.2,
        "stairs_climbed": 156, "total_deliveries": 342,
        "current_delivery_id": "del-123",
        "uptime_seconds": 28800,
        "obstacle_detected": False, "stair_detected": False,
        "distance_to_obstacle": 3.2, "incline_angle": 0.0, "weight_kg": 2.5,
    },
    {
        "id": "robot-002",
        "name": "StairBot Beta",
        "serial_number": "SB-002-2024",
        "status": RobotStatus.CLIMBING,
        "lock_status": LockStatus.LOCKED,
        "floor": 2, "building": "Building B", "room": None,
        "x": 30.0, "y": 70.0,
        "battery_level": 45, "is_charging": False,
        "voltage": 23.8, "temperature": 38.0,
        "estimated_minutes": 72,
        "speed": 0.8,
        "stairs_climbed": 89, "total_deliveries": 287,
        "current_delivery_id": "del-124",
        "uptime_seconds": 21600,
        "obstacle_detected": False, "stair_detected": True,
        "distance_to_obstacle": None, "incline_angle": 35.0, "weight_kg": 1.8,
    },
    {
        "id": "robot-003",
        "name": "StairBot Gamma",
        "serial_number": "SB-003-2024",
        "status": RobotStatus.CHARGING,
        "lock_status": LockStatus.LOCKED,
        "floor": 1, "building": "Building A", "room": "Dock-1",
        "x": 10.0, "y": 90.0,
        "battery_level": 23, "is_charging": True,
        "voltage": 26.2, "temperature": 28.0,
        "estimated_minutes": 45,
        "speed": 0.0,
        "stairs_climbed": 201, "total_deliveries": 456,
        "current_delivery_id": None,
        "uptime_seconds": 14400,
        "obstacle_detected": False, "stair_detected": False,
        "distance_to_obstacle": None, "incline_angle": 0.0, "weight_kg": 0.0,
    },
    {
        "id": "robot-004",
        "name": "StairBot Delta",
        "serial_number": "SB-004-2024",
        "status": RobotStatus.IDLE,
        "lock_status": LockStatus.UNLOCKED,
        "floor": 1, "building": "Building C", "room": "Lobby",
        "x": 50.0, "y": 20.0,
        "battery_level": 92, "is_charging": False,
        "voltage": 25.9, "temperature": 26.0,
        "estimated_minutes": 210,
        "speed": 0.0,
        "stairs_climbed": 178, "total_deliveries": 389,
        "current_delivery_id": None,
        "uptime_seconds": 36000,
        "obstacle_detected": False, "stair_detected": False,
        "distance_to_obstacle": 5.0, "incline_angle": 0.0, "weight_kg": 0.0,
    },
]

# System health metrics
_system_health: dict[str, Any] = {
    "cpu_usage": 42.0,
    "memory_usage": 58.0,
    "disk_usage": 35.0,
    "network_latency_ms": 12,
    "lidar_status": "operational",
    "camera_status": "operational",
    "mqtt_connected": True,
    "database_connected": True,
    "uptime_seconds": 86400,
    "active_connections": 0,
    "errors_last_hour": 0,
    "warnings_last_hour": 3,
}

# Background task reference
_telemetry_task: asyncio.Task | None = None


# ── Telemetry Generator ─────────────────────────────────────────────────

def _evolve_robot(robot: dict[str, Any]) -> None:
    """Mutate a robot's state to simulate real-time changes."""
    # Battery drift
    if robot["is_charging"]:
        robot["battery_level"] = min(100, robot["battery_level"] + random.randint(0, 2))
        if robot["battery_level"] >= 95:
            robot["is_charging"] = False
            robot["status"] = RobotStatus.IDLE
    else:
        robot["battery_level"] = max(0, robot["battery_level"] + random.randint(-2, 1))

    # Voltage and temp jitter
    robot["voltage"] += random.uniform(-0.3, 0.3)
    robot["voltage"] = round(max(20.0, min(28.0, robot["voltage"])), 1)
    robot["temperature"] += random.uniform(-0.5, 0.5)
    robot["temperature"] = round(max(20.0, min(45.0, robot["temperature"])), 1)

    # Position drift for moving robots
    if robot["status"] in (RobotStatus.DELIVERING, RobotStatus.CLIMBING,
                            RobotStatus.DESCENDING, RobotStatus.RETURNING):
        robot["x"] = round(max(0, min(100, robot["x"] + random.uniform(-3, 3))), 1)
        robot["y"] = round(max(0, min(100, robot["y"] + random.uniform(-3, 3))), 1)
        robot["speed"] = round(max(0, random.uniform(0.3, 2.0)), 1)
    else:
        robot["speed"] = 0.0

    # Sensor jitter
    robot["obstacle_detected"] = random.random() > 0.92
    if robot["status"] == RobotStatus.CLIMBING:
        robot["stair_detected"] = True
        robot["incline_angle"] = round(random.uniform(25, 40), 1)
    else:
        robot["stair_detected"] = random.random() > 0.85
        robot["incline_angle"] = round(random.uniform(-2, 5), 1)

    if robot["obstacle_detected"]:
        robot["distance_to_obstacle"] = round(random.uniform(0.3, 2.0), 1)
    else:
        robot["distance_to_obstacle"] = round(random.uniform(2.0, 6.0), 1) if random.random() > 0.3 else None

    # Uptime
    robot["uptime_seconds"] += 2

    # Occasional delivery completion
    if robot["status"] == RobotStatus.DELIVERING and random.random() > 0.95:
        robot["total_deliveries"] += 1
        robot["stairs_climbed"] += random.randint(1, 4)


def _evolve_system_health() -> None:
    """Mutate system health metrics."""
    _system_health["cpu_usage"] = round(max(5, min(95, _system_health["cpu_usage"] + random.uniform(-5, 5))), 1)
    _system_health["memory_usage"] = round(max(20, min(90, _system_health["memory_usage"] + random.uniform(-2, 2))), 1)
    _system_health["network_latency_ms"] = max(1, _system_health["network_latency_ms"] + random.randint(-3, 3))
    _system_health["uptime_seconds"] += 2
    _system_health["errors_last_hour"] = max(0, _system_health["errors_last_hour"] + (1 if random.random() > 0.97 else 0))
    _system_health["warnings_last_hour"] = max(0, _system_health["warnings_last_hour"] + random.choice([-1, 0, 0, 0, 1]))


def _build_telemetry_payload(robot: dict[str, Any]) -> dict[str, Any]:
    """Build a robot_telemetry event payload (JSON-safe dict)."""
    return {
        "robot_id": robot["id"],
        "name": robot["name"],
        "serial_number": robot["serial_number"],
        "status": robot["status"].value if isinstance(robot["status"], RobotStatus) else robot["status"],
        "lock_status": robot["lock_status"].value if isinstance(robot["lock_status"], LockStatus) else robot["lock_status"],
        "location": {
            "floor": robot["floor"],
            "building": robot["building"],
            "room": robot["room"],
            "x": robot["x"],
            "y": robot["y"],
        },
        "battery": {
            "level": robot["battery_level"],
            "is_charging": robot["is_charging"],
            "voltage": robot["voltage"],
            "temperature": robot["temperature"],
            "estimated_minutes_remaining": robot["estimated_minutes"],
        },
        "sensors": {
            "obstacle_detected": robot["obstacle_detected"],
            "stair_detected": robot["stair_detected"],
            "distance_to_obstacle": robot["distance_to_obstacle"],
            "incline_angle": robot["incline_angle"],
            "weight_kg": robot["weight_kg"],
        },
        "speed": robot["speed"],
        "stairs_climbed": robot["stairs_climbed"],
        "total_deliveries": robot["total_deliveries"],
        "current_delivery_id": robot["current_delivery_id"],
        "uptime_seconds": robot["uptime_seconds"],
        "timestamp": datetime.utcnow().isoformat(),
    }


def _build_system_health_payload() -> dict[str, Any]:
    """Build system_health event payload."""
    return {
        **_system_health,
        "active_connections": len(_connected_sids),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Background Telemetry Loop ───────────────────────────────────────────

_connected_sids: set[str] = set()


async def _telemetry_loop() -> None:
    """Emit robot_telemetry + system_health every 2 seconds."""
    while True:
        await asyncio.sleep(2)

        # Evolve state
        for robot in _robot_state:
            _evolve_robot(robot)
        _evolve_system_health()

        # Build payloads
        robots_payload = [_build_telemetry_payload(r) for r in _robot_state]
        health_payload = _build_system_health_payload()

        # Emit to all connected clients
        if _connected_sids:
            await sio.emit("robot_telemetry", {
                "robots": robots_payload,
                "total": len(robots_payload),
                "timestamp": datetime.utcnow().isoformat(),
            })
            await sio.emit("system_health", health_payload)


# ── Socket.IO Event Handlers ────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict) -> None:
    """Client connected."""
    _connected_sids.add(sid)
    _system_health["active_connections"] = len(_connected_sids)
    print(f"[Socket.IO] Client connected: {sid}  ({len(_connected_sids)} total)")

    # Send initial state immediately
    robots_payload = [_build_telemetry_payload(r) for r in _robot_state]
    await sio.emit("robot_telemetry", {
        "robots": robots_payload,
        "total": len(robots_payload),
        "timestamp": datetime.utcnow().isoformat(),
    }, to=sid)
    await sio.emit("system_health", _build_system_health_payload(), to=sid)


@sio.event
async def disconnect(sid: str) -> None:
    """Client disconnected."""
    _connected_sids.discard(sid)
    _system_health["active_connections"] = len(_connected_sids)
    print(f"[Socket.IO] Client disconnected: {sid}  ({len(_connected_sids)} total)")


@sio.event
async def subscribe_robot(sid: str, data: dict) -> None:
    """Subscribe to a specific robot's updates (room-based)."""
    robot_id = data.get("robotId")
    if robot_id:
        await sio.enter_room(sid, f"robot:{robot_id}")
        print(f"[Socket.IO] {sid} subscribed to {robot_id}")


@sio.event
async def unsubscribe_robot(sid: str, data: dict) -> None:
    """Unsubscribe from a specific robot's updates."""
    robot_id = data.get("robotId")
    if robot_id:
        await sio.leave_room(sid, f"robot:{robot_id}")
        print(f"[Socket.IO] {sid} unsubscribed from {robot_id}")


@sio.event
async def robot_command(sid: str, data: dict) -> None:
    """Handle commands from the frontend (e.g., emergency stop)."""
    action = data.get("action")
    robot_id = data.get("robotId")
    print(f"[Socket.IO] Command from {sid}: {action} → {robot_id or 'all'}")

    if action == "emergency_stop":
        targets = (
            [r for r in _robot_state if r["id"] == robot_id]
            if robot_id
            else _robot_state
        )
        for robot in targets:
            robot["status"] = RobotStatus.EMERGENCY
            robot["speed"] = 0.0

        # Broadcast emergency event
        await sio.emit("delivery_update", {
            "type": "emergency_stop",
            "robot_id": robot_id,
            "timestamp": datetime.utcnow().isoformat(),
            "message": f"Emergency stop: {robot_id or 'all robots'}",
        })

    elif action == "resume":
        targets = (
            [r for r in _robot_state if r["id"] == robot_id]
            if robot_id
            else _robot_state
        )
        for robot in targets:
            if robot["status"] == RobotStatus.EMERGENCY:
                robot["status"] = RobotStatus.IDLE

        await sio.emit("delivery_update", {
            "type": "resume",
            "robot_id": robot_id,
            "timestamp": datetime.utcnow().isoformat(),
            "message": f"Resumed: {robot_id or 'all robots'}",
        })

    # Acknowledge command
    await sio.emit("command_ack", {
        "action": action,
        "robot_id": robot_id,
        "status": "accepted",
        "timestamp": datetime.utcnow().isoformat(),
    }, to=sid)


# ── Lifecycle ────────────────────────────────────────────────────────────

def start_telemetry_background_task() -> None:
    """Start the background telemetry loop. Call once at app startup."""
    global _telemetry_task
    if _telemetry_task is None:
        _telemetry_task = asyncio.ensure_future(_telemetry_loop())
        print("[Socket.IO] Telemetry background task started (2s interval)")
