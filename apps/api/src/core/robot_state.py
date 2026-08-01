"""Shared in-memory state for the single Stair-Doc robot."""

from typing import Any

from src.core.robot import ROBOT_ID, ROBOT_NAME
from src.schemas.robot import LockStatus, RobotStatus

_robot: dict[str, Any] = {
    "id": ROBOT_ID,
    "name": ROBOT_NAME,
    "serial_number": "SB-001",
    "status": RobotStatus.OFFLINE,
    "lock_status": LockStatus.LOCKED,
    "floor": 1,
    "building": "Building A",
    "room": None,
    "x": 50.0,
    "y": 50.0,
    "battery_level": 0,
    "is_charging": False,
    "voltage": 0.0,
    "temperature": 0.0,
    "estimated_minutes": 0,
    "speed": 0.0,
    "stairs_climbed": 0,
    "total_deliveries": 0,
    "current_delivery_id": None,
    "uptime_seconds": 0,
    "obstacle_detected": False,
    "stair_detected": False,
    "distance_to_obstacle": None,
    "incline_angle": 0.0,
    "weight_kg": 0.0,
    "esp32_connected": False,
    "esp32_port": None,
    "esp32_connection": None,
    "ros2_ready": False,
    "nav2_ready": False,
    "micro_ros_agent": False,
    "amcl_ready": False,
    "slam_mode": None,
}


def get_robot() -> dict[str, Any]:
    return _robot


def get_robots() -> list[dict[str, Any]]:
    return [_robot]
