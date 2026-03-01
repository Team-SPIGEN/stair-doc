"""
Pydantic schemas for push notifications.
"""

from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, HttpUrl


# ── Push Subscription ──────────────────────────────────────────────────────


class PushSubscriptionKeys(BaseModel):
    """ECDH keys from the browser PushSubscription."""

    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """Schema for registering a browser push subscription."""

    endpoint: str
    keys: PushSubscriptionKeys
    role: str = "operator"
    robot_id: Optional[str] = None


class PushSubscriptionResponse(BaseModel):
    """Confirmation returned after saving a subscription."""

    success: bool
    message: str


# ── Notification Types ─────────────────────────────────────────────────────


class NotificationType(str, Enum):
    DELIVERY_READY = "delivery_ready"
    LOW_BATTERY = "low_battery"
    RFID_DENIED = "rfid_denied"
    EMERGENCY_STOP = "emergency_stop"
    DELIVERY_COMPLETE = "delivery_complete"
    DELIVERY_FAILED = "delivery_failed"
    ROBOT_OFFLINE = "robot_offline"


# ── Payloads ──────────────────────────────────────────────────────────────


class NotificationAction(BaseModel):
    action: str
    title: str
    icon: Optional[str] = None


class NotificationPayload(BaseModel):
    """Web Push notification payload following the Web Notifications spec."""

    title: str
    body: str
    icon: str = "/icons/icon-192x192.png"
    badge: str = "/icons/badge.png"
    tag: Optional[str] = None
    url: Optional[str] = "/"
    actions: list[NotificationAction] = []
    require_interaction: bool = False
    renotify: bool = False
    silent: bool = False


# ── Send Request ─────────────────────────────────────────────────────────


class SendNotificationRequest(BaseModel):
    """Request body for the /send endpoint (admin/robot use)."""

    type: NotificationType
    payload: NotificationPayload
    # If provided, only send to subscriptions with matching role
    target_role: Optional[str] = None
    robot_id: Optional[str] = None


# ── VAPID Key Response ────────────────────────────────────────────────────


class VapidPublicKeyResponse(BaseModel):
    public_key: str


# ── Test Notification ─────────────────────────────────────────────────────


class TestNotificationRequest(BaseModel):
    type: NotificationType = NotificationType.DELIVERY_READY


# ── Preset notification builders ─────────────────────────────────────────


NOTIFICATION_TEMPLATES: dict[NotificationType, NotificationPayload] = {
    NotificationType.DELIVERY_READY: NotificationPayload(
        title="Delivery Ready",
        body="Your delivery has arrived. Tap your RFID card to unlock.",
        tag="delivery-ready",
        url="/rfid",
        require_interaction=True,
        actions=[NotificationAction(action="unlock", title="Go to RFID Unlock")],
    ),
    NotificationType.LOW_BATTERY: NotificationPayload(
        title="⚠️ Low Battery",
        body="Robot battery is below 20%. Please return to charging station.",
        tag="low-battery",
        url="/dashboard",
    ),
    NotificationType.RFID_DENIED: NotificationPayload(
        title="RFID Scan Denied",
        body="Unauthorized RFID tag detected. Check the security log.",
        tag="rfid-denied",
        url="/dashboard",
        require_interaction=True,
    ),
    NotificationType.EMERGENCY_STOP: NotificationPayload(
        title="🚨 Emergency Stop Activated",
        body="The robot has been halted. Immediate attention required.",
        tag="emergency-stop",
        url="/dashboard",
        require_interaction=True,
        renotify=True,
    ),
    NotificationType.DELIVERY_COMPLETE: NotificationPayload(
        title="✅ Delivery Complete",
        body="Delivery has been successfully received and confirmed.",
        tag="delivery-complete",
        url="/deliveries",
    ),
    NotificationType.DELIVERY_FAILED: NotificationPayload(
        title="❌ Delivery Failed",
        body="A delivery could not be completed. Please check the queue.",
        tag="delivery-failed",
        url="/deliveries",
        require_interaction=True,
    ),
    NotificationType.ROBOT_OFFLINE: NotificationPayload(
        title="Robot Offline",
        body="The robot has lost connection. Please investigate.",
        tag="robot-offline",
        url="/dashboard",
    ),
}
