"""Pydantic models for camera feed and photo gallery.

Defines request / response schemas for image upload, listing, and streaming.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class CameraSource(str, Enum):
    """Which robot camera captured the image."""

    FRONT = "front"
    REAR = "rear"
    VERIFICATION = "verification"


class PhotoType(str, Enum):
    """Purpose of the captured photo."""

    DELIVERY_PROOF = "delivery_proof"
    RECIPIENT_VERIFY = "recipient_verify"
    OBSTACLE = "obstacle"
    SNAPSHOT = "snapshot"
    ENVIRONMENT = "environment"


# ── Request schemas ──────────────────────────────────────────────────────


class PhotoUploadMeta(BaseModel):
    """Metadata sent alongside an image upload (form fields or JSON)."""

    robot_id: str = Field(..., min_length=1, description="Robot that captured the photo")
    delivery_id: Optional[str] = Field(None, description="Associated delivery, if any")
    photo_type: PhotoType = PhotoType.SNAPSHOT
    camera_source: CameraSource = CameraSource.FRONT
    caption: Optional[str] = Field(None, max_length=200)
    robot_floor: Optional[int] = Field(None, ge=0, le=100, description="Floor the robot was on when photo was taken")
    recipient_rfid: Optional[str] = Field(None, description="RFID tag of the recipient for verification photos")


# ── Response schemas ─────────────────────────────────────────────────────


class PhotoResponse(BaseModel):
    """Single photo record returned by the API."""

    id: str
    robot_id: str
    delivery_id: Optional[str] = None
    photo_type: PhotoType
    camera_source: CameraSource
    caption: Optional[str] = None
    filename: str
    url: str
    thumbnail_url: str
    width: int
    height: int
    size_bytes: int
    robot_floor: Optional[int] = None
    recipient_rfid: Optional[str] = None
    captured_at: datetime
    uploaded_at: datetime


class PhotoListResponse(BaseModel):
    """Paginated list of photos."""

    photos: list[PhotoResponse]
    total: int
    page: int
    page_size: int
    timestamp: datetime


class CameraStreamInfo(BaseModel):
    """Info about a robot's live camera stream."""

    robot_id: str
    robot_name: str
    stream_active: bool
    stream_url: Optional[str] = None
    fps: int
    resolution: str
    camera_source: CameraSource
    last_frame_at: Optional[datetime] = None
