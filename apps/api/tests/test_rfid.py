"""Tests for the RFID management endpoints.

All responses follow the ApiResponse envelope: { success, data, message, timestamp }.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import get_application

_app = get_application()


@pytest.fixture()
def anyio_backend():
    return "asyncio"


# ── POST /api/v1/rfid/authorize ──────────────────────────────────────────


@pytest.mark.anyio
async def test_authorize_known_active_tag():
    """Authorizing a known, active tag should unlock the container."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/rfid/authorize",
            json={"tag_id": "RFID-A1B2C3", "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "timestamp" in body

    data = body["data"]
    assert data["authorized"] is True
    assert data["container_status"] == "unlocked"
    assert data["tag_id"] == "RFID-A1B2C3"
    assert data["user_name"] == "Alice Johnson"


@pytest.mark.anyio
async def test_authorize_unknown_tag():
    """An unrecognised tag should be denied."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/rfid/authorize",
            json={"tag_id": "RFID-NOPE999", "robot_id": "robot-001"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True  # request itself succeeded

    data = body["data"]
    assert data["authorized"] is False
    assert data["container_status"] == "locked"
    assert data["user_name"] is None


@pytest.mark.anyio
async def test_authorize_revoked_tag():
    """A revoked tag should be denied even though it's registered."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/rfid/authorize",
            json={"tag_id": "RFID-REVOKED", "robot_id": "robot-003"},
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["authorized"] is False
    assert data["container_status"] == "locked"
    assert "revoked" in data["message"].lower()


@pytest.mark.anyio
async def test_authorize_creates_log_entry():
    """After authorization, a new entry should appear in the access logs."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Authorize
        await ac.post(
            "/api/v1/rfid/authorize",
            json={"tag_id": "RFID-D4E5F6", "robot_id": "robot-002"},
        )
        # Fetch logs filtered by tag
        resp = await ac.get("/api/v1/rfid/logs", params={"tag_id": "RFID-D4E5F6"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    logs = body["data"]["logs"]
    assert len(logs) >= 1
    # Most recent log should be the authorization we just did
    assert logs[0]["tag_id"] == "RFID-D4E5F6"
    assert logs[0]["authorized"] is True


# ── GET /api/v1/rfid/logs ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_rfid_logs():
    """GET /api/v1/rfid/logs returns seeded logs in envelope."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/rfid/logs")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "timestamp" in body

    data = body["data"]
    assert "logs" in data
    assert data["total"] >= 5
    assert "timestamp" in data


@pytest.mark.anyio
async def test_get_rfid_logs_filter_scan_type():
    """Filter logs by scan type."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/rfid/logs", params={"scan_type": "denied"})

    assert resp.status_code == 200
    logs = resp.json()["data"]["logs"]
    for log in logs:
        assert log["scan_type"] == "denied"


@pytest.mark.anyio
async def test_get_rfid_logs_filter_authorized():
    """Filter logs by authorization result."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/rfid/logs", params={"authorized": "false"})

    assert resp.status_code == 200
    logs = resp.json()["data"]["logs"]
    for log in logs:
        assert log["authorized"] is False


# ── GET /api/v1/rfid/tags ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_registered_tags():
    """GET /api/v1/rfid/tags returns registered tags."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/rfid/tags")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    tags = body["data"]
    assert isinstance(tags, list)
    assert len(tags) >= 4  # 4 seeded tags
    tag_ids = [t["tag_id"] for t in tags]
    assert "RFID-A1B2C3" in tag_ids


# ── POST /api/v1/rfid/tags ───────────────────────────────────────────────


@pytest.mark.anyio
async def test_register_new_tag():
    """Register a new RFID tag."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/rfid/tags",
            json={
                "tag_id": "RFID-NEW001",
                "user_name": "Test User",
                "role": "recipient",
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert data["tag_id"] == "RFID-NEW001"
    assert data["user_name"] == "Test User"
    assert data["status"] == "active"


@pytest.mark.anyio
async def test_register_duplicate_tag_fails():
    """Registering a tag that already exists should return 409."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/rfid/tags",
            json={
                "tag_id": "RFID-A1B2C3",
                "user_name": "Duplicate",
                "role": "recipient",
            },
        )

    assert resp.status_code == 409
