from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Body, Depends
from app.core.security import require_roles
from app.models.contracts import (
    SystemStatusContract,
    SystemOperationalState,
    ModeTransitionRequest,
)
from app.services.state_store import state_store
from app.services.persistence_repository import persistence_repo

router = APIRouter(prefix="/status", tags=["Status"])


@router.get("", response_model=SystemStatusContract, summary="Get full system status")
async def get_system_status():
    """
    Returns the authoritative system state, operational mode, uptime,
    active alerts count, and latest sensor values.
    """
    return state_store.get_system_status()


@router.get("/mode", summary="Get current operational mode and details")
async def get_current_mode():
    """
    Returns current operational mode (SIMULATION, PHYSICAL, SAFE_HOLD, or HARDWARE)
    and helper boolean flags.
    """
    return {
        "status": "success",
        "mode": state_store.mode,
        "is_simulation": state_store.is_simulation(),
        "is_physical": state_store.is_physical(),
        "is_safe_hold": state_store.is_safe_hold(),
    }


@router.get("/mode/history", summary="Get auditable mode transition history")
async def get_mode_history():
    """
    Returns the complete auditable log of operational mode transitions,
    including timestamps, source modes, target modes, and transition reasons.
    """
    return {
        "status": "success",
        "current_mode": state_store.mode,
        "history": state_store.get_mode_history(),
    }


@router.post("/mode", summary="Set system operational mode")
async def set_system_mode(
    payload: ModeTransitionRequest,
    claims: Dict[str, Any] = Depends(require_roles(["admin", "municipality", "worker", "service_role"])),
):
    """
    Explicitly transition between SIMULATION, PHYSICAL, SAFE_HOLD, and HARDWARE modes.
    Mode transitions are validated, secured by RBAC, and logged into an auditable ledger.
    """
    try:
        old_mode = state_store.mode
        success, message = state_store.set_mode(payload.mode, payload.reason or "")
        if success and old_mode != state_store.mode:
            operator_id = claims.get("sub") or claims.get("email") or "API_OPERATOR"
            await persistence_repo.persist_mode_transition(
                from_mode=old_mode,
                to_mode=state_store.mode,
                reason=payload.reason or f"Mode transition to {state_store.mode}",
                operator_id=operator_id,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "mode": state_store.mode,
        "message": message,
    }


@router.post("/state", summary="Set operational state")
async def set_operational_state(operational_state: SystemOperationalState = Body(..., embed=True)):
    """
    Set operational state (e.g. STANDBY, MONITORING, INTERVENING, FAULT, EMERGENCY_STOP).
    """
    state_store.operational_state = operational_state
    return {
        "status": "success",
        "operational_state": state_store.operational_state
    }
