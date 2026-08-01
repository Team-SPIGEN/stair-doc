"""Unit tests for robot bridge helpers."""

from src.core.bridge import (
    NAV_TO_BT,
    build_bridge_command_payload,
    normalize_tag_id,
    ultrasonic_to_lidar,
)


def test_normalize_tag_id_numeric():
    assert normalize_tag_id("432745742349") == "RFID-432745742349"


def test_normalize_tag_id_prefixed():
    assert normalize_tag_id("RFID-A1B2C3") == "RFID-A1B2C3"


def test_nav_to_bt_mapping():
    assert NAV_TO_BT["forward"] == "f"
    assert NAV_TO_BT["emergency_stop"] == "s"
    assert NAV_TO_BT["front_servo_up"] == "u"
    assert NAV_TO_BT["front_up"] == "u"
    assert NAV_TO_BT["rear_down"] == "e"


def test_build_bridge_command_payload():
    payload = build_bridge_command_payload("forward", "robot-001", speed=0.8)
    assert payload["action"] == "forward"
    assert payload["robot_id"] == "robot-001"
    assert payload["speed"] == 0.8
    # Drive actions must NOT carry UART bt_command (ROS /cmd_vel path)
    assert "bt_command" not in payload or payload.get("bt_command") is None


def test_ultrasonic_to_lidar():
    points = ultrasonic_to_lidar(20.0, 100.0, 30.0, 50.0, fov=90)
    assert len(points) == 90
    assert all("angle" in p and "distance" in p for p in points)
    # Front-facing angles should have shorter distances
    front_point = next(p for p in points if p["angle"] == 0)
    assert front_point["distance"] < 1.0
