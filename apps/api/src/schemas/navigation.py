"""Pydantic models for navigation control.

Defines request / response schemas for manual joystick, autonomous navigation,
and navigation status endpoints.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class NavigationCommand(str, Enum):
    """Valid manual navigation commands."""

    FORWARD = "forward"
    BACKWARD = "backward"
    LEFT = "left"
    RIGHT = "right"
    STOP = "stop"
    EMERGENCY_STOP = "emergency_stop"


class NavigationMode(str, Enum):
    """Current navigation mode."""

    MANUAL = "manual"
    AUTONOMOUS = "autonomous"
    IDLE = "idle"
    EMERGENCY = "emergency"


# ── Request schemas ──────────────────────────────────────────────────────


class ManualCommandRequest(BaseModel):
    """Body for POST /navigation/command."""

    command: NavigationCommand
    speed: float = Field(0.5, ge=0.0, le=1.0, description="Speed in m/s")
    duration: float = Field(
        0.0, ge=0.0, le=10.0, description="Duration in seconds (0 = continuous)"
    )
    robot_id: str = Field("robot-001", description="Target robot ID")


class AutonomousRequest(BaseModel):
    """Body for POST /navigation/autonomous.

    Destination (room name / id / alias) is required. Floor is optional and
    currently unused (multi-floor coming soon).
    """

    robot_id: str = Field("robot-001", description="Target robot ID")
    target_floor: int = Field(
        0,
        ge=0,
        le=20,
        description="Destination floor (coming soon — ignored for Nav2 goals)",
    )
    target_location: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Room / destination name (matched against maps/locations.json)",
    )

    @field_validator("target_location")
    @classmethod
    def _trim_location(cls, value: str) -> str:
        cleaned = " ".join(str(value).split())
        if not cleaned:
            raise ValueError("Destination is required")
        return cleaned


class ModeSwitchRequest(BaseModel):
    """Body for POST /navigation/mode — hub Enter/Exit mode buttons."""

    robot_id: str = Field("robot-001", description="Target robot ID")
    mode: NavigationMode = Field(
        ...,
        description="Target mode: manual, autonomous, or idle (exit). Emergency via E-stop only.",
    )

    @field_validator("mode")
    @classmethod
    def _allowed_modes(cls, value: NavigationMode) -> NavigationMode:
        if value == NavigationMode.EMERGENCY:
            raise ValueError("Use emergency_stop / reset-estop; cannot set emergency via /mode")
        return value


# ── Response schemas ─────────────────────────────────────────────────────


class CommandResponse(BaseModel):
    """Response for a navigation command."""

    success: bool
    command: str
    robot_id: str
    speed: float
    timestamp: datetime


class NavGoalPose(BaseModel):
    """Resolved map-frame Nav2 goal."""

    x: float
    y: float
    yaw: float = Field(..., description="Yaw in radians")
    frame_id: str = "map"
    room_id: str
    map: str = "stairbot_room_map"


class AutonomousResponse(BaseModel):
    """Response for starting autonomous navigation."""

    success: bool
    robot_id: str
    target_floor: int
    target_location: Optional[str] = None
    goal: Optional[NavGoalPose] = None
    eta_seconds: int = Field(0, ge=0, description="Estimated time of arrival in seconds")
    eta_display: str = Field("", description="Human-readable ETA")
    path: list[dict] = Field(default_factory=list, description="Waypoint path")
    message: str = Field("", description="Human-readable status (e.g. Nav2 goal accepted)")
    timestamp: datetime


class NavigationStatusResponse(BaseModel):
    """Current navigation status for a robot."""

    robot_id: str
    mode: NavigationMode
    target_floor: Optional[int] = None
    target_location: Optional[str] = None
    progress: float = Field(0.0, ge=0.0, le=1.0, description="0.0 to 1.0")
    eta_seconds: Optional[int] = None
    current_speed: float = Field(0.0, ge=0.0)
    emergency_active: bool = False
    timestamp: datetime


class LidarPoint(BaseModel):
    """Single LIDAR scan point."""

    angle: float = Field(..., ge=0, le=360, description="Angle in degrees")
    distance: float = Field(..., ge=0, description="Distance in metres")
