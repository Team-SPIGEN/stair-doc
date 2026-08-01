"""Map endpoints for Stair-Doc.

Provides:
  GET /api/v1/map/slam    — latest live SLAM map from ros2_bridge relay (JSON)
  GET /api/v1/map/static  — pre-built stairbot_room_map.pgm as a PNG data URI
"""

import base64
import struct
import zlib
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from src.core.bridge import get_robot_pose, get_slam_map
from src.core.robot import ROBOT_ID
from src.schemas.base import ApiResponse, success_response

router = APIRouter(prefix="/map", tags=["map"])

# Path to the pre-built map shipped with the StairDOC repo (copied to Pi's ~/maps/)
_STATIC_MAP_PGM = Path("/home/spigen/maps/stairbot_room_map.pgm")
# Also check a path relative to this file for local dev
_DEV_MAP_PGM = (
    Path(__file__).parents[5] / "maps" / "stairbot_room_map.pgm"
)


def _find_pgm() -> Path | None:
    if _STATIC_MAP_PGM.exists():
        return _STATIC_MAP_PGM
    if _DEV_MAP_PGM.exists():
        return _DEV_MAP_PGM
    return None


def _pgm_to_png_b64(pgm_path: Path) -> tuple[str, int, int]:
    """Read a PGM (P5 binary or P2 ASCII) and return (base64-PNG, width, height)."""
    data = pgm_path.read_bytes()
    # Parse PGM header (skip comment lines starting with #)
    lines: list[str] = []
    idx = 0
    while len(lines) < 3:
        end = data.index(b"\n", idx)
        line = data[idx:end].decode("ascii", errors="ignore").strip()
        idx = end + 1
        if line.startswith("#"):
            continue
        lines.append(line)

    magic = lines[0]
    w, h = map(int, lines[1].split())

    if magic == "P5":  # binary grayscale
        raw_pixels = data[idx : idx + w * h]
    else:  # P2 ascii grayscale
        raw_pixels = bytes(int(v) for v in data[idx:].decode().split())

    # Build a minimal PNG (8-bit greyscale) without Pillow
    def _chunk(chunk_type: bytes, chunk_data: bytes) -> bytes:
        length = len(chunk_data)
        crc = zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
        return struct.pack(">I", length) + chunk_type + chunk_data + struct.pack(">I", crc)

    ihdr_data = struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)
    ihdr = _chunk(b"IHDR", ihdr_data)

    scanlines = bytearray()
    for row in range(h):
        scanlines.append(0)  # filter byte = None
        start = row * w
        scanlines.extend(raw_pixels[start : start + w])
    idat = _chunk(b"IDAT", zlib.compress(bytes(scanlines), 6))
    iend = _chunk(b"IEND", b"")

    png_bytes = b"\x89PNG\r\n\x1a\n" + ihdr + idat + iend
    return base64.b64encode(png_bytes).decode(), w, h


def _read_yaml_meta(pgm_path: Path) -> dict[str, Any]:
    """Return resolution + origin from the .yaml sidecar file if available."""
    meta: dict[str, Any] = {"resolution": 0.05, "origin_x": 0.0, "origin_y": 0.0}
    yaml_path = pgm_path.with_suffix(".yaml")
    if not yaml_path.exists():
        return meta
    try:
        import yaml  # PyYAML (optional)

        raw = yaml.safe_load(yaml_path.read_text())
        meta["resolution"] = raw.get("resolution", 0.05)
        origin = raw.get("origin", [0, 0, 0])
        meta["origin_x"] = origin[0]
        meta["origin_y"] = origin[1]
    except Exception:
        pass
    return meta


@router.get(
    "/slam",
    response_model=ApiResponse[dict[str, Any]],
    summary="Get latest live SLAM map",
    description=(
        "Returns the latest SLAM OccupancyGrid snapshot received from the ros2_bridge "
        "relay running on the Raspberry Pi. Includes grid dimensions, resolution, origin, "
        "downsampled obstacle points in world frame, and the robot's localized pose. "
        "Returns 404 if no live SLAM data is available yet."
    ),
)
async def get_slam_map_endpoint() -> dict:
    slam = get_slam_map(ROBOT_ID)
    pose = get_robot_pose(ROBOT_ID)
    if slam is None:
        raise HTTPException(status_code=404, detail="No live SLAM map data available")
    return success_response(
        data={
            "slam_map": slam,
            "robot_pose": pose,
            "robot_id": ROBOT_ID,
        },
        message="Live SLAM map data",
    )


@router.get(
    "/static",
    response_model=ApiResponse[dict[str, Any]],
    summary="Get pre-built static map",
    description=(
        "Returns the pre-built stairbot_room_map.pgm as a base64-encoded PNG data URI "
        "along with its occupancy grid metadata (width, height, resolution, origin). "
        "This is used as a background overlay in the PWA navigation view when the robot "
        "is in Nav2 localization mode (navigating on a known map). "
        "Returns 404 if the map file is not present on this host."
    ),
)
async def get_static_map() -> dict:
    pgm_path = _find_pgm()
    if pgm_path is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Pre-built map not found. "
                "Copy stairbot_room_map.pgm to ~/maps/ on the Pi."
            ),
        )
    try:
        png_b64, width, height = _pgm_to_png_b64(pgm_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert map: {exc}") from exc

    meta = _read_yaml_meta(pgm_path)
    return success_response(
        data={
            "width": width,
            "height": height,
            "resolution": meta["resolution"],
            "origin_x": meta["origin_x"],
            "origin_y": meta["origin_y"],
            "image_data_uri": f"data:image/png;base64,{png_b64}",
            "robot_id": ROBOT_ID,
        },
        message="Pre-built static map",
    )
