"""Shared schema primitives for the Stair-Doc API.

Provides the standard ``ApiResponse`` envelope that ALL endpoints must use,
plus convenience helpers ``success_response`` and ``error_response``.
"""

from datetime import UTC, datetime
from typing import ClassVar, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


# ── Standard API envelope ────────────────────────────────────────────────


class ApiResponse(BaseModel, Generic[T]):
    """Standard API response wrapper.

    Every endpoint returns ``{ success, data, message, timestamp }``.
    """

    success: bool
    data: T
    message: str
    timestamp: datetime


class ApiErrorResponse(BaseModel):
    """Error response (success is always False, data is always None)."""

    success: bool = False
    data: None = None
    message: str
    timestamp: datetime


# ── Helpers ───────────────────────────────────────────────────────────────


def success_response(data: T, message: str = "Success") -> dict:
    """Build a successful envelope dict that FastAPI will serialise."""
    return {
        "success": True,
        "data": data,
        "message": message,
        "timestamp": datetime.now(UTC),
    }


def error_response(message: str) -> dict:
    """Build an error envelope dict."""
    return {
        "success": False,
        "data": None,
        "message": message,
        "timestamp": datetime.now(UTC),
    }


# ── Legacy CRUD bases (kept for backward-compat) ────────────────────────


# Properties to receive on item creation
# in
class CreateBase(BaseModel):
    # inherent to add more properties for creating
    pass


# Properties to receive on item update
# in
class UpdateBase(BaseModel):
    # inherent to add more properties for updating
    id: str


# response
# Properties shared by models stored in DB
class InDBBase(BaseModel):
    id: str
    user_id: str
    created_at: str


# Properties to return to client
# crud model
# out
class ResponseBase(InDBBase):
    # inherent to add more properties for responding
    table_name: ClassVar[str] = "ResponseBase".lower()
    Config: ClassVar[ConfigDict] = ConfigDict(
        extra="ignore", arbitrary_types_allowed=True
    )
