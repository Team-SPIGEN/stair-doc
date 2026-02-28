"""Delivery management endpoints for Stair-Doc.

Provides CRUD operations for the delivery queue with mock in-memory storage.
Supports filtering by status and priority, and sorting by creation date.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from src.schemas.base import ApiResponse, success_response
from src.schemas.delivery import (
    DeliveryCreate,
    DeliveryListResponse,
    DeliveryLocation,
    DeliveryResponse,
    DeliveryStatus,
    DeliveryUpdate,
    Priority,
)

router = APIRouter(prefix="/deliveries", tags=["deliveries"])

# ── Mock In-Memory Store ─────────────────────────────────────────────────

_deliveries: list[DeliveryResponse] = [
    DeliveryResponse(
        id="del-001",
        robot_id="robot-001",
        status=DeliveryStatus.IN_TRANSIT,
        pickup_location=DeliveryLocation(
            floor=1, building="Building A", room="101"
        ),
        dropoff_location=DeliveryLocation(
            floor=3, building="Building A", room="305"
        ),
        package_weight=2.5,
        priority=Priority.URGENT,
        recipient_name="Alice Johnson",
        notes="Handle with care",
        estimated_arrival=datetime.now(UTC) + timedelta(minutes=12),
        created_at=datetime.now(UTC) - timedelta(hours=1),
        updated_at=datetime.now(UTC) - timedelta(minutes=10),
    ),
    DeliveryResponse(
        id="del-002",
        robot_id="robot-002",
        status=DeliveryStatus.CLIMBING_STAIRS,
        pickup_location=DeliveryLocation(
            floor=1, building="Building B", room="Mailroom"
        ),
        dropoff_location=DeliveryLocation(
            floor=4, building="Building B", room="412"
        ),
        package_weight=1.8,
        priority=Priority.NORMAL,
        recipient_name="Bob Smith",
        estimated_arrival=datetime.now(UTC) + timedelta(minutes=8),
        created_at=datetime.now(UTC) - timedelta(hours=2),
        updated_at=datetime.now(UTC) - timedelta(minutes=5),
    ),
    DeliveryResponse(
        id="del-003",
        robot_id=None,
        status=DeliveryStatus.PENDING,
        pickup_location=DeliveryLocation(
            floor=2, building="Building A", room="201"
        ),
        dropoff_location=DeliveryLocation(
            floor=5, building="Building C", room="510"
        ),
        package_weight=3.2,
        priority=Priority.EXPRESS,
        recipient_name="Carol Williams",
        notes="Time-sensitive documents",
        created_at=datetime.now(UTC) - timedelta(minutes=15),
        updated_at=datetime.now(UTC) - timedelta(minutes=15),
    ),
    DeliveryResponse(
        id="del-004",
        robot_id="robot-004",
        status=DeliveryStatus.DELIVERED,
        pickup_location=DeliveryLocation(
            floor=1, building="Building C", room="Lobby"
        ),
        dropoff_location=DeliveryLocation(
            floor=2, building="Building C", room="207"
        ),
        package_weight=0.5,
        priority=Priority.NORMAL,
        recipient_name="David Lee",
        estimated_arrival=datetime.now(UTC) - timedelta(hours=1),
        actual_arrival=datetime.now(UTC) - timedelta(minutes=55),
        created_at=datetime.now(UTC) - timedelta(hours=3),
        updated_at=datetime.now(UTC) - timedelta(minutes=55),
    ),
    DeliveryResponse(
        id="del-005",
        robot_id=None,
        status=DeliveryStatus.CANCELLED,
        pickup_location=DeliveryLocation(
            floor=3, building="Building A", room="301"
        ),
        dropoff_location=DeliveryLocation(
            floor=1, building="Building B", room="102"
        ),
        package_weight=4.0,
        priority=Priority.NORMAL,
        recipient_name="Eve Davis",
        notes="Recipient unavailable",
        created_at=datetime.now(UTC) - timedelta(hours=5),
        updated_at=datetime.now(UTC) - timedelta(hours=4),
    ),
]


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=ApiResponse[DeliveryListResponse],
    summary="List all deliveries",
    description=(
        "Returns the delivery queue. Supports optional filtering by status "
        "and priority, and sorting by created_at (asc or desc)."
    ),
)
async def list_deliveries(
    status_filter: Optional[DeliveryStatus] = Query(
        None, alias="status", description="Filter by delivery status"
    ),
    priority: Optional[Priority] = Query(
        None, description="Filter by priority level"
    ),
    sort: Optional[str] = Query(
        "desc",
        pattern=r"^(asc|desc)$",
        description="Sort by created_at: asc or desc",
    ),
) -> dict:
    results = list(_deliveries)

    # ── Filter ──
    if status_filter is not None:
        results = [d for d in results if d.status == status_filter]
    if priority is not None:
        results = [d for d in results if d.priority == priority]

    # ── Sort ──
    results.sort(
        key=lambda d: d.created_at,
        reverse=(sort == "desc"),
    )

    data = DeliveryListResponse(
        deliveries=results,
        total=len(results),
        timestamp=datetime.now(UTC),
    )
    return success_response(data, f"Retrieved {len(results)} deliveries")


@router.get(
    "/{delivery_id}",
    response_model=ApiResponse[DeliveryResponse],
    summary="Get a single delivery",
    description="Returns details for a specific delivery by its ID.",
)
async def get_delivery(delivery_id: str) -> dict:
    delivery = next((d for d in _deliveries if d.id == delivery_id), None)
    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Delivery with id '{delivery_id}' not found",
        )
    return success_response(delivery, "Delivery retrieved successfully")


@router.post(
    "",
    response_model=ApiResponse[DeliveryResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new delivery",
    description="Adds a new delivery to the queue with status 'pending'.",
)
async def create_delivery(payload: DeliveryCreate) -> dict:
    now = datetime.now(UTC)
    delivery = DeliveryResponse(
        id=f"del-{uuid.uuid4().hex[:8]}",
        robot_id=None,
        status=DeliveryStatus.PENDING,
        pickup_location=payload.pickup_location,
        dropoff_location=payload.dropoff_location,
        package_weight=payload.package_weight,
        priority=payload.priority,
        recipient_name=payload.recipient_name,
        notes=payload.notes,
        estimated_arrival=None,
        created_at=now,
        updated_at=now,
    )
    _deliveries.append(delivery)
    return success_response(delivery, "Delivery created successfully")


@router.patch(
    "/{delivery_id}",
    response_model=ApiResponse[DeliveryResponse],
    summary="Update a delivery",
    description=(
        "Partially update a delivery. Allows changing status, assigned robot, "
        "priority, recipient name, and notes."
    ),
)
async def update_delivery(delivery_id: str, payload: DeliveryUpdate) -> dict:
    for idx, delivery in enumerate(_deliveries):
        if delivery.id == delivery_id:
            update_data = payload.model_dump(exclude_unset=True)
            if not update_data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No fields to update",
                )
            update_data["updated_at"] = datetime.now(UTC)
            # If status changed to delivered, set actual_arrival
            if (
                "status" in update_data
                and update_data["status"] == DeliveryStatus.DELIVERED
                and delivery.actual_arrival is None
            ):
                update_data["actual_arrival"] = datetime.now(UTC)
            updated = delivery.model_copy(update=update_data)
            _deliveries[idx] = updated
            return success_response(updated, "Delivery updated successfully")

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Delivery with id '{delivery_id}' not found",
    )


@router.delete(
    "/{delivery_id}",
    response_model=ApiResponse[DeliveryResponse],
    summary="Delete a delivery",
    description="Remove a delivery from the queue. Returns the deleted delivery.",
)
async def delete_delivery(delivery_id: str) -> dict:
    for idx, delivery in enumerate(_deliveries):
        if delivery.id == delivery_id:
            removed = _deliveries.pop(idx)
            return success_response(removed, "Delivery deleted successfully")

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Delivery with id '{delivery_id}' not found",
    )
