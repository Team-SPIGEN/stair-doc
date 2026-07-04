"""Voice command endpoint with simple NLP + action dispatch.

Parses raw transcript text into intents, enforces role-based safety rules,
executes the mapped action (navigation, RFID unlock, snapshots, deliveries),
and emits Socket.IO events for UI feedback.

Endpoints:
  POST /voice/command   - parse + execute a voice command
  GET  /voice/commands  - list all supported commands + phrases
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from src.api.api_v1.endpoints import deliveries as deliveries_api
from src.api.api_v1.endpoints import navigation as nav_api
from src.api.api_v1.endpoints import rfid as rfid_api
from src.core.robot_state import get_robot
from src.core.socket import sio
from src.schemas.base import ApiResponse, success_response
from src.schemas.delivery import DeliveryCreate, DeliveryLocation
from src.schemas.navigation import (
    AutonomousRequest,
    ManualCommandRequest,
    NavigationCommand,
)
from src.schemas.rfid import RFIDAuthorizeRequest
from src.schemas.voice import (
    SupportedCommand,
    SupportedCommandsResponse,
    VoiceAction,
    VoiceCommandIntent,
    VoiceCommandRequest,
    VoiceCommandResponse,
)

router = APIRouter(prefix="/voice", tags=["voice"])

# ── Safety / Role rules ─────────────────────────────────────────────────

_ROLE_ALLOWED_ACTIONS: dict[str, set[VoiceAction]] = {
    "admin": set(VoiceAction),  # full access
    "operator": {
        VoiceAction.NAVIGATE,
        VoiceAction.STOP,
        VoiceAction.EMERGENCY_STOP,
        VoiceAction.UNLOCK_CONTAINER,
        VoiceAction.TAKE_PHOTO,
        VoiceAction.STATUS,
        VoiceAction.RETURN_HOME,
        VoiceAction.CREATE_DELIVERY,
    },
    "recipient": {
        VoiceAction.UNLOCK_CONTAINER,
        VoiceAction.TAKE_PHOTO,
        VoiceAction.STATUS,
        VoiceAction.EMERGENCY_STOP,
    },
}

_ALLOWED_FLOORS = {1, 2, 3, 4}

# ── Word-to-number mapping ──────────────────────────────────────────────

_WORD_FLOORS: dict[str, int] = {
    "one": 1, "first": 1,
    "two": 2, "second": 2,
    "three": 3, "third": 3,
    "four": 4, "fourth": 4,
}

# ── Supported commands catalogue ────────────────────────────────────────

_SUPPORTED_COMMANDS: list[SupportedCommand] = [
    SupportedCommand(
        phrase="Go to floor [1-4]",
        action=VoiceAction.NAVIGATE,
        description="Send robot to target floor autonomously",
        example="Go to floor three",
        role_required="operator",
    ),
    SupportedCommand(
        phrase="Emergency stop",
        action=VoiceAction.EMERGENCY_STOP,
        description="Immediately halt the robot",
        example="Emergency stop now",
        role_required="all",
    ),
    SupportedCommand(
        phrase="Open container / Unlock container / Open door",
        action=VoiceAction.UNLOCK_CONTAINER,
        description="Authorize RFID unlock of the delivery container or door",
        example="Open door",
        role_required="recipient",
    ),
    SupportedCommand(
        phrase="Take photo / Take a snapshot",
        action=VoiceAction.TAKE_PHOTO,
        description="Capture a camera snapshot from the robot",
        example="Take a photo please",
        role_required="operator",
    ),
    SupportedCommand(
        phrase="Status report / Battery / Where are you",
        action=VoiceAction.STATUS,
        description="Read current robot status",
        example="Status report",
        role_required="all",
    ),
    SupportedCommand(
        phrase="Return home / Return to base / Go home",
        action=VoiceAction.RETURN_HOME,
        description="Navigate robot back to the base station on floor 1",
        example="Return home",
        role_required="operator",
    ),
    SupportedCommand(
        phrase="Delivery to [name] / [name] delivery",
        action=VoiceAction.CREATE_DELIVERY,
        description="Create a new delivery for a recipient",
        example="Delivery to Alice",
        role_required="operator",
    ),
]


def _is_allowed(role: str, action: VoiceAction) -> bool:
    allowed = _ROLE_ALLOWED_ACTIONS.get(role, set())
    return action in allowed


# ── Parsing helpers ─────────────────────────────────────────────────────


def _extract_floor(normalized: str) -> Optional[int]:
    """Extract floor number from normalised text (digit or word)."""
    # Numeric: "floor 2", "level 3"
    m = re.search(r"(?:floor|level)\s+(\d+)", normalized)
    if m:
        return int(m.group(1))
    # Word: "floor three", "level one"
    for word, num in _WORD_FLOORS.items():
        if re.search(rf"(?:floor|level)\s+{re.escape(word)}", normalized):
            return num
    return None


def _extract_recipient(normalized: str) -> Optional[str]:
    """Extract recipient name from delivery phrases."""
    m = re.search(
        r"(?:delivery to|deliver to|create delivery for|package for)\s+([a-z]+(?:\s+[a-z]+)?)",
        normalized,
    )
    if m:
        return m.group(1).title()
    m = re.search(r"([a-z]+(?:\s+[a-z]+)?)\s+delivery", normalized)
    if m:
        return m.group(1).title()
    return None


def _parse_voice_text(text: str) -> VoiceCommandIntent:
    """Rule-based parsing of voice text into an intent."""

    normalized = text.lower().strip()
    requires_confirmation = False
    target_floor = _extract_floor(normalized)
    recipient_name = None
    tag_id = None
    camera_source = None
    action = VoiceAction.STATUS
    confidence = 0.4

    # Priority ordering — most specific patterns first
    if "emergency" in normalized and ("stop" in normalized or "halt" in normalized):
        action = VoiceAction.EMERGENCY_STOP
        requires_confirmation = True
        confidence = 0.98

    elif any(p in normalized for p in ["return home", "return to base", "go home", "back to base", "home base"]):
        action = VoiceAction.RETURN_HOME
        confidence = 0.92

    elif any(p in normalized for p in ["delivery to", "deliver to", "create delivery", " delivery"]):
        recipient_name = _extract_recipient(normalized)
        action = VoiceAction.CREATE_DELIVERY
        confidence = 0.85 if recipient_name else 0.6

    elif any(p in normalized for p in ["go to", "navigate to", "navigate", "send to", "take to", "move to"]):
        action = VoiceAction.NAVIGATE
        confidence = 0.92 if target_floor else 0.65

    elif "unlock" in normalized or "open container" in normalized or "open the container" in normalized or "unlock door" in normalized or "open door" in normalized or "open the door" in normalized:
        action = VoiceAction.UNLOCK_CONTAINER
        confidence = 0.88
        tag_match = re.search(r"rfid[-\s]?([a-z0-9]+)", normalized)
        if tag_match:
            tag_id = f"RFID-{tag_match.group(1).upper()}"

    elif any(p in normalized for p in ["photo", "picture", "snapshot", "take a photo", "camera"]):
        action = VoiceAction.TAKE_PHOTO
        confidence = 0.82
        camera_source = "rear" if "rear" in normalized else ("verification" if "verification" in normalized else "front")

    elif "stop" in normalized or "halt" in normalized or "pause" in normalized:
        action = VoiceAction.STOP
        confidence = 0.75

    elif any(p in normalized for p in ["status", "battery", "where are you", "location", "report"]):
        action = VoiceAction.STATUS
        confidence = 0.7

    return VoiceCommandIntent(
        action=action,
        target_floor=target_floor,
        recipient_name=recipient_name,
        tag_id=tag_id,
        camera_source=camera_source,
        requires_confirmation=requires_confirmation,
        confidence=confidence,
    )


async def _emit_voice_activity(
    *,
    text: str,
    robot_id: str,
    user_role: str,
    intent: VoiceCommandIntent,
    executed: bool,
    message: str,
) -> None:
    """Broadcast voice activity to all listeners."""

    payload = {
        "text": text,
        "robot_id": robot_id,
        "role": user_role,
        "action": intent.action.value,
        "target_floor": intent.target_floor,
        "confidence": intent.confidence,
        "executed": executed,
        "message": message,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    try:
        await sio.emit("voice_activity", payload)
    except Exception:
        # Socket failures are non-critical for API response
        pass


# ── Endpoint ────────────────────────────────────────────────────────────


@router.post(
    "/command",
    response_model=ApiResponse[VoiceCommandResponse],
    summary="Parse and execute a voice command",
    description=(
        "Parses raw transcript text, enforces role and safety guards, optionally "
        "executes navigation/RFID/camera actions, and emits socket events for UI "
        "feedback. Emergency stop requires confirmation. Floors restricted to 1–4."
    ),
)
async def process_voice_command(body: VoiceCommandRequest) -> dict:
    intent = _parse_voice_text(body.text)

    # Floor safety guard
    if intent.target_floor is not None and intent.target_floor not in _ALLOWED_FLOORS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Floor {intent.target_floor} is outside the allowed range (1-4)",
        )

    # Role guard
    if not _is_allowed(body.user_role, intent.action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{body.user_role}' cannot execute action '{intent.action.value}'",
        )

    # Emergency stop confirmation guard
    if intent.action == VoiceAction.EMERGENCY_STOP and intent.requires_confirmation and not body.confirm:
        response = VoiceCommandResponse(
            success=True,
            text=body.text,
            robot_id=body.robot_id,
            intent=intent,
            message="Confirmation required for emergency stop",
            executed=False,
            timestamp=datetime.now(UTC),
        )
        await _emit_voice_activity(
            text=body.text,
            robot_id=body.robot_id,
            user_role=body.user_role,
            intent=intent,
            executed=False,
            message=response.message,
        )
        return success_response(response, response.message)

    # Execute mapped action
    executed = False
    message = "Intent parsed"
    eta_seconds: Optional[int] = None

    try:
        if intent.action in (VoiceAction.NAVIGATE, VoiceAction.RETURN_HOME):
            floor = intent.target_floor or (1 if intent.action == VoiceAction.RETURN_HOME else 1)
            nav_result = await nav_api.start_autonomous(
                AutonomousRequest(
                    robot_id=body.robot_id,
                    target_floor=floor,
                    target_location="Base Station" if intent.action == VoiceAction.RETURN_HOME else None,
                )
            )
            message = nav_result.get("message", "Navigation started")
            nav_data = nav_result.get("data", {})
            if isinstance(nav_data, dict):
                eta_seconds = nav_data.get("eta_seconds")
            executed = True

        elif intent.action == VoiceAction.STOP:
            nav_result = await nav_api.send_command(
                ManualCommandRequest(
                    command=NavigationCommand.STOP,
                    robot_id=body.robot_id,
                )
            )
            message = nav_result.get("message", "Navigation stopped")
            executed = True

        elif intent.action == VoiceAction.EMERGENCY_STOP:
            nav_result = await nav_api.send_command(
                ManualCommandRequest(
                    command=NavigationCommand.EMERGENCY_STOP,
                    robot_id=body.robot_id,
                )
            )
            message = nav_result.get("message", "Emergency stop activated")
            executed = True

        elif intent.action == VoiceAction.UNLOCK_CONTAINER:
            tag_id = intent.tag_id or "RFID-A1B2C3"
            rfid_result = await rfid_api.authorize_rfid(
                RFIDAuthorizeRequest(
                    tag_id=tag_id,
                    robot_id=body.robot_id,
                    delivery_id=None,
                )
            )
            rfid_data = rfid_result.get("data", {})
            if isinstance(rfid_data, dict):
                message = rfid_data.get("message", "RFID check sent")
            else:
                message = rfid_result.get("message", "RFID check sent")
            executed = True

        elif intent.action == VoiceAction.TAKE_PHOTO:
            now = datetime.now(UTC).isoformat()
            await sio.emit(
                "camera_event",
                {
                    "type": "snapshot",
                    "robot_id": body.robot_id,
                    "camera_source": intent.camera_source or "front",
                    "timestamp": now,
                    "message": f"Snapshot requested from {body.robot_id}",
                },
            )
            message = "Snapshot captured"
            executed = True

        elif intent.action == VoiceAction.CREATE_DELIVERY:
            # Create a draft delivery destined for the recipient
            recipient = intent.recipient_name or "Unknown"
            delivery_result = await deliveries_api.create_delivery(
                DeliveryCreate(
                    pickup_location=DeliveryLocation(floor=1, building="Building A"),
                    dropoff_location=DeliveryLocation(floor=intent.target_floor or 1, building="Building A"),
                    recipient_name=recipient,
                    notes=f"Created via voice command for {recipient}",
                )
            )
            message = delivery_result.get("message", f"Delivery for {recipient} created")
            executed = True

        elif intent.action == VoiceAction.STATUS:
            robot = get_robot()
            battery = robot.get("battery_level", 0)
            floor = robot.get("floor", "?")
            room = robot.get("room") or "the current route"
            mode = robot.get("status")
            mode_text = getattr(mode, "value", mode)
            lock = robot.get("lock_status")
            lock_text = getattr(lock, "value", lock)
            message = (
                f"{robot.get('name', body.robot_id)} is on floor {floor}, near {room}. "
                f"Battery is {battery} percent, mode is {mode_text}, "
                f"and the container is {lock_text}."
            )
            executed = True

    except HTTPException:
        # Bubble up HTTP errors from downstream handlers
        raise
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute voice command: {exc}",
        )

    response = VoiceCommandResponse(
        success=True,
        text=body.text,
        robot_id=body.robot_id,
        intent=intent,
        message=message,
        executed=executed,
        eta_seconds=eta_seconds,
        timestamp=datetime.now(UTC),
    )

    await _emit_voice_activity(
        text=body.text,
        robot_id=body.robot_id,
        user_role=body.user_role,
        intent=intent,
        executed=executed,
        message=message,
    )

    # Post execution signal for UI to react
    try:
        await sio.emit(
            "voice_command_executed",
            {
                "action": intent.action.value,
                "robot_id": body.robot_id,
                "executed": executed,
                "message": message,
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
    except Exception:
        pass

    return success_response(response, message)


@router.get(
    "/commands",
    response_model=ApiResponse[SupportedCommandsResponse],
    summary="List supported voice commands",
    description="Returns all supported voice commands with example phrases and required roles.",
)
async def get_supported_commands() -> dict:
    return success_response(
        SupportedCommandsResponse(commands=_SUPPORTED_COMMANDS),
        "Supported voice commands",
    )
