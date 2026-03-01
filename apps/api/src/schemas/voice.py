"""Pydantic models for voice command processing.

Defines lightweight NLP intent payloads and responses for the voice
command endpoint. Keeps parsing simple and rule-based.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class VoiceAction(str, Enum):
    """Supported voice command actions."""

    NAVIGATE = "navigate"
    STOP = "stop"
    EMERGENCY_STOP = "emergency_stop"
    UNLOCK_CONTAINER = "unlock_container"
    TAKE_PHOTO = "take_photo"
    STATUS = "status"
    RETURN_HOME = "return_home"
    CREATE_DELIVERY = "create_delivery"


class VoiceCommandRequest(BaseModel):
    """Incoming voice text to parse/execute."""

    text: str = Field(..., min_length=1, max_length=256, description="Transcript text")
    user_role: str = Field(
        "operator",
        pattern=r"^(operator|admin|recipient)$",
        description="Role of the speaker for permission checks",
    )
    robot_id: str = Field("robot-001", description="Target robot for the command")
    confirm: bool = Field(
        False, description="Whether the user already confirmed a sensitive action"
    )


class VoiceCommandIntent(BaseModel):
    """Parsed intent from raw voice text."""

    action: VoiceAction
    target_floor: Optional[int] = None
    recipient_name: Optional[str] = None
    tag_id: Optional[str] = None
    camera_source: Optional[str] = None
    requires_confirmation: bool = False
    confidence: float = Field(0.5, ge=0.0, le=1.0)


class SupportedCommand(BaseModel):
    """A command that the voice system can handle."""

    phrase: str
    action: VoiceAction
    description: str
    example: str
    role_required: str = "operator"


class VoiceCommandResponse(BaseModel):
    """Response from the voice endpoint with parsed intent and execution info."""

    success: bool
    text: str
    robot_id: str
    intent: VoiceCommandIntent
    message: str
    executed: bool = False
    eta_seconds: Optional[int] = None
    timestamp: datetime


class SupportedCommandsResponse(BaseModel):
    """List of all supported voice commands."""

    commands: list[SupportedCommand]
