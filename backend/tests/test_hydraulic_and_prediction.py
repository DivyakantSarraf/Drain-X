from datetime import datetime, timezone
import pytest
from app.services.hydraulic_simulation import HydraulicChannelSimulator
from app.services.blockage_detector import blockage_detector
from app.services.prediction_engine import prediction_engine
from app.services.fault_detector import fault_detector
from app.services.state_store import state_store
from app.models.contracts import (
    PredictionState,
    SensorReadingContract,
    SensorType,
    MeasurementUnit,
    DataSource,
    SensorHealthStatus,
)


def test_hydraulic_simulation_clean_flow():
    sim = HydraulicChannelSimulator(seed=123)
    sim.set_inflow(5.0)
    sim.set_blockage(0.0)

    # Step for 5 seconds
    for _ in range(10):
        h1, h2, qin, qout = sim.step(0.5)

    assert h1 > 0.0
    assert h2 >= sim.pw
    # Clean flow should maintain low differential head
    delta_h = h1 - h2
    assert delta_h < 1.5


def test_hydraulic_blockage_head_loss():
    sim = HydraulicChannelSimulator(seed=123)
    sim.set_inflow(8.0)
    sim.set_blockage(0.85)  # 85% clogged

    # Step for 15 seconds
    for _ in range(30):
        h1, h2, qin, qout = sim.step(0.5)

    # Upstream head should rise significantly above downstream
    delta_h = h1 - h2
    assert delta_h > 2.0


def test_blockage_detector_evaluates_excess_head():
    state_store.ingest_reading(
        SensorReadingContract(
            sensor_id="US_UPSTREAM_01",
            section_id="SEC_SCREENING",
            sensor_type=SensorType.WATER_LEVEL,
            value=8.5,
            unit=MeasurementUnit.CENTIMETRE,
        )
    )
    state_store.ingest_reading(
        SensorReadingContract(
            sensor_id="US_WEIR_02",
            section_id="SEC_OUTLET",
            sensor_type=SensorType.WATER_LEVEL,
            value=1.0,
            unit=MeasurementUnit.CENTIMETRE,
        )
    )

    event = blockage_detector.evaluate()
    assert event is not None
    assert event.probable_segment == "PRIMARY_SCREENING_NET"
    assert event.severity > 0.5
    assert event.differential_head_cm > 2.5


def test_ttc_prediction_stable_vs_rising():
    # 1. Stable Readings
    for i in range(6):
        state_store.ingest_reading(
            SensorReadingContract(
                sensor_id="US_UPSTREAM_01",
                section_id="SEC_SCREENING",
                sensor_type=SensorType.WATER_LEVEL,
                value=5.0,
                unit=MeasurementUnit.CENTIMETRE,
                timestamp=datetime(2026, 11, 2, 0, 0, i, tzinfo=timezone.utc),
            )
        )
    pred_stable = prediction_engine.evaluate()
    assert pred_stable.state == PredictionState.STABLE
    assert pred_stable.ttc_seconds is None

    # 2. Rising Readings (e.g. 10 consecutive samples rising by 0.3 cm/s)
    for i in range(10):
        state_store.ingest_reading(
            SensorReadingContract(
                sensor_id="US_UPSTREAM_01",
                section_id="SEC_SCREENING",
                sensor_type=SensorType.WATER_LEVEL,
                value=5.0 + (i * 0.3),
                unit=MeasurementUnit.CENTIMETRE,
                timestamp=datetime(2026, 11, 2, 0, 1, i, tzinfo=timezone.utc),
            )
        )
    pred_rising = prediction_engine.evaluate()
    assert pred_rising.state == PredictionState.ESTIMATING
    assert pred_rising.ttc_seconds is not None
    assert pred_rising.ttc_seconds > 0.0


def test_fault_detector_identifies_implausible_spike():
    fault = fault_detector.evaluate_reading(
        SensorReadingContract(
            sensor_id="US_UPSTREAM_01",
            section_id="SEC_SCREENING",
            sensor_type=SensorType.WATER_LEVEL,
            value=99.9,  # Exceeds 16cm physical flume depth
            unit=MeasurementUnit.CENTIMETRE,
        )
    )
    assert fault is not None
    assert fault.fault_type.value == "IMPLAUSIBLE_READING"
