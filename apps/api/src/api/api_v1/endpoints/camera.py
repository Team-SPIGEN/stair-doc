"""Camera feed endpoints for Stair-Doc.

Provides image upload (simulated), photo gallery listing with timestamp-based
filtering, individual photo retrieval, and camera stream info — all with
mock in-memory storage.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from src.schemas.base import ApiResponse, success_response
from src.schemas.camera import (
    CameraSource,
    CameraStreamInfo,
    PhotoListResponse,
    PhotoResponse,
    PhotoType,
    PhotoUploadMeta,
)
from src.core.socket import broadcast_new_photo

router = APIRouter(prefix="/camera", tags=["camera"])

# ── Mock In-Memory Store ─────────────────────────────────────────────────

_photos: list[PhotoResponse] = [
    PhotoResponse(
        id="photo-001",
        robot_id="robot-001",
        delivery_id="del-001",
        photo_type=PhotoType.DELIVERY_PROOF,
        camera_source=CameraSource.FRONT,
        caption="Package delivered to Room 305",
        filename="delivery_proof_001.jpg",
        url="/api/v1/camera/photos/photo-001/image",
        thumbnail_url="/api/v1/camera/photos/photo-001/thumbnail",
        width=1280,
        height=720,
        size_bytes=245_760,
        robot_floor=3,
        recipient_rfid="RFID-A1B2C3",
        captured_at=datetime.now(UTC) - timedelta(hours=1),
        uploaded_at=datetime.now(UTC) - timedelta(hours=1),
    ),
    PhotoResponse(
        id="photo-002",
        robot_id="robot-002",
        delivery_id="del-002",
        photo_type=PhotoType.RECIPIENT_VERIFY,
        camera_source=CameraSource.FRONT,
        caption="Recipient verification — Bob Smith",
        filename="recipient_verify_002.jpg",
        url="/api/v1/camera/photos/photo-002/image",
        thumbnail_url="/api/v1/camera/photos/photo-002/thumbnail",
        width=640,
        height=480,
        size_bytes=102_400,
        robot_floor=2,
        recipient_rfid="RFID-D4E5F6",
        captured_at=datetime.now(UTC) - timedelta(hours=3),
        uploaded_at=datetime.now(UTC) - timedelta(hours=3),
    ),
    PhotoResponse(
        id="photo-003",
        robot_id="robot-001",
        delivery_id=None,
        photo_type=PhotoType.OBSTACLE,
        camera_source=CameraSource.FRONT,
        caption="Obstacle detected on floor 2 hallway",
        filename="obstacle_003.jpg",
        url="/api/v1/camera/photos/photo-003/image",
        thumbnail_url="/api/v1/camera/photos/photo-003/thumbnail",
        width=1280,
        height=720,
        size_bytes=198_000,
        captured_at=datetime.now(UTC) - timedelta(hours=5),
        uploaded_at=datetime.now(UTC) - timedelta(hours=5),
    ),
    PhotoResponse(
        id="photo-004",
        robot_id="robot-003",
        delivery_id=None,
        photo_type=PhotoType.SNAPSHOT,
        camera_source=CameraSource.FRONT,
        caption="Charging dock environment check",
        filename="snapshot_004.jpg",
        url="/api/v1/camera/photos/photo-004/image",
        thumbnail_url="/api/v1/camera/photos/photo-004/thumbnail",
        width=1920,
        height=1080,
        size_bytes=512_000,
        captured_at=datetime.now(UTC) - timedelta(hours=8),
        uploaded_at=datetime.now(UTC) - timedelta(hours=8),
    ),
    PhotoResponse(
        id="photo-005",
        robot_id="robot-004",
        delivery_id="del-004",
        photo_type=PhotoType.DELIVERY_PROOF,
        camera_source=CameraSource.FRONT,
        caption="Delivery completed — Building C, Room 207",
        filename="delivery_proof_005.jpg",
        url="/api/v1/camera/photos/photo-005/image",
        thumbnail_url="/api/v1/camera/photos/photo-005/thumbnail",
        width=1280,
        height=720,
        size_bytes=230_400,
        robot_floor=2,
        recipient_rfid="RFID-G7H8I9",
        captured_at=datetime.now(UTC) - timedelta(hours=12),
        uploaded_at=datetime.now(UTC) - timedelta(hours=12),
    ),
    PhotoResponse(
        id="photo-006",
        robot_id="robot-002",
        delivery_id=None,
        photo_type=PhotoType.ENVIRONMENT,
        camera_source=CameraSource.REAR,
        caption="Stairwell B — floor 3 landing",
        filename="environment_006.jpg",
        url="/api/v1/camera/photos/photo-006/image",
        thumbnail_url="/api/v1/camera/photos/photo-006/thumbnail",
        width=1280,
        height=720,
        size_bytes=275_000,
        captured_at=datetime.now(UTC) - timedelta(days=1),
        uploaded_at=datetime.now(UTC) - timedelta(days=1),
    ),
]

# Camera stream info per robot
_stream_info: dict[str, CameraStreamInfo] = {
    "robot-001": CameraStreamInfo(
        robot_id="robot-001",
        robot_name="StairBot Alpha",
        stream_active=True,
        stream_url="/api/v1/camera/stream/robot-001",
        fps=15,
        resolution="1280x720",
        camera_source=CameraSource.FRONT,
        last_frame_at=datetime.now(UTC) - timedelta(seconds=2),
    ),
    "robot-002": CameraStreamInfo(
        robot_id="robot-002",
        robot_name="StairBot Beta",
        stream_active=True,
        stream_url="/api/v1/camera/stream/robot-002",
        fps=15,
        resolution="1280x720",
        camera_source=CameraSource.FRONT,
        last_frame_at=datetime.now(UTC) - timedelta(seconds=2),
    ),
    "robot-003": CameraStreamInfo(
        robot_id="robot-003",
        robot_name="StairBot Gamma",
        stream_active=False,
        stream_url=None,
        fps=0,
        resolution="640x480",
        camera_source=CameraSource.FRONT,
        last_frame_at=datetime.now(UTC) - timedelta(minutes=30),
    ),
    "robot-004": CameraStreamInfo(
        robot_id="robot-004",
        robot_name="StairBot Delta",
        stream_active=True,
        stream_url="/api/v1/camera/stream/robot-004",
        fps=10,
        resolution="640x480",
        camera_source=CameraSource.FRONT,
        last_frame_at=datetime.now(UTC) - timedelta(seconds=5),
    ),
}


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post(
    "/upload",
    response_model=ApiResponse[PhotoResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload a camera image",
    description=(
        "Upload an image captured by a robot camera. Accepts multipart form "
        "data with the image file and metadata. In this mock implementation the "
        "file contents are discarded but metadata is stored."
    ),
)
async def upload_photo(
    robot_id: str = Form(...),
    photo_type: PhotoType = Form(PhotoType.SNAPSHOT),
    camera_source: CameraSource = Form(CameraSource.FRONT),
    delivery_id: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    robot_floor: Optional[int] = Form(None),
    recipient_rfid: Optional[str] = Form(None),
    file: UploadFile = File(...),
) -> dict:
    # Read file size (mock — we don't persist the bytes)
    contents = await file.read()
    size_bytes = len(contents)

    now = datetime.now(UTC)
    photo_id = f"photo-{uuid.uuid4().hex[:8]}"
    filename = file.filename or f"{photo_type.value}_{photo_id}.jpg"

    photo = PhotoResponse(
        id=photo_id,
        robot_id=robot_id,
        delivery_id=delivery_id,
        photo_type=photo_type,
        camera_source=camera_source,
        caption=caption,
        filename=filename,
        url=f"/api/v1/camera/photos/{photo_id}/image",
        thumbnail_url=f"/api/v1/camera/photos/{photo_id}/thumbnail",
        width=1280,
        height=720,
        size_bytes=size_bytes,
        robot_floor=robot_floor,
        recipient_rfid=recipient_rfid,
        captured_at=now,
        uploaded_at=now,
    )
    _photos.insert(0, photo)

    # Broadcast to all connected Socket.IO clients for live gallery refresh
    try:
        await broadcast_new_photo(photo.model_dump(mode="json"))
    except Exception:
        pass  # Non-critical — don't fail upload if broadcast fails

    return success_response(
        data=photo.model_dump(mode="json"),
        message=f"Photo '{filename}' uploaded successfully",
    )


@router.get(
    "/photos",
    response_model=ApiResponse[PhotoListResponse],
    summary="List photos (gallery)",
    description=(
        "Returns a paginated photo gallery with optional filtering by robot, "
        "photo type, and timestamp range."
    ),
)
async def list_photos(
    robot_id: Optional[str] = Query(None, description="Filter by robot ID"),
    photo_type: Optional[PhotoType] = Query(None, description="Filter by photo type"),
    from_date: Optional[datetime] = Query(
        None, description="Start of date range (ISO 8601)", alias="from"
    ),
    to_date: Optional[datetime] = Query(
        None, description="End of date range (ISO 8601)", alias="to"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
) -> dict:
    results = list(_photos)

    # ── Filters ──
    if robot_id is not None:
        results = [p for p in results if p.robot_id == robot_id]
    if photo_type is not None:
        results = [p for p in results if p.photo_type == photo_type]
    if from_date is not None:
        # Ensure timezone-aware comparison
        fd = from_date if from_date.tzinfo else from_date.replace(tzinfo=UTC)
        results = [p for p in results if p.captured_at >= fd]
    if to_date is not None:
        td = to_date if to_date.tzinfo else to_date.replace(tzinfo=UTC)
        results = [p for p in results if p.captured_at <= td]

    # ── Sort newest first ──
    results.sort(key=lambda p: p.captured_at, reverse=True)

    # ── Paginate ──
    total = len(results)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = results[start:end]

    payload = PhotoListResponse(
        photos=page_items,
        total=total,
        page=page,
        page_size=page_size,
        timestamp=datetime.now(UTC),
    )
    return success_response(
        data=payload.model_dump(mode="json"),
        message=f"Retrieved {len(page_items)} photo(s) (page {page})",
    )


@router.get(
    "/photos/{photo_id}",
    response_model=ApiResponse[PhotoResponse],
    summary="Get a single photo",
    description="Retrieve metadata for a specific photo by ID.",
)
async def get_photo(photo_id: str) -> dict:
    photo = next((p for p in _photos if p.id == photo_id), None)
    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo '{photo_id}' not found",
        )
    return success_response(
        data=photo.model_dump(mode="json"),
        message="Photo retrieved successfully",
    )


@router.get(
    "/streams",
    response_model=ApiResponse[list[CameraStreamInfo]],
    summary="List camera streams",
    description="Returns live camera stream info for each robot.",
)
async def list_streams() -> dict:
    streams = list(_stream_info.values())
    return success_response(
        data=[s.model_dump(mode="json") for s in streams],
        message=f"Retrieved {len(streams)} camera stream(s)",
    )


@router.get(
    "/streams/{robot_id}",
    response_model=ApiResponse[CameraStreamInfo],
    summary="Get stream info for a robot",
    description="Camera stream metadata for a specific robot.",
)
async def get_stream_info(robot_id: str) -> dict:
    info = _stream_info.get(robot_id)
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No camera stream for robot '{robot_id}'",
        )
    return success_response(
        data=info.model_dump(mode="json"),
        message=f"Stream info for {robot_id}",
    )


@router.delete(
    "/photos/{photo_id}",
    response_model=ApiResponse[dict],
    summary="Delete a photo (admin)",
    description=(
        "Permanently delete a photo from the gallery. "
        "In production this requires admin authentication."
    ),
)
async def delete_photo(photo_id: str) -> dict:
    photo = next((p for p in _photos if p.id == photo_id), None)
    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo '{photo_id}' not found",
        )
    _photos.remove(photo)
    return success_response(
        data={"id": photo_id, "deleted": True},
        message=f"Photo '{photo_id}' deleted successfully",
    )


@router.get(
    "/stream.mjpg",
    summary="MJPEG stream proxy (placeholder)",
    description=(
        "Proxy endpoint for MJPEG camera streams from robots. "
        "In production this relays the Pi Camera MJPEG stream. "
        "Returns a simulated multipart response for development."
    ),
)
async def mjpeg_stream_proxy(
    robot_id: str = Query(..., description="Robot whose camera to stream"),
) -> StreamingResponse:
    info = _stream_info.get(robot_id)
    if info is None or not info.stream_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active camera stream for robot '{robot_id}'",
        )

    async def _placeholder_generator():
        """Yield a single placeholder frame — real implementation would
        relay MJPEG frames from the robot's Pi Camera over WebSocket/MQTT."""
        # 1x1 transparent JPEG placeholder
        placeholder_jpeg = (
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01"
            b"\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06"
            b"\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b"
            b"\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c"
            b"\x1c $.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0"
            b"\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4"
            b"\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00"
            b"\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06"
            b"\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03"
            b"\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02"
            b"\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07\"q\x142\x81"
            b"\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16"
            b"\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghij"
            b"stuvwxyz\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd2"
            b"\x8a(\x03\xff\xd9"
        )
        boundary = b"--frame"
        yield boundary + b"\r\n"
        yield b"Content-Type: image/jpeg\r\n"
        yield f"Content-Length: {len(placeholder_jpeg)}\r\n\r\n".encode()
        yield placeholder_jpeg
        yield b"\r\n"

    return StreamingResponse(
        _placeholder_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
