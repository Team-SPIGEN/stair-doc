"""
Push notification endpoints.

Provides:
  GET  /notifications/vapid-public-key   – returns VAPID public key
  POST /notifications/subscribe           – save browser push subscription
  DELETE /notifications/unsubscribe       – remove subscription
  POST /notifications/send                – send push to matching subscribers
  POST /notifications/test                – send a test notification to all subscribers
"""

import json
import logging
import os
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pywebpush import webpush, WebPushException

from src.schemas.base import ApiResponse, success_response
from src.schemas.notifications import (
    NOTIFICATION_TEMPLATES,
    NotificationType,
    PushSubscriptionCreate,
    PushSubscriptionResponse,
    SendNotificationRequest,
    TestNotificationRequest,
    VapidPublicKeyResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])

# ── In-memory subscription store ─────────────────────────────────────────
# For production replace with a proper DB table.
# Key: endpoint URL  Value: PushSubscriptionCreate

_subscriptions: dict[str, PushSubscriptionCreate] = {}


# ── VAPID helpers ─────────────────────────────────────────────────────────


def _get_vapid_private_key() -> str:
    key = os.getenv("VAPID_PRIVATE_KEY", "")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAPID keys are not configured on this server.",
        )
    return key


def _get_vapid_public_key() -> str:
    key = os.getenv("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAPID keys are not configured on this server.",
        )
    return key


def _get_vapid_claims() -> dict:
    mailto = os.getenv("VAPID_MAILTO", "mailto:admin@example.com")
    return {"sub": mailto}


# ── Push sender ───────────────────────────────────────────────────────────


def _send_push(sub: PushSubscriptionCreate, payload: dict) -> bool:
    """Send a single push notification; returns True on success."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {
                    "p256dh": sub.keys.p256dh,
                    "auth": sub.keys.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=_get_vapid_private_key(),
            vapid_claims=_get_vapid_claims(),
        )
        return True
    except WebPushException as exc:
        # 410 Gone / 404 Not Found → subscription is no longer valid
        if exc.response is not None and exc.response.status_code in (404, 410):
            _subscriptions.pop(sub.endpoint, None)
            logger.info("Removed stale subscription: %s", sub.endpoint[:40])
        else:
            logger.warning("WebPush failed: %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected push error: %s", exc)
        return False


# ── Routes ────────────────────────────────────────────────────────────────


@router.get("/vapid-public-key", response_model=ApiResponse[VapidPublicKeyResponse])
async def get_vapid_public_key() -> ApiResponse[VapidPublicKeyResponse]:
    """
    Return the server VAPID public key.

    The frontend uses this to subscribe to push notifications via
    `pushManager.subscribe({ applicationServerKey: ... })`.
    """
    public_key = _get_vapid_public_key()
    return success_response(
        data=VapidPublicKeyResponse(public_key=public_key),
        message="VAPID public key retrieved",
    )


@router.post(
    "/subscribe",
    response_model=ApiResponse[PushSubscriptionResponse],
    status_code=status.HTTP_201_CREATED,
)
async def subscribe(
    body: PushSubscriptionCreate,
) -> ApiResponse[PushSubscriptionResponse]:
    """
    Register a browser push subscription.

    The client should call this once after obtaining a `PushSubscription`
    from `navigator.serviceWorker.ready`.
    """
    _subscriptions[body.endpoint] = body
    logger.info(
        "New push subscription registered (role=%s, total=%d)",
        body.role,
        len(_subscriptions),
    )
    return success_response(
        data=PushSubscriptionResponse(success=True, message="Subscription saved"),
        message="Push subscription registered",
    )


@router.delete("/unsubscribe", response_model=ApiResponse[PushSubscriptionResponse])
async def unsubscribe(body: dict) -> ApiResponse[PushSubscriptionResponse]:
    """Remove a push subscription by endpoint URL."""
    endpoint: str = body.get("endpoint", "")
    removed = _subscriptions.pop(endpoint, None)
    msg = "Subscription removed" if removed else "Subscription not found"
    return success_response(
        data=PushSubscriptionResponse(success=True, message=msg),
        message=msg,
    )


@router.post("/send", response_model=ApiResponse[dict])
async def send_notification(
    body: SendNotificationRequest,
) -> ApiResponse[dict]:
    """
    Send a push notification to all (or role-filtered) subscribers.

    Intended for server-side / robot events (not directly called by clients
    in production — use internal service calls instead).
    """
    targets = [
        sub
        for sub in _subscriptions.values()
        if body.target_role is None or sub.role == body.target_role
    ]

    payload = {
        "title": body.payload.title,
        "body": body.payload.body,
        "icon": body.payload.icon,
        "badge": body.payload.badge,
        "tag": body.payload.tag,
        "url": body.payload.url,
        "actions": [a.model_dump() for a in body.payload.actions],
        "requireInteraction": body.payload.require_interaction,
        "renotify": body.payload.renotify,
        "silent": body.payload.silent,
    }

    sent = sum(_send_push(sub, payload) for sub in targets)

    return success_response(
        data={"sent": sent, "total_targets": len(targets)},
        message=f"Notification sent to {sent}/{len(targets)} subscribers",
    )


@router.post("/test", response_model=ApiResponse[dict])
async def send_test_notification(
    body: TestNotificationRequest,
) -> ApiResponse[dict]:
    """
    Send a test push notification of the given type to ALL subscribers.
    Useful for verifying the push pipeline end-to-end during development.
    """
    template = NOTIFICATION_TEMPLATES.get(body.type)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown notification type: {body.type}",
        )

    payload = {
        "title": template.title,
        "body": f"[TEST] {template.body}",
        "icon": template.icon,
        "badge": template.badge,
        "tag": template.tag,
        "url": template.url,
        "actions": [a.model_dump() for a in template.actions],
        "requireInteraction": template.require_interaction,
        "renotify": template.renotify,
        "silent": template.silent,
    }

    sent = sum(_send_push(sub, payload) for sub in _subscriptions.values())

    return success_response(
        data={"sent": sent, "total_subscribers": len(_subscriptions)},
        message=f"Test notification ({body.type}) sent to {sent} subscriber(s)",
    )
