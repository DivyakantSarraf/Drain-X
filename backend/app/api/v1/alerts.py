from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from app.models.contracts import AlertContract, AlertSeverity
from app.services.state_store import state_store

router = APIRouter(prefix="/alerts", tags=["Alerts"])


class CreateAlertPayload(BaseModel):
    section_id: str
    alert_type: str
    message: str
    severity: AlertSeverity = AlertSeverity.WARNING
    context_data: dict = {}


@router.get("", response_model=List[AlertContract], summary="List system alerts")
async def list_alerts(active_only: bool = Query(default=True, description="Filter for unresolved alerts")):
    """
    Returns active or all alerts logged by the system.
    """
    return state_store.get_alerts(active_only=active_only)


@router.post("", response_model=AlertContract, status_code=status.HTTP_201_CREATED, summary="Create a new alert")
async def create_alert(payload: CreateAlertPayload):
    """
    Create a new system alert.
    """
    alert = state_store.create_alert(
        section_id=payload.section_id,
        alert_type=payload.alert_type,
        message=payload.message,
        severity=payload.severity,
        context_data=payload.context_data
    )
    return alert


@router.post("/{alert_id}/resolve", response_model=AlertContract, summary="Resolve an alert")
async def resolve_alert(alert_id: str):
    """
    Mark an active alert as resolved.
    """
    alert = state_store.resolve_alert(alert_id=alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert with ID {alert_id} not found"
        )
    return alert
