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
async def test_autonomous_start():
    """Starting autonomous navigation returns ETA and path."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_floor": 3},
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["success"] is True
    assert data["robot_id"] == "robot-001"
    assert data["target_floor"] == 3
    assert data["eta_seconds"] > 0
    assert len(data["eta_display"]) > 0
    assert isinstance(data["path"], list)
    assert len(data["path"]) >= 2  # at least start + destination


@pytest.mark.anyio
async def test_autonomous_with_location():
    """Autonomous navigation with a target location includes it in the path."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={
                "robot_id": "robot-001",
                "target_floor": 5,
                "target_location": "Room 501",
            },
        )

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["target_location"] == "Room 501"
    # Last waypoint should be the target location
    last_wp = data["path"][-1]
    assert last_wp["label"] == "Room 501"


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
            json={"robot_id": "robot-001", "target_floor": 3},
        )

    assert resp.status_code == 409


@pytest.mark.anyio
async def test_autonomous_invalid_floor():
    """Floor > 20 returns 422."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_floor": 99},
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
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-002")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["robot_id"] == "robot-002"


@pytest.mark.anyio
async def test_status_unknown_robot():
    """Status for a new robot ID auto-creates idle state."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-999")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["robot_id"] == "robot-999"
    assert data["mode"] == "idle"


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
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _reset_state(ac)
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": "robot-001", "target_floor": 4},
        )
        resp = await ac.get("/api/v1/navigation/status?robot_id=robot-001")

    assert resp.status_code == 200
    data = _assert_envelope(resp.json())
    assert data["mode"] == "autonomous"
    assert data["target_floor"] == 4
    assert data["progress"] > 0  # should have incremented


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
async def test_full_lifecycle():
    """Complete lifecycle: idle → manual → autonomous → emergency → reset → idle."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        robot = "robot-003"
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
        await ac.post(
            "/api/v1/navigation/autonomous",
            json={"robot_id": robot, "target_floor": 2},
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
