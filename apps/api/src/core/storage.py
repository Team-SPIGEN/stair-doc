"""Lightweight durable storage for Stair-Doc development deployments.

The project currently runs with in-memory stores. This module adds a small
SQLite database plus file storage for camera images without introducing a
large ORM dependency. It is intentionally simple and safe for the single-robot
prototype.
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.config import settings

DATA_DIR = Path(settings.DATA_DIR)


def _data_dir() -> Path:
    if "PYTEST_CURRENT_TEST" in os.environ:
        return Path(tempfile.gettempdir()) / f"stairdoc-api-test-{os.getpid()}"
    return DATA_DIR


def _db_path() -> Path:
    return _data_dir() / "stairdoc.sqlite3"


def _photo_dir() -> Path:
    return _data_dir() / "photos"


def _connect() -> sqlite3.Connection:
    _data_dir().mkdir(parents=True, exist_ok=True)
    _photo_dir().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value)


def _dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, default=_json_default, separators=(",", ":"))


def _loads(payload: str) -> dict[str, Any]:
    return json.loads(payload)


def init_storage() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                metadata_json TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rfid_tags (
                tag_id TEXT PRIMARY KEY,
                metadata_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rfid_logs (
                id TEXT PRIMARY KEY,
                metadata_json TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
            """
        )


def save_photo(metadata: dict[str, Any], content: bytes, content_type: str) -> dict[str, Any]:
    init_storage()
    suffix = Path(metadata["filename"]).suffix or ".jpg"
    file_path = _photo_dir() / f"{metadata['id']}{suffix}"
    file_path.write_bytes(content)
    now = datetime.now(UTC).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO photos (id, metadata_json, file_path, content_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (metadata["id"], _dumps(metadata), str(file_path), content_type, now),
        )
    return metadata


def list_photos() -> list[dict[str, Any]]:
    init_storage()
    with _connect() as conn:
        rows = conn.execute("SELECT metadata_json FROM photos ORDER BY created_at DESC").fetchall()
    return [_loads(row["metadata_json"]) for row in rows]


def get_photo(photo_id: str) -> dict[str, Any] | None:
    init_storage()
    with _connect() as conn:
        row = conn.execute(
            "SELECT metadata_json FROM photos WHERE id = ?",
            (photo_id,),
        ).fetchone()
    return _loads(row["metadata_json"]) if row else None


def get_photo_file(photo_id: str) -> tuple[Path, str] | None:
    init_storage()
    with _connect() as conn:
        row = conn.execute(
            "SELECT file_path, content_type FROM photos WHERE id = ?",
            (photo_id,),
        ).fetchone()
    if not row:
        return None
    path = Path(row["file_path"])
    if not path.exists():
        return None
    return path, row["content_type"]


def delete_photo(photo_id: str) -> bool:
    init_storage()
    photo_file = get_photo_file(photo_id)
    with _connect() as conn:
        cur = conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
    if cur.rowcount and photo_file:
        try:
            photo_file[0].unlink(missing_ok=True)
        except OSError:
            pass
    return cur.rowcount > 0


def save_rfid_tag(tag: dict[str, Any]) -> dict[str, Any]:
    init_storage()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO rfid_tags (tag_id, metadata_json, updated_at)
            VALUES (?, ?, ?)
            """,
            (tag["tag_id"], _dumps(tag), datetime.now(UTC).isoformat()),
        )
    return tag


def list_rfid_tags() -> list[dict[str, Any]]:
    init_storage()
    with _connect() as conn:
        rows = conn.execute("SELECT metadata_json FROM rfid_tags ORDER BY updated_at DESC").fetchall()
    return [_loads(row["metadata_json"]) for row in rows]


def get_rfid_tag(tag_id: str) -> dict[str, Any] | None:
    init_storage()
    with _connect() as conn:
        row = conn.execute(
            "SELECT metadata_json FROM rfid_tags WHERE tag_id = ?",
            (tag_id,),
        ).fetchone()
    return _loads(row["metadata_json"]) if row else None


def save_rfid_log(log: dict[str, Any]) -> dict[str, Any]:
    init_storage()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO rfid_logs (id, metadata_json, timestamp)
            VALUES (?, ?, ?)
            """,
            (log["id"], _dumps(log), log["timestamp"]),
        )
    return log


def list_rfid_logs() -> list[dict[str, Any]]:
    init_storage()
    with _connect() as conn:
        rows = conn.execute("SELECT metadata_json FROM rfid_logs ORDER BY timestamp DESC").fetchall()
    return [_loads(row["metadata_json"]) for row in rows]
