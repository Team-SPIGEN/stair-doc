#!/usr/bin/env python3
"""
ros2_bridge.py — ROS 2 → Stair-Doc Socket.IO relay (SLAM / Nav2 mode)
======================================================================

Subscribes to the robot's live ROS 2 topics and forwards data to the
Stair-Doc FastAPI backend via Socket.IO, using the same bridge_register
protocol as bridge.py — but this script claims the bridge slot instead.

Run via start_ros2_bridge.sh (which stops the conflicting services first):

    bash ~/stairbot_firmware/start_ros2_bridge.sh [mapping|localization]

Or manually (ROS 2 env must already be sourced):

    source /opt/ros/humble/setup.bash
    source ~/micro_ros_ws/install/setup.bash
    python3 ~/stairbot_firmware/ros2_bridge.py --mode mapping

Environment variables (loaded from .env in the same directory):
    STAIRDOC_API_URL        Backend URL (default: http://localhost:8000)
    ROBOT_BRIDGE_TOKEN      Must match API ROBOT_BRIDGE_TOKEN setting
    ROBOT_ID                Default: stairbot-001
    SLAM_MODE               mapping | localization (default: mapping)
    MAP_POINTS_MAX          Max obstacle cells per slam_map event (default: 2000)
    SCAN_RATE_HZ            /scan emit rate (default: 5 Hz)
    MAP_RATE_HZ             /map emit rate (default: 1 Hz)

Requires (Pi):
    pip install "python-socketio[asyncio]" aiohttp python-dotenv
    (rclpy is available after sourcing the ROS 2 workspace)

Resource ownership when this script is running:
    /dev/sensors/esp32  → micro_ros_agent (NOT this script)
    Socket.IO slot      → THIS script (bridge.py must be in ESP32_ENABLED=false)
    GPIO / RFID / Cam   → bridge.py in sensors-only mode (no conflict)
"""

from __future__ import annotations

import argparse
import asyncio
import atexit
import fcntl
import math
import os
import signal
import sys
import time
from pathlib import Path
from typing import Any

# Load .env from the same directory as this script
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

import socketio  # python-socketio[asyncio]

# ── Config ────────────────────────────────────────────────────────────────
API_URL         = os.getenv("STAIRDOC_API_URL", "http://localhost:8000").rstrip("/")
BRIDGE_TOKEN    = os.getenv("ROBOT_BRIDGE_TOKEN", "")
ROBOT_ID        = os.getenv("ROBOT_ID", "robot-001")
MAP_POINTS_MAX  = int(os.getenv("MAP_POINTS_MAX", "2000"))
SCAN_RATE_HZ    = float(os.getenv("SCAN_RATE_HZ", "5"))
MAP_RATE_HZ     = float(os.getenv("MAP_RATE_HZ", "1"))
# Named Destinations for NavigateToPose (same schema as maps/locations.json)
_LOCATIONS_CANDIDATES = [
    os.getenv("STAIRDOC_LOCATIONS_FILE", "").strip(),
    str(Path(__file__).parent / "locations.json"),
    str(Path.home() / "maps" / "locations.json"),
    "/home/spigen/maps/locations.json",
]

SCAN_INTERVAL = 1.0 / SCAN_RATE_HZ
MAP_INTERVAL  = 1.0 / MAP_RATE_HZ

# ── Locations catalog ─────────────────────────────────────────────────────
_locations_by_key: dict[str, dict[str, Any]] = {}


def _load_locations() -> None:
    """Load maps/locations.json (id + aliases → x,y,yaw radians)."""
    global _locations_by_key
    _locations_by_key = {}
    path = next((p for p in _LOCATIONS_CANDIDATES if p and Path(p).exists()), None)
    if not path:
        print(
            "[ros2_bridge] No locations.json found — Destination lookup disabled. "
            "Copy maps/locations.json to ~/maps/ or set STAIRDOC_LOCATIONS_FILE."
        )
        return
    try:
        import json
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        for room in raw.get("rooms") or []:
            entry = {
                "id": str(room["id"]),
                "x": float(room["x"]),
                "y": float(room["y"]),
                "yaw": float(room.get("yaw", 0.0)),
                "frame_id": str(room.get("frame_id", "map")),
            }
            keys = [entry["id"].lower()]
            for alias in room.get("aliases") or []:
                keys.append(str(alias).strip().lower())
            for key in keys:
                if key:
                    _locations_by_key[key] = entry
        print(f"[ros2_bridge] Loaded {len(raw.get('rooms') or [])} rooms from {path}")
    except Exception as exc:
        print(f"[ros2_bridge] Failed to load locations from {path}: {exc}")


def _resolve_location(name: str) -> dict[str, Any] | None:
    return _locations_by_key.get(str(name).strip().lower())

# ── PID lock ──────────────────────────────────────────────────────────────
_PID_LOCK_PATH = Path("/tmp/ros2-bridge.pid")
_pid_lock_file = None  # held open for fcntl


def _acquire_pid_lock() -> None:
    """Ensure only one ros2_bridge instance runs at a time."""
    global _pid_lock_file
    try:
        _pid_lock_file = open(_PID_LOCK_PATH, "w")
        fcntl.flock(_pid_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _pid_lock_file.write(str(os.getpid()))
        _pid_lock_file.flush()

        def _release() -> None:
            try:
                fcntl.flock(_pid_lock_file, fcntl.LOCK_UN)
                _pid_lock_file.close()
                _PID_LOCK_PATH.unlink(missing_ok=True)
            except Exception:
                pass

        atexit.register(_release)
    except BlockingIOError:
        pid = _PID_LOCK_PATH.read_text().strip() if _PID_LOCK_PATH.exists() else "unknown"
        print(
            f"[PID Lock] Another ros2_bridge instance is already running (PID {pid}).\n"
            f"           Run 'kill {pid}' or use start_ros2_bridge.sh to restart."
        )
        sys.exit(1)


# ── Shared state (written by ROS 2 callbacks, read by async emit loops) ───
_latest_scan: list[dict]       = []   # [{angle°, distance m}]
_latest_map_pts: list[dict]    = []   # [{x m, y m}] world frame
_map_meta: dict[str, Any]      = {}   # OccupancyGrid header fields
_latest_amcl_pose: dict | None = None # {x, y, heading°} from /amcl_pose
_latest_odom_pose: dict | None = None # {x, y, heading°} from /odom (fallback)

# ── Async stop event ──────────────────────────────────────────────────────
_shutdown = asyncio.Event()

# ── ROS 2 node (set by _init_ros) ─────────────────────────────────────────
_ros_node     = None
_cmd_vel_pub  = None
_nav_client   = None
_nav_goal_handle = None  # latest NavigateToPose goal handle (for cancel)
_nav_goal_active = False  # True while a Nav2 goal is outstanding
_nav2_ready   = False
_micro_ros_ok = False


# ── Socket.IO client ──────────────────────────────────────────────────────
sio = socketio.AsyncClient(
    reconnection=True,
    reconnection_attempts=0,
    reconnection_delay=3,
    reconnection_delay_max=30,
)


@sio.event
async def connect() -> None:
    print(f"[ros2_bridge] Connected to {API_URL}")
    payload: dict[str, Any] = {"robot_id": ROBOT_ID}
    if BRIDGE_TOKEN:
        payload["token"] = BRIDGE_TOKEN
    await sio.emit("bridge_register", payload)


@sio.event
async def bridge_register_ack(data: dict) -> None:
    print(f"[ros2_bridge] Registered: {data}")


@sio.event
async def disconnect() -> None:
    print("[ros2_bridge] Disconnected from API (will reconnect)")


def _publish_zero_twist() -> None:
    """Publish a zero Twist once to clear lingering Manual /cmd_vel."""
    if _cmd_vel_pub is None:
        return
    from geometry_msgs.msg import Twist  # type: ignore[import]

    _cmd_vel_pub.publish(Twist())


@sio.event
async def bridge_command(data: dict) -> None:
    """Forward navigation commands from the PWA to ROS 2 /cmd_vel or Nav2.

    Defense in depth: refuse Manual Twist while a Nav2 goal is active;
    refuse a second navigate_to until stop; zero Twist before Nav2 goals.
    """
    global _nav_goal_active
    action = data.get("action", "")
    speed  = float(data.get("speed", 0.3))
    print(f"[ros2_bridge] bridge_command: {action!r}  speed={speed}")

    if _ros_node is None or _cmd_vel_pub is None:
        print("[ros2_bridge] ROS 2 not ready — command ignored")
        return

    if action in ("stop", "emergency_stop"):
        await _cancel_nav_goal()
        _nav_goal_active = False
        _publish_zero_twist()
        print(f"[ros2_bridge] {action}: Nav2 cancelled + cmd_vel zeroed")
        return

    if action == "navigate_to":
        if _nav_goal_active:
            print(
                "[ros2_bridge] REFUSE navigate_to — Nav2 goal already active. "
                "Send stop before a new Destination."
            )
            return
        goal = data.get("goal") or {}
        # Prefer yaw (radians). Fall back to heading (degrees) for legacy clients.
        if "yaw" in goal and goal["yaw"] is not None:
            yaw_rad = float(goal["yaw"])
        else:
            yaw_rad = math.radians(float(goal.get("heading", 0)))
        label = data.get("target_location") or data.get("room_id") or "goal"
        print(
            f"[ros2_bridge] navigate_to {label!r} -> "
            f"({goal.get('x')}, {goal.get('y')}) yaw={yaw_rad:.3f} rad"
        )
        # Clear any lingering Manual Twist before Nav2 takes /cmd_vel
        _publish_zero_twist()
        await _send_nav_goal(
            float(goal.get("x", 0)),
            float(goal.get("y", 0)),
            yaw_rad,
            frame_id=str(goal.get("frame_id", "map")),
        )
        return

    if action == "autonomous":
        if _nav_goal_active:
            print(
                "[ros2_bridge] REFUSE autonomous — Nav2 goal already active. "
                "Send stop before a new Destination."
            )
            return
        # Fallback path: resolve Destination on the Pi if API did not send a goal
        target_location = data.get("target_location") or data.get("targetLocation") or ""
        room = _resolve_location(str(target_location))
        if room is None:
            print(
                f"[ros2_bridge] Unknown destination {target_location!r} — "
                "refusing Nav2 goal (edit locations.json)"
            )
            return
        print(
            f"[ros2_bridge] Autonomous {target_location!r} -> "
            f"({room['x']}, {room['y']}) yaw={room['yaw']:.3f}"
        )
        _publish_zero_twist()
        await _send_nav_goal(room["x"], room["y"], room["yaw"], frame_id=room["frame_id"])
        return

    if action in ("forward", "backward", "left", "right"):
        if _nav_goal_active:
            print(
                f"[ros2_bridge] REFUSE {action} — Nav2 goal active "
                "(Manual and Autonomous cannot share /cmd_vel)"
            )
            return
        from geometry_msgs.msg import Twist  # type: ignore[import]
        twist = Twist()
        if action == "forward":
            twist.linear.x = speed
        elif action == "backward":
            twist.linear.x = -speed
        elif action == "left":
            twist.angular.z = speed * 2.0
        elif action == "right":
            twist.angular.z = -speed * 2.0
        _cmd_vel_pub.publish(twist)
        return

    print(f"[ros2_bridge] Unknown action {action!r} — ignored")


# ── ROS 2 topic callbacks (called from rclpy spin in a thread) ────────────

def _laser_callback(msg: Any) -> None:
    """Convert LaserScan → [{angle°, distance m}]."""
    global _latest_scan
    pts: list[dict] = []
    angle_rad = msg.angle_min
    for r in msg.ranges:
        if msg.range_min < r < msg.range_max:
            pts.append({
                "angle":    round(math.degrees(angle_rad) % 360, 2),
                "distance": round(r, 3),
            })
        angle_rad += msg.angle_increment
    _latest_scan = pts


def _map_callback(msg: Any) -> None:
    """Convert OccupancyGrid → downsampled world-frame obstacle points."""
    global _latest_map_pts, _map_meta
    w   = msg.info.width
    h   = msg.info.height
    res = msg.info.resolution
    ox  = msg.info.origin.position.x
    oy  = msg.info.origin.position.y

    _map_meta = {
        "width":      w,
        "height":     h,
        "resolution": res,
        "origin_x":   ox,
        "origin_y":   oy,
    }

    # Occupied cells: OccupancyGrid values ≥ 65 (0=free, 100=occupied, -1=unknown)
    pts: list[dict] = []
    for i, val in enumerate(msg.data):
        if val >= 65:
            col = i % w
            row = i // w
            pts.append({
                "x": round(ox + (col + 0.5) * res, 3),
                "y": round(oy + (row + 0.5) * res, 3),
            })

    # Uniform downsampling to MAP_POINTS_MAX
    if len(pts) > MAP_POINTS_MAX:
        stride = max(1, len(pts) // MAP_POINTS_MAX)
        pts = pts[::stride]

    _latest_map_pts = pts


_latest_weight_kg: float = 0.0


def _weight_callback(msg: Any) -> None:
    """Callback for /stairbot/weight (Float32 in grams)."""
    global _latest_weight_kg
    try:
        _latest_weight_kg = round(float(msg.data) / 1000.0, 3)
    except (ValueError, TypeError):
        pass


def _quat_to_yaw_deg(q: Any) -> float:
    """Extract yaw angle (degrees) from a ROS 2 quaternion."""
    yaw_rad = math.atan2(
        2.0 * (q.w * q.z + q.x * q.y),
        1.0 - 2.0 * (q.y * q.y + q.z * q.z),
    )
    return round(math.degrees(yaw_rad), 2)


def _amcl_callback(msg: Any) -> None:
    """Extract localized pose from /amcl_pose (PoseWithCovarianceStamped)."""
    global _latest_amcl_pose
    p = msg.pose.pose
    _latest_amcl_pose = {
        "x":       round(p.position.x, 3),
        "y":       round(p.position.y, 3),
        "heading": _quat_to_yaw_deg(p.orientation),
    }


def _odom_callback(msg: Any) -> None:
    """Extract pose from /odom (Odometry) — fallback when AMCL not running."""
    global _latest_odom_pose
    p = msg.pose.pose
    _latest_odom_pose = {
        "x":       round(p.position.x, 3),
        "y":       round(p.position.y, 3),
        "heading": _quat_to_yaw_deg(p.orientation),
    }


async def _cancel_nav_goal() -> None:
    """Cancel the active NavigateToPose goal if any."""
    global _nav_goal_handle, _nav_goal_active
    handle = _nav_goal_handle
    _nav_goal_handle = None
    _nav_goal_active = False
    if handle is None:
        return
    try:
        handle.cancel_goal_async()
        print("[ros2_bridge] Nav2 goal cancel requested")
    except Exception as exc:
        print(f"[ros2_bridge] Nav2 cancel error: {exc}")


async def _send_nav_goal(
    x: float,
    y: float,
    yaw_rad: float,
    *,
    frame_id: str = "map",
) -> None:
    """Send a NavigateToPose goal to Nav2 (yaw in radians)."""
    global _nav_goal_handle, _nav_goal_active
    if _nav_client is None:
        print("[ros2_bridge] Nav2 action client not ready — goal ignored")
        return
    try:
        from nav2_msgs.action import NavigateToPose  # type: ignore[import]
        from geometry_msgs.msg import PoseStamped    # type: ignore[import]

        if not _nav_client.server_is_ready():
            print("[ros2_bridge] Waiting for navigate_to_pose action server…")
            ready = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _nav_client.wait_for_server(timeout_sec=5.0)
            )
            if not ready:
                print("[ros2_bridge] Nav2 action server not available — goal not sent")
                return

        goal_msg  = NavigateToPose.Goal()
        ps        = PoseStamped()
        ps.header.frame_id = frame_id or "map"
        ps.pose.position.x = x
        ps.pose.position.y = y
        ps.pose.orientation.z = math.sin(yaw_rad / 2.0)
        ps.pose.orientation.w = math.cos(yaw_rad / 2.0)
        goal_msg.pose = ps

        # Mark active as soon as we submit so Manual Twist is refused immediately
        _nav_goal_active = True

        def _on_goal_response(fut: Any) -> None:
            global _nav_goal_handle, _nav_goal_active
            try:
                goal_handle = fut.result()
                if not goal_handle.accepted:
                    _nav_goal_active = False
                    print("[ros2_bridge] Nav2 goal REJECTED by action server")
                    return
                _nav_goal_handle = goal_handle
                print(
                    f"[ros2_bridge] Nav2 goal ACCEPTED: ({x:.3f}, {y:.3f}) "
                    f"yaw={yaw_rad:.3f} rad frame={frame_id}"
                )

                def _on_result(result_fut: Any) -> None:
                    global _nav_goal_handle, _nav_goal_active
                    _nav_goal_active = False
                    _nav_goal_handle = None
                    try:
                        result = result_fut.result()
                        status = getattr(result, "status", None)
                        print(f"[ros2_bridge] Nav2 goal finished (status={status})")
                    except Exception as exc:
                        print(f"[ros2_bridge] Nav2 result error: {exc}")

                result_future = goal_handle.get_result_async()
                result_future.add_done_callback(_on_result)
            except Exception as exc:
                _nav_goal_active = False
                print(f"[ros2_bridge] Nav2 goal response error: {exc}")

        send_future = _nav_client.send_goal_async(goal_msg)
        send_future.add_done_callback(_on_goal_response)
        print(f"[ros2_bridge] Nav2 goal submitted: ({x:.3f}, {y:.3f}) yaw={yaw_rad:.3f}")
    except Exception as exc:
        _nav_goal_active = False
        print(f"[ros2_bridge] Nav2 goal error: {exc}")


def _check_micro_ros_agent() -> bool:
    """Return True if micro_ros_agent is running (required for ESP32 comms)."""
    import subprocess
    try:
        result = subprocess.run(
            ["pgrep", "-f", "micro_ros_agent"],
            capture_output=True, timeout=3,
        )
        return result.returncode == 0
    except Exception:
        return False  # can't tell — don't block startup


def _init_ros(slam_mode: str, max_retries: int = 5) -> Any:
    """Initialise rclpy with retry logic (agent may not be ready yet)."""
    global _ros_node, _cmd_vel_pub, _nav_client, _nav2_ready
    import rclpy                                                            # type: ignore[import]
    from rclpy.node import Node                                             # type: ignore[import]
    from sensor_msgs.msg import LaserScan                                   # type: ignore[import]
    from nav_msgs.msg import OccupancyGrid, Odometry                       # type: ignore[import]
    from geometry_msgs.msg import PoseWithCovarianceStamped, Twist         # type: ignore[import]
    from std_msgs.msg import Float32                                       # type: ignore[import]

    for attempt in range(1, max_retries + 1):
        try:
            if not rclpy.ok():
                rclpy.init()
            node = rclpy.create_node("ros2_bridge_relay")
            break
        except Exception as exc:
            print(f"[ros2_bridge] rclpy init attempt {attempt}/{max_retries} failed: {exc}")
            if attempt == max_retries:
                print("[ros2_bridge] Could not initialise ROS 2 — is the workspace sourced?")
                sys.exit(1)
            time.sleep(2)

    _ros_node = node

    node.create_subscription(LaserScan,                  "/scan",      _laser_callback, 10)
    node.create_subscription(OccupancyGrid,              "/map",       _map_callback,    1)
    node.create_subscription(Odometry,                   "/odom",      _odom_callback,  10)
    node.create_subscription(PoseWithCovarianceStamped,  "/amcl_pose", _amcl_callback,  10)
    node.create_subscription(Float32,                    "/stairbot/weight", _weight_callback, 10)

    _cmd_vel_pub = node.create_publisher(Twist, "/cmd_vel", 10)

    # Nav2 action client — optional (Nav2 may not be running in mapping mode)
    try:
        from rclpy.action import ActionClient       # type: ignore[import]
        from nav2_msgs.action import NavigateToPose  # type: ignore[import]
        _nav_client = ActionClient(node, NavigateToPose, "navigate_to_pose")
        _nav2_ready = True
        print("[ros2_bridge] Nav2 action client ready")
    except Exception as exc:
        _nav2_ready = False
        print(f"[ros2_bridge] Nav2 not available ({exc}) — navigate_to goal disabled")

    print(
        f"[ros2_bridge] ROS 2 ready  mode={slam_mode}  "
        "subscribed: /scan /map /odom /amcl_pose /stairbot/weight"
    )
    return node


# ── Async emit loops ───────────────────────────────────────────────────────

async def _emit_scan_loop() -> None:
    """Emit bridge_lidar at SCAN_RATE_HZ."""
    while not _shutdown.is_set():
        await asyncio.sleep(SCAN_INTERVAL)
        pts = _latest_scan
        if pts and sio.connected:
            try:
                await sio.emit("bridge_lidar", {
                    "robot_id": ROBOT_ID,
                    "points":   pts,
                    "source":   "rplidar_c1",
                })
            except Exception as exc:
                print(f"[ros2_bridge] scan emit error: {exc}")


async def _emit_map_loop(slam_mode: str) -> None:
    """Emit slam_map + bridge_pose + bridge_telemetry at MAP_RATE_HZ."""
    while not _shutdown.is_set():
        await asyncio.sleep(MAP_INTERVAL)
        if not sio.connected:
            continue

        # Best-available pose: AMCL (localisation) > odom (mapping)
        pose = _latest_amcl_pose if slam_mode == "localization" else (_latest_amcl_pose or _latest_odom_pose)

        # SLAM map snapshot
        if _latest_map_pts and _map_meta:
            try:
                await sio.emit("slam_map", {
                    "robot_id":        ROBOT_ID,
                    **_map_meta,
                    "slam_mode":       slam_mode,
                    "map_points":      _latest_map_pts,
                    "obstacle_points": _latest_scan[:500],
                })
            except Exception as exc:
                print(f"[ros2_bridge] map emit error: {exc}")

        # Robot pose
        if pose:
            try:
                await sio.emit("bridge_pose", {"robot_id": ROBOT_ID, **pose})
                # Also push to telemetry so the dashboard shows live x/y + ROS readiness
                await sio.emit("bridge_telemetry", {
                    "robot_id": ROBOT_ID,
                    "location": {"x": pose["x"], "y": pose["y"]},
                    "sensors":  {
                        "esp32_connected": _micro_ros_ok,
                        "esp32_connection": "micro-ros",
                        "esp32_port": "micro_ros_agent",
                    },
                    "ros2": {
                        "ready": True,
                        "nav2_ready": _nav2_ready,
                        "micro_ros_agent": _micro_ros_ok,
                        "amcl_ready": _latest_amcl_pose is not None,
                        "slam_mode": slam_mode,
                        "cmd_vel": True,
                    },
                })
            except Exception as exc:
                print(f"[ros2_bridge] pose emit error: {exc}")


async def _ros_spin_loop(node: Any) -> None:
    """Spin rclpy in short bursts, yielding to the asyncio event loop."""
    import rclpy  # type: ignore[import]
    while not _shutdown.is_set():
        rclpy.spin_once(node, timeout_sec=0.0)
        await asyncio.sleep(0.01)


# ── Graceful shutdown ──────────────────────────────────────────────────────

async def _shutdown_handler() -> None:
    """Disconnect Socket.IO and shut down rclpy cleanly."""
    _shutdown.set()
    if sio.connected:
        try:
            await sio.emit("bridge_unregister", {"robot_id": ROBOT_ID})
            await asyncio.sleep(0.3)
        except Exception:
            pass
        await sio.disconnect()
    if _ros_node is not None:
        try:
            import rclpy  # type: ignore[import]
            rclpy.shutdown()
        except Exception:
            pass
    print("[ros2_bridge] Stopped cleanly")


def _install_signal_handlers(loop: asyncio.AbstractEventLoop) -> None:
    def _sig(_signum: int, _frame: object) -> None:
        print("[ros2_bridge] Signal received — shutting down gracefully")
        loop.call_soon_threadsafe(lambda: asyncio.ensure_future(_shutdown_handler()))

    signal.signal(signal.SIGTERM, _sig)
    signal.signal(signal.SIGINT,  _sig)


# ── Main ───────────────────────────────────────────────────────────────────

async def _main(slam_mode: str) -> None:
    global _micro_ros_ok
    print(f"[ros2_bridge] Starting  robot={ROBOT_ID}  mode={slam_mode}  api={API_URL}")

    _load_locations()

    # Warn if micro_ros_agent is not detected
    _micro_ros_ok = _check_micro_ros_agent()
    if not _micro_ros_ok:
        print(
            "[ros2_bridge] WARNING: micro_ros_agent not detected. "
            "ESP32 /cmd_vel will not reach the hardware. "
            "Autonomy requires micro_ros_agent on /dev/sensors/esp32 "
            "(do NOT run UART bridge.py against the same port). "
            "Run 'bash ~/stairbot_firmware/start_nav.sh' first."
        )

    # Initialise ROS 2
    node = _init_ros(slam_mode)

    # Connect to the Stair-Doc API (non-blocking — reconnects automatically)
    try:
        await sio.connect(API_URL, transports=["websocket"])
    except Exception as exc:
        print(f"[ros2_bridge] Initial connect failed ({exc}) — will retry automatically")

    await asyncio.gather(
        _ros_spin_loop(node),
        _emit_scan_loop(),
        _emit_map_loop(slam_mode),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Stair-Doc ROS 2 → Socket.IO relay")
    parser.add_argument(
        "--mode",
        choices=["mapping", "localization"],
        default=os.getenv("SLAM_MODE", "mapping"),
        help="SLAM mode: 'mapping' (build map live) or 'localization' (navigate on saved map)",
    )
    args = parser.parse_args()

    _acquire_pid_lock()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    _install_signal_handlers(loop)

    try:
        loop.run_until_complete(_main(args.mode))
    except (KeyboardInterrupt, SystemExit):
        loop.run_until_complete(_shutdown_handler())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
