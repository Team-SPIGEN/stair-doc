"""Pydantic models for RFID management.

Defines request / response schemas for RFID authorization and access logs.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RFIDScanType(str, Enum):
    """Type of RFID scan event."""

    CHECKPOINT = "checkpoint"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    UNLOCK = "unlock"
    DENIED = "denied"


class RFIDTagStatus(str, Enum):
    """Current authorization status of an RFID tag."""

    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"
    UNKNOWN = "unknown"


class ContainerStatus(str, Enum):
    """Physical state of the delivery container lock."""

    LOCKED = "locked"
    UNLOCKED = "unlocked"
    ERROR = "error"


# ── Request schemas ──────────────────────────────────────────────────────


class RFIDAuthorizeRequest(BaseModel):
    """Payload for POST /rfid/authorize — simulate an RFID tap."""

    tag_id: str = Field(
        ...,
        min_length=4,
        max_length=32,
        description="RFID tag UID (e.g., 'RFID-A1B2C3')",
    )
    robot_id: str = Field(
        ...,
        min_length=1,
        description="ID of the robot whose container is being scanned",
    )
    delivery_id: Optional[str] = Field(
        None,
        description="Associated delivery (optional; can be auto-resolved)",
    )


class RFIDRegisterRequest(BaseModel):
    """Payload for registering a new RFID tag to a user."""

    tag_id: str = Field(..., min_length=4, max_length=32)
    user_name: str = Field(..., min_length=1, max_length=100)
    role: str = Field("recipient", pattern=r"^(operator|recipient|admin)$")


# ── Response schemas ─────────────────────────────────────────────────────


class RFIDAuthorizeResponse(BaseModel):
    """Result of an RFID authorization attempt."""

    authorized: bool
    tag_id: str
    robot_id: str
    delivery_id: Optional[str] = None
    container_status: ContainerStatus
    user_name: Optional[str] = None
    message: str
    timestamp: datetime


class RFIDLogEntry(BaseModel):
    """A single RFID access log record."""

    id: str
    tag_id: str
    robot_id: str
    delivery_id: Optional[str] = None
    scan_type: RFIDScanType
    authorized: bool
    user_name: Optional[str] = None
    location: Optional[str] = None
    message: str
    timestamp: datetime


class RFIDLogListResponse(BaseModel):
    """Paginated list of RFID access logs."""

    logs: list[RFIDLogEntry]
    total: int
    timestamp: datetime


class RFIDTagResponse(BaseModel):
    """Registered RFID tag info."""

    tag_id: str
    user_name: str
    role: str
    status: RFIDTagStatus
    registered_at: datetime
    last_used: Optional[datetime] = None
