"""Tests for the Navigation Control endpoints.

All responses follow the ApiResponse envelope: { success, data, message, timestamp }.

Endpoints under test:
  POST /api/v1/navigation/command       — manual navigation command
  POST /api/v1/navigation/autonomous    — start autonomous navigation
  GET  /api/v1/navigation/status        — get navigation status
  POST /api/v1/navigation/reset-estop   — reset emergency stop
"""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import get_application

_app = get_application()


@pytest.fixture()
def anyio_backend():
    return "asyncio"


# ── Helpers ──────────────────────────────────────────────────────────────


def _assert_envelope(body: dict, *, success: bool = True) -> dict:
    """Assert standard API envelope and return data."""
    assert body["success"] is success
    assert "message" in body
    assert "timestamp" in body
    return body["data"]


async def _reset_state(ac: AsyncClient, robot_id: str = "robot-001"):
    """Helper to reset the robot's nav state to idle by resetting estop
    (if active) then sending a stop command."""
    # Clear any test-registered Pi bridge so manual ESP32 checks stay clean
    from src.core import bridge as bridge_mod
    from src.core.nav_state import force_reset

    bridge_mod._bridge_clients.clear()
    bridge_mod._bridge_sid_to_robot.clear()
    force_reset(robot_id)

    # Try to reset estop — ignore 400 (not active)
    await ac.post(f"/api/v1/navigation/reset-estop?robot_id={robot_id}")
    # Send stop to go idle
    await ac.post(
        "/api/v1/navigation/command",
        json={"command": "stop", "robot_id": robot_id},
    )


# ── POST /navigation/command ─────────────────────────────────────────────


@pytest.mark.anyio
async def test_command_forward():
    """Sending 'forward' returns accepted response."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "speed": 0.6, "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["success"] is True
    assert data["command"] == "forward"
    assert data["robot_id"] == "robot-001"
    assert data["speed"] == 0.6
    assert "timestamp" in data


@pytest.mark.anyio
async def test_command_backward():
    """Sending 'backward' returns accepted response."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "backward", "speed": 0.3, "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["command"] == "backward"
    assert data["speed"] == 0.3


@pytest.mark.anyio
async def test_command_left_right():
    """Left and right commands work."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        for cmd in ("left", "right"):
            resp = await ac.post(
                "/api/v1/navigation/command",
                json={"command": cmd, "robot_id": "robot-001"},
            )
            assert resp.status_code == 200
            data = _assert_envelope(resp.json())
            assert data["command"] == cmd


@pytest.mark.anyio
async def test_command_stop():
    """Sending 'stop' resets speed to 0."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        # Move forward first
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "speed": 0.8, "robot_id": "robot-001"},
        )
        # Then stop
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "stop", "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["command"] == "stop"
    assert data["speed"] == 0.0


@pytest.mark.anyio
async def test_command_emergency_stop():
    """Emergency stop sets mode to emergency and speed to 0."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["command"] == "emergency_stop"
    assert data["speed"] == 0.0
    assert "emergency" in resp.json()["message"].lower() or data["success"] is True


@pytest.mark.anyio
async def test_command_blocked_during_emergency():
    """Commands other than emergency_stop are blocked when emergency is active."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        # Activate emergency
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": "robot-001"},
        )
        # Try to move — should get 409
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "robot_id": "robot-001"},
        )

    assert resp.status_code == 409


@pytest.mark.anyio
async def test_command_invalid_enum():
    """Invalid command value returns 422."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "fly", "robot_id": "robot-001"},
        )

    assert resp.status_code == 422


@pytest.mark.anyio
async def test_command_speed_out_of_range():
    """Speed > 1.0 should return 422 validation error."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "speed": 5.0, "robot_id": "robot-001"},
        )

    assert resp.status_code == 422


@pytest.mark.anyio
async def test_command_default_speed():
    """When speed is omitted, the default (0.5) is used."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["speed"] == 0.5


# ── POST /navigation/autonomous ──────────────────────────────────────────


@pytest.mark.anyio
async def test_autonomous_requires_destination():
    """Missing Destination returns 422."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_floor": 0},
        )

    assert resp.status_code == 422


@pytest.mark.anyio
async def test_autonomous_unknown_destination():
    """Unknown room returns 404 and does not start navigation."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={
                "robot_id": "robot-001",
                "target_floor": 0,
                "target_location": "No Such Room XYZ",
            },
        )

    assert resp.status_code == 404
    assert "Unknown destination" in resp.json()["detail"]


@pytest.mark.anyio
async def test_autonomous_pi_offline():
    """Known room with no Pi bridge returns 503."""
    from src.core import bridge as bridge_mod

    # Ensure no bridge is registered
    bridge_mod._bridge_clients.clear()
    bridge_mod._bridge_sid_to_robot.clear()

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={
                "robot_id": "robot-001",
                "target_location": "IDS Lab",
            },
        )

    assert resp.status_code == 503
    assert "ROS relay" in resp.json()["detail"] or "ros2_bridge" in resp.json()["detail"]


@pytest.mark.anyio
async def test_autonomous_start():
    """Known Destination with a registered Pi bridge returns Nav2 goal."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        ok, _ = register_bridge("test-sid-autonomous", "robot-001", None)
        assert ok
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={
                "robot_id": "robot-001",
                "target_floor": 0,
                "target_location": "ids_lab",
            },
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["success"] is True
    assert data["robot_id"] == "robot-001"
    assert data["target_location"] == "ids_lab"
    assert data["goal"]["room_id"] == "ids_lab"
    assert data["goal"]["x"] == pytest.approx(21.425)
    assert data["goal"]["y"] == pytest.approx(7.835)
    assert data["eta_seconds"] > 0
    assert isinstance(data["path"], list)
    assert len(data["path"]) >= 1


@pytest.mark.anyio
async def test_autonomous_with_alias():
    """Alias match (case-insensitive) resolves to the same room."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-alias", "robot-001", None)
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={
                "robot_id": "robot-001",
                "target_location": "  IDS Lab  ",
            },
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["goal"]["room_id"] == "ids_lab"
    assert data["target_location"] == "IDS Lab"


@pytest.mark.anyio
async def test_locations_catalog():
    """GET /navigation/locations returns the rooms catalog."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/navigation/locations")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["count"] >= 1
    ids = {r["id"] for r in data["rooms"]}
    assert "ids_lab" in ids


@pytest.mark.anyio
async def test_autonomous_blocked_during_emergency():
    """Autonomous navigation is blocked when emergency stop is active."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        # Activate emergency
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": "robot-001"},
        )
        # Try autonomous — should fail
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "IDS Lab"},
        )

    assert resp.status_code == 409


@pytest.mark.anyio
async def test_autonomous_invalid_floor():
    """Floor > 20 returns 422."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={
                "robot_id": "robot-001",
                "target_floor": 99,
                "target_location": "home",
            },
        )

    assert resp.status_code == 422


# ── GET /navigation/status ───────────────────────────────────────────────


@pytest.mark.anyio
async def test_status_default():
    """Status for default robot returns valid fields."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.get("/api/v1/navigation/status")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["robot_id"] == "robot-001"
    assert data["mode"] in ("idle", "manual", "autonomous", "emergency")
    assert 0.0 <= data["progress"] <= 1.0
    assert isinstance(data["emergency_active"], bool)
    assert "timestamp" in data


@pytest.mark.anyio
async def test_status_specific_robot():
    """Status for a specific robot ID works."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-001")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["robot_id"] == "robot-001"


@pytest.mark.anyio
async def test_status_unknown_robot():
    """Status for an unknown robot ID returns 404."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-999")

    assert resp.status_code == 404


@pytest.mark.anyio
async def test_status_reflects_manual_mode():
    """After sending a forward command, status shows manual mode."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "speed": 0.7, "robot_id": "robot-001"},
        )
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-001")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["mode"] == "manual"
    assert data["current_speed"] == 0.7


@pytest.mark.anyio
async def test_status_reflects_autonomous_mode():
    """After starting autonomous nav, status shows autonomous mode."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-status-auto", "robot-001", None)
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-001")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["mode"] == "autonomous"
    assert data["target_location"] == "home"
    assert data["progress"] == pytest.approx(0.05)


@pytest.mark.anyio
async def test_status_emergency_flag():
    """Emergency stop sets emergency_active flag in status."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": "robot-001"},
        )
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-001")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["mode"] == "emergency"
    assert data["emergency_active"] is True


# ── POST /navigation/reset-estop ─────────────────────────────────────────


@pytest.mark.anyio
async def test_reset_estop():
    """Resetting estop clears emergency state."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Activate emergency first
        await _reset_state(ac)
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": "robot-001"},
        )
        # Reset
        resp = await ac.post("/api/v1/navigation/reset-estop?robot_id=robot-001")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["command"] == "reset_estop"
    assert data["speed"] == 0.0


@pytest.mark.anyio
async def test_reset_estop_when_not_active():
    """Resetting estop when not active returns 400."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post("/api/v1/navigation/reset-estop?robot_id=robot-001")

    assert resp.status_code == 400


@pytest.mark.anyio
async def test_reset_estop_allows_commands_again():
    """After resetting estop, commands should work again."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        # Activate emergency
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": "robot-001"},
        )
        # Reset
        await ac.post("/api/v1/navigation/reset-estop?robot_id=robot-001")
        # Now commands should work
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["command"] == "forward"


# ── Cross-endpoint integration ───────────────────────────────────────────


@pytest.mark.anyio
async def test_manual_rejected_while_autonomous():
    """Manual Twist returns 409 while Autonomous mode is active."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-manual-vs-auto", "robot-001", None)
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )
        resp = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "robot_id": "robot-001"},
        )

    assert resp.status_code == 409
    assert "Autonomous" in resp.json()["detail"]


@pytest.mark.anyio
async def test_autonomous_rejected_while_manual():
    """Autonomous start returns 409 while Manual mode is active."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-auto-vs-manual", "robot-001", None)
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "speed": 0.4, "robot_id": "robot-001"},
        )
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )

    assert resp.status_code == 409
    assert "Manual" in resp.json()["detail"]


@pytest.mark.anyio
async def test_second_autonomous_rejected_until_stop():
    """A second Nav2 goal is 409 until Stop clears the first."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-second-goal", "robot-001", None)
        first = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )
        assert first.status_code == 200
        second = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "ids_lab"},
        )
        assert second.status_code == 409

        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "stop", "robot_id": "robot-001"},
        )
        again = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "ids_lab"},
        )
        assert again.status_code == 200


@pytest.mark.anyio
async def test_stop_clears_autonomous_then_manual_works():
    """Stop → idle; Manual drive works again after Autonomous."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-stop-clear", "robot-001", None)
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )
        stop = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "stop", "robot_id": "robot-001"},
        )
        assert stop.status_code == 200
        status = await ac.get("/api/v1/navigation/status?robot_id=robot-001")
        assert _assert_envelope(status.json())["mode"] == "idle"

        fwd = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "robot_id": "robot-001"},
        )
        assert fwd.status_code == 200
        assert _assert_envelope(fwd.json())["command"] == "forward"


@pytest.mark.anyio
async def test_mode_enter_manual_blocks_autonomous():
    """POST /mode manual arms Manual; Autonomous start is 409 until Exit."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-mode-manual", "robot-001", None)
        mode = await ac.post(
            "/api/v1/navigation/mode",
            json={"robot_id": "robot-001", "mode": "manual"},
        )
        assert mode.status_code == 200
        assert _assert_envelope(mode.json())["mode"] == "manual"

        auto = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )
        assert auto.status_code == 409

        exit_mode = await ac.post(
            "/api/v1/navigation/mode",
            json={"robot_id": "robot-001", "mode": "idle"},
        )
        assert exit_mode.status_code == 200
        assert _assert_envelope(exit_mode.json())["mode"] == "idle"


@pytest.mark.anyio
async def test_mode_arm_autonomous_then_start():
    """Enter Autonomous arms mode; Start Destination then succeeds; Manual 409."""
    from src.core.bridge import register_bridge

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-mode-auto", "robot-001", None)
        arm = await ac.post(
            "/api/v1/navigation/mode",
            json={"robot_id": "robot-001", "mode": "autonomous"},
        )
        assert arm.status_code == 200
        assert _assert_envelope(arm.json())["mode"] == "autonomous"

        fwd = await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "robot_id": "robot-001"},
        )
        assert fwd.status_code == 409

        start = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )
        assert start.status_code == 200


@pytest.mark.anyio
async def test_full_lifecycle():
    """Complete lifecycle: idle → manual → autonomous → emergency → reset → idle."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        robot = "robot-001"
        await _reset_state(ac, robot)

        # 1. Idle
        resp = await ac.get(f"/api/v1/navigation/status?robot_id={robot}")
        assert _assert_envelope(resp.json())["mode"] == "idle"

        # 2. Manual forward
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "forward", "speed": 0.5, "robot_id": robot},
        )
        resp = await ac.get(f"/api/v1/navigation/status?robot_id={robot}")
        assert _assert_envelope(resp.json())["mode"] == "manual"

        # 3. Stop → idle
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "stop", "robot_id": robot},
        )
        resp = await ac.get(f"/api/v1/navigation/status?robot_id={robot}")
        assert _assert_envelope(resp.json())["mode"] == "idle"

        # 4. Autonomous
        from src.core.bridge import register_bridge

        register_bridge("test-sid-lifecycle", robot, None)
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": robot, "target_location": "home"},
        )
        resp = await ac.get(f"/api/v1/navigation/status?robot_id={robot}")
        status = _assert_envelope(resp.json())
        assert status["mode"] == "autonomous"

        # 5. Emergency stop
        await ac.post(
            "/api/v1/navigation/command",
            json={"command": "emergency_stop", "robot_id": robot},
        )
        resp = await ac.get(f"/api/v1/navigation/status?robot_id={robot}")
        status = _assert_envelope(resp.json())
        assert status["mode"] == "emergency"
        assert status["emergency_active"] is True

        # 6. Reset → idle
        await ac.post(f"/api/v1/navigation/reset-estop?robot_id={robot}")
        resp = await ac.get(f"/api/v1/navigation/status?robot_id={robot}")
        status = _assert_envelope(resp.json())
        assert status["mode"] == "idle"
        assert status["emergency_active"] is False


@pytest.mark.anyio
async def test_forged_socket_manual_rejected_while_autonomous():
    """Socket Manual does not overwrite Autonomous (shared nav_state reject)."""
    from src.core.bridge import register_bridge
    from src.core.nav_state import get_nav_state, manual_reject_message
    from src.core import nav_state as nav_state_mod
    from src.schemas.navigation import NavigationMode

    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        register_bridge("test-sid-forged", "robot-001", None)
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_location": "home"},
        )

    state = get_nav_state("robot-001")
    assert state["mode"] == NavigationMode.AUTONOMOUS.value
    msg = manual_reject_message(state)
    assert msg is not None
    assert "Autonomous" in msg
    # Prove REST and Socket share the same dict
    assert nav_state_mod._nav_state["robot-001"] is state
