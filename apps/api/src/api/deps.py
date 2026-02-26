from typing import Annotated

from fastapi import Depends, HTTPException
from supabase import create_async_client, AsyncClient
from supabase.lib.client_options import AsyncClientOptions

from src.config import settings


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
