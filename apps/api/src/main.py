from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from src.api.api_v1.api import api_router
from src.config import settings, validate_production_settings
from src.core.socket import sio, start_telemetry_background_task
from src.core.storage import init_storage

info_router = APIRouter()


@info_router.get("/", status_code=200, include_in_schema=False)
async def info():
    return [{"Status": "API Running"}]


@info_router.get("/health", status_code=200, include_in_schema=False)
async def health():
    return {
        "ok": True,
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }


def custom_generate_unique_id(route: APIRoute):
    """Generates a custom ID when using the TypeScript Generator Client

    Args:
        route (APIRoute): The route to be customised

    Returns:
        str: tag-route_name, e.g. items-CreateItem
    """
    return f"{route.tags[0]}-{route.name}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan – start background tasks on startup."""
    validate_production_settings()
    init_storage()
    start_telemetry_background_task()
    yield


def get_application():
    _app = FastAPI(
        title=settings.PROJECT_NAME,
        description=settings.PROJECT_DESCRIPTION,
        generate_unique_id_function=custom_generate_unique_id,
        root_path=settings.ROOT,
        root_path_in_servers=True,
        lifespan=lifespan,
    )

    _app.include_router(api_router, prefix=settings.API_VERSION)
    _app.include_router(info_router, tags=[""])

    _app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials="*" not in settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return _app


# Build the FastAPI app, then wrap it with Socket.IO ASGI app.
# Socket.IO handles /socket.io/* ; everything else goes to FastAPI.
import socketio as _socketio

_fastapi_app = get_application()
app = _socketio.ASGIApp(sio, other_asgi_app=_fastapi_app, socketio_path="/socket.io")
