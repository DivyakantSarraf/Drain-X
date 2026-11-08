import os
import re
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.models.contracts import (
    IncidentCreateContract,
    IncidentUpdateContract,
    IncidentResponseContract,
    IncidentStatus,
    IncidentCategory,
    IncidentSeverity,
    IncidentSource,
)
from app.services.state_store import state_store

router = APIRouter(prefix="/incidents", tags=["incidents"])

# Dedicated uploads directory for competition MVP local storage
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "incidents"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@router.get("", response_model=list[IncidentResponseContract])
def get_incidents(
    status: Optional[IncidentStatus] = Query(None, description="Filter by incident status"),
    category: Optional[IncidentCategory] = Query(None, description="Filter by category"),
    severity: Optional[IncidentSeverity] = Query(None, description="Filter by severity level"),
    source: Optional[IncidentSource] = Query(None, description="Filter by reporting source"),
) -> list[IncidentResponseContract]:
    """
    Retrieve all incidents, optionally filtered by status, category, severity, or reporting source.
    Returns incidents ordered chronologically (newest first).
    """
    return state_store.get_incidents(
        status=status,
        category=category,
        severity=severity,
        source=source,
    )


@router.post("", response_model=IncidentResponseContract, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreateContract) -> IncidentResponseContract:
    """
    Submit a citizen or field-reported drainage incident.
    Initial status will automatically be set to REPORTED.
    """
    incident = IncidentResponseContract(
        category=payload.category,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        severity=payload.severity,
        status=IncidentStatus.REPORTED,
        source=payload.source,
        reporter_name=payload.reporter_name or "Citizen Anonymous",
        photos=payload.photos,
    )
    return state_store.create_incident(incident)


@router.get("/{incident_id}", response_model=IncidentResponseContract)
def get_incident(incident_id: str) -> IncidentResponseContract:
    """
    Retrieve a single incident by its unique tracking identifier.
    """
    incident = state_store.get_incident(incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found",
        )
    return incident


@router.patch("/{incident_id}", response_model=IncidentResponseContract)
def update_incident(incident_id: str, payload: IncidentUpdateContract) -> IncidentResponseContract:
    """
    Update an incident status, assignment, or municipal dispatch notes.
    Rejects invalid state machine transitions with 400 Bad Request.
    """
    existing = state_store.get_incident(incident_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found",
        )

    try:
        updated = state_store.update_incident(incident_id, payload)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident with ID '{incident_id}' not found",
            )
        return updated
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{incident_id}/photos", response_model=IncidentResponseContract)
async def upload_incident_photos(
    incident_id: str,
    files: list[UploadFile] = File(..., description="Photographic evidence files (max 3 per incident, 5MB max each, JPEG/PNG/WebP)"),
) -> IncidentResponseContract:
    """
    Upload 1 to 3 photo evidence files for a specific incident.
    Validates MIME type, maximum 5MB size per file, and attaches safe relative URLs to the incident.
    """
    incident = state_store.get_incident(incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found",
        )

    if len(incident.photos) + len(files) > settings.MAX_PHOTOS_PER_INCIDENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot exceed maximum limit of {settings.MAX_PHOTOS_PER_INCIDENT} photos per incident. Already attached: {len(incident.photos)}, attempting to add: {len(files)}.",
        )

    new_photo_urls: list[str] = []

    for file in files:
        # Validate MIME type
        content_type = file.content_type or ""
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported image type '{content_type}'. Allowed types: JPEG, PNG, WebP.",
            )

        # Validate file size
        data = await file.read()
        if len(data) > settings.MAX_PHOTO_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image file exceeds maximum allowable size of 5 MB ({len(data)} bytes received).",
            )

        if len(data) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file upload is not permitted.",
            )

        # Safe server-side filename generation
        ext = ALLOWED_MIME_TYPES[content_type]
        safe_name = f"{incident_id}_{uuid.uuid4().hex[:8]}{ext}"
        destination = UPLOAD_DIR / safe_name

        try:
            destination.write_bytes(data)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist photographic evidence: {str(e)}",
            )

        photo_url = f"/api/v1/incidents/photos/{safe_name}"
        new_photo_urls.append(photo_url)

    updated = state_store.attach_incident_photos(incident_id, new_photo_urls)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found",
        )
    return updated


@router.get("/photos/{filename}")
def get_incident_photo(filename: str):
    """
    Retrieve and serve an uploaded incident photograph.
    Enforces path traversal protection and validates safe filename structure.
    """
    # Filename structure validation
    if not re.match(r"^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$", filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename structure or unsupported extension.",
        )

    # Path traversal validation
    file_path = (UPLOAD_DIR / filename).resolve()
    upload_root = UPLOAD_DIR.resolve()

    try:
        file_path.relative_to(upload_root)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal forbidden.",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo '{filename}' not found.",
        )

    ext = file_path.suffix.lower()
    media_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    return FileResponse(path=file_path, media_type=media_map.get(ext, "image/jpeg"))
