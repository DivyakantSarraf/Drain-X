from datetime import datetime, timezone
from fastapi import APIRouter, Response, status
from app.core.config import settings
from app.services.state_store import state_store
from app.services.persistence_repository import persistence_repo

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Service health check endpoint.
    Returns status, version, uptime, and system mode.
    """
    status_obj = state_store.get_system_status()
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mode": status_obj.mode,
        "operational_state": status_obj.operational_state,
        "uptime_seconds": status_obj.uptime_seconds,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/health/liveness")
async def liveness_probe():
    """
    Lightweight container orchestrator liveness probe (e.g. Render, Docker, Kubernetes).
    Returns 200 OK as long as the ASGI process is accepting requests.
    """
    return {
        "status": "alive",
        "service": settings.APP_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/health/ready")
async def readiness_probe(response: Response):
    """
    Container orchestrator readiness probe distinguishing basic process health from
    Supabase persistence connectivity.
    If Supabase is configured, verifies active connectivity to PostgREST.
    """
    db_status = persistence_repo.get_status()
    is_ready = True
    persistence_info = {
        "configured": db_status.configured,
        "mode": db_status.mode,
        "connection_status": db_status.connection_status,
        "last_ping_ms": db_status.last_ping_ms
    }

    if db_status.configured:
        conn_check = await persistence_repo.check_connection()
        persistence_info["connection_status"] = conn_check.get("status")
        persistence_info["latency_ms"] = conn_check.get("latency_ms")
        if conn_check.get("status") not in ("CONNECTED", "UNCONFIGURED"):
            is_ready = False
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if is_ready else "not_ready",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "system_mode": state_store.mode,
        "persistence": persistence_info,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
