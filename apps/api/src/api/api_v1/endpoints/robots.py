"""Robot status endpoints for Stair-Doc delivery robots.

Provides real-time robot status including battery, location, lock status,
and sensor readings. Uses mock data for development.
"""

import random
from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from src.schemas.robot import (
    BatteryResponse,
    LocationResponse,
    LockStatus,
    RobotStatus,
    RobotStatusListResponse,
    RobotStatusResponse,
    SensorsResponse,
)

router = APIRouter(prefix="/robot", tags=["robot"])

# ── Mock Data ────────────────────────────────────────────────────────────
# Replace with database queries when PostgreSQL is connected

MOCK_ROBOTS: list[dict] = [
    {
        "id": "robot-001",
        "name": "StairBot Alpha",
        "serial_number": "SB-001-2024",
        "status": RobotStatus.DELIVERING,
        "lock_status": LockStatus.LOCKED,
        "location": LocationResponse(
            floor=3, building="Building A", room="305",
            x=65.0, y=40.0,
        ),
        "battery": BatteryResponse(
            level=78, is_charging=False, voltage=25.6,
            temperature=32.0, estimated_minutes_remaining=156,
        ),
        "sensors": SensorsResponse(
            obstacle_detected=False, stair_detected=False,
            distance_to_obstacle=3.2, incline_angle=0.0, weight_kg=2.5,
        ),
        "speed": 1.2,
        "stairs_climbed": 156,
        "total_deliveries": 342,
        "current_delivery_id": "del-123",
        "uptime_seconds": 28800,
    },
    {
        "id": "robot-002",
        "name": "StairBot Beta",
        "serial_number": "SB-002-2024",
        "status": RobotStatus.CLIMBING,
        "lock_status": LockStatus.LOCKED,
        "location": LocationResponse(
            floor=2, building="Building B", room=None,
            x=30.0, y=70.0,
        ),
        "battery": BatteryResponse(
            level=45, is_charging=False, voltage=23.8,
            temperature=38.0, estimated_minutes_remaining=72,
        ),
        "sensors": SensorsResponse(
            obstacle_detected=False, stair_detected=True,
            distance_to_obstacle=None, incline_angle=35.0, weight_kg=1.8,
        ),
        "speed": 0.8,
        "stairs_climbed": 89,
        "total_deliveries": 287,
        "current_delivery_id": "del-124",
        "uptime_seconds": 21600,
    },
    {
        "id": "robot-003",
        "name": "StairBot Gamma",
        "serial_number": "SB-003-2024",
        "status": RobotStatus.CHARGING,
        "lock_status": LockStatus.LOCKED,
        "location": LocationResponse(
            floor=1, building="Building A", room="Dock-1",
            x=10.0, y=90.0,
        ),
        "battery": BatteryResponse(
            level=23, is_charging=True, voltage=26.2,
            temperature=28.0, estimated_minutes_remaining=45,
        ),
        "sensors": SensorsResponse(
            obstacle_detected=False, stair_detected=False,
            distance_to_obstacle=None, incline_angle=0.0, weight_kg=0.0,
        ),
        "speed": 0.0,
        "stairs_climbed": 201,
        "total_deliveries": 456,
        "current_delivery_id": None,
        "uptime_seconds": 14400,
    },
    {
        "id": "robot-004",
        "name": "StairBot Delta",
        "serial_number": "SB-004-2024",
        "status": RobotStatus.IDLE,
        "lock_status": LockStatus.UNLOCKED,
        "location": LocationResponse(
            floor=1, building="Building C", room="Lobby",
            x=50.0, y=20.0,
        ),
        "battery": BatteryResponse(
            level=92, is_charging=False, voltage=25.9,
            temperature=26.0, estimated_minutes_remaining=210,
        ),
        "sensors": SensorsResponse(
            obstacle_detected=False, stair_detected=False,
            distance_to_obstacle=5.0, incline_angle=0.0, weight_kg=0.0,
        ),
        "speed": 0.0,
        "stairs_climbed": 178,
        "total_deliveries": 389,
        "current_delivery_id": None,
        "uptime_seconds": 36000,
    },
]


def _build_robot_response(robot_data: dict) -> RobotStatusResponse:
    """Build a RobotStatusResponse with live-ish battery jitter."""
    battery: BatteryResponse = robot_data["battery"]
    jitter = random.randint(-2, 2)
    adjusted_level = max(0, min(100, battery.level + jitter))

    return RobotStatusResponse(
        id=robot_data["id"],
        name=robot_data["name"],
        serial_number=robot_data["serial_number"],
        status=robot_data["status"],
        lock_status=robot_data["lock_status"],
        location=robot_data["location"],
        battery=BatteryResponse(
            level=adjusted_level,
            is_charging=battery.is_charging,
            voltage=battery.voltage + random.uniform(-0.2, 0.2),
            temperature=battery.temperature + random.uniform(-1.0, 1.0),
            estimated_minutes_remaining=battery.estimated_minutes_remaining,
        ),
        sensors=robot_data["sensors"],
        speed=robot_data["speed"],
        stairs_climbed=robot_data["stairs_climbed"],
        total_deliveries=robot_data["total_deliveries"],
        current_delivery_id=robot_data.get("current_delivery_id"),
        last_seen=datetime.utcnow(),
        uptime_seconds=robot_data["uptime_seconds"],
    )


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get(
    "/status",
    response_model=RobotStatusListResponse,
    summary="Get all robot statuses",
    description="Returns the current status of all Stair-Doc delivery robots "
    "including battery levels, locations, lock status, and sensor readings.",
)
async def get_all_robot_status() -> RobotStatusListResponse:
    robots = [_build_robot_response(r) for r in MOCK_ROBOTS]
    return RobotStatusListResponse(
        robots=robots,
        total=len(robots),
        timestamp=datetime.utcnow(),
    )


@router.get(
    "/status/{robot_id}",
    response_model=RobotStatusResponse,
    summary="Get single robot status",
    description="Returns the current status of a specific robot by ID.",
)
async def get_robot_status(robot_id: str) -> RobotStatusResponse:
    robot_data = next((r for r in MOCK_ROBOTS if r["id"] == robot_id), None)
    if not robot_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Robot with id '{robot_id}' not found",
        )
    return _build_robot_response(robot_data)
