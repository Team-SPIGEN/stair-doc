"""Authentication endpoints – register, login, me.

All responses follow the ``ApiResponse`` envelope.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.auth import (
    add_user,
    create_access_token,
    get_user_by_email,
    hash_password,
    verify_password,
)
from src.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenPayload,
    TokenResponse,
    UserResponse,
    UserRole,
)
from src.schemas.base import ApiResponse, success_response

from src.api.deps import get_current_user, require_role

router = APIRouter(prefix="/auth", tags=["auth"])

_bearer = HTTPBearer()


# ── Helpers ───────────────────────────────────────────────────────────────


def _user_to_response(user: dict) -> UserResponse:
    """Convert an internal mock-user dict into a ``UserResponse``."""
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        floor_access=user["floor_access"],
        rfid_tags=user["rfid_tags"],
        created_at=user["created_at"],
    )


# ── POST /auth/register ──────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=ApiResponse[TokenResponse],
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    current_user: dict = Depends(require_role(UserRole.ADMIN)),
):
    """Register a new user (admin-only).

    Creates a mock user and returns a JWT token + user object.
    """
    # Duplicate check
    if get_user_by_email(body.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Email {body.email} is already registered",
        )

    user = add_user(
        {
            "email": body.email,
            "name": body.name,
            "role": body.role,
            "password_hash": hash_password(body.password),
            "floor_access": body.floor_access,
            "rfid_tags": body.rfid_tags,
        }
    )

    token = create_access_token(
        TokenPayload(
            sub=user["id"],
            email=user["email"],
            role=user["role"],
            floor_access=user["floor_access"],
            rfid_tags=user["rfid_tags"],
        )
    )

    return success_response(
        data=TokenResponse(token=token, user=_user_to_response(user)),
        message="User registered successfully",
    )


# ── POST /auth/login ─────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=ApiResponse[TokenResponse],
)
async def login(body: LoginRequest):
    """Authenticate with email + password, receive a JWT."""
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        TokenPayload(
            sub=user["id"],
            email=user["email"],
            role=user["role"],
            floor_access=user["floor_access"],
            rfid_tags=user["rfid_tags"],
        )
    )

    return success_response(
        data=TokenResponse(token=token, user=_user_to_response(user)),
        message="Login successful",
    )


# ── GET /auth/me ──────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=ApiResponse[UserResponse],
)
async def me(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return success_response(
        data=_user_to_response(current_user),
        message="Current user retrieved",
    )
