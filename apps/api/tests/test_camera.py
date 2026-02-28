"""Tests for the Camera Feed endpoints.

All responses follow the ApiResponse envelope: { success, data, message, timestamp }.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import get_application

_app = get_application()


@pytest.fixture()
def anyio_backend():
    return "asyncio"


# ── GET /api/v1/camera/photos ────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_photos_default():
    """Listing photos without filters returns seeded records."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/photos")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "timestamp" in body

    data = body["data"]
    assert isinstance(data["photos"], list)
    assert data["total"] >= 1
    assert data["page"] == 1
    assert data["page_size"] == 20


@pytest.mark.anyio
async def test_list_photos_pagination():
    """Requesting a specific page size works correctly."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/photos?page=1&page_size=2")

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data["photos"]) <= 2
    assert data["page_size"] == 2


@pytest.mark.anyio
async def test_list_photos_filter_by_robot():
    """Filtering by robot_id returns only that robot's photos."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/photos?robot_id=robot-001")

    assert resp.status_code == 200
    data = resp.json()["data"]
    for photo in data["photos"]:
        assert photo["robot_id"] == "robot-001"


@pytest.mark.anyio
async def test_list_photos_filter_by_type():
    """Filtering by photo_type works."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/photos?photo_type=obstacle")

    assert resp.status_code == 200
    data = resp.json()["data"]
    for photo in data["photos"]:
        assert photo["photo_type"] == "obstacle"


@pytest.mark.anyio
async def test_list_photos_timestamp_filter():
    """Timestamp range filtering returns correctly shaped data."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Use a very wide range to ensure results
        resp = await ac.get(
            "/api/v1/camera/photos",
            params={"from": "2020-01-01T00:00:00", "to": "2099-12-31T23:59:59"},
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] >= 1


# ── GET /api/v1/camera/photos/{photo_id} ─────────────────────────────────


@pytest.mark.anyio
async def test_get_photo_by_id():
    """Fetching a known seeded photo returns correct data."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/photos/photo-001")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True

    data = body["data"]
    assert data["id"] == "photo-001"
    assert data["robot_id"] == "robot-001"
    assert data["photo_type"] == "delivery_proof"
    assert "url" in data
    assert "captured_at" in data


@pytest.mark.anyio
async def test_get_photo_not_found():
    """Requesting a non-existent photo returns 404."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/photos/photo-nonexistent")

    assert resp.status_code == 404


# ── POST /api/v1/camera/upload ───────────────────────────────────────────


@pytest.mark.anyio
async def test_upload_photo():
    """Uploading a photo via multipart form data returns metadata."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/camera/upload",
            data={
                "robot_id": "robot-002",
                "photo_type": "delivery_proof",
                "camera_source": "front",
                "caption": "Test upload from pytest",
            },
            files={"file": ("test_image.jpg", b"fake-jpeg-bytes", "image/jpeg")},
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True

    data = body["data"]
    assert data["robot_id"] == "robot-002"
    assert data["photo_type"] == "delivery_proof"
    assert data["camera_source"] == "front"
    assert data["caption"] == "Test upload from pytest"
    assert data["size_bytes"] == len(b"fake-jpeg-bytes")
    assert "id" in data
    assert "url" in data


@pytest.mark.anyio
async def test_upload_then_appears_in_gallery():
    """After uploading, the new photo shows up in the gallery list."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Upload
        upload_resp = await ac.post(
            "/api/v1/camera/upload",
            data={
                "robot_id": "robot-003",
                "photo_type": "snapshot",
                "camera_source": "rear",
                "caption": "Gallery flow test",
            },
            files={"file": ("flow_test.jpg", b"gallery-flow-bytes", "image/jpeg")},
        )
        assert upload_resp.status_code == 201
        photo_id = upload_resp.json()["data"]["id"]

        # Fetch gallery
        list_resp = await ac.get("/api/v1/camera/photos")
        assert list_resp.status_code == 200
        photos = list_resp.json()["data"]["photos"]
        ids = [p["id"] for p in photos]
        assert photo_id in ids

        # Fetch by ID
        get_resp = await ac.get(f"/api/v1/camera/photos/{photo_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["data"]["caption"] == "Gallery flow test"


# ── GET /api/v1/camera/streams ───────────────────────────────────────────


@pytest.mark.anyio
async def test_list_streams():
    """Listing camera streams returns info for each robot."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/streams")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "robot_id" in data[0]
    assert "stream_active" in data[0]


@pytest.mark.anyio
async def test_get_stream_by_robot():
    """Get stream info for a specific robot."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/streams/robot-001")

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["robot_id"] == "robot-001"
    assert data["stream_active"] is True
    assert data["resolution"] == "1280x720"


@pytest.mark.anyio
async def test_get_stream_not_found():
    """Requesting stream for a non-existent robot returns 404."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/streams/robot-nonexistent")

    assert resp.status_code == 404


# ── DELETE /api/v1/camera/photos/{photo_id} ──────────────────────────────


@pytest.mark.anyio
async def test_delete_photo():
    """Deleting a seeded photo returns success and removes it."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First upload a photo so we don't affect other tests' seeded data
        upload_resp = await ac.post(
            "/api/v1/camera/upload",
            data={
                "robot_id": "robot-001",
                "photo_type": "snapshot",
                "camera_source": "front",
                "caption": "Delete-me test photo",
            },
            files={"file": ("delete_test.jpg", b"delete-bytes", "image/jpeg")},
        )
        assert upload_resp.status_code == 201
        photo_id = upload_resp.json()["data"]["id"]

        # Delete it
        del_resp = await ac.delete(f"/api/v1/camera/photos/{photo_id}")
        assert del_resp.status_code == 200
        body = del_resp.json()
        assert body["success"] is True
        assert body["data"]["deleted"] is True

        # Verify it's gone
        get_resp = await ac.get(f"/api/v1/camera/photos/{photo_id}")
        assert get_resp.status_code == 404


@pytest.mark.anyio
async def test_delete_photo_not_found():
    """Deleting a non-existent photo returns 404."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete("/api/v1/camera/photos/photo-nonexistent")

    assert resp.status_code == 404


# ── GET /api/v1/camera/stream.mjpg ──────────────────────────────────────


@pytest.mark.anyio
async def test_mjpeg_stream_proxy():
    """MJPEG stream proxy returns multipart response for active robot."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/stream.mjpg?robot_id=robot-001")

    assert resp.status_code == 200
    assert "multipart/x-mixed-replace" in resp.headers.get("content-type", "")


@pytest.mark.anyio
async def test_mjpeg_stream_proxy_inactive_robot():
    """MJPEG stream proxy returns 404 for inactive robot."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/stream.mjpg?robot_id=robot-003")

    assert resp.status_code == 404


@pytest.mark.anyio
async def test_mjpeg_stream_proxy_unknown_robot():
    """MJPEG stream proxy returns 404 for unknown robot."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/camera/stream.mjpg?robot_id=robot-unknown")

    assert resp.status_code == 404


# ── Upload with robot_floor and recipient_rfid ───────────────────────────


@pytest.mark.anyio
async def test_upload_photo_with_context_fields():
    """Uploading a photo with robot_floor and recipient_rfid returns them."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/camera/upload",
            data={
                "robot_id": "robot-001",
                "photo_type": "recipient_verify",
                "camera_source": "verification",
                "caption": "RFID verification photo",
                "robot_floor": "3",
                "recipient_rfid": "RFID-A1B2C3",
            },
            files={"file": ("verify.jpg", b"verify-bytes", "image/jpeg")},
        )

    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["robot_floor"] == 3
    assert data["recipient_rfid"] == "RFID-A1B2C3"
