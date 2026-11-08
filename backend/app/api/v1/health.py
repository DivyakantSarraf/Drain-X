from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.services.state_store import state_store

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Service health check endpoint.
    Returns status, version, uptime, and system mode.
    """
    status = state_store.get_system_status()
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mode": status.mode,
        "operational_state": status.operational_state,
        "uptime_seconds": status.uptime_seconds,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
