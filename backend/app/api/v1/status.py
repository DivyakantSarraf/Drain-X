from typing import Literal
from fastapi import APIRouter, HTTPException, Body
from app.models.contracts import SystemStatusContract, SystemOperationalState
from app.services.state_store import state_store

router = APIRouter(prefix="/status", tags=["Status"])


@router.get("", response_model=SystemStatusContract, summary="Get full system status")
async def get_system_status():
    """
    Returns the authoritative system state, operational mode, uptime,
    active alerts count, and latest sensor values.
    """
    return state_store.get_system_status()


@router.post("/mode", summary="Set system operational mode")
async def set_system_mode(mode: Literal["SIMULATION", "HARDWARE"] = Body(..., embed=True)):
    """
    Switch between SIMULATION and HARDWARE modes.
    """
    state_store.mode = mode
    return {
        "status": "success",
        "mode": state_store.mode,
        "message": f"System mode successfully switched to {mode}"
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
