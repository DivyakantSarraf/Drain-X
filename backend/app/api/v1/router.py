from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.telemetry import router as telemetry_router
from app.api.v1.status import router as status_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.simulation import router as simulation_router
from app.api.v1.incidents import router as incidents_router
from app.api.v1.devices import router as devices_router

api_v1_router = APIRouter()

api_v1_router.include_router(health_router)
api_v1_router.include_router(telemetry_router)
api_v1_router.include_router(status_router)
api_v1_router.include_router(alerts_router)
api_v1_router.include_router(simulation_router)
api_v1_router.include_router(incidents_router)
api_v1_router.include_router(devices_router)

