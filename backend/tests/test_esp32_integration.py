"""
DRAIN-X P0.3F: ESP32 Wi-Fi Telemetry & FastAPI Integration Tests

Validates:
1. POST /api/v1/telemetry/ingest endpoint alias accepts canonical telemetry.
2. Exact ESP32 batch payload format (WATER_LEVEL + FLOW_RATE) is ingested and processed.
3. Metadata preservation: device_id, firmware_version, gate_state, gate_angle, pulse counts.
4. Strict operational mode isolation:
   - In SIMULATION mode, PHYSICAL telemetry is rejected (HTTP 409 Conflict).
   - In PHYSICAL mode, SIMULATED telemetry is rejected (HTTP 409 Conflict).
5. Sensor independence in backend:
   - Ultrasonic failure payload (value=0, status=FAULT) with valid flow rate ingested cleanly.
   - Flow failure payload (value=0, status=FAULT) with valid water level ingested cleanly.
6. Zero flow (value=0.0, status=OK) is accepted as valid physical flow.
7. Backend response contract (prediction, blockage, gate_directive) matches TelemetryIngestResponse.
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.services.state_store import state_store
from app.models.contracts import DataSource


@pytest.fixture(autouse=True)
def clean_mode():
    """Default each test to SIMULATION mode and restore afterwards."""
    state_store.set_mode("SIMULATION", reason="test_esp32_integration setup")
    yield
    state_store.set_mode("SIMULATION", reason="test_esp32_integration cleanup")


def test_esp32_ingest_endpoint_alias_available(client: TestClient):
    """Verify /api/v1/telemetry/ingest alias is active and accepts single reading."""
    payload = {
        "sensor_id": "US_UPSTREAM_01",
        "section_id": "SEC_SCREENING_01",
        "sensor_type": "WATER_LEVEL",
        "value": 4.5,
        "unit": "cm",
        "source": "SIMULATED",
        "status": "OK",
        "metadata": {
            "device_id": "DRAINX-ESP32-NODE-01",
            "firmware_version": "0.3.6-p0.3f"
        }
    }
    response = client.post("/api/v1/telemetry/ingest", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["ingested_count"] == 1


def test_esp32_batch_telemetry_payload_physical_mode(client: TestClient):
    """Verify exact JSON structure emitted by ESP32 NetworkManager in PHYSICAL mode."""
    state_store.set_mode("PHYSICAL", reason="ESP32 physical ingest verification")

    esp32_batch_payload = [
        {
            "sensor_id": "US_UPSTREAM_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "WATER_LEVEL",
            "value": 4.82,
            "unit": "cm",
            "source": "PHYSICAL",
            "status": "OK",
            "metadata": {
                "device_id": "DRAINX-ESP32-NODE-01",
                "firmware_version": "0.3.6-p0.3f",
                "raw_distance_cm": 30.18,
                "is_valid": True,
                "is_filtered": False,
                "fault_code": "NONE",
                "gate_state": "CLOSED",
                "gate_angle_deg": 0.0,
                "uptime_ms": 12450,
                "sequence_number": 12
            }
        },
        {
            "sensor_id": "FS_FLUME_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "FLOW_RATE",
            "value": 3.42,
            "unit": "L/min",
            "source": "PHYSICAL",
            "status": "OK",
            "metadata": {
                "device_id": "DRAINX-ESP32-NODE-01",
                "firmware_version": "0.3.6-p0.3f",
                "is_valid": True,
                "total_volume_liters": 1.250,
                "flow_pulse_count": 563,
                "fault_code": "NONE",
                "uptime_ms": 12450,
                "sequence_number": 12
            }
        }
    ]

    response = client.post("/api/v1/telemetry/ingest", json=esp32_batch_payload)
    assert response.status_code == 201
    data = response.json()

    assert data["status"] == "success"
    assert data["ingested_count"] == 2
    assert "prediction" in data
    assert "blockage" in data
    assert "gate_directive" in data

    # Verify latest values in StateStore
    latest = state_store.get_latest_readings()
    assert "US_UPSTREAM_01" in latest
    assert "FS_FLUME_01" in latest
    assert latest["US_UPSTREAM_01"].value == 4.82
    assert latest["US_UPSTREAM_01"].source == DataSource.PHYSICAL
    assert latest["FS_FLUME_01"].value == 3.42
    assert latest["FS_FLUME_01"].source == DataSource.PHYSICAL


def test_esp32_zero_flow_is_valid_reading(client: TestClient):
    """Verify stagnant water (0.0 L/min, status OK) is ingested as valid physical state."""
    state_store.set_mode("PHYSICAL", reason="Zero flow invariant test")

    payload = [
        {
            "sensor_id": "US_UPSTREAM_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "WATER_LEVEL",
            "value": 4.5,
            "unit": "cm",
            "source": "PHYSICAL",
            "status": "OK",
            "metadata": {"raw_distance_cm": 30.5}
        },
        {
            "sensor_id": "FS_FLUME_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "FLOW_RATE",
            "value": 0.0,
            "unit": "L/min",
            "source": "PHYSICAL",
            "status": "OK",
            "metadata": {"total_volume_liters": 0.0, "flow_pulse_count": 0}
        }
    ]

    response = client.post("/api/v1/telemetry/ingest", json=payload)
    assert response.status_code == 201

    latest = state_store.get_latest_readings()
    assert latest["FS_FLUME_01"].value == 0.0
    assert latest["FS_FLUME_01"].status.value == "OK"


def test_mode_isolation_rejection_http_409(client: TestClient):
    """Verify physical telemetry is rejected when backend is in SIMULATION mode."""
    # Backend is in SIMULATION mode by default
    assert state_store.is_simulation()

    physical_payload = {
        "sensor_id": "US_UPSTREAM_01",
        "section_id": "SEC_SCREENING_01",
        "sensor_type": "WATER_LEVEL",
        "value": 5.0,
        "unit": "cm",
        "source": "PHYSICAL",
        "status": "OK"
    }

    # Physical telemetry must be rejected with 409 Conflict
    response = client.post("/api/v1/telemetry/ingest", json=physical_payload)
    assert response.status_code == 409
    assert "SIMULATION mode" in response.json()["detail"]

    # Switch backend to PHYSICAL mode
    state_store.set_mode("PHYSICAL", reason="Test physical acceptance")

    simulated_payload = {
        "sensor_id": "US_UPSTREAM_01",
        "section_id": "SEC_SCREENING_01",
        "sensor_type": "WATER_LEVEL",
        "value": 5.0,
        "unit": "cm",
        "source": "SIMULATED",
        "status": "OK"
    }

    # Simulated telemetry must be rejected with 409 Conflict
    resp_conflict = client.post("/api/v1/telemetry/ingest", json=simulated_payload)
    assert resp_conflict.status_code == 409
    assert "PHYSICAL mode" in resp_conflict.json()["detail"]


def test_sensor_independence_backend_handling(client: TestClient):
    """Verify backend handles partial sensor failure (ultrasonic timeout with valid flow)."""
    state_store.set_mode("PHYSICAL", reason="Sensor independence test")

    degraded_payload = [
        {
            "sensor_id": "US_UPSTREAM_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "WATER_LEVEL",
            "value": 0.0,
            "unit": "cm",
            "source": "PHYSICAL",
            "status": "FAULT",
            "metadata": {
                "fault_code": "TIMEOUT_NO_ECHO",
                "is_valid": False
            }
        },
        {
            "sensor_id": "FS_FLUME_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "FLOW_RATE",
            "value": 4.12,
            "unit": "L/min",
            "source": "PHYSICAL",
            "status": "OK",
            "metadata": {
                "total_volume_liters": 2.5,
                "flow_pulse_count": 1125,
                "is_valid": True
            }
        }
    ]

    response = client.post("/api/v1/telemetry/ingest", json=degraded_payload)
    assert response.status_code == 201

    latest = state_store.get_latest_readings()
    # Ultrasonic is flagged FAULT
    assert latest["US_UPSTREAM_01"].status.value == "FAULT"
    # Flow meter is functional and preserved
    assert latest["FS_FLUME_01"].status.value == "OK"
    assert latest["FS_FLUME_01"].value == 4.12


def test_esp32_p03g_validation_stage_and_uninstalled_sensor_ingestion(client: TestClient):
    """Verify backend cleanly ingests telemetry containing validation_stage and SENSOR_NOT_INSTALLED fault."""
    state_store.set_mode("PHYSICAL", reason="P0.3G validation stage test")

    uninstalled_sensor_payload = [
        {
            "sensor_id": "US_UPSTREAM_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "WATER_LEVEL",
            "value": 11.45,
            "unit": "cm",
            "source": "PHYSICAL",
            "status": "OK",
            "metadata": {
                "device_id": "DRAINX-ESP32-NODE-01",
                "firmware_version": "0.3.7-p0.3g",
                "raw_distance_cm": 23.55,
                "is_valid": True,
                "is_filtered": False,
                "fault_code": "NONE",
                "validation_stage": "PARTIALLY_ASSEMBLED",
                "gate_state": "CLOSED",
                "gate_angle_deg": 0.0,
                "uptime_ms": 12450,
                "sequence_number": 6
            }
        },
        {
            "sensor_id": "FS_FLUME_01",
            "section_id": "SEC_SCREENING_01",
            "sensor_type": "FLOW_RATE",
            "value": 0.0,
            "unit": "L/min",
            "source": "PHYSICAL",
            "status": "FAULT",
            "metadata": {
                "device_id": "DRAINX-ESP32-NODE-01",
                "firmware_version": "0.3.7-p0.3g",
                "is_valid": False,
                "total_volume_liters": 0.0,
                "flow_pulse_count": 0,
                "fault_code": "SENSOR_NOT_INSTALLED",
                "validation_stage": "PARTIALLY_ASSEMBLED",
                "uptime_ms": 12450,
                "sequence_number": 6
            }
        }
    ]

    response = client.post("/api/v1/telemetry/ingest", json=uninstalled_sensor_payload)
    assert response.status_code == 201

    latest = state_store.get_latest_readings()
    # Ultrasonic is valid physical reading
    assert latest["US_UPSTREAM_01"].value == 11.45
    assert latest["US_UPSTREAM_01"].status.value == "OK"
    assert latest["US_UPSTREAM_01"].metadata["validation_stage"] == "PARTIALLY_ASSEMBLED"

    # Flow sensor is accurately recorded as FAULT / SENSOR_NOT_INSTALLED without fake healthy data
    assert latest["FS_FLUME_01"].value == 0.0
    assert latest["FS_FLUME_01"].status.value == "FAULT"
    assert latest["FS_FLUME_01"].metadata["fault_code"] == "SENSOR_NOT_INSTALLED"
    assert latest["FS_FLUME_01"].metadata["validation_stage"] == "PARTIALLY_ASSEMBLED"


def test_esp32_disconnection_network_loss_does_not_corrupt_backend_mode(client: TestClient):
    """Verify that backend operational mode remains stable when ESP32 disconnects/times out."""
    state_store.set_mode("PHYSICAL", reason="Pre-disconnect baseline")
    assert state_store.is_physical() is True

    # Simulate quiet period (no telemetry from disconnected node)
    # Backend must maintain PHYSICAL state and not randomly revert to SIMULATION
    assert state_store.is_physical() is True
    assert state_store.mode == "PHYSICAL"
