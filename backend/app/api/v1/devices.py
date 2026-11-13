"""
DRAIN-X IoT Edge Node / Device Registry API.

Milestone: P0.6 Supabase Cloud Integration.

Endpoints for managing physical and simulated edge controllers (ESP32 DevKit V1),
tracking hardware validation stages, firmware revisions, and connection timestamps.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import require_roles, get_current_user_claims
from app.services.persistence_repository import persistence_repo

router = APIRouter(prefix="/devices", tags=["Device Registry"])


class DeviceRegistrationRequest(BaseModel):
    device_id: str = Field(..., min_length=3, max_length=64, description="Unique hardware node identifier")
    name: str = Field(..., max_length=128, description="Human-readable node label")
    hardware_model: str = Field(default="ESP32 DevKit V1", description="Microcontroller board model")
    firmware_version: str = Field(default="0.3.7-p0.3g", description="Firmware build version")
    is_active: bool = Field(default=True, description="Whether node is authorized and enabled")
    validation_stage: str = Field(default="SOFTWARE_ONLY", description="Current hardware readiness stage")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Custom peripheral configuration")


@router.get("", summary="List all registered edge devices")
async def list_devices() -> Dict[str, Any]:
    """
    Returns the list of all registered physical and simulated edge nodes.
    """
    devices = await persistence_repo.list_devices()
    return {
        "status": "success",
        "count": len(devices),
        "devices": devices,
    }


@router.get("/{device_id}", summary="Get device by identifier")
async def get_device(device_id: str) -> Dict[str, Any]:
    """
    Retrieve metadata and validation stage for a specific edge device.
    """
    device = await persistence_repo.get_device(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device '{device_id}' not found in registry.",
        )
    return {
        "status": "success",
        "device": device,
    }


@router.post(
    "",
    summary="Register or update an IoT edge device",
    dependencies=[Depends(require_roles(["admin", "municipality", "worker", "service_role"]))],
)
async def register_device(payload: DeviceRegistrationRequest) -> Dict[str, Any]:
    """
    Registers a new edge hardware node or updates firmware and validation stage.
    Protected by role-based access control when Supabase Auth is enabled.
    """
    registered = await persistence_repo.register_device(payload.model_dump())
    return {
        "status": "success",
        "message": f"Device '{payload.device_id}' registered successfully.",
        "device": registered,
    }
