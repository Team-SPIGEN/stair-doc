"""RFID management endpoints for Stair-Doc.

Provides RFID tag authorization (container unlock), access log retrieval,
and tag registration — all with mock in-memory storage.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.deps import get_current_user, require_role
from src.schemas.auth import UserRole
from src.core.bridge import normalize_tag_id
from src.core.socket import sio
from src.core.storage import (
    get_rfid_tag,
    list_rfid_logs as storage_list_rfid_logs,
    list_rfid_tags as storage_list_rfid_tags,
    save_rfid_log,
    save_rfid_tag,
)
from src.schemas.base import ApiResponse, success_response
from src.schemas.rfid import (
    ContainerStatus,
    RFIDAuthorizeRequest,
    RFIDAuthorizeResponse,
    RFIDLogEntry,
    RFIDLogListResponse,
    RFIDRegisterRequest,
    RFIDScanType,
    RFIDTagResponse,
    RFIDTagStatus,
)

router = APIRouter(prefix="/rfid", tags=["rfid"])

# ── Mock In-Memory Stores ────────────────────────────────────────────────

_registered_tags: dict[str, RFIDTagResponse] = {}

_access_logs: list[RFIDLogEntry] = []


def _seed_hardware_tags() -> None:
    """Ensure the three physical demo tags are available after restarts."""
    seeds = [
        ("RFID-432745742349", "Authorized User 1"),
        ("RFID-805223990738", "Authorized User 2"),
        ("RFID-1023250728362", "Authorized User 3"),
    ]
    now = datetime.now(UTC)
    for tag_id, user_name in seeds:
        if get_rfid_tag(tag_id):
            continue
        tag = RFIDTagResponse(
            tag_id=tag_id,
            user_name=user_name,
            role="recipient",
            status=RFIDTagStatus.ACTIVE,
            registered_at=now,
            last_used=None,
        )
        save_rfid_tag(tag.model_dump(mode="json"))


def _load_tag(tag_id: str) -> RFIDTagResponse | None:
    if tag_id in _registered_tags:
        return _registered_tags[tag_id]
    raw = get_rfid_tag(tag_id)
    if raw:
        return RFIDTagResponse(**raw)
    return None


def _store_tag(tag: RFIDTagResponse) -> None:
    _registered_tags[tag.tag_id] = tag
    save_rfid_tag(tag.model_dump(mode="json"))


def _store_log(log: RFIDLogEntry) -> None:
    _access_logs.insert(0, log)
    save_rfid_log(log.model_dump(mode="json"))


async def authorize_scan(body: RFIDAuthorizeRequest) -> RFIDAuthorizeResponse:
    """Authorize a scan and persist the access log."""
    _seed_hardware_tags()
    tag_id = normalize_tag_id(body.tag_id)
    tag = _load_tag(tag_id)
    now = datetime.now(UTC)

    if tag is None:
        log = RFIDLogEntry(
            id=f"rfid-log-{uuid.uuid4().hex[:8]}",
            tag_id=tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            scan_type=RFIDScanType.DENIED,
            authorized=False,
            user_name=None,
            location=None,
            message="Unknown RFID tag — access denied",
            timestamp=now,
        )
        _store_log(log)
        return RFIDAuthorizeResponse(
            authorized=False,
            tag_id=tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            container_status=ContainerStatus.LOCKED,
            user_name=None,
            message="Tag not recognised. Access denied.",
            timestamp=now,
        )

    if tag.status != RFIDTagStatus.ACTIVE:
        log = RFIDLogEntry(
            id=f"rfid-log-{uuid.uuid4().hex[:8]}",
            tag_id=tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            scan_type=RFIDScanType.DENIED,
            authorized=False,
            user_name=tag.user_name,
            location=None,
            message=f"Tag status '{tag.status.value}' — access denied",
            timestamp=now,
        )
        _store_log(log)
        return RFIDAuthorizeResponse(
            authorized=False,
            tag_id=tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            container_status=ContainerStatus.LOCKED,
            user_name=tag.user_name,
            message=f"Tag is {tag.status.value}. Access denied.",
            timestamp=now,
        )

    updated = tag.model_copy(update={"last_used": now})
    _store_tag(updated)
    log = RFIDLogEntry(
        id=f"rfid-log-{uuid.uuid4().hex[:8]}",
        tag_id=tag_id,
        robot_id=body.robot_id,
        delivery_id=body.delivery_id,
        scan_type=RFIDScanType.UNLOCK,
        authorized=True,
        user_name=tag.user_name,
        location=None,
        message="Container unlocked successfully",
        timestamp=now,
    )
    _store_log(log)
    return RFIDAuthorizeResponse(
        authorized=True,
        tag_id=tag_id,
        robot_id=body.robot_id,
        delivery_id=body.delivery_id,
        container_status=ContainerStatus.UNLOCKED,
        user_name=tag.user_name,
        message=f"Welcome, {tag.user_name}! Container unlocked.",
        timestamp=now,
    )


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post(
    "/authorize",
    response_model=ApiResponse[RFIDAuthorizeResponse],
    status_code=status.HTTP_200_OK,
    summary="Authorize an RFID scan",
    description=(
        "Simulate an RFID tap on a robot's container. Checks if the tag is "
        "registered and active, then returns authorization result and container "
        "lock state. Also appends to the access log."
    ),
)
async def authorize_rfid(body: RFIDAuthorizeRequest) -> dict:
    result = await authorize_scan(body)

    await sio.emit("rfid_event", {
        "tag_id": result.tag_id,
        "robot_id": body.robot_id,
        "delivery_id": body.delivery_id,
        "authorized": result.authorized,
        "user_name": result.user_name,
        "scan_type": "unlock" if result.authorized else "denied",
        "message": result.message,
        "timestamp": result.timestamp.isoformat(),
    })

    return success_response(
        data=result.model_dump(mode="json"),
        message=(
            "RFID authorized — container unlocked"
            if result.authorized
            else "RFID authorization failed"
        ),
    )


@router.get(
    "/logs",
    response_model=ApiResponse[RFIDLogListResponse],
    summary="Get RFID access logs",
    description=(
        "Returns RFID scan / access logs with optional filtering by tag ID, "
        "robot ID, or scan type."
    ),
)
async def get_rfid_logs(
    tag_id: Optional[str] = Query(None, description="Filter by RFID tag UID"),
    robot_id: Optional[str] = Query(None, description="Filter by robot ID"),
    scan_type: Optional[RFIDScanType] = Query(
        None, description="Filter by scan type"
    ),
    authorized: Optional[bool] = Query(
        None, description="Filter by authorization result"
    ),
    limit: int = Query(50, ge=1, le=200, description="Max logs to return"),
) -> dict:
    _seed_hardware_tags()
    results = [RFIDLogEntry(**log) for log in storage_list_rfid_logs()]
    if _access_logs:
        known_ids = {log.id for log in results}
        results = [*results, *(log for log in _access_logs if log.id not in known_ids)]
        results.sort(key=lambda r: r.timestamp, reverse=True)

    if tag_id is not None:
        results = [r for r in results if r.tag_id == tag_id]
    if robot_id is not None:
        results = [r for r in results if r.robot_id == robot_id]
    if scan_type is not None:
        results = [r for r in results if r.scan_type == scan_type]
    if authorized is not None:
        results = [r for r in results if r.authorized == authorized]

    results = results[:limit]

    payload = RFIDLogListResponse(
        logs=results,
        total=len(results),
        timestamp=datetime.now(UTC),
    )
    return success_response(
        data=payload.model_dump(mode="json"),
        message=f"Retrieved {len(results)} RFID log(s)",
    )


@router.get(
    "/tags",
    response_model=ApiResponse[list[RFIDTagResponse]],
    summary="List registered RFID tags",
    description="Returns all registered RFID tags and their current status.",
)
async def list_registered_tags() -> dict:
    _seed_hardware_tags()
    tags = [RFIDTagResponse(**tag) for tag in storage_list_rfid_tags()]
    if _registered_tags:
        known_ids = {tag.tag_id for tag in tags}
        tags.extend(tag for tag in _registered_tags.values() if tag.tag_id not in known_ids)
    return success_response(
        data=[t.model_dump(mode="json") for t in tags],
        message=f"Retrieved {len(tags)} registered tag(s)",
    )


@router.post(
    "/tags",
    response_model=ApiResponse[RFIDTagResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new RFID tag",
    description="Register an RFID tag and assign it to a user with a role.",
)
async def register_tag(
    body: RFIDRegisterRequest,
    _admin: dict = Depends(require_role(UserRole.ADMIN)),
) -> dict:
    tag_id = normalize_tag_id(body.tag_id)
    if _load_tag(tag_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag '{tag_id}' is already registered",
        )

    now = datetime.now(UTC)
    tag = RFIDTagResponse(
        tag_id=tag_id,
        user_name=body.user_name,
        role=body.role,
        status=RFIDTagStatus.ACTIVE,
        registered_at=now,
        last_used=None,
    )
    _store_tag(tag)
    return success_response(
        data=tag.model_dump(mode="json"),
        message=f"Tag '{tag_id}' registered for {body.user_name}",
    )
