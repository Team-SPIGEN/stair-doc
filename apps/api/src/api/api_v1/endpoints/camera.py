"""Camera feed endpoints for Stair-Doc.

Provides image upload, photo gallery listing with timestamp-based filtering,
individual photo retrieval, and camera stream info.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from src.core.socket import broadcast_new_photo
from src.core.storage import delete_photo as storage_delete_photo
from src.core.storage import get_photo as storage_get_photo
from src.core.storage import get_photo_file, list_photos as storage_list_photos
from src.core.storage import save_photo
from src.schemas.base import ApiResponse, success_response
from src.schemas.camera import (
    CameraSource,
    CameraStreamInfo,
    PhotoListResponse,
    PhotoResponse,
    PhotoType,
    PhotoUploadMeta,
)

router = APIRouter(prefix="/camera", tags=["camera"])

# ── Backward-compatible In-Memory Store ──────────────────────────────────

_photos: list[PhotoResponse] = []

_stream_info: dict[str, CameraStreamInfo] = {
    "robot-001": CameraStreamInfo(
        robot_id="robot-001",
        robot_name="StairBot",
        stream_active=True,
        stream_url="http://192.168.8.114:8080/stream.mjpg",
        fps=15,
        resolution="640x480",
        camera_source=CameraSource.FRONT,
        last_frame_at=None,
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
        "data with the image file and metadata. The image bytes are persisted "
        "and returned by the gallery image endpoints."
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
    contents = await file.read()
    size_bytes = len(contents)

    now = datetime.now(UTC)
    photo_id = f"photo-{uuid.uuid4().hex[:8]}"
    filename = file.filename or f"{photo_type.value}_{photo_id}.jpg"
    content_type = file.content_type or "application/octet-stream"

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
    save_photo(photo.model_dump(mode="json"), contents, content_type)

    # Broadcast to all connected Socket.IO clients for live gallery refresh
    try:
        await broadcast_new_photo(photo.model_dump(mode="json"))
    except Exception:
        pass  # Non-critical — don't fail upload if broadcast fails

    return success_response(
        data=photo.model_dump(mode="json"),
        message=f"Photo '{filename}' uploaded successfully",
    )


@router.post(
    "/photos",
    response_model=ApiResponse[PhotoResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload a camera image",
    include_in_schema=False,
)
async def upload_photo_alias(
    robot_id: str = Form(...),
    photo_type: PhotoType = Form(PhotoType.SNAPSHOT),
    camera_source: CameraSource = Form(CameraSource.FRONT),
    delivery_id: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    robot_floor: Optional[int] = Form(None),
    recipient_rfid: Optional[str] = Form(None),
    file: UploadFile = File(...),
) -> dict:
    """Upload alias used by older Pi bridge code."""
    return await upload_photo(
        robot_id=robot_id,
        photo_type=photo_type,
        camera_source=camera_source,
        delivery_id=delivery_id,
        caption=caption,
        robot_floor=robot_floor,
        recipient_rfid=recipient_rfid,
        file=file,
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
    results = [PhotoResponse(**p) for p in storage_list_photos()]

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
    raw = storage_get_photo(photo_id)
    photo = PhotoResponse(**raw) if raw else None
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
    "/photos/{photo_id}/image",
    summary="Get photo image bytes",
    description="Return the uploaded image file for a photo.",
)
async def get_photo_image(photo_id: str) -> FileResponse:
    photo_file = get_photo_file(photo_id)
    if photo_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image for photo '{photo_id}' not found",
        )
    path, content_type = photo_file
    return FileResponse(path, media_type=content_type)


@router.get(
    "/photos/{photo_id}/thumbnail",
    summary="Get photo thumbnail",
    description="Return the uploaded image as a thumbnail for the prototype.",
)
async def get_photo_thumbnail(photo_id: str) -> FileResponse:
    return await get_photo_image(photo_id)


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
    if not storage_delete_photo(photo_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo '{photo_id}' not found",
        )
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
