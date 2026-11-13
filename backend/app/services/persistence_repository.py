"""
DRAIN-X Database Persistence Layer Interface & Supabase Cloud Client Adapter.

Milestone: P0.6 Supabase Cloud Integration.

Architecture Principles:
1. Non-invasive & Graceful Degradation:
   - If SUPABASE_URL / SUPABASE_KEY are unset or the cloud database is unreachable,
     the application runs in IN_MEMORY_FALLBACK mode with zero crashes.
   - Persistence operations fail soft and record diagnostic metadata without
     disrupting live telemetry ingestion or real-time analytics.
2. Direct HTTP REST Interface (No Heavy External SDK Required):
   - Uses `httpx` to communicate directly with Supabase PostgREST API (/rest/v1/).
3. Operational Mode Partitioning:
   - Readings are persisted with strict `source` classification ('PHYSICAL' vs 'SIMULATED').
   - Historical queries support source filtering so simulated runs never contaminate
     physical sensor archives.
4. Security & Role Boundaries:
   - Supports privileged `SUPABASE_SERVICE_ROLE_KEY` for backend ingestion bypassing RLS.
   - Never exposes service-role keys to clients or logs.
5. Device Registry & Auditing:
   - Full persistence for edge nodes (devices) and operational mode transition ledgers.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from pydantic import BaseModel

from app.core.config import settings
from app.models.contracts import SensorReadingContract, DataSource

logger = logging.getLogger("drainx.persistence")


class DatabaseConfigStatus(BaseModel):
    configured: bool
    url_present: bool
    key_present: bool
    service_role_key_present: bool
    mode: str
    target_table: str
    last_persistence_error: Optional[str] = None
    total_persisted_count: int = 0
    failed_persistence_count: int = 0
    connection_status: str = "UNKNOWN"
    last_ping_ms: Optional[float] = None


class PersistenceRepository:
    """
    Modular persistence client interfacing FastAPI with Supabase Cloud PostgREST.
    Operates in fallback/mock mode when unconfigured.
    """

    def __init__(
        self,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None,
        service_role_key: Optional[str] = None,
        timeout_sec: Optional[float] = None,
    ):
        self._supabase_url = (supabase_url or settings.SUPABASE_URL or "").rstrip("/")
        self._supabase_key = (supabase_key or settings.SUPABASE_KEY or "").strip()
        self._supabase_service_role_key = (
            service_role_key or settings.SUPABASE_SERVICE_ROLE_KEY or ""
        ).strip()
        self._timeout_sec = timeout_sec or settings.PERSISTENCE_TIMEOUT_SEC

        # Active authentication key: prefer service_role_key for backend if available
        self._active_key = self._supabase_service_role_key or self._supabase_key
        self._is_configured = bool(self._supabase_url and self._active_key)

        # In-memory storage buffers for fallback / local development
        self._in_memory_records: List[Dict[str, Any]] = []
        self._mode_history_records: List[Dict[str, Any]] = []
        self._in_memory_devices: Dict[str, Dict[str, Any]] = {
            "DRAINX-ESP32-NODE-01": {
                "device_id": "DRAINX-ESP32-NODE-01",
                "name": "Primary Flume ESP32 Node",
                "hardware_model": "ESP32 DevKit V1 (ESP-WROOM-32)",
                "firmware_version": "0.3.7-p0.3g",
                "is_active": True,
                "validation_stage": "CONNECTIVITY_READY",
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metadata": {"location": "Flume Primary Sump"},
            }
        }

        self._last_persistence_error: Optional[str] = None
        self._total_persisted_count: int = 0
        self._failed_persistence_count: int = 0
        self._connection_status: str = "UNCONFIGURED" if not self._is_configured else "CONFIGURED_UNCHECKED"
        self._last_ping_ms: Optional[float] = None

    @property
    def is_configured(self) -> bool:
        return self._is_configured

    @property
    def supabase_url(self) -> str:
        return self._supabase_url

    def get_status(self) -> DatabaseConfigStatus:
        return DatabaseConfigStatus(
            configured=self._is_configured,
            url_present=bool(self._supabase_url),
            key_present=bool(self._supabase_key),
            service_role_key_present=bool(self._supabase_service_role_key),
            mode="SUPABASE_CLOUD" if self._is_configured else "IN_MEMORY_FALLBACK",
            target_table="sensor_readings",
            last_persistence_error=self._last_persistence_error,
            total_persisted_count=self._total_persisted_count,
            failed_persistence_count=self._failed_persistence_count,
            connection_status=self._connection_status,
            last_ping_ms=self._last_ping_ms,
        )

    def _get_headers(self, prefer: str = "return=minimal") -> Dict[str, str]:
        return {
            "apikey": self._active_key,
            "Authorization": f"Bearer {self._active_key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }

    async def check_connection(self) -> Dict[str, Any]:
        """
        Probe Supabase Cloud PostgREST health and round-trip latency.
        """
        if not self._is_configured:
            self._connection_status = "UNCONFIGURED"
            return {
                "status": "UNCONFIGURED",
                "mode": "IN_MEMORY_FALLBACK",
                "message": "Supabase credentials not configured. Running in local in-memory mode.",
                "latency_ms": None,
                "configured": False,
            }

        endpoint = f"{self._supabase_url}/rest/v1/sensor_readings?select=count&limit=0"
        t_start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.get(
                    endpoint,
                    headers={
                        "apikey": self._active_key,
                        "Authorization": f"Bearer {self._active_key}",
                        "Prefer": "count=exact",
                    },
                )
                elapsed_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
                self._last_ping_ms = elapsed_ms

                if resp.status_code in (200, 206):
                    self._connection_status = "CONNECTED"
                    self._last_persistence_error = None
                    return {
                        "status": "CONNECTED",
                        "mode": "SUPABASE_CLOUD",
                        "message": "Successfully connected to Supabase Cloud PostgREST.",
                        "latency_ms": elapsed_ms,
                        "http_status": resp.status_code,
                        "configured": True,
                    }
                elif resp.status_code in (401, 403):
                    self._connection_status = "AUTH_FAILED"
                    err_msg = f"HTTP {resp.status_code} - Invalid or unauthorized Supabase API key"
                    self._last_persistence_error = err_msg
                    return {
                        "status": "AUTH_FAILED",
                        "mode": "SUPABASE_CLOUD",
                        "message": err_msg,
                        "latency_ms": elapsed_ms,
                        "http_status": resp.status_code,
                        "configured": True,
                    }
                else:
                    self._connection_status = "UNREACHABLE"
                    err_msg = f"HTTP {resp.status_code} - {resp.text}"
                    self._last_persistence_error = err_msg
                    return {
                        "status": "UNREACHABLE",
                        "mode": "SUPABASE_CLOUD",
                        "message": err_msg,
                        "latency_ms": elapsed_ms,
                        "http_status": resp.status_code,
                        "configured": True,
                    }
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
            self._last_ping_ms = elapsed_ms
            self._connection_status = "UNREACHABLE"
            err_msg = f"Network connection failed: {exc}"
            self._last_persistence_error = err_msg
            return {
                "status": "UNREACHABLE",
                "mode": "SUPABASE_CLOUD",
                "message": err_msg,
                "latency_ms": elapsed_ms,
                "http_status": None,
                "configured": True,
            }

    async def persist_readings(
        self, readings: List[SensorReadingContract]
    ) -> int:
        """
        Persist a batch of validated sensor telemetry readings to Supabase PostgREST.
        Falls back to internal buffer if Supabase is unconfigured or unreachable.
        """
        if not readings:
            return 0

        records = []
        for r in readings:
            device_id = None
            if r.metadata and isinstance(r.metadata, dict):
                device_id = r.metadata.get("device_id")

            records.append({
                "sensor_id": r.sensor_id,
                "section_id": r.section_id,
                "sensor_type": r.sensor_type.value,
                "value": float(r.value),
                "unit": r.unit.value,
                "source": r.source.value,
                "status": r.status.value,
                "timestamp": r.timestamp.isoformat(),
                "device_id": device_id,
                "metadata": r.metadata or {},
            })

        # Local buffer is maintained as fallback and secondary audit
        self._in_memory_records.extend(records)
        if len(self._in_memory_records) > 2000:
            self._in_memory_records = self._in_memory_records[-2000:]

        if not self._is_configured:
            self._total_persisted_count += len(records)
            return len(records)

        endpoint = f"{self._supabase_url}/rest/v1/sensor_readings"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.post(
                    endpoint,
                    json=records,
                    headers=self._get_headers(),
                )
                if resp.status_code in (200, 201):
                    self._total_persisted_count += len(records)
                    self._last_persistence_error = None
                    self._connection_status = "CONNECTED"
                    return len(records)
                else:
                    err_msg = f"HTTP {resp.status_code} - {resp.text}"
                    self._last_persistence_error = err_msg
                    self._failed_persistence_count += len(records)
                    logger.warning(f"Supabase persistence error: {err_msg}")
                    return 0
        except Exception as exc:
            err_msg = str(exc)
            self._last_persistence_error = err_msg
            self._failed_persistence_count += len(records)
            logger.warning(f"Supabase persistence network error: {err_msg}")
            return 0

    async def query_historical_telemetry(
        self,
        sensor_id: Optional[str] = None,
        source: Optional[str] = None,
        section_id: Optional[str] = None,
        device_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
        chronological: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Query historical telemetry with operational source, device, and time-range filtering.
        Supports pagination via limit & offset.
        """
        limit = max(1, min(limit, 500))
        offset = max(0, offset)

        if not self._is_configured:
            results = list(self._in_memory_records)
            if sensor_id:
                results = [r for r in results if r["sensor_id"] == sensor_id]
            if source:
                results = [r for r in results if r["source"] == source]
            if section_id:
                results = [r for r in results if r["section_id"] == section_id]
            if device_id:
                results = [r for r in results if r.get("device_id") == device_id]
            if start_time:
                iso_start = start_time.isoformat()
                results = [r for r in results if r["timestamp"] >= iso_start]
            if end_time:
                iso_end = end_time.isoformat()
                results = [r for r in results if r["timestamp"] <= iso_end]

            results.sort(key=lambda r: r["timestamp"], reverse=not chronological)
            return results[offset : offset + limit]

        endpoint = f"{self._supabase_url}/rest/v1/sensor_readings"
        order_direction = "asc" if chronological else "desc"
        
        # Build query params as list of tuples to support multiple timestamp constraints
        query_params: List[Tuple[str, str]] = [
            ("order", f"timestamp.{order_direction}"),
            ("limit", str(limit)),
        ]
        if offset > 0:
            query_params.append(("offset", str(offset)))
        if sensor_id:
            query_params.append(("sensor_id", f"eq.{sensor_id}"))
        if source:
            query_params.append(("source", f"eq.{source}"))
        if section_id:
            query_params.append(("section_id", f"eq.{section_id}"))
        if device_id:
            query_params.append(("device_id", f"eq.{device_id}"))
        if start_time:
            query_params.append(("timestamp", f"gte.{start_time.isoformat()}"))
        if end_time:
            query_params.append(("timestamp", f"lte.{end_time.isoformat()}"))

        headers = {
            "apikey": self._active_key,
            "Authorization": f"Bearer {self._active_key}",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.get(endpoint, params=query_params, headers=headers)
                if resp.status_code == 200:
                    self._last_persistence_error = None
                    return resp.json()
                logger.warning(f"Supabase query error: HTTP {resp.status_code}")
                return []
        except Exception as exc:
            logger.warning(f"Supabase query network error: {exc}")
            return []

    async def persist_mode_transition(
        self,
        from_mode: str,
        to_mode: str,
        reason: str,
        operator_id: str = "SYSTEM",
    ) -> bool:
        """
        Persist an operational mode transition audit record.
        """
        record = {
            "from_mode": from_mode,
            "to_mode": to_mode,
            "reason": reason,
            "operator_id": operator_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._mode_history_records.append(record)
        if len(self._mode_history_records) > 500:
            self._mode_history_records = self._mode_history_records[-500:]

        if not self._is_configured:
            return True

        endpoint = f"{self._supabase_url}/rest/v1/operational_mode_history"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.post(
                    endpoint,
                    json=[record],
                    headers=self._get_headers(),
                )
                return resp.status_code in (200, 201)
        except Exception as exc:
            logger.warning(f"Failed to persist mode history to Supabase: {exc}")
            return False

    async def query_mode_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Query auditable mode transition history from Supabase or memory buffer.
        """
        limit = max(1, min(limit, 500))
        if not self._is_configured:
            return list(reversed(self._mode_history_records))[:limit]

        endpoint = f"{self._supabase_url}/rest/v1/operational_mode_history"
        params = {"order": "timestamp.desc", "limit": str(limit)}
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.get(
                    endpoint,
                    params=params,
                    headers={
                        "apikey": self._active_key,
                        "Authorization": f"Bearer {self._active_key}",
                        "Accept": "application/json",
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                return list(reversed(self._mode_history_records))[:limit]
        except Exception as exc:
            logger.warning(f"Supabase mode history query error: {exc}")
            return list(reversed(self._mode_history_records))[:limit]

    async def register_device(self, device_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Register or update an IoT edge device in the devices registry.
        """
        device_id = device_data.get("device_id")
        if not device_id:
            raise ValueError("device_id is required")

        record = {
            "device_id": device_id,
            "name": device_data.get("name", device_id),
            "hardware_model": device_data.get("hardware_model", "ESP32 DevKit V1"),
            "firmware_version": device_data.get("firmware_version", "unknown"),
            "is_active": device_data.get("is_active", True),
            "validation_stage": device_data.get("validation_stage", "SOFTWARE_ONLY"),
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
            "metadata": device_data.get("metadata", {}),
        }

        # Keep local memory updated
        self._in_memory_devices[device_id] = record

        if not self._is_configured:
            return record

        endpoint = f"{self._supabase_url}/rest/v1/devices"
        headers = self._get_headers(prefer="resolution=merge-duplicates,return=representation")
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.post(endpoint, json=[record], headers=headers)
                if resp.status_code in (200, 201):
                    returned = resp.json()
                    return returned[0] if returned else record
                logger.warning(f"Device registration Supabase error: HTTP {resp.status_code}")
                return record
        except Exception as exc:
            logger.warning(f"Device registration network error: {exc}")
            return record

    async def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve device metadata by device_id.
        """
        if not self._is_configured:
            return self._in_memory_devices.get(device_id)

        endpoint = f"{self._supabase_url}/rest/v1/devices"
        params = {"device_id": f"eq.{device_id}"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.get(
                    endpoint,
                    params=params,
                    headers={
                        "apikey": self._active_key,
                        "Authorization": f"Bearer {self._active_key}",
                        "Accept": "application/json",
                    },
                )
                if resp.status_code == 200:
                    items = resp.json()
                    return items[0] if items else None
                return self._in_memory_devices.get(device_id)
        except Exception as exc:
            logger.warning(f"Get device network error: {exc}")
            return self._in_memory_devices.get(device_id)

    async def list_devices(self) -> List[Dict[str, Any]]:
        """
        List all registered IoT edge nodes.
        """
        if not self._is_configured:
            return list(self._in_memory_devices.values())

        endpoint = f"{self._supabase_url}/rest/v1/devices"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
                resp = await client.get(
                    endpoint,
                    headers={
                        "apikey": self._active_key,
                        "Authorization": f"Bearer {self._active_key}",
                        "Accept": "application/json",
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                return list(self._in_memory_devices.values())
        except Exception as exc:
            logger.warning(f"List devices network error: {exc}")
            return list(self._in_memory_devices.values())


# Global persistence client instance
persistence_repo = PersistenceRepository()
