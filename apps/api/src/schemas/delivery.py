"""Pydantic models for delivery management.

Defines request / response schemas for the delivery CRUD endpoints.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DeliveryStatus(str, Enum):
    """Possible states of a delivery."""

    PENDING = "pending"
    ASSIGNED = "assigned"
    PICKED_UP = "picked_up"
    IN_TRANSIT = "in_transit"
    CLIMBING_STAIRS = "climbing_stairs"
    ARRIVED = "arrived"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Priority(str, Enum):
    """Delivery priority level."""

    NORMAL = "normal"
    URGENT = "urgent"
    EXPRESS = "express"


# ── Shared sub-models ────────────────────────────────────────────────────


class DeliveryLocation(BaseModel):
    """Indoor location used for pickup / drop-off."""

    floor: int = Field(..., ge=0, le=20, description="Floor number")
    building: str = Field(..., min_length=1, max_length=100)
    room: Optional[str] = Field(None, max_length=50)


# ── Request schemas ──────────────────────────────────────────────────────


class DeliveryCreate(BaseModel):
    """Schema for creating a new delivery."""

    pickup_location: DeliveryLocation
    dropoff_location: DeliveryLocation
    package_weight: float = Field(
        0.0, ge=0, le=50, description="Package weight in kg"
    )
    priority: Priority = Priority.NORMAL
    recipient_name: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)


# ── Response schemas ─────────────────────────────────────────────────────


class DeliveryResponse(BaseModel):
    """Full delivery response."""

    id: str
    robot_id: Optional[str] = None
    status: DeliveryStatus
    pickup_location: DeliveryLocation
    dropoff_location: DeliveryLocation
    package_weight: float = Field(0.0, ge=0, le=50)
    priority: Priority
    recipient_name: Optional[str] = None
    notes: Optional[str] = None
    estimated_arrival: Optional[datetime] = None
    actual_arrival: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class DeliveryListResponse(BaseModel):
    """Response containing multiple deliveries with metadata."""

    deliveries: list[DeliveryResponse]
    total: int
    timestamp: datetime
