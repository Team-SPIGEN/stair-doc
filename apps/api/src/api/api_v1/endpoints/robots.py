"""Robot status endpoints for Stair-Doc delivery robots."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

from src.core.bridge import get_bridge_status, is_bridge_connected
from src.core.robot import ROBOT_ID
from src.core.robot_state import get_robot, get_robots
from src.schemas.base import ApiResponse, success_response
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


def _build_robot_response(robot_data: dict) -> RobotStatusResponse:
    return RobotStatusResponse(
        id=robot_data["id"],
        name=robot_data["name"],
        serial_number=robot_data["serial_number"],
        status=robot_data["status"],
        lock_status=robot_data["lock_status"],
        location=LocationResponse(
            floor=robot_data["floor"],
            building=robot_data["building"],
            room=robot_data["room"],
            x=robot_data["x"],
            y=robot_data["y"],
        ),
        battery=BatteryResponse(
            level=robot_data["battery_level"],
            is_charging=robot_data["is_charging"],
            voltage=robot_data["voltage"],
            temperature=robot_data["temperature"],
            estimated_minutes_remaining=robot_data["estimated_minutes"],
        ),
        sensors=SensorsResponse(
            obstacle_detected=robot_data["obstacle_detected"],
            stair_detected=robot_data["stair_detected"],
            distance_to_obstacle=robot_data["distance_to_obstacle"],
            incline_angle=robot_data["incline_angle"],
            weight_kg=robot_data["weight_kg"],
            esp32_connected=robot_data.get("esp32_connected", False),
            esp32_port=robot_data.get("esp32_port"),
            esp32_connection=robot_data.get("esp32_connection"),
            ros2_ready=robot_data.get("ros2_ready", False),
            nav2_ready=robot_data.get("nav2_ready", False),
            micro_ros_agent=robot_data.get("micro_ros_agent", False),
            amcl_ready=robot_data.get("amcl_ready", False),
            slam_mode=robot_data.get("slam_mode"),
        ),
        speed=robot_data["speed"],
        stairs_climbed=robot_data["stairs_climbed"],
        total_deliveries=robot_data["total_deliveries"],
        current_delivery_id=robot_data.get("current_delivery_id"),
        last_seen=datetime.now(UTC),
        uptime_seconds=robot_data["uptime_seconds"],
    )


@router.get(
    "/status",
    response_model=ApiResponse[RobotStatusListResponse],
    summary="Get robot status",
    description="Returns the current status of the Stair-Doc robot.",
)
async def get_all_robot_status() -> dict:
    robots = [_build_robot_response(r) for r in get_robots()]
    data = RobotStatusListResponse(
        robots=robots,
        total=len(robots),
        timestamp=datetime.now(UTC),
    )
    return success_response(data, "Robot status retrieved successfully")


@router.get(
    "/status/{robot_id}",
    response_model=ApiResponse[RobotStatusResponse],
    summary="Get robot status by ID",
    description="Returns the current status of the robot.",
)
async def get_robot_status(robot_id: str) -> dict:
    if robot_id != ROBOT_ID:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Robot with id '{robot_id}' not found",
        )
    return success_response(
        _build_robot_response(get_robot()),
        "Robot status retrieved successfully",
    )


@router.get(
    "/bridge/status",
    summary="Get hardware bridge connection status",
    description=(
        "Returns whether the Raspberry Pi bridge is connected "
        "via Socket.IO for ESP32 telemetry and command forwarding."
    ),
)
async def get_bridge_connection_status() -> dict:
    status_payload = get_bridge_status()
    status_payload["robot_001_live"] = is_bridge_connected(ROBOT_ID)
    return success_response(
        status_payload,
        f"{status_payload['connected_count']} bridge(s) connected",
    )
