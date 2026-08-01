"""Named destination lookup for autonomous Nav2 goals.

Loads ``maps/locations.json`` (or YAML) and matches room id / aliases
case-insensitively. Coordinates are map-frame metres; ``yaw`` is radians.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Repo root maps/ (…/stair-doc/maps) — parents[4] from apps/api/src/core/
_DEFAULT_LOCATIONS = Path(__file__).resolve().parents[4] / "maps" / "locations.json"
# Pi deploy path (same layout as static map)
_PI_LOCATIONS = Path("/home/spigen/maps/locations.json")


@dataclass(frozen=True)
class LocationRoom:
    """A named Nav2 goal pose in the map frame."""

    id: str
    aliases: tuple[str, ...]
    x: float
    y: float
    yaw: float  # radians
    frame_id: str = "map"
    map: str = "stairbot_room_map"

    def matches(self, query: str) -> bool:
        key = query.strip().lower()
        if not key:
            return False
        if self.id.lower() == key:
            return True
        return any(a.strip().lower() == key for a in self.aliases)


_cache: list[LocationRoom] | None = None
_cache_mtime: float | None = None
_cache_path: Path | None = None


def locations_file_path() -> Path:
    """Resolve the locations catalog path (env override → Pi → repo)."""
    override = os.getenv("STAIRDOC_LOCATIONS_FILE", "").strip()
    if override:
        return Path(override)
    if _PI_LOCATIONS.exists():
        return _PI_LOCATIONS
    return _DEFAULT_LOCATIONS


def _parse_rooms(raw: dict[str, Any]) -> list[LocationRoom]:
    rooms: list[LocationRoom] = []
    for entry in raw.get("rooms") or []:
        if not isinstance(entry, dict):
            continue
        room_id = str(entry.get("id", "")).strip()
        if not room_id:
            continue
        aliases = entry.get("aliases") or []
        if isinstance(aliases, str):
            aliases = [aliases]
        rooms.append(
            LocationRoom(
                id=room_id,
                aliases=tuple(str(a) for a in aliases),
                x=float(entry["x"]),
                y=float(entry["y"]),
                yaw=float(entry.get("yaw", 0.0)),
                frame_id=str(entry.get("frame_id", "map")),
                map=str(entry.get("map", "stairbot_room_map")),
            )
        )
    return rooms


def _load_file(path: Path) -> list[LocationRoom]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore[import-untyped]
        except ImportError as exc:
            raise RuntimeError(
                "PyYAML required to load locations YAML. Use locations.json or pip install pyyaml."
            ) from exc
        raw = yaml.safe_load(text) or {}
    else:
        raw = json.loads(text)
    if not isinstance(raw, dict):
        raise ValueError("Locations file must be a JSON/YAML object with a 'rooms' array")
    return _parse_rooms(raw)


def load_locations(*, force: bool = False) -> list[LocationRoom]:
    """Load (and cache) the locations catalog."""
    global _cache, _cache_mtime, _cache_path
    path = locations_file_path()
    mtime = path.stat().st_mtime if path.exists() else None
    if (
        not force
        and _cache is not None
        and _cache_path == path
        and _cache_mtime == mtime
    ):
        return _cache

    if not path.exists():
        _cache = []
        _cache_mtime = None
        _cache_path = path
        return _cache

    _cache = _load_file(path)
    _cache_mtime = mtime
    _cache_path = path
    return _cache


def normalize_destination(raw: str | None) -> str:
    """Trim and collapse whitespace for destination lookup."""
    if raw is None:
        return ""
    return " ".join(str(raw).split())


def find_location(query: str | None) -> LocationRoom | None:
    """Case-insensitive match on room id or aliases. Returns None if unknown."""
    key = normalize_destination(query)
    if not key:
        return None
    for room in load_locations():
        if room.matches(key):
            return room
    return None


def list_locations() -> list[dict[str, Any]]:
    """Serialize rooms for API / UI."""
    return [
        {
            "id": r.id,
            "aliases": list(r.aliases),
            "x": r.x,
            "y": r.y,
            "yaw": r.yaw,
            "frame_id": r.frame_id,
            "map": r.map,
        }
        for r in load_locations()
    ]
