"""Socket.IO server for real-time robot telemetry.

Emits `robot_telemetry` events every 2 seconds. When a Raspberry Pi bridge is
connected for a robot, uses live hardware telemetry instead of simulation.
Forwards navigation/robot commands to the bridge for ESP32 Bluetooth control.
"""

import asyncio
import math
from datetime import UTC, datetime
from typing import Any

import socketio

from src.config import settings
from src.core.bridge import (
    apply_bridge_telemetry,
    build_bridge_command_payload,
    clear_slam_map,
    get_bridge_lidar,
    get_bridge_map,
    get_bridge_last_seen,
    get_bridge_sid,
    get_bridge_status,
    get_field,
    get_robot_pose,
    get_slam_map,
    is_bridge_connected,
    register_bridge,
    clear_bridge_map,
    store_bridge_lidar,
    store_robot_pose,
    store_slam_map,
    unregister_bridge,
)
from src.core.locations import find_location, normalize_destination
from src.core.nav_state import (
    autonomous_reject_message,
    enter_autonomous,
    enter_emergency,
    enter_idle,
    enter_manual,
    get_nav_state,
    manual_reject_message,
)
from src.core.robot import ROBOT_ID
from src.core.robot_state import get_robot, get_robots
from src.schemas.robot import LockStatus, RobotStatus

# ── Socket.IO Server ─────────────────────────────────────────────────────

_socket_cors_origins = (
    "*"
    if "*" in settings.socket_cors_origins
    else settings.socket_cors_origins
)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_socket_cors_origins,
    logger=False,
    engineio_logger=False,
)

# ASGI app to mount alongside FastAPI
socket_app = socketio.ASGIApp(sio, socketio_path="/socket.io")

# ── Shared State ─────────────────────────────────────────────────────────

# System health metrics (connection stats only — no simulated load)
_system_health: dict[str, Any] = {
    "cpu_usage": 0.0,
    "memory_usage": 0.0,
    "disk_usage": 0.0,
    "network_latency_ms": 0,
    "lidar_status": "offline",
    "camera_status": "offline",
    "mqtt_connected": False,
    "database_connected": False,
    "uptime_seconds": 0,
    "active_connections": 0,
    "errors_last_hour": 0,
    "warnings_last_hour": 0,
}

# Background task reference
_telemetry_task: asyncio.Task | None = None

# ── Navigation State (shared with REST via src.core.nav_state) ───────────


def _build_nav_status_payload(robot_id: str) -> dict[str, Any]:
    """Build navigation status event payload."""
    state = get_nav_state(robot_id)
    return {
        "robot_id": robot_id,
        "mode": state["mode"],
        "target_floor": state["target_floor"],
        "target_location": state.get("target_location"),
        "progress": round(state["progress"], 3),
        "eta_seconds": state.get("eta_seconds"),
        "current_speed": state.get("current_speed", 0.0),
        "emergency_active": bool(state.get("emergency_active")),
        "heading": state.get("heading", 0.0),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Telemetry Generator ─────────────────────────────────────────────────

def _build_telemetry_payload(robot: dict[str, Any]) -> dict[str, Any]:
    """Build a robot_telemetry event payload (JSON-safe dict)."""
    return {
        "id": robot["id"],
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
            "esp32_connected": robot.get("esp32_connected", False),
            "esp32_port": robot.get("esp32_port"),
            "esp32_connection": robot.get("esp32_connection"),
            "ros2_ready": robot.get("ros2_ready", False),
            "nav2_ready": robot.get("nav2_ready", False),
            "micro_ros_agent": robot.get("micro_ros_agent", False),
            "amcl_ready": robot.get("amcl_ready", False),
            "slam_mode": robot.get("slam_mode"),
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
    bridge_live = is_bridge_connected(ROBOT_ID)
    return {
        **_system_health,
        "active_connections": len(_connected_sids),
        "bridge_connected": bridge_live,
        "lidar_status": "operational" if bridge_live else "offline",
        "camera_status": "operational" if bridge_live else "offline",
        "mqtt_connected": False,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Background Telemetry Loop ───────────────────────────────────────────

_connected_sids: set[str] = set()


async def _forward_to_bridge(
    robot_id: str | None,
    action: str,
    *,
    speed: float = 0.5,
    target_floor: int | None = None,
    extra: dict | None = None,
) -> list[str]:
    """Forward a command to the connected Pi bridge. Returns robot IDs sent."""
    sent: list[str] = []
    rid = robot_id or ROBOT_ID
    sid = get_bridge_sid(rid)
    if sid:
        payload = build_bridge_command_payload(
            action, rid, speed=speed, target_floor=target_floor, extra=extra
        )
        await sio.emit("bridge_command", payload, to=sid)
        sent.append(rid)
    return sent


def _motor_controller_ready(robot_id: str) -> bool:
    """True when ros2_bridge holds the Socket.IO slot (Manual+Auto via ROS)."""
    return bool(get_bridge_sid(robot_id))


async def _reject_navigation_command(
    sid: str,
    action: str,
    robot_id: str,
    message: str,
) -> None:
    await sio.emit(
        "command_ack",
        {
            "action": f"nav_{action}",
            "robot_id": robot_id,
            "status": "rejected",
            "message": message,
            "timestamp": datetime.utcnow().isoformat(),
        },
        to=sid,
    )


async def _telemetry_loop() -> None:
    """Emit robot_telemetry + system_health every 2 seconds."""
    while True:
        await asyncio.sleep(2)

        robot = get_robot()
        if is_bridge_connected(robot["id"]):
            robot["uptime_seconds"] = robot.get("uptime_seconds", 0) + 2
            _system_health["uptime_seconds"] += 2

        # Mark bridged robot offline if telemetry is stale
        now = datetime.now(UTC)
        if is_bridge_connected(robot["id"]):
            last = get_bridge_last_seen(robot["id"])
            if last and (now - last).total_seconds() > settings.BRIDGE_STALE_SECONDS:
                robot["status"] = RobotStatus.OFFLINE
                robot["speed"] = 0.0
                robot["esp32_connected"] = False

        robots_payload = [_build_telemetry_payload(r) for r in get_robots()]
        health_payload = _build_system_health_payload()
        health_payload["bridge"] = get_bridge_status()

        if _connected_sids:
            await sio.emit("robot_telemetry", {
                "robots": robots_payload,
                "total": len(robots_payload),
                "timestamp": datetime.utcnow().isoformat(),
            })
            await sio.emit("system_health", health_payload)

            bridge_lidar = get_bridge_lidar(ROBOT_ID)
            if bridge_lidar:
                await sio.emit("lidar_scan", {
                    "robot_id": ROBOT_ID,
                    "points": bridge_lidar,
                    "fov": 270,
                    "source": "bridge",
                    "timestamp": datetime.utcnow().isoformat(),
                })
                bridge_map = get_bridge_map(ROBOT_ID)
                if bridge_map:
                    await sio.emit("lidar_map", {
                        "robot_id": ROBOT_ID,
                        "points": bridge_map,
                        "fov": 360,
                        "source": "bridge",
                        "timestamp": datetime.utcnow().isoformat(),
                    })

            # Broadcast SLAM map snapshot if ros2_bridge relay is feeding one
            slam_map = get_slam_map(ROBOT_ID)
            if slam_map:
                await sio.emit("slam_map_update", {
                    "robot_id": ROBOT_ID,
                    **slam_map,
                    "timestamp": datetime.utcnow().isoformat(),
                })

            # Broadcast robot world-frame pose (from /amcl_pose or /odom via relay)
            robot_pose = get_robot_pose(ROBOT_ID)
            if robot_pose:
                await sio.emit("robot_pose", {
                    "robot_id": ROBOT_ID,
                    **robot_pose,
                    "timestamp": datetime.utcnow().isoformat(),
                })

            await sio.emit("nav_status", _build_nav_status_payload(ROBOT_ID))


# ── Socket.IO Event Handlers ────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict) -> None:
    """Client connected."""
    _connected_sids.add(sid)
    _system_health["active_connections"] = len(_connected_sids)
    print(f"[Socket.IO] Client connected: {sid}  ({len(_connected_sids)} total)")

    # Send initial state immediately
    robots_payload = [_build_telemetry_payload(r) for r in get_robots()]
    await sio.emit("robot_telemetry", {
        "robots": robots_payload,
        "total": len(robots_payload),
        "timestamp": datetime.utcnow().isoformat(),
    }, to=sid)
    health_payload = _build_system_health_payload()
    health_payload["bridge"] = get_bridge_status()
    await sio.emit("system_health", health_payload, to=sid)


@sio.event
async def disconnect(sid: str) -> None:
    """Client disconnected."""
    _connected_sids.discard(sid)
    _system_health["active_connections"] = len(_connected_sids)

    robot_id = unregister_bridge(sid)
    if robot_id:
        for robot in get_robots():
            if robot["id"] == robot_id:
                robot["status"] = RobotStatus.OFFLINE
                robot["speed"] = 0.0
                robot["esp32_connected"] = False
        await sio.emit("bridge_status", get_bridge_status())
        print(f"[Socket.IO] Bridge disconnected: {robot_id}")

    print(f"[Socket.IO] Client disconnected: {sid}  ({len(_connected_sids)} total)")


@sio.event
async def subscribe_robot(sid: str, data: dict) -> None:
    """Subscribe to a specific robot's updates (room-based)."""
    robot_id = get_field(data, "robot_id", "robotId")
    if robot_id:
        await sio.enter_room(sid, f"robot:{robot_id}")
        print(f"[Socket.IO] {sid} subscribed to {robot_id}")


@sio.event
async def unsubscribe_robot(sid: str, data: dict) -> None:
    """Unsubscribe from a specific robot's updates."""
    robot_id = get_field(data, "robot_id", "robotId")
    if robot_id:
        await sio.leave_room(sid, f"robot:{robot_id}")
        print(f"[Socket.IO] {sid} unsubscribed from {robot_id}")


@sio.event
async def bridge_register(sid: str, data: dict) -> None:
    """Register a Raspberry Pi bridge client for a robot."""
    robot_id = get_field(data, "robot_id", "robotId", default="robot-001")
    token = get_field(data, "token")
    ok, message = register_bridge(sid, robot_id, token)

    await sio.emit("bridge_register_ack", {
        "ok": ok,
        "robot_id": robot_id,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    }, to=sid)

    if ok:
        for robot in get_robots():
            if robot["id"] == robot_id:
                robot["status"] = RobotStatus.IDLE
        await sio.emit("bridge_status", get_bridge_status())
        print(f"[Socket.IO] Bridge registered: {robot_id} ({sid})")
    else:
        print(f"[Socket.IO] Bridge registration failed: {message}")


@sio.event
async def bridge_telemetry(sid: str, data: dict) -> None:
    """Ingest live telemetry from the Pi bridge."""
    robot_id = get_field(data, "robot_id", "robotId")
    if not robot_id or get_bridge_sid(robot_id) != sid:
        return

    for robot in get_robots():
        if robot["id"] == robot_id:
            apply_bridge_telemetry(robot, data)
            break

    # Optional inline lidar from ultrasonic readings
    sensors = get_field(data, "sensors", default={})
    if isinstance(sensors, dict):
        front = sensors.get("front_distance_cm") or sensors.get("frontDistanceCm")
        rear = sensors.get("rear_distance_cm") or sensors.get("rearDistanceCm")
        if front is not None and rear is not None:
            from src.core.bridge import ultrasonic_to_lidar

            fl = sensors.get("stair_front_left_cm") or sensors.get("stairFrontLeftCm")
            rr = sensors.get("stair_rear_right_cm") or sensors.get("stairRearRightCm")
            store_bridge_lidar(
                robot_id,
                ultrasonic_to_lidar(
                    float(front),
                    float(rear),
                    float(fl) if fl is not None else None,
                    float(rr) if rr is not None else None,
                ),
            )


@sio.event
async def bridge_lidar(sid: str, data: dict) -> None:
    """Ingest LIDAR / ultrasonic scan points from the Pi bridge."""
    robot_id = get_field(data, "robot_id", "robotId")
    points = data.get("points", [])
    if robot_id and get_bridge_sid(robot_id) == sid and points:
        store_bridge_lidar(robot_id, points)


@sio.event
async def slam_map(sid: str, data: dict) -> None:
    """Ingest a SLAM OccupancyGrid snapshot from the ros2_bridge relay.

    Expected payload keys (from ros2_bridge.py):
      robot_id        : str
      width, height   : int   — grid dimensions in cells
      resolution      : float — metres per cell
      origin_x, origin_y : float — world-frame origin of grid (metres)
      obstacle_points : [{angle, distance}] — current /scan in robot frame
      map_points      : [{x, y}]            — occupied cells in world frame
      slam_mode       : "mapping" | "localization"
    """
    robot_id = get_field(data, "robot_id", "robotId")
    if not robot_id or get_bridge_sid(robot_id) != sid:
        return
    store_slam_map(robot_id, {k: v for k, v in data.items() if k != "robot_id"})
    print(f"[Socket.IO] SLAM map update: {robot_id} ({data.get('slam_mode', 'unknown')} mode)")


@sio.event
async def bridge_pose(sid: str, data: dict) -> None:
    """Ingest the robot's world-frame pose from the ros2_bridge relay.

    Expected payload: robot_id, x, y, heading (degrees, 0=east/+x, CCW positive).
    Emitted from /amcl_pose (localization) or /odom (mapping).
    """
    robot_id = get_field(data, "robot_id", "robotId")
    if not robot_id or get_bridge_sid(robot_id) != sid:
        return
    try:
        store_robot_pose(
            robot_id,
            float(data.get("x", 0)),
            float(data.get("y", 0)),
            float(data.get("heading", 0)),
        )
    except (TypeError, ValueError):
        pass


@sio.event
async def robot_command(sid: str, data: dict) -> None:
    """Handle commands from the frontend (e.g., emergency stop)."""
    action = data.get("action")
    robot_id = get_field(data, "robot_id", "robotId")
    print(f"[Socket.IO] Command from {sid}: {action} → {robot_id or 'all'}")

    if action == "emergency_stop":
        enter_emergency(robot_id or ROBOT_ID)

        robot = get_robot()
        if not robot_id or robot_id == robot["id"]:
            robot["status"] = RobotStatus.EMERGENCY
            robot["speed"] = 0.0

        await sio.emit("emergency_active", {"robot_id": robot_id or ROBOT_ID, "active": True, "timestamp": datetime.utcnow().isoformat()})
        await sio.emit("nav_status", _build_nav_status_payload(robot_id or ROBOT_ID))
        await sio.emit("delivery_update", {
            "type": "emergency_stop",
            "robot_id": robot_id or ROBOT_ID,
            "timestamp": datetime.utcnow().isoformat(),
            "message": f"Emergency stop: {robot_id or ROBOT_ID}",
        })
        await _forward_to_bridge(robot_id, "emergency_stop")

    elif action == "resume":
        rid = robot_id or ROBOT_ID
        state = get_nav_state(rid)
        state["emergency_active"] = False
        enter_idle(rid)

        robot = get_robot()
        if (not robot_id or robot_id == robot["id"]) and robot["status"] == RobotStatus.EMERGENCY:
            robot["status"] = RobotStatus.IDLE

        await _forward_to_bridge(robot_id, "stop")
        await sio.emit("emergency_active", {"robot_id": robot_id or ROBOT_ID, "active": False, "timestamp": datetime.utcnow().isoformat()})
        await sio.emit("nav_status", _build_nav_status_payload(robot_id or ROBOT_ID))
        await sio.emit("delivery_update", {
            "type": "resume",
            "robot_id": robot_id or ROBOT_ID,
            "timestamp": datetime.utcnow().isoformat(),
            "message": f"Resumed: {robot_id or ROBOT_ID}",
        })

    # Acknowledge command
    await sio.emit("command_ack", {
        "action": action,
        "robot_id": robot_id,
        "status": "accepted",
        "timestamp": datetime.utcnow().isoformat(),
    }, to=sid)


@sio.event
async def navigation_command(sid: str, data: dict) -> None:
    """Handle real-time navigation commands from the frontend.

    Manual Twist and Autonomous NavigateToPose are hard-separated via shared
    nav_state — cross-mode commands are rejected (no silent mode overwrite).
    """
    action = data.get("action", "")
    robot_id = get_field(data, "robot_id", "robotId", default="robot-001")
    now = datetime.utcnow().isoformat()
    state = get_nav_state(robot_id)

    if action == "emergency_stop":
        enter_emergency(robot_id)
        for robot in get_robots():
            if robot["id"] == robot_id:
                robot["status"] = RobotStatus.EMERGENCY
                robot["speed"] = 0.0
        await sio.emit("emergency_active", {"robot_id": robot_id, "active": True, "timestamp": now})
        await _forward_to_bridge(robot_id, "emergency_stop")

    elif action == "reset_estop":
        state["emergency_active"] = False
        enter_idle(robot_id)
        for robot in get_robots():
            if robot["id"] == robot_id:
                robot["status"] = RobotStatus.IDLE
                robot["speed"] = 0.0
        await sio.emit("emergency_active", {"robot_id": robot_id, "active": False, "timestamp": now})
        await _forward_to_bridge(robot_id, "stop")

    elif action in ("autonomous", "navigate_to"):
        reject = autonomous_reject_message(state)
        if reject:
            await _reject_navigation_command(sid, action, robot_id, reject)
            return

        target_floor = get_field(data, "target_floor", "targetFloor", default=0)
        raw_location = get_field(data, "target_location", "targetLocation")
        goal = get_field(data, "goal") or {}
        destination = normalize_destination(raw_location)

        if not goal and destination:
            room = find_location(destination)
            if room is None:
                await _reject_navigation_command(
                    sid,
                    action,
                    robot_id,
                    f"Unknown destination {destination!r}. Check maps/locations.json.",
                )
                return
            goal = {
                "x": room.x,
                "y": room.y,
                "yaw": room.yaw,
                "heading": math.degrees(room.yaw),
                "frame_id": room.frame_id,
            }
            destination = room.id

        if not goal and not destination:
            await _reject_navigation_command(
                sid,
                action,
                robot_id,
                "Destination is required for autonomous navigation.",
            )
            return

        if not get_bridge_sid(robot_id):
            await _reject_navigation_command(
                sid,
                action,
                robot_id,
                "Pi ROS bridge is offline. Start ros2_bridge (micro_ros_agent + Nav2).",
            )
            return

        enter_autonomous(
            robot_id,
            target_floor=target_floor,
            target_location=destination or goal.get("room_id"),
            eta_seconds=get_field(data, "eta_seconds", "etaSeconds"),
            speed=float(data.get("speed", 0.4)),
        )
        await _forward_to_bridge(
            robot_id,
            "navigate_to",
            speed=float(data.get("speed", 0.4)),
            target_floor=int(target_floor) if target_floor is not None else None,
            extra={
                "target_location": destination,
                "targetLocation": destination,
                "goal": goal,
            },
        )

    elif action in ("forward", "backward", "left", "right"):
        reject = manual_reject_message(state)
        if reject:
            await _reject_navigation_command(sid, action, robot_id, reject)
            return
        if not _motor_controller_ready(robot_id):
            await _reject_navigation_command(
                sid,
                action,
                robot_id,
                "ROS relay offline. Start micro_ros_agent + ros2_bridge for Manual /cmd_vel.",
            )
            return
        speed = data.get("speed", 0.5)
        enter_manual(robot_id, speed=float(speed))
        for robot in get_robots():
            if robot["id"] == robot_id:
                robot["speed"] = speed
        await _forward_to_bridge(robot_id, action, speed=float(speed))

    elif action == "stop":
        # Always allowed: cancel Nav2 + zero /cmd_vel + idle
        enter_idle(robot_id)
        for robot in get_robots():
            if robot["id"] == robot_id:
                robot["speed"] = 0.0
        await _forward_to_bridge(robot_id, "stop")

    elif action in ("front_servo_up", "front_servo_down", "rear_servo_up", "rear_servo_down"):
        await _reject_navigation_command(
            sid,
            action,
            robot_id,
            "Servo sweeps need a ROS servo API (Coming soon). UART bridge motor path is disabled.",
        )
        return

    elif action == "reset_map":
        clear_bridge_map(robot_id)
        clear_slam_map(robot_id)
        await sio.emit("lidar_map", {
            "robot_id": robot_id,
            "points": [],
            "fov": 360,
            "source": "bridge",
            "timestamp": now,
        })
        await sio.emit("slam_map_update", {
            "robot_id": robot_id,
            "cleared": True,
            "timestamp": now,
        })

    await sio.emit("nav_status", _build_nav_status_payload(robot_id))
    await sio.emit("command_ack", {
        "action": f"nav_{action}",
        "robot_id": robot_id,
        "status": "accepted",
        "timestamp": now,
    }, to=sid)

    print(f"[Socket.IO] Navigation: {action} → {robot_id}")


@sio.event
async def rfid_scan(sid: str, data: dict) -> None:
    """Handle real-time RFID scan from the frontend.

    Uses the same authorization path as REST so registered tags, names, and
    access logs stay consistent.
    """
    from src.api.api_v1.endpoints.rfid import authorize_scan
    from src.schemas.rfid import RFIDAuthorizeRequest

    tag_id = get_field(data, "tag_id", "tagId", default="")
    robot_id = get_field(data, "robot_id", "robotId", default=ROBOT_ID)
    delivery_id = get_field(data, "delivery_id", "deliveryId")

    result_model = await authorize_scan(
        RFIDAuthorizeRequest(
            tag_id=tag_id,
            robot_id=robot_id,
            delivery_id=delivery_id,
        )
    )
    result = result_model.model_dump(mode="json")

    # Send result back to the requesting client
    await sio.emit("rfid_result", result, to=sid)

    # Broadcast scan event to all connected clients (live activity feed)
    await sio.emit("rfid_event", {
        "tag_id": result["tag_id"],
        "robot_id": result["robot_id"],
        "delivery_id": result["delivery_id"],
        "authorized": result["authorized"],
        "user_name": result["user_name"],
        "scan_type": "unlock" if result["authorized"] else "denied",
        "message": result["message"],
        "timestamp": result["timestamp"],
    })

    print(f"[Socket.IO] RFID scan: {result['tag_id']} → {'authorized' if result['authorized'] else 'denied'}")


@sio.event
async def camera_snapshot(sid: str, data: dict) -> None:
    """Handle a snapshot request from the frontend.

    When a client requests a snapshot for a robot, we broadcast a
    simulated camera frame (base64 placeholder) to all subscribers.
    """
    robot_id = data.get("robotId", "")
    camera_source = data.get("cameraSource", "front")
    now = datetime.utcnow().isoformat()

    frame_payload = {
        "robot_id": robot_id,
        "camera_source": camera_source,
        "frame_type": "snapshot",
        "timestamp": now,
        # In production this would be a base64-encoded JPEG from the Pi Camera
        "frame_data": None,
        "resolution": "1280x720",
        "message": f"Snapshot captured from {robot_id} ({camera_source} camera)",
    }

    # Send frame to the requesting client
    await sio.emit("camera_frame", frame_payload, to=sid)

    # Broadcast notification to all clients
    await sio.emit("camera_event", {
        "type": "snapshot",
        "robot_id": robot_id,
        "camera_source": camera_source,
        "timestamp": now,
        "message": f"Snapshot captured from {robot_id}",
    })

    print(f"[Socket.IO] Camera snapshot: {robot_id} ({camera_source})")


@sio.event
async def camera_stream_toggle(sid: str, data: dict) -> None:
    """Start or stop a simulated camera stream for a robot."""
    robot_id = data.get("robotId", "")
    action = data.get("action", "start")  # "start" | "stop"
    now = datetime.utcnow().isoformat()

    await sio.emit("camera_event", {
        "type": f"stream_{action}",
        "robot_id": robot_id,
        "timestamp": now,
        "message": f"Camera stream {action}ed for {robot_id}",
    })

    await sio.emit("camera_stream_status", {
        "robot_id": robot_id,
        "active": action == "start",
        "timestamp": now,
    }, to=sid)

    print(f"[Socket.IO] Camera stream {action}: {robot_id}")


@sio.event
async def voice_command(sid: str, data: dict) -> None:
    """Handle real-time voice commands sent directly over WebSocket.

    Lightweight alternative to the REST endpoint: broadcasts voice_activity
    so all clients see who sent what.  Actual command execution should still
    go through POST /api/v1/voice/command for full NLP + safety checks.
    """
    text = data.get("text", "")
    robot_id = data.get("robotId", "robot-001")
    role = data.get("role", "operator")
    now = datetime.utcnow().isoformat()

    # Broadcast so all connected clients see the live activity
    await sio.emit("voice_activity", {
        "text": text,
        "robot_id": robot_id,
        "role": role,
        "action": "unknown",
        "executed": False,
        "message": f"Voice input received from {role}",
        "timestamp": now,
    })

    # Ack back to sender
    await sio.emit("command_ack", {
        "action": "voice_command",
        "robot_id": robot_id,
        "status": "received",
        "timestamp": now,
    }, to=sid)

    print(f"[Socket.IO] Voice command from {sid}: \"{text}\" → {robot_id}")


async def broadcast_new_photo(photo_data: dict) -> None:
    """Broadcast a new_photo event to all connected clients.

    Call this from the camera upload endpoint so the gallery can
    auto-refresh when new photos arrive.
    """
    if _connected_sids:
        await sio.emit("new_photo", {
            "photo": photo_data,
            "timestamp": datetime.utcnow().isoformat(),
            "message": "New photo uploaded",
        })
        print(f"[Socket.IO] Broadcast new_photo: {photo_data.get('id', 'unknown')}")


# ── Lifecycle ────────────────────────────────────────────────────────────

def start_telemetry_background_task() -> None:
    """Start the background telemetry loop. Call once at app startup."""
    global _telemetry_task
    if _telemetry_task is None:
        _telemetry_task = asyncio.ensure_future(_telemetry_loop())
        print("[Socket.IO] Telemetry background task started (2s interval)")
