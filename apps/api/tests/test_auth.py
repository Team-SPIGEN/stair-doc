"""Tests for the authentication endpoints.

Covers login, register (admin-only), /me, and role-based access control.
All responses follow the ApiResponse envelope.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import get_application

_app = get_application()


@pytest.fixture()
def anyio_backend():
    return "asyncio"


# ── Helpers ───────────────────────────────────────────────────────────────


def _assert_envelope(body: dict, *, success: bool = True):
    """Verify standard ApiResponse envelope fields."""
    assert body["success"] is success
    assert "message" in body
    assert "timestamp" in body


async def _login(ac: AsyncClient, email: str, password: str = "password123") -> str:
    """Login and return the JWT token."""
    resp = await ac.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    return resp.json()["data"]["token"]


def _auth_header(token: str) -> dict:
    """Return an Authorization header dict."""
    return {"Authorization": f"Bearer {token}"}


# ── POST /auth/login ────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_login_operator():
    """Operator can log in with correct credentials."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            json={"email": "operator@stairdoc.com", "password": "password123"},
        )

    assert resp.status_code == 200
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["token"]
    assert body["data"]["user"]["role"] == "operator"
    assert body["data"]["user"]["email"] == "operator@stairdoc.com"


@pytest.mark.anyio
async def test_login_recipient():
    """Recipient can log in."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            json={"email": "recipient@stairdoc.com", "password": "password123"},
        )

    assert resp.status_code == 200
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["user"]["role"] == "recipient"


@pytest.mark.anyio
async def test_login_admin():
    """Admin can log in."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            json={"email": "admin@stairdoc.com", "password": "password123"},
        )

    assert resp.status_code == 200
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["user"]["role"] == "admin"


@pytest.mark.anyio
async def test_login_wrong_password():
    """Invalid password returns 401."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            json={"email": "operator@stairdoc.com", "password": "wrongpassword"},
        )

    assert resp.status_code == 401


@pytest.mark.anyio
async def test_login_unknown_email():
    """Non-existent email returns 401."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            json={"email": "nobody@stairdoc.com", "password": "password123"},
        )

    assert resp.status_code == 401


@pytest.mark.anyio
async def test_login_missing_fields():
    """Missing required fields returns 422."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/login", json={})

    assert resp.status_code == 422


# ── GET /auth/me ─────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_me_operator():
    """Authenticated operator can fetch their profile."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "operator@stairdoc.com")
        resp = await ac.get("/api/v1/auth/me", headers=_auth_header(token))

    assert resp.status_code == 200
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["email"] == "operator@stairdoc.com"
    assert body["data"]["role"] == "operator"
    assert body["data"]["name"] == "Operator One"


@pytest.mark.anyio
async def test_me_recipient():
    """Authenticated recipient can fetch their profile."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "recipient@stairdoc.com")
        resp = await ac.get("/api/v1/auth/me", headers=_auth_header(token))

    assert resp.status_code == 200
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["role"] == "recipient"
    assert "RFID-A1B2C3" in body["data"]["rfid_tags"]


@pytest.mark.anyio
async def test_me_admin():
    """Authenticated admin can fetch their profile."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "admin@stairdoc.com")
        resp = await ac.get("/api/v1/auth/me", headers=_auth_header(token))

    assert resp.status_code == 200
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["role"] == "admin"


@pytest.mark.anyio
async def test_me_no_token():
    """Missing Authorization header returns 403."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/auth/me")

    assert resp.status_code == 403


@pytest.mark.anyio
async def test_me_invalid_token():
    """Garbage token returns 401."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalidtoken"},
        )

    assert resp.status_code == 401


# ── POST /auth/register (admin-only) ─────────────────────────────────────


@pytest.mark.anyio
async def test_register_as_admin():
    """Admin can register a new user."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "admin@stairdoc.com")
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@stairdoc.com",
                "password": "securepass",
                "name": "New User",
                "role": "recipient",
                "floor_access": [3, 4],
                "rfid_tags": ["RFID-NEW001"],
            },
            headers=_auth_header(token),
        )

    assert resp.status_code == 201
    body = resp.json()
    _assert_envelope(body)
    assert body["data"]["user"]["email"] == "newuser@stairdoc.com"
    assert body["data"]["user"]["role"] == "recipient"
    assert body["data"]["token"]


@pytest.mark.anyio
async def test_register_duplicate_email():
    """Registering an existing email returns 409."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "admin@stairdoc.com")
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "operator@stairdoc.com",
                "password": "securepass",
                "name": "Duplicate",
                "role": "operator",
            },
            headers=_auth_header(token),
        )

    assert resp.status_code == 409


@pytest.mark.anyio
async def test_register_as_operator_forbidden():
    """Operator cannot register users (403)."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "operator@stairdoc.com")
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "another@stairdoc.com",
                "password": "securepass",
                "name": "Forbidden",
                "role": "recipient",
            },
            headers=_auth_header(token),
        )

    assert resp.status_code == 403


@pytest.mark.anyio
async def test_register_as_recipient_forbidden():
    """Recipient cannot register users (403)."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "recipient@stairdoc.com")
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "another2@stairdoc.com",
                "password": "securepass",
                "name": "Forbidden",
                "role": "recipient",
            },
            headers=_auth_header(token),
        )

    assert resp.status_code == 403


@pytest.mark.anyio
async def test_register_no_auth():
    """Unauthenticated register returns 403."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "noauth@stairdoc.com",
                "password": "securepass",
                "name": "No Auth",
                "role": "recipient",
            },
        )

    assert resp.status_code == 403


# ── Token payload fields ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_token_contains_role_and_floor_access():
    """Decoded token data is reflected in /me response."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac, "operator@stairdoc.com")
        resp = await ac.get("/api/v1/auth/me", headers=_auth_header(token))

    body = resp.json()
    user = body["data"]
    assert user["floor_access"] == [1, 2, 3, 4, 5]
    assert user["role"] == "operator"


@pytest.mark.anyio
async def test_login_response_structure():
    """Login response has correct nested structure."""
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            json={"email": "admin@stairdoc.com", "password": "password123"},
        )

    body = resp.json()
    # Envelope
    assert "success" in body
    assert "data" in body
    assert "message" in body
    assert "timestamp" in body
    # Data
    data = body["data"]
    assert "token" in data
    assert "user" in data
    # User
    user = data["user"]
    assert "id" in user
    assert "email" in user
    assert "name" in user
    assert "role" in user
    assert "floor_access" in user
    assert "rfid_tags" in user
    assert "created_at" in user
