"""Robot bridge state and helpers for Raspberry Pi ↔ ESP32 integration.

The Pi connects via Socket.IO, registers as a bridge for a robot_id, pushes
real telemetry, and receives forwarded navigation/robot commands.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from src.config import settings
from src.schemas.robot import LockStatus, RobotStatus

# ── Bridge client registry ───────────────────────────────────────────────

# robot_id → socket session id
_bridge_clients: dict[str, str] = {}
# sid → robot_id
_bridge_sid_to_robot: dict[str, str] = {}
# robot_id → latest lidar points from bridge
_bridge_lidar: dict[str, list[dict[str, float]]] = {}
# robot_id → accumulated map points from manual exploration / SLAM feed
_bridge_map: dict[str, list[dict[str, float]]] = {}
# robot_id → last telemetry push timestamp
_bridge_last_seen: dict[str, datetime] = {}

# Map app navigation actions → ESP32 Bluetooth single-char commands
NAV_TO_BT: dict[str, str] = {
    "forward": "f",
    "backward": "b",
    "left": "l",
    "right": "r",
    "stop": "s",
    "emergency_stop": "s",
    "front_up": "u",
    "front_servo_up": "u",
    "front_down": "d",
    "front_servo_down": "d",
    "rear_up": "v",
    "rear_servo_up": "v",
    "rear_down": "e",
    "rear_servo_down": "e",
}


def normalize_tag_id(raw: str) -> str:
    """Normalize RFID UIDs from hardware (numeric or prefixed) to app format."""
    cleaned = raw.strip().upper()
    if cleaned.startswith("RFID-"):
        return cleaned
    if cleaned.isdigit():
        return f"RFID-{cleaned}"
    return f"RFID-{cleaned}"


def get_field(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Read a field accepting snake_case or camelCase keys."""
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return default


def is_bridge_connected(robot_id: str) -> bool:
    return robot_id in _bridge_clients


def get_bridge_status() -> dict[str, Any]:
    """Return bridge connection status for all registered robots."""
    now = datetime.now(UTC)
    robots = []
    for robot_id, sid in _bridge_clients.items():
        last = _bridge_last_seen.get(robot_id)
        robots.append({
            "robot_id": robot_id,
            "session_id": sid,
            "connected": True,
            "last_telemetry": last.isoformat() if last else None,
            "seconds_since_telemetry": (
                (now - last).total_seconds() if last else None
            ),
        })
    return {
        "connected_count": len(_bridge_clients),
        "robots": robots,
        "timestamp": now.isoformat(),
    }


def register_bridge(sid: str, robot_id: str, token: str | None) -> tuple[bool, str]:
    """Register a Pi bridge client for a robot."""
    expected = settings.ROBOT_BRIDGE_TOKEN
    if expected and token != expected:
        return False, "Invalid bridge token"

    # Disconnect any previous bridge for this robot
    old_sid = _bridge_clients.get(robot_id)
    if old_sid and old_sid != sid:
        _bridge_sid_to_robot.pop(old_sid, None)

    _bridge_clients[robot_id] = sid
    _bridge_sid_to_robot[sid] = robot_id
    return True, f"Bridge registered for {robot_id}"


def unregister_bridge(sid: str) -> str | None:
    """Remove bridge on disconnect. Returns robot_id if was a bridge."""
    robot_id = _bridge_sid_to_robot.pop(sid, None)
    if robot_id:
        if _bridge_clients.get(robot_id) == sid:
            _bridge_clients.pop(robot_id, None)
        _bridge_lidar.pop(robot_id, None)
        _bridge_last_seen.pop(robot_id, None)
    return robot_id


def get_bridge_sid(robot_id: str) -> str | None:
    return _bridge_clients.get(robot_id)


def get_bridge_last_seen(robot_id: str) -> datetime | None:
    return _bridge_last_seen.get(robot_id)


def apply_bridge_telemetry(robot: dict[str, Any], data: dict[str, Any]) -> None:
    """Merge a bridge telemetry payload into the in-memory robot state."""
    robot_id = get_field(data, "robot_id", "robotId", default=robot["id"])
    _bridge_last_seen[robot_id] = datetime.now(UTC)

    status = get_field(data, "status")
    if status:
        try:
            robot["status"] = RobotStatus(status)
        except ValueError:
            robot["status"] = status

    lock = get_field(data, "lock_status", "lockStatus")
    if lock:
        try:
            robot["lock_status"] = LockStatus(lock)
        except ValueError:
            robot["lock_status"] = lock

    location = get_field(data, "location")
    if isinstance(location, dict):
        robot["floor"] = location.get("floor", robot["floor"])
        robot["building"] = location.get("building", robot["building"])
        robot["room"] = location.get("room", robot["room"])
        robot["x"] = location.get("x", robot["x"])
        robot["y"] = location.get("y", robot["y"])

    battery = get_field(data, "battery")
    if isinstance(battery, dict):
        robot["battery_level"] = battery.get("level", robot["battery_level"])
        robot["is_charging"] = battery.get(
            "is_charging", battery.get("isCharging", robot["is_charging"])
        )
        robot["voltage"] = battery.get("voltage", robot["voltage"])
        robot["temperature"] = battery.get("temperature", robot["temperature"])
        robot["estimated_minutes"] = battery.get(
            "estimated_minutes_remaining",
            battery.get("estimatedMinutesRemaining", robot["estimated_minutes"]),
        )

    sensors = get_field(data, "sensors")
    if isinstance(sensors, dict):
        robot["obstacle_detected"] = sensors.get(
            "obstacle_detected", sensors.get("obstacleDetected", robot["obstacle_detected"])
        )
        robot["stair_detected"] = sensors.get(
            "stair_detected", sensors.get("stairDetected", robot["stair_detected"])
        )
        robot["distance_to_obstacle"] = sensors.get(
            "distance_to_obstacle",
            sensors.get("distanceToObstacle", robot["distance_to_obstacle"]),
        )
        robot["incline_angle"] = sensors.get(
            "incline_angle", sensors.get("inclineAngle", robot["incline_angle"])
        )
        robot["weight_kg"] = sensors.get(
            "weight_kg", sensors.get("weightKg", robot["weight_kg"])
        )
        robot["esp32_connected"] = sensors.get(
            "esp32_connected",
            sensors.get("esp32Connected", robot.get("esp32_connected", False)),
        )
        robot["esp32_port"] = sensors.get(
            "esp32_port",
            sensors.get("esp32Port", robot.get("esp32_port")),
        )
        robot["esp32_connection"] = sensors.get(
            "esp32_connection",
            sensors.get("esp32Connection", robot.get("esp32_connection")),
        )

    speed = get_field(data, "speed")
    if speed is not None:
        robot["speed"] = speed

    robot["uptime_seconds"] = robot.get("uptime_seconds", 0) + 2


def store_bridge_lidar(robot_id: str, points: list[dict[str, float]]) -> None:
    _bridge_lidar[robot_id] = points
    existing = _bridge_map.setdefault(robot_id, [])
    existing.extend(points)
    if len(existing) > 3000:
        del existing[: len(existing) - 3000]
    _bridge_last_seen[robot_id] = datetime.now(UTC)


def get_bridge_lidar(robot_id: str) -> list[dict[str, float]] | None:
    return _bridge_lidar.get(robot_id)


def get_bridge_map(robot_id: str) -> list[dict[str, float]] | None:
    return _bridge_map.get(robot_id)


def clear_bridge_map(robot_id: str) -> None:
    _bridge_map.pop(robot_id, None)


def ultrasonic_to_lidar(
    front_cm: float,
    rear_cm: float,
    front_left_cm: float | None = None,
    rear_right_cm: float | None = None,
    fov: int = 270,
) -> list[dict[str, float]]:
    """Build a pseudo-LIDAR scan from ultrasonic distances (cm → metres)."""
    points: list[dict[str, float]] = []
    sensor_angles: dict[int, float] = {0: front_cm}

    if front_left_cm is not None:
        sensor_angles[45] = front_left_cm
    if rear_right_cm is not None:
        sensor_angles[225] = rear_right_cm
    sensor_angles[180] = rear_cm

    for angle in range(0, fov):
        dist_cm = 400.0  # default max range
        for sa, d in sensor_angles.items():
            diff = abs(angle - sa)
            if diff > 180:
                diff = 360 - diff
            if diff <= 30:
                weight = math.cos(math.radians(diff * 3))
                dist_cm = min(dist_cm, d / max(0.1, weight))

        dist_m = round(max(0.05, min(4.0, dist_cm / 100.0)), 2)
        points.append({"angle": float(angle), "distance": dist_m})

    return points


def build_bridge_command_payload(
    action: str,
    robot_id: str,
    *,
    speed: float = 0.5,
    target_floor: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the command payload forwarded to the Pi bridge."""
    payload: dict[str, Any] = {
        "action": action,
        "robot_id": robot_id,
        "bt_command": NAV_TO_BT.get(action),
        "speed": speed,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    if target_floor is not None:
        payload["target_floor"] = target_floor
    if extra:
        payload.update(extra)
    return payload
