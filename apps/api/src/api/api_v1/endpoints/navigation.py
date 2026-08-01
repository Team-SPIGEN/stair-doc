"""Navigation control endpoints for Stair-Doc.

Manual joystick → Socket.IO → ros2_bridge → geometry_msgs/Twist on /cmd_vel
  (micro_ros_agent on the ESP — NOT UART serial chars).

Autonomous Destination → locations.json lookup → NavigateToPose via ros2_bridge.

Manual and Autonomous are hard-separated: cross-mode commands return 409.
"""

import math
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from src.core.bridge import build_bridge_command_payload, get_bridge_sid, get_robot_pose
from src.core.locations import find_location, list_locations, normalize_destination
from src.core.nav_state import (
    arm_autonomous,
    assert_can_autonomous,
    assert_can_enter_mode,
    assert_can_manual,
    clear_emergency,
    enter_autonomous,
    enter_emergency,
    enter_idle,
    enter_manual,
    mode_of,
    require_known_robot,
)
from src.core.robot import ROBOT_ID
from src.core.socket import sio

from src.schemas.base import ApiResponse, success_response
from src.schemas.navigation import (
    AutonomousRequest,
    AutonomousResponse,
    CommandResponse,
    ManualCommandRequest,
    ModeSwitchRequest,
    NavigationCommand,
    NavigationMode,
    NavigationStatusResponse,
    NavGoalPose,
)

router = APIRouter(prefix="/navigation", tags=["navigation"])


def _assert_ros_bridge_ready(robot_id: str) -> None:
    """Manual and autonomous motion require ros2_bridge (Socket.IO → /cmd_vel / Nav2)."""
    if get_bridge_sid(robot_id):
        return
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "ROS relay offline. Start micro_ros_agent + ros2_bridge on the Pi "
            "(Manual /cmd_vel and Destination Nav2 share that stack)."
        ),
    )


async def _forward_to_bridge(
    robot_id: str,
    action: str,
    *,
    speed: float = 0.5,
    target_floor: int | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    sid = get_bridge_sid(robot_id)
    if not sid:
        return
    await sio.emit(
        "bridge_command",
        build_bridge_command_payload(
            action,
            robot_id,
            speed=speed,
            target_floor=target_floor,
            extra=extra,
        ),
        to=sid,
    )


def _estimate_eta(goal_x: float, goal_y: float) -> int:
    """Rough ETA from current pose (or origin) at ~0.4 m/s."""
    pose = get_robot_pose(ROBOT_ID)
    sx = float(pose["x"]) if pose else 0.0
    sy = float(pose["y"]) if pose else 0.0
    dist = math.hypot(goal_x - sx, goal_y - sy)
    return max(15, int(dist / 0.4) + 10)


async def _broadcast_nav_status(robot_id: str) -> None:
    """Keep Socket.IO clients in sync after REST mode changes."""
    from src.core.socket import _build_nav_status_payload

    await sio.emit("nav_status", _build_nav_status_payload(robot_id))


def _status_response(robot_id: str, now: datetime) -> NavigationStatusResponse:
    state = require_known_robot(robot_id)
    return NavigationStatusResponse(
        robot_id=robot_id,
        mode=NavigationMode(mode_of(state)),
        target_floor=state["target_floor"],
        target_location=state["target_location"],
        progress=round(state["progress"], 3),
        eta_seconds=state["eta_seconds"],
        current_speed=state["current_speed"],
        emergency_active=state["emergency_active"],
        timestamp=now,
    )


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get(
    "/locations",
    response_model=ApiResponse[dict],
    summary="List named Destinations",
    description=(
        "Returns rooms from maps/locations.json (id, aliases, map-frame x/y/yaw). "
        "Used by the Navigation page Destination field."
    ),
)
async def get_locations() -> dict:
    rooms = list_locations()
    return success_response(
        {"rooms": rooms, "count": len(rooms)},
        "Destination catalog",
    )


@router.post(
    "/command",
    response_model=ApiResponse[CommandResponse],
    summary="Send a manual navigation command",
    description=(
        "Send a directional command to a specific robot. "
        "Commands: forward, backward, left, right, stop, emergency_stop. "
        "Manual directions require idle/manual mode (409 if autonomous). "
        "Speed in m/s (0–1.0), duration in seconds (0 = continuous)."
    ),
)
async def send_command(body: ManualCommandRequest) -> dict:
    now = datetime.now(UTC)

    if body.command == NavigationCommand.EMERGENCY_STOP:
        enter_emergency(body.robot_id)
        result = CommandResponse(
            success=True,
            command=body.command.value,
            robot_id=body.robot_id,
            speed=0.0,
            timestamp=now,
        )
        await _forward_to_bridge(body.robot_id, body.command.value, speed=0.0)
        await _broadcast_nav_status(body.robot_id)
        return success_response(result, "Emergency stop activated")

    if body.command == NavigationCommand.STOP:
        enter_idle(body.robot_id)
        result = CommandResponse(
            success=True,
            command=body.command.value,
            robot_id=body.robot_id,
            speed=0.0,
            timestamp=now,
        )
        await _forward_to_bridge(body.robot_id, body.command.value, speed=0.0)
        await _broadcast_nav_status(body.robot_id)
        return success_response(
            result,
            f"Command '{body.command.value}' sent to {body.robot_id}",
        )

    state = require_known_robot(body.robot_id)
    assert_can_manual(state)
    enter_manual(body.robot_id, speed=body.speed)

    result = CommandResponse(
        success=True,
        command=body.command.value,
        robot_id=body.robot_id,
        speed=body.speed,
        timestamp=now,
    )
    await _forward_to_bridge(body.robot_id, body.command.value, speed=body.speed)
    await _broadcast_nav_status(body.robot_id)
    return success_response(
        result,
        f"Command '{body.command.value}' sent to {body.robot_id}",
    )


@router.post(
    "/autonomous",
    response_model=ApiResponse[AutonomousResponse],
    summary="Start autonomous navigation to a Destination",
    description=(
        "Look up Destination in maps/locations.json and send a Nav2 NavigateToPose "
        "goal via ros2_bridge (Socket.IO → ROS 2). Requires idle or armed autonomous "
        "(409 if Manual or an Autonomous goal is already active)."
    ),
)
async def start_autonomous(body: AutonomousRequest) -> dict:
    now = datetime.now(UTC)
    state = require_known_robot(body.robot_id)
    assert_can_autonomous(state)

    destination = normalize_destination(body.target_location)
    if not destination:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Destination is required. Enter a room name from the locations catalog.",
        )

    room = find_location(destination)
    if room is None:
        known = ", ".join(r["id"] for r in list_locations()) or "(catalog empty)"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Unknown destination {destination!r}. "
                f"Known rooms: {known}. Edit maps/locations.json to add rooms."
            ),
        )

    _assert_ros_bridge_ready(body.robot_id)

    eta_seconds = _estimate_eta(room.x, room.y)
    eta_minutes = eta_seconds // 60
    eta_remaining_seconds = eta_seconds % 60
    eta_display = (
        f"{eta_minutes}min {eta_remaining_seconds}s"
        if eta_minutes > 0
        else f"{eta_seconds}s"
    )

    goal = NavGoalPose(
        x=room.x,
        y=room.y,
        yaw=room.yaw,
        frame_id=room.frame_id,
        room_id=room.id,
        map=room.map,
    )

    path = [
        {
            "x": room.x,
            "y": room.y,
            "floor": body.target_floor,
            "label": room.id,
            "yaw": room.yaw,
        }
    ]

    enter_autonomous(
        body.robot_id,
        target_floor=body.target_floor,
        target_location=destination,
        eta_seconds=eta_seconds,
        speed=0.4,
    )

    await _forward_to_bridge(
        body.robot_id,
        "navigate_to",
        speed=0.4,
        target_floor=body.target_floor,
        extra={
            "target_location": destination,
            "targetLocation": destination,
            "room_id": room.id,
            "goal": {
                "x": room.x,
                "y": room.y,
                "yaw": room.yaw,
                "heading": math.degrees(room.yaw),
                "frame_id": room.frame_id,
            },
        },
    )
    await _broadcast_nav_status(body.robot_id)

    result = AutonomousResponse(
        success=True,
        robot_id=body.robot_id,
        target_floor=body.target_floor,
        target_location=destination,
        goal=goal,
        eta_seconds=eta_seconds,
        eta_display=eta_display,
        path=path,
        message=(
            f"Nav2 goal sent to {room.id} "
            f"({room.x:.3f}, {room.y:.3f}, yaw={room.yaw:.3f} rad)"
        ),
        timestamp=now,
    )
    return success_response(result, result.message)


@router.post(
    "/mode",
    response_model=ApiResponse[NavigationStatusResponse],
    summary="Enter or exit a navigation mode",
    description=(
        "Hub Enter Manual / Enter Autonomous / Exit. "
        "Entering requires idle (or already that mode). "
        "Exiting (idle) cancels Nav2 + zeros /cmd_vel. "
        "Enter Autonomous arms the mode (blocks Manual) but does not send a Nav2 goal — "
        "use POST /autonomous to start Destination navigation."
    ),
)
async def switch_mode(body: ModeSwitchRequest) -> dict:
    now = datetime.now(UTC)
    state = require_known_robot(body.robot_id)
    target = body.mode.value

    if target == NavigationMode.IDLE.value:
        enter_idle(body.robot_id)
        await _forward_to_bridge(body.robot_id, "stop", speed=0.0)
    elif target == NavigationMode.MANUAL.value:
        assert_can_enter_mode(state, target)
        enter_manual(body.robot_id, speed=0.0)
    elif target == NavigationMode.AUTONOMOUS.value:
        arm_autonomous(body.robot_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported mode '{target}'",
        )

    await _broadcast_nav_status(body.robot_id)
    return success_response(
        _status_response(body.robot_id, now),
        f"Mode set to {mode_of(require_known_robot(body.robot_id))}",
    )


@router.get(
    "/status",
    response_model=ApiResponse[NavigationStatusResponse],
    summary="Get navigation status",
    description="Returns the current navigation state for a specific robot.",
)
async def get_nav_status(
    robot_id: str = Query("robot-001", description="Robot ID"),
) -> dict:
    return success_response(
        _status_response(robot_id, datetime.now(UTC)),
        "Navigation status retrieved",
    )


@router.post(
    "/reset-estop",
    response_model=ApiResponse[CommandResponse],
    summary="Reset emergency stop",
    description="Clear the emergency stop state so commands can be sent again.",
)
async def reset_emergency_stop(
    robot_id: str = Query("robot-001", description="Robot ID"),
) -> dict:
    now = datetime.now(UTC)
    clear_emergency(robot_id)

    result = CommandResponse(
        success=True,
        command="reset_estop",
        robot_id=robot_id,
        speed=0.0,
        timestamp=now,
    )
    await _forward_to_bridge(robot_id, "stop", speed=0.0)
    await _broadcast_nav_status(robot_id)
    return success_response(result, "Emergency stop reset")
