"""RFID management endpoints for Stair-Doc.

Provides RFID tag authorization (container unlock), access log retrieval,
and tag registration — all with mock in-memory storage.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

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

_registered_tags: dict[str, RFIDTagResponse] = {
    "RFID-A1B2C3": RFIDTagResponse(
        tag_id="RFID-A1B2C3",
        user_name="Alice Johnson",
        role="recipient",
        status=RFIDTagStatus.ACTIVE,
        registered_at=datetime.now(UTC) - timedelta(days=30),
        last_used=datetime.now(UTC) - timedelta(hours=2),
    ),
    "RFID-D4E5F6": RFIDTagResponse(
        tag_id="RFID-D4E5F6",
        user_name="Bob Smith",
        role="recipient",
        status=RFIDTagStatus.ACTIVE,
        registered_at=datetime.now(UTC) - timedelta(days=14),
        last_used=datetime.now(UTC) - timedelta(hours=6),
    ),
    "RFID-G7H8I9": RFIDTagResponse(
        tag_id="RFID-G7H8I9",
        user_name="Carol Williams",
        role="operator",
        status=RFIDTagStatus.ACTIVE,
        registered_at=datetime.now(UTC) - timedelta(days=60),
        last_used=datetime.now(UTC) - timedelta(days=1),
    ),
    "RFID-REVOKED": RFIDTagResponse(
        tag_id="RFID-REVOKED",
        user_name="Dave (Revoked)",
        role="recipient",
        status=RFIDTagStatus.REVOKED,
        registered_at=datetime.now(UTC) - timedelta(days=90),
        last_used=datetime.now(UTC) - timedelta(days=45),
    ),
}

_access_logs: list[RFIDLogEntry] = [
    RFIDLogEntry(
        id="rfid-log-001",
        tag_id="RFID-A1B2C3",
        robot_id="robot-001",
        delivery_id="del-001",
        scan_type=RFIDScanType.UNLOCK,
        authorized=True,
        user_name="Alice Johnson",
        location="Building A, Floor 3, Room 305",
        message="Container unlocked for recipient",
        timestamp=datetime.now(UTC) - timedelta(hours=2),
    ),
    RFIDLogEntry(
        id="rfid-log-002",
        tag_id="RFID-D4E5F6",
        robot_id="robot-002",
        delivery_id="del-002",
        scan_type=RFIDScanType.CHECKPOINT,
        authorized=True,
        user_name="Bob Smith",
        location="Building B, Floor 2",
        message="Checkpoint scan — robot passing floor 2",
        timestamp=datetime.now(UTC) - timedelta(hours=4),
    ),
    RFIDLogEntry(
        id="rfid-log-003",
        tag_id="RFID-UNKNOWN",
        robot_id="robot-003",
        delivery_id=None,
        scan_type=RFIDScanType.DENIED,
        authorized=False,
        user_name=None,
        location="Building A, Floor 1, Lobby",
        message="Unknown RFID tag — access denied",
        timestamp=datetime.now(UTC) - timedelta(hours=6),
    ),
    RFIDLogEntry(
        id="rfid-log-004",
        tag_id="RFID-G7H8I9",
        robot_id="robot-001",
        delivery_id="del-004",
        scan_type=RFIDScanType.PICKUP,
        authorized=True,
        user_name="Carol Williams",
        location="Building C, Floor 1, Lobby",
        message="Operator pickup scan — delivery loaded",
        timestamp=datetime.now(UTC) - timedelta(hours=8),
    ),
    RFIDLogEntry(
        id="rfid-log-005",
        tag_id="RFID-REVOKED",
        robot_id="robot-004",
        delivery_id=None,
        scan_type=RFIDScanType.DENIED,
        authorized=False,
        user_name="Dave (Revoked)",
        location="Building C, Floor 2, Room 207",
        message="Tag revoked — access denied",
        timestamp=datetime.now(UTC) - timedelta(hours=10),
    ),
]


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
    tag = _registered_tags.get(body.tag_id)
    now = datetime.now(UTC)

    if tag is None:
        # Unknown tag
        log = RFIDLogEntry(
            id=f"rfid-log-{uuid.uuid4().hex[:8]}",
            tag_id=body.tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            scan_type=RFIDScanType.DENIED,
            authorized=False,
            user_name=None,
            location=None,
            message="Unknown RFID tag — access denied",
            timestamp=now,
        )
        _access_logs.insert(0, log)

        result = RFIDAuthorizeResponse(
            authorized=False,
            tag_id=body.tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            container_status=ContainerStatus.LOCKED,
            user_name=None,
            message="Tag not recognised. Access denied.",
            timestamp=now,
        )
        return success_response(
            data=result.model_dump(mode="json"),
            message="RFID authorization failed — unknown tag",
        )

    if tag.status != RFIDTagStatus.ACTIVE:
        # Revoked / expired tag
        log = RFIDLogEntry(
            id=f"rfid-log-{uuid.uuid4().hex[:8]}",
            tag_id=body.tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            scan_type=RFIDScanType.DENIED,
            authorized=False,
            user_name=tag.user_name,
            location=None,
            message=f"Tag status '{tag.status.value}' — access denied",
            timestamp=now,
        )
        _access_logs.insert(0, log)

        result = RFIDAuthorizeResponse(
            authorized=False,
            tag_id=body.tag_id,
            robot_id=body.robot_id,
            delivery_id=body.delivery_id,
            container_status=ContainerStatus.LOCKED,
            user_name=tag.user_name,
            message=f"Tag is {tag.status.value}. Access denied.",
            timestamp=now,
        )
        return success_response(
            data=result.model_dump(mode="json"),
            message=f"RFID authorization failed — tag {tag.status.value}",
        )

    # ── Authorized ───────────────────────────────────────────────────
    # Update last_used timestamp on the tag
    _registered_tags[body.tag_id] = tag.model_copy(update={"last_used": now})

    log = RFIDLogEntry(
        id=f"rfid-log-{uuid.uuid4().hex[:8]}",
        tag_id=body.tag_id,
        robot_id=body.robot_id,
        delivery_id=body.delivery_id,
        scan_type=RFIDScanType.UNLOCK,
        authorized=True,
        user_name=tag.user_name,
        location=None,
        message="Container unlocked successfully",
        timestamp=now,
    )
    _access_logs.insert(0, log)

    result = RFIDAuthorizeResponse(
        authorized=True,
        tag_id=body.tag_id,
        robot_id=body.robot_id,
        delivery_id=body.delivery_id,
        container_status=ContainerStatus.UNLOCKED,
        user_name=tag.user_name,
        message=f"Welcome, {tag.user_name}! Container unlocked.",
        timestamp=now,
    )
    return success_response(
        data=result.model_dump(mode="json"),
        message="RFID authorized — container unlocked",
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
    results = list(_access_logs)

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
    tags = list(_registered_tags.values())
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
async def register_tag(body: RFIDRegisterRequest) -> dict:
    if body.tag_id in _registered_tags:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag '{body.tag_id}' is already registered",
        )

    now = datetime.now(UTC)
    tag = RFIDTagResponse(
        tag_id=body.tag_id,
        user_name=body.user_name,
        role=body.role,
        status=RFIDTagStatus.ACTIVE,
        registered_at=now,
        last_used=None,
    )
    _registered_tags[body.tag_id] = tag
    return success_response(
        data=tag.model_dump(mode="json"),
        message=f"Tag '{body.tag_id}' registered for {body.user_name}",
    )
