"""Authentication & authorization schemas for the Stair-Doc API.

Defines the role enum, request/response models for register, login, me,
and the JWT token payload structure.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ── Roles ─────────────────────────────────────────────────────────────────


class UserRole(str, Enum):
    """Three-tier role system for Stair-Doc access control."""

    OPERATOR = "operator"
    RECIPIENT = "recipient"
    ADMIN = "admin"


# ── Request schemas ───────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    """Payload for POST /auth/register (admin-only)."""

    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=1, max_length=100)
    role: UserRole = UserRole.RECIPIENT
    floor_access: list[int] = Field(default_factory=lambda: [1])
    rfid_tags: list[str] = Field(default_factory=list)


class LoginRequest(BaseModel):
    """Payload for POST /auth/login."""

    email: EmailStr
    password: str = Field(..., min_length=1)


# ── Response schemas ──────────────────────────────────────────────────────


class UserResponse(BaseModel):
    """Public user representation returned by the API."""

    id: str
    email: str
    name: str
    role: UserRole
    floor_access: list[int]
    rfid_tags: list[str]
    created_at: str


class TokenResponse(BaseModel):
    """Returned on successful login / register."""

    token: str
    user: UserResponse


# ── JWT internals ─────────────────────────────────────────────────────────


class TokenPayload(BaseModel):
    """Claims embedded inside the signed JWT."""

    sub: str  # user id
    email: str
    role: UserRole
    floor_access: list[int] = Field(default_factory=list)
    rfid_tags: list[str] = Field(default_factory=list)
    exp: Optional[datetime] = None
