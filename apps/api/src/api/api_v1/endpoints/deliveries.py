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

_deliveries: list[DeliveryResponse] = []


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
