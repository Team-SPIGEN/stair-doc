from fastapi import APIRouter

from src.api.api_v1.endpoints import robots

api_router = APIRouter()

api_router.include_router(robots.router)
