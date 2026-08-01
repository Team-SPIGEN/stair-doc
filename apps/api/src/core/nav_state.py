"""Shared navigation mode state and hard Manual/Autonomous locks.

Single source of truth for REST (`navigation.py`) and Socket.IO (`socket.py`)
so the two paths cannot diverge and fight over `/cmd_vel`.

Modes: idle | manual | autonomous | emergency
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

from src.core.robot import ROBOT_ID
from src.schemas.navigation import NavigationMode

# ── Shared in-memory state ───────────────────────────────────────────────

_nav_state: dict[str, dict[str, Any]] = {
    ROBOT_ID: {
        "mode": NavigationMode.IDLE.value,
        "target_floor": None,
        "target_location": None,
        "progress": 0.0,
        "eta_seconds": None,
        "current_speed": 0.0,
        "emergency_active": False,
        "heading": 0.0,
    },
}


def get_nav_state(robot_id: str) -> dict[str, Any]:
    """Return mutable nav state for the robot, creating a default row if needed."""
    if robot_id not in _nav_state:
        _nav_state[robot_id] = {
            "mode": NavigationMode.IDLE.value,
            "target_floor": None,
            "target_location": None,
            "progress": 0.0,
            "eta_seconds": None,
            "current_speed": 0.0,
            "emergency_active": False,
            "heading": 0.0,
        }
    return _nav_state[robot_id]


def require_known_robot(robot_id: str) -> dict[str, Any]:
    """Like get_nav_state but 404 for unknown robots (REST status endpoint)."""
    if robot_id != ROBOT_ID:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Robot with id '{robot_id}' not found",
        )
    return get_nav_state(robot_id)


def mode_of(state: dict[str, Any]) -> str:
    """Normalize mode to a string value."""
    mode = state.get("mode", NavigationMode.IDLE.value)
    return mode.value if isinstance(mode, NavigationMode) else str(mode)


def is_emergency(state: dict[str, Any]) -> bool:
    return bool(state.get("emergency_active")) or mode_of(state) == NavigationMode.EMERGENCY.value


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def assert_can_manual(state: dict[str, Any]) -> None:
    """Manual Twist (forward/…) allowed only from idle or manual (not emergency)."""
    if is_emergency(state):
        raise _conflict("Emergency stop is active. Reset before sending commands.")
    mode = mode_of(state)
    if mode == NavigationMode.AUTONOMOUS.value:
        raise _conflict(
            "Autonomous mode is active. Exit Autonomous (Stop) before Manual drive."
        )
    if mode not in (NavigationMode.IDLE.value, NavigationMode.MANUAL.value):
        raise _conflict(f"Cannot Manual drive while mode is '{mode}'.")


def assert_can_autonomous(state: dict[str, Any]) -> None:
    """Start Nav2 from idle or armed autonomous (no active goal). Reject Manual / active goal."""
    if is_emergency(state):
        raise _conflict("Emergency stop is active. Reset before navigating.")
    mode = mode_of(state)
    if mode == NavigationMode.MANUAL.value:
        raise _conflict(
            "Manual mode is active. Exit Manual (Stop) before Autonomous navigation."
        )
    if mode == NavigationMode.AUTONOMOUS.value and state.get("target_location"):
        raise _conflict(
            "Autonomous goal already active. Stop the current goal before starting another."
        )
    if mode not in (NavigationMode.IDLE.value, NavigationMode.AUTONOMOUS.value):
        raise _conflict(f"Cannot start Autonomous while mode is '{mode}'.")


def arm_autonomous(robot_id: str) -> dict[str, Any]:
    """Hub Enter Autonomous — blocks Manual until Exit; no Nav2 goal yet."""
    state = get_nav_state(robot_id)
    assert_can_enter_mode(state, NavigationMode.AUTONOMOUS.value)
    state["mode"] = NavigationMode.AUTONOMOUS.value
    state["progress"] = 0.0
    state["current_speed"] = 0.0
    state["target_floor"] = None
    state["target_location"] = None
    state["eta_seconds"] = None
    state["emergency_active"] = False
    return state


def assert_can_enter_mode(state: dict[str, Any], target: str) -> None:
    """Hub Enter Manual / Enter Autonomous — only from idle (or already that mode)."""
    if is_emergency(state):
        raise _conflict("Emergency stop is active. Reset before changing mode.")
    mode = mode_of(state)
    if target == NavigationMode.IDLE.value:
        return
    if target == mode:
        return
    if mode != NavigationMode.IDLE.value:
        raise _conflict(
            f"Cannot enter {target} while mode is '{mode}'. "
            "Exit the current mode (Stop) first."
        )


def enter_idle(robot_id: str) -> dict[str, Any]:
    """Clear motion targets and return to idle (does not clear emergency)."""
    state = get_nav_state(robot_id)
    if is_emergency(state):
        return state
    state["mode"] = NavigationMode.IDLE.value
    state["current_speed"] = 0.0
    state["target_floor"] = None
    state["target_location"] = None
    state["eta_seconds"] = None
    state["progress"] = 0.0
    return state


def force_reset(robot_id: str = ROBOT_ID) -> dict[str, Any]:
    """Test/helper: clear emergency and return to idle unconditionally."""
    state = get_nav_state(robot_id)
    state["emergency_active"] = False
    state["mode"] = NavigationMode.IDLE.value
    state["current_speed"] = 0.0
    state["target_floor"] = None
    state["target_location"] = None
    state["eta_seconds"] = None
    state["progress"] = 0.0
    return state


def enter_manual(robot_id: str, *, speed: float) -> dict[str, Any]:
    state = get_nav_state(robot_id)
    assert_can_manual(state)
    state["mode"] = NavigationMode.MANUAL.value
    state["current_speed"] = speed
    state["emergency_active"] = False
    return state


def enter_autonomous(
    robot_id: str,
    *,
    target_floor: int | None,
    target_location: str | None,
    eta_seconds: int | None,
    speed: float = 0.4,
) -> dict[str, Any]:
    state = get_nav_state(robot_id)
    assert_can_autonomous(state)
    state["mode"] = NavigationMode.AUTONOMOUS.value
    state["target_floor"] = target_floor
    state["target_location"] = target_location
    state["progress"] = 0.05
    state["eta_seconds"] = eta_seconds
    state["current_speed"] = speed
    state["emergency_active"] = False
    return state


def enter_emergency(robot_id: str) -> dict[str, Any]:
    state = get_nav_state(robot_id)
    state["mode"] = NavigationMode.EMERGENCY.value
    state["current_speed"] = 0.0
    state["emergency_active"] = True
    state["progress"] = 0.0
    state["target_floor"] = None
    state["target_location"] = None
    state["eta_seconds"] = None
    return state


def clear_emergency(robot_id: str) -> dict[str, Any]:
    state = get_nav_state(robot_id)
    if not state["emergency_active"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Emergency stop is not active.",
        )
    state["emergency_active"] = False
    state["mode"] = NavigationMode.IDLE.value
    state["current_speed"] = 0.0
    state["target_floor"] = None
    state["target_location"] = None
    state["eta_seconds"] = None
    state["progress"] = 0.0
    return state


def manual_reject_message(state: dict[str, Any]) -> str | None:
    """Socket-friendly reject reason for Manual Twist, or None if allowed."""
    try:
        assert_can_manual(state)
        return None
    except HTTPException as exc:
        return str(exc.detail)


def autonomous_reject_message(state: dict[str, Any]) -> str | None:
    """Socket-friendly reject reason for navigate_to, or None if allowed."""
    try:
        assert_can_autonomous(state)
        return None
    except HTTPException as exc:
        return str(exc.detail)
