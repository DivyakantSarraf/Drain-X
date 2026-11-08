from typing import List, Union
from fastapi import APIRouter, Query, status
from app.models.contracts import (
    SensorReadingContract,
    TelemetryIngestResponse,
)
from app.services.state_store import state_store
from app.services.fault_detector import fault_detector
from app.services.blockage_detector import blockage_detector
from app.services.prediction_engine import prediction_engine
from app.services.intervention_engine import intervention_engine

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


@router.post("", response_model=TelemetryIngestResponse, status_code=status.HTTP_201_CREATED, summary="Ingest sensor reading(s)")
async def ingest_telemetry(payload: Union[SensorReadingContract, List[SensorReadingContract]]):
    """
    Ingest validated sensor telemetry and immediately execute the analytics pipeline.
    Accepts either a single SensorReadingContract or a list of readings.
    Used by physical ESP32 adapters, simulation runners, and MQTT bridges alike.
    
    Processing steps:
    1. Store readings into thread-safe in-memory state store and circular history buffer.
    2. Evaluate individual reading plausibility, ranges, and spike faults.
    3. Evaluate system-level sensor health, staleness, and cross-consistency.
    4. Run hydraulic blockage detection and localization across monitored sections.
    5. Run Time-to-Critical (TTC) predictive linear regression.
    6. Compute real-time actuator directives (diversion gate angle & action).
    7. Return structured ingestion response with analytics snapshot.
    """
    readings = payload if isinstance(payload, list) else [payload]
    single_msg_id = payload.message_id if isinstance(payload, SensorReadingContract) else None

    # 1. Store reading and validate plausibility
    for reading in readings:
        state_store.ingest_reading(reading)
        fault_detector.evaluate_reading(reading)

    # 2. System-level health and cross-consistency
    fault_detector.evaluate_system_health()

    # 3. Blockage detection and localization
    blockage = blockage_detector.evaluate()

    # 4. Predictive trend estimation & TTC
    prediction = prediction_engine.evaluate()

    # 5. Actuator & diversion gate directive
    directive = intervention_engine.compute_gate_directive()
    state_store.set_gate_directive(directive)

    # 6. Active alert count
    active_alerts = len(state_store.get_alerts(active_only=True))

    return TelemetryIngestResponse(
        status="success",
        ingested_count=len(readings),
        message_id=single_msg_id,
        prediction=prediction,
        blockage=blockage,
        active_alerts_count=active_alerts,
        gate_directive=directive,
        gate_command=directive,
    )


@router.get("/latest", summary="Get latest readings across all sensors")
async def get_latest_telemetry():
    """
    Returns the most recent reading from each active sensor.
    """
    return {
        "status": "success",
        "readings": state_store.get_latest_readings()
    }


@router.get("/history/{sensor_id}", summary="Get rolling history for a specific sensor")
async def get_sensor_history(sensor_id: str, limit: int = Query(default=100, ge=1, le=500)):
    """
    Returns the rolling buffer of historical readings for a specific sensor.
    """
    history = state_store.get_sensor_history(sensor_id=sensor_id, limit=limit)
    if not history:
        return {
            "status": "empty",
            "sensor_id": sensor_id,
            "readings": []
        }
    return {
        "status": "success",
        "sensor_id": sensor_id,
        "count": len(history),
        "readings": history
    }
