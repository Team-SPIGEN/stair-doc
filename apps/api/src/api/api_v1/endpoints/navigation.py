"""Navigation control endpoints for Stair-Doc.

Provides manual joystick commands, autonomous navigation,
and navigation status — all with mock in-memory state.
"""

import random
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from src.schemas.base import ApiResponse, success_response
from src.schemas.navigation import (
    AutonomousRequest,
    AutonomousResponse,
    CommandResponse,
    ManualCommandRequest,
    NavigationCommand,
    NavigationMode,
    NavigationStatusResponse,
)

router = APIRouter(prefix="/navigation", tags=["navigation"])

# ── Mock In-Memory State ─────────────────────────────────────────────────

_nav_state: dict[str, dict] = {
    "robot-001": {
        "mode": NavigationMode.IDLE,
        "target_floor": None,
        "target_location": None,
        "progress": 0.0,
        "eta_seconds": None,
        "current_speed": 0.0,
        "emergency_active": False,
    },
    "robot-002": {
        "mode": NavigationMode.IDLE,
        "target_floor": None,
        "target_location": None,
        "progress": 0.0,
        "eta_seconds": None,
        "current_speed": 0.0,
        "emergency_active": False,
    },
    "robot-003": {
        "mode": NavigationMode.IDLE,
        "target_floor": None,
        "target_location": None,
        "progress": 0.0,
        "eta_seconds": None,
        "current_speed": 0.0,
        "emergency_active": False,
    },
    "robot-004": {
        "mode": NavigationMode.IDLE,
        "target_floor": None,
        "target_location": None,
        "progress": 0.0,
        "eta_seconds": None,
        "current_speed": 0.0,
        "emergency_active": False,
    },
}


def _get_nav_state(robot_id: str) -> dict:
    """Get or create navigation state for a robot."""
    if robot_id not in _nav_state:
        _nav_state[robot_id] = {
            "mode": NavigationMode.IDLE,
            "target_floor": None,
            "target_location": None,
            "progress": 0.0,
            "eta_seconds": None,
            "current_speed": 0.0,
            "emergency_active": False,
        }
    return _nav_state[robot_id]


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post(
    "/command",
    response_model=ApiResponse[CommandResponse],
    summary="Send a manual navigation command",
    description=(
        "Send a directional command to a specific robot. "
        "Commands: forward, backward, left, right, stop, emergency_stop. "
        "Speed in m/s (0–1.0), duration in seconds (0 = continuous)."
    ),
)
async def send_command(body: ManualCommandRequest) -> dict:
    state = _get_nav_state(body.robot_id)
    now = datetime.now(UTC)

    if body.command == NavigationCommand.EMERGENCY_STOP:
        state["mode"] = NavigationMode.EMERGENCY
        state["current_speed"] = 0.0
        state["emergency_active"] = True
        state["progress"] = 0.0
        state["target_floor"] = None
        state["target_location"] = None
        state["eta_seconds"] = None

        result = CommandResponse(
            success=True,
            command=body.command.value,
            robot_id=body.robot_id,
            speed=0.0,
            timestamp=now,
        )
        return success_response(result, "Emergency stop activated")

    if state["emergency_active"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Emergency stop is active. Reset before sending commands.",
        )

    if body.command == NavigationCommand.STOP:
        state["current_speed"] = 0.0
        if state["mode"] == NavigationMode.MANUAL:
            state["mode"] = NavigationMode.IDLE
    else:
        state["mode"] = NavigationMode.MANUAL
        state["current_speed"] = body.speed

    result = CommandResponse(
        success=True,
        command=body.command.value,
        robot_id=body.robot_id,
        speed=body.speed if body.command != NavigationCommand.STOP else 0.0,
        timestamp=now,
    )
    return success_response(
        result,
        f"Command '{body.command.value}' sent to {body.robot_id}",
    )


@router.post(
    "/autonomous",
    response_model=ApiResponse[AutonomousResponse],
    summary="Start autonomous navigation",
    description=(
        "Command a robot to autonomously navigate to a target floor/location. "
        "Returns estimated ETA and planned waypoint path."
    ),
)
async def start_autonomous(body: AutonomousRequest) -> dict:
    state = _get_nav_state(body.robot_id)
    now = datetime.now(UTC)

    if state["emergency_active"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Emergency stop is active. Reset before navigating.",
        )

    # Simulate ETA: ~30s per floor difference
    current_floor = random.choice([1, 2, 3])
    floor_diff = abs(body.target_floor - current_floor)
    eta_seconds = max(30, floor_diff * 30 + random.randint(10, 60))
    eta_minutes = eta_seconds // 60
    eta_remaining_seconds = eta_seconds % 60
    eta_display = (
        f"{eta_minutes}min {eta_remaining_seconds}s"
        if eta_minutes > 0
        else f"{eta_seconds}s"
    )

    # Simulate waypoint path
    path = [
        {"x": 50.0, "y": 20.0, "floor": current_floor, "label": "Start"},
        {"x": 50.0, "y": 50.0, "floor": current_floor, "label": "Corridor"},
        {"x": 20.0, "y": 50.0, "floor": current_floor, "label": "Stairwell"},
    ]
    for f in range(
        min(current_floor, body.target_floor) + 1,
        max(current_floor, body.target_floor) + 1,
    ):
        path.append({"x": 20.0, "y": 50.0, "floor": f, "label": f"Floor {f}"})
    if body.target_location:
        path.append(
            {"x": 70.0, "y": 60.0, "floor": body.target_floor, "label": body.target_location}
        )
    else:
        path.append(
            {"x": 50.0, "y": 50.0, "floor": body.target_floor, "label": "Destination"}
        )

    # Update state
    state["mode"] = NavigationMode.AUTONOMOUS
    state["target_floor"] = body.target_floor
    state["target_location"] = body.target_location
    state["progress"] = 0.0
    state["eta_seconds"] = eta_seconds
    state["current_speed"] = 0.7

    result = AutonomousResponse(
        success=True,
        robot_id=body.robot_id,
        target_floor=body.target_floor,
        target_location=body.target_location,
        eta_seconds=eta_seconds,
        eta_display=eta_display,
        path=path,
        timestamp=now,
    )
    return success_response(result, "Autonomous navigation started")


@router.get(
    "/status",
    response_model=ApiResponse[NavigationStatusResponse],
    summary="Get navigation status",
    description="Returns the current navigation state for a specific robot.",
)
async def get_nav_status(
    robot_id: str = Query("robot-001", description="Robot ID"),
) -> dict:
    state = _get_nav_state(robot_id)
    now = datetime.now(UTC)

    # Simulate progress increment for autonomous mode
    if state["mode"] == NavigationMode.AUTONOMOUS:
        state["progress"] = min(1.0, state["progress"] + random.uniform(0.01, 0.05))
        if state["eta_seconds"] and state["eta_seconds"] > 0:
            state["eta_seconds"] = max(0, state["eta_seconds"] - random.randint(1, 5))
        if state["progress"] >= 1.0:
            state["mode"] = NavigationMode.IDLE
            state["current_speed"] = 0.0
            state["eta_seconds"] = 0

    result = NavigationStatusResponse(
        robot_id=robot_id,
        mode=state["mode"],
        target_floor=state["target_floor"],
        target_location=state["target_location"],
        progress=round(state["progress"], 3),
        eta_seconds=state["eta_seconds"],
        current_speed=state["current_speed"],
        emergency_active=state["emergency_active"],
        timestamp=now,
    )
    return success_response(result, "Navigation status retrieved")


@router.post(
    "/reset-estop",
    response_model=ApiResponse[CommandResponse],
    summary="Reset emergency stop",
    description="Clear the emergency stop state so commands can be sent again.",
)
async def reset_emergency_stop(
    robot_id: str = Query("robot-001", description="Robot ID"),
) -> dict:
    state = _get_nav_state(robot_id)
    now = datetime.now(UTC)

    if not state["emergency_active"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Emergency stop is not active.",
        )

    state["emergency_active"] = False
    state["mode"] = NavigationMode.IDLE
    state["current_speed"] = 0.0

    result = CommandResponse(
        success=True,
        command="reset_estop",
        robot_id=robot_id,
        speed=0.0,
        timestamp=now,
    )
    return success_response(result, "Emergency stop reset")
