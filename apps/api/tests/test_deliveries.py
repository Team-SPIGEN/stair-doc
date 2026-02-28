"""Tests for the delivery management endpoints.

All responses follow the ApiResponse envelope: { success, data, message, timestamp }.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import get_application

_app = get_application()


@pytest.fixture()
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_list_deliveries():
    """GET /api/v1/deliveries returns seeded mock deliveries in envelope."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/deliveries")

    assert resp.status_code == 200
    body = resp.json()
    # Envelope fields
    assert body["success"] is True
    assert "message" in body
    assert "timestamp" in body
    # Inner data
    data = body["data"]
    assert "deliveries" in data
    assert data["total"] >= 5  # seeded data
    assert "timestamp" in data


@pytest.mark.anyio
async def test_list_deliveries_filter_status():
    """GET /api/v1/deliveries?status=pending returns only pending items."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/deliveries", params={"status": "pending"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    for d in body["data"]["deliveries"]:
        assert d["status"] == "pending"


@pytest.mark.anyio
async def test_list_deliveries_filter_priority():
    """GET /api/v1/deliveries?priority=express returns only express items."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/deliveries", params={"priority": "express"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    for d in body["data"]["deliveries"]:
        assert d["priority"] == "express"


@pytest.mark.anyio
async def test_create_delivery():
    """POST /api/v1/deliveries creates a new delivery in envelope."""
    payload = {
        "pickup_location": {"floor": 1, "building": "Building A", "room": "101"},
        "dropoff_location": {"floor": 4, "building": "Building B", "room": "402"},
        "package_weight": 1.5,
        "priority": "urgent",
        "recipient_name": "Test User",
        "notes": "Phase 4 test delivery",
    }
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/deliveries", json=payload)

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert data["status"] == "pending"
    assert data["priority"] == "urgent"
    assert data["recipient_name"] == "Test User"
    assert data["pickup_location"]["floor"] == 1
    assert data["dropoff_location"]["room"] == "402"
    assert data["id"].startswith("del-")


@pytest.mark.anyio
async def test_create_delivery_appears_in_list():
    """Create a delivery then verify it appears in the queue listing."""
    payload = {
        "pickup_location": {"floor": 2, "building": "Building C"},
        "dropoff_location": {"floor": 5, "building": "Building C", "room": "501"},
        "priority": "express",
        "recipient_name": "Queue Test",
    }
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/api/v1/deliveries", json=payload)
        assert create_resp.status_code == 201
        new_id = create_resp.json()["data"]["id"]

        list_resp = await ac.get("/api/v1/deliveries")
        assert list_resp.status_code == 200
        ids = [d["id"] for d in list_resp.json()["data"]["deliveries"]]
        assert new_id in ids


@pytest.mark.anyio
async def test_get_single_delivery():
    """GET /api/v1/deliveries/{id} returns the correct delivery in envelope."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/deliveries/del-001")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["id"] == "del-001"


@pytest.mark.anyio
async def test_get_delivery_not_found():
    """GET /api/v1/deliveries/{id} returns 404 for non-existent delivery."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/deliveries/del-nonexistent")

    assert resp.status_code == 404


@pytest.mark.anyio
async def test_sort_ascending():
    """GET /api/v1/deliveries?sort=asc returns oldest first."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/deliveries", params={"sort": "asc"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    deliveries = body["data"]["deliveries"]
    if len(deliveries) >= 2:
        assert deliveries[0]["created_at"] <= deliveries[-1]["created_at"]
