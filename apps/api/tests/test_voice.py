import pytest
import httpx
from httpx import AsyncClient, ASGITransport

from src.main import app


def _client() -> AsyncClient:
    """Create an AsyncClient wired to the FastAPI app via ASGITransport."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_voice_navigate_floor():
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "Go to floor 2",
                "user_role": "operator",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["intent"]["action"] == "navigate"
    assert payload["data"]["intent"]["target_floor"] == 2
    assert payload["data"]["executed"] is True


@pytest.mark.asyncio
async def test_voice_emergency_requires_confirmation():
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "emergency stop now",
                "user_role": "operator",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["intent"]["action"] == "emergency_stop"
    assert payload["data"]["executed"] is False
    assert "Confirmation" in payload["data"]["message"]


@pytest.mark.asyncio
async def test_voice_recipient_blocked_from_navigation():
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "go to floor 3",
                "user_role": "recipient",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 403
    payload = response.json()
    assert payload["detail"].startswith("Role 'recipient'")


@pytest.mark.asyncio
async def test_voice_navigate_word_floor():
    """Word-spelled floor ('three') must map to integer 3."""
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "go to floor three",
                "user_role": "operator",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["intent"]["action"] == "navigate"
    assert payload["data"]["intent"]["target_floor"] == 3
    assert payload["data"]["executed"] is True


@pytest.mark.asyncio
async def test_voice_floor_out_of_range():
    """Floor 5 exceeds the 1-4 range; expect 400."""
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "go to floor 5",
                "user_role": "operator",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 400
    assert "Floor" in response.json()["detail"]


@pytest.mark.asyncio
async def test_voice_return_home():
    """'Return home' should navigate robot to floor 1 / base station."""
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "return home",
                "user_role": "operator",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["intent"]["action"] == "return_home"
    assert payload["data"]["executed"] is True


@pytest.mark.asyncio
async def test_voice_create_delivery():
    """'Delivery to Alice' should create a delivery for recipient Alice."""
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "delivery to Alice on floor 2",
                "user_role": "operator",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["intent"]["action"] == "create_delivery"


@pytest.mark.asyncio
async def test_voice_confirm_emergency():
    """With confirm=True, emergency stop should execute immediately."""
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "emergency stop now",
                "user_role": "operator",
                "robot_id": "robot-001",
                "confirm": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["intent"]["action"] == "emergency_stop"
    assert payload["data"]["executed"] is True


@pytest.mark.asyncio
async def test_voice_get_supported_commands():
    """GET /api/v1/voice/commands must return a non-empty command list."""
    async with _client() as client:
        response = await client.get("/api/v1/voice/commands")

    assert response.status_code == 200
    payload = response.json()
    commands = payload["data"]["commands"]
    assert isinstance(commands, list)
    assert len(commands) >= 1
    first = commands[0]
    assert "phrase" in first
    assert "action" in first
    assert "example" in first


@pytest.mark.asyncio
async def test_voice_recipient_can_request_status():
    """Recipients are allowed to ask for status."""
    async with _client() as client:
        response = await client.post(
            "/api/v1/voice/command",
            json={
                "text": "status report",
                "user_role": "recipient",
                "robot_id": "robot-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["intent"]["action"] == "status"
    assert payload["data"]["executed"] is True

