from fastapi import APIRouter

from src.api.api_v1.endpoints import camera, deliveries, navigation, rfid, robots

api_router = APIRouter()

api_router.include_router(robots.router)
api_router.include_router(deliveries.router)
api_router.include_router(rfid.router)
api_router.include_router(camera.router)
api_router.include_router(navigation.router)
