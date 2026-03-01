"""JWT token helpers and in-memory mock user store.

This module keeps the authentication logic isolated from the endpoint
layer.  In production you would swap ``MOCK_USERS`` for a real database
query.
"""

from datetime import UTC, datetime, timedelta
from typing import Optional
from uuid import uuid4

import bcrypt
from jose import JWTError, jwt

from src.config import settings
from src.schemas.auth import TokenPayload, UserRole

# ── Password hashing ─────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Check *plain* against *hashed*."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ───────────────────────────────────────────────────────────


def create_access_token(payload: TokenPayload) -> str:
    """Create a signed JWT from *payload*."""
    claims = payload.model_dump()
    claims["exp"] = datetime.now(UTC) + timedelta(
        days=settings.JWT_EXPIRATION_DAYS
    )
    # jose expects ``sub`` to be a string
    claims["sub"] = str(claims["sub"])
    return jwt.encode(
        claims,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> Optional[TokenPayload]:
    """Decode and validate a JWT, returning ``None`` on failure."""
    try:
        data = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return TokenPayload(**data)
    except JWTError:
        return None


# ── Mock user store ───────────────────────────────────────────────────────

# Each entry mirrors the DB row a real implementation would have.
# Passwords are hashed at import time (once).

_HASHED = hash_password("password123")

MOCK_USERS: dict[str, dict] = {
    "usr_op_001": {
        "id": "usr_op_001",
        "email": "operator@stairdoc.com",
        "name": "Operator One",
        "role": UserRole.OPERATOR,
        "password_hash": _HASHED,
        "floor_access": [1, 2, 3, 4, 5],
        "rfid_tags": [],
        "created_at": "2025-01-15T08:00:00Z",
    },
    "usr_rc_001": {
        "id": "usr_rc_001",
        "email": "recipient@stairdoc.com",
        "name": "Recipient One",
        "role": UserRole.RECIPIENT,
        "password_hash": _HASHED,
        "floor_access": [2],
        "rfid_tags": ["RFID-A1B2C3"],
        "created_at": "2025-01-15T08:00:00Z",
    },
    "usr_ad_001": {
        "id": "usr_ad_001",
        "email": "admin@stairdoc.com",
        "name": "Admin One",
        "role": UserRole.ADMIN,
        "password_hash": _HASHED,
        "floor_access": [1, 2, 3, 4, 5],
        "rfid_tags": [],
        "created_at": "2025-01-15T08:00:00Z",
    },
}

# Quick lookup by email
_EMAIL_INDEX: dict[str, str] = {
    u["email"]: uid for uid, u in MOCK_USERS.items()
}


def get_user_by_email(email: str) -> Optional[dict]:
    """Return mock user dict or ``None``."""
    uid = _EMAIL_INDEX.get(email)
    return MOCK_USERS.get(uid) if uid else None


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Return mock user dict or ``None``."""
    return MOCK_USERS.get(user_id)


def add_user(user_data: dict) -> dict:
    """Insert a new user into the mock store and return it."""
    uid = f"usr_{uuid4().hex[:8]}"
    user_data["id"] = uid
    user_data["created_at"] = datetime.now(UTC).isoformat()
    MOCK_USERS[uid] = user_data
    _EMAIL_INDEX[user_data["email"]] = uid
    return user_data
