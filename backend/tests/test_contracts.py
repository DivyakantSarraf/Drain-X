from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from app.models.contracts import (
    SensorReadingContract,
    SensorType,
    MeasurementUnit,
    DataSource,
    SensorHealthStatus,
    AlertContract,
    AlertSeverity,
    BlockageEventContract,
    PredictionContract,
    PredictionState,
    SystemStatusContract,
    SystemOperationalState,
)


def test_valid_sensor_reading_contract():
    reading = SensorReadingContract(
        sensor_id="US_UPSTREAM_01",
        section_id="SEC_SCREENING",
        sensor_type=SensorType.WATER_LEVEL,
        value=5.42,
        unit=MeasurementUnit.CENTIMETRE,
        source=DataSource.PHYSICAL,
        status=SensorHealthStatus.OK,
    )
    assert reading.sensor_id == "US_UPSTREAM_01"
    assert reading.value == 5.42
    assert reading.unit == MeasurementUnit.CENTIMETRE
    assert reading.timestamp.tzinfo is not None  # Must be timezone-aware (UTC)


def test_negative_water_depth_rejected():
    with pytest.raises(ValidationError):
        SensorReadingContract(
            sensor_id="US_UPSTREAM_01",
            section_id="SEC_SCREENING",
            sensor_type=SensorType.WATER_LEVEL,
            value=-1.5,
            unit=MeasurementUnit.CENTIMETRE,
        )


def test_negative_flow_rate_rejected():
    with pytest.raises(ValidationError):
        SensorReadingContract(
            sensor_id="FLOW_INFLOW_01",
            section_id="SEC_INFLOW",
            sensor_type=SensorType.FLOW_RATE,
            value=-0.1,
            unit=MeasurementUnit.LITRES_PER_MINUTE,
        )


def test_alert_contract():
    alert = AlertContract(
        section_id="SEC_SCREENING",
        alert_type="DEBRIS_DETECTED",
        severity=AlertSeverity.HIGH,
        message="Debris accumulation threshold reached on primary net"
    )
    assert alert.severity == AlertSeverity.HIGH
    assert alert.resolved is False
    assert alert.alert_id is not None


def test_blockage_event_contract():
    event = BlockageEventContract(
        section_id="SEC_SCREENING",
        probable_segment="PRIMARY_SCREENING_NET",
        confidence=0.92,
        differential_head_cm=3.4,
        estimated_flow_drop_lpm=4.2
    )
    assert event.probable_segment == "PRIMARY_SCREENING_NET"
    assert event.confidence == 0.92


def test_prediction_contract():
    pred = PredictionContract(
        section_id="SEC_SCREENING",
        state=PredictionState.ESTIMATING,
        ttc_seconds=34.5,
        confidence=0.85,
        rate_of_rise_cm_s=0.12
    )
    assert pred.state == PredictionState.ESTIMATING
    assert pred.ttc_seconds == 34.5


def test_system_status_contract():
    status = SystemStatusContract(
        mode="SIMULATION",
        operational_state=SystemOperationalState.MONITORING,
        active_alerts_count=0
    )
    assert status.mode == "SIMULATION"
    assert status.operational_state == SystemOperationalState.MONITORING
