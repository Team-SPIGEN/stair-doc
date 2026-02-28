"""Pydantic models for navigation control.

Defines request / response schemas for manual joystick, autonomous navigation,
and navigation status endpoints.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


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
    """Body for POST /navigation/autonomous."""

    robot_id: str = Field("robot-001", description="Target robot ID")
    target_floor: int = Field(..., ge=0, le=20, description="Destination floor")
    target_location: Optional[str] = Field(
        None, max_length=100, description="Room or landmark name"
    )


# ── Response schemas ─────────────────────────────────────────────────────


class CommandResponse(BaseModel):
    """Response for a navigation command."""

    success: bool
    command: str
    robot_id: str
    speed: float
    timestamp: datetime


class AutonomousResponse(BaseModel):
    """Response for starting autonomous navigation."""

    success: bool
    robot_id: str
    target_floor: int
    target_location: Optional[str] = None
    eta_seconds: int = Field(0, ge=0, description="Estimated time of arrival in seconds")
    eta_display: str = Field("", description="Human-readable ETA")
    path: list[dict] = Field(default_factory=list, description="Waypoint path")
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
