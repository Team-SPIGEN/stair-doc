from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RobotStatus(str, Enum):
    """Possible states for a Stair-Doc delivery robot."""
    IDLE = "idle"
    CLIMBING = "climbing"
    DESCENDING = "descending"
    DELIVERING = "delivering"
    RETURNING = "returning"
    CHARGING = "charging"
    MAINTENANCE = "maintenance"
    EMERGENCY = "emergency"
    OFFLINE = "offline"


class LockStatus(str, Enum):
    """Container lock status."""
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    ERROR = "error"


class LocationResponse(BaseModel):
    """Robot location data."""
    floor: int = Field(..., ge=0, le=20, description="Current floor number")
    building: str = Field(..., min_length=1, max_length=100)
    room: Optional[str] = Field(None, max_length=50)
    x: float = Field(0.0, description="X position on floor map (0-100)")
    y: float = Field(0.0, description="Y position on floor map (0-100)")


class BatteryResponse(BaseModel):
    """Robot battery information."""
    level: int = Field(..., ge=0, le=100, description="Battery percentage")
    is_charging: bool = False
    voltage: float = Field(24.0, ge=0, le=50)
    temperature: float = Field(25.0, ge=-10, le=80)
    estimated_minutes_remaining: int = Field(0, ge=0)


class SensorsResponse(BaseModel):
    """Robot sensor readings."""
    obstacle_detected: bool = False
    stair_detected: bool = False
    distance_to_obstacle: Optional[float] = Field(None, ge=0)
    incline_angle: float = Field(0.0, ge=-90, le=90)
    weight_kg: float = Field(0.0, ge=0, le=50, description="Payload weight")
    esp32_connected: bool = False
    esp32_port: Optional[str] = None
    esp32_connection: Optional[str] = None


class RobotStatusResponse(BaseModel):
    """Full robot status response."""
    id: str
    name: str
    serial_number: str = Field(..., description="Robot serial number")
    status: RobotStatus
    lock_status: LockStatus = LockStatus.LOCKED
    location: LocationResponse
    battery: BatteryResponse
    sensors: SensorsResponse
    speed: float = Field(0.0, ge=0, description="Current speed in m/s")
    stairs_climbed: int = Field(0, ge=0, description="Stairs climbed today")
    total_deliveries: int = Field(0, ge=0)
    current_delivery_id: Optional[str] = None
    last_seen: datetime
    uptime_seconds: int = Field(0, ge=0)


class RobotStatusListResponse(BaseModel):
    """Response containing multiple robot statuses."""
    robots: list[RobotStatusResponse]
    total: int
    timestamp: datetime
