from typing import Annotated, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_async_client, AsyncClient
from supabase.lib.client_options import AsyncClientOptions

from src.config import settings
from src.core.auth import decode_token, get_user_by_id
from src.schemas.auth import UserRole


async def get_db() -> AsyncClient:
    client: AsyncClient | None = None
    try:
        client = await create_async_client(
            settings.DB_URL,
            settings.DB_API_KEY,
            options=AsyncClientOptions(
                postgrest_client_timeout=10, storage_client_timeout=10
            ),
        )
        # client = await client.auth.sign_in_with_password(
        #     {"email": settings.DB_EMAIL, "password": settings.DB_PASSWORD}
        # )
        yield client

    except Exception as e:
        print(e)
        raise


SessionDep = Annotated[AsyncClient, Depends(get_db)]


# ── Auth dependencies ─────────────────────────────────────────────────────

_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """Decode JWT from the ``Authorization: Bearer <token>`` header.

    Returns the mock-user dict or raises 401.
    """
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = get_user_by_id(payload.sub)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def require_role(*roles: UserRole) -> Callable:
    """Factory that returns a dependency enforcing one or more roles.

    Usage::

        @router.post("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
        async def admin_endpoint(): ...

    Or as a parameter dependency::

        async def endpoint(user: dict = Depends(require_role(UserRole.ADMIN))): ...
    """

    async def _check(
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user['role']}' is not authorised for this resource",
            )
        return current_user

    return _check
