from datetime import datetime, timezone
from typing import Optional, List

from app.models.contracts import (
    SensorReadingContract,
    FaultType,
    FaultEventContract,
    AlertSeverity,
    SensorHealthStatus,
    MechanismState,
    MechanismStatusContract,
)
from app.services.state_store import state_store


class FaultDetector:
    """
    Automated Software Fault Detection Service for DRAIN-X.
    Detects sensor failures, stale data, implausible values, actuator timeouts,
    mechanism jams, and sensor inconsistencies.
    """

    def __init__(
        self,
        stale_timeout_s: float = 8.0,
        max_physical_depth_cm: float = 16.0,
        max_step_change_cm: float = 6.0,
        actuator_timeout_s: float = 8.0,
    ):
        self.stale_timeout_s = stale_timeout_s
        self.max_physical_depth_cm = max_physical_depth_cm
        self.max_step_change_cm = max_step_change_cm
        self.actuator_timeout_s = actuator_timeout_s

    def evaluate_reading(self, reading: SensorReadingContract) -> Optional[FaultEventContract]:
        """Validates an individual incoming reading for physical plausibility and health."""
        sensor_id = reading.sensor_id

        # 1. Explicit Hardware Error Status
        if reading.status == SensorHealthStatus.FAULT:
            fault = FaultEventContract(
                target_id=sensor_id,
                fault_type=FaultType.SENSOR_DISCONNECTED,
                severity=AlertSeverity.CRITICAL,
                description=f"Sensor {sensor_id} reported hardware FAULT state or disconnection.",
                context={"reading": reading.model_dump()}
            )
            state_store.record_fault(fault)
            state_store.create_alert(
                section_id=reading.section_id,
                alert_type="SENSOR_DISCONNECTED",
                severity=AlertSeverity.CRITICAL,
                message=fault.description,
            )
            return fault

        # 2. Implausible Range Checks
        if reading.unit.value == "cm":
            if reading.value > self.max_physical_depth_cm:
                fault = FaultEventContract(
                    target_id=sensor_id,
                    fault_type=FaultType.IMPLAUSIBLE_READING,
                    severity=AlertSeverity.HIGH,
                    description=f"Sensor {sensor_id} value {reading.value:.1f} cm exceeds maximum physical flume depth ({self.max_physical_depth_cm} cm).",
                    context={"value": reading.value}
                )
                state_store.record_fault(fault)
                state_store.create_alert(
                    section_id=reading.section_id,
                    alert_type="IMPLAUSIBLE_READING",
                    severity=AlertSeverity.HIGH,
                    message=fault.description,
                )
                return fault

            # 3. Sudden Step Jumps
            history = state_store.get_sensor_history(sensor_id, limit=2)
            if len(history) >= 2:
                prev_val = history[-2].value
                delta = abs(reading.value - prev_val)
                if delta > self.max_step_change_cm:
                    fault = FaultEventContract(
                        target_id=sensor_id,
                        fault_type=FaultType.IMPLAUSIBLE_READING,
                        severity=AlertSeverity.WARNING,
                        description=f"Sensor {sensor_id} experienced unrealistic step jump of {delta:.1f} cm in single sample.",
                        context={"previous": prev_val, "current": reading.value, "delta": delta}
                    )
                    state_store.record_fault(fault)
                    return fault

        return None

    def evaluate_system_health(self) -> List[FaultEventContract]:
        """Evaluates stale telemetry, mechanism timeouts, and sensor cross-consistency."""
        now = datetime.now(timezone.utc)
        latest_readings = state_store.get_latest_readings()
        faults_detected = []

        # 1. Stale Telemetry Check
        for sensor_id, reading in latest_readings.items():
            age_s = (now - reading.timestamp).total_seconds()
            if age_s > self.stale_timeout_s:
                fault = FaultEventContract(
                    target_id=sensor_id,
                    fault_type=FaultType.STALE_DATA,
                    severity=AlertSeverity.WARNING,
                    description=f"Telemetry from {sensor_id} is stale (no updates for {age_s:.1f}s).",
                    context={"age_seconds": age_s}
                )
                state_store.record_fault(fault)
                state_store.create_alert(
                    section_id=reading.section_id,
                    alert_type="STALE_TELEMETRY",
                    severity=AlertSeverity.WARNING,
                    message=fault.description,
                )
                faults_detected.append(fault)

        # 2. Mechanism Jam & Actuator Timeout Check
        mechanism = state_store.get_mechanism_status()
        if mechanism.is_jammed or mechanism.state == MechanismState.JAMMED:
            fault = FaultEventContract(
                target_id="WINCH_MECHANISM",
                fault_type=FaultType.MECHANISM_JAM,
                severity=AlertSeverity.CRITICAL,
                description="Screening mechanical winch carriage is jammed or overcurrent tripped.",
                context={"tray_height_cm": mechanism.tray_height_cm}
            )
            state_store.record_fault(fault)
            state_store.create_alert(
                section_id="SEC_SCREENING",
                alert_type="MECHANISM_JAM",
                severity=AlertSeverity.CRITICAL,
                message=fault.description,
            )
            faults_detected.append(fault)

        elif mechanism.state in (MechanismState.HOISTING, MechanismState.LOWERING):
            if mechanism.elapsed_in_state_s > self.actuator_timeout_s:
                fault = FaultEventContract(
                    target_id="WINCH_MECHANISM",
                    fault_type=FaultType.ACTUATOR_TIMEOUT,
                    severity=AlertSeverity.HIGH,
                    description=f"Winch operation timed out in state {mechanism.state.value} ({mechanism.elapsed_in_state_s:.1f}s > {self.actuator_timeout_s}s).",
                    context={"state": mechanism.state.value, "elapsed_s": mechanism.elapsed_in_state_s}
                )
                state_store.record_fault(fault)
                faults_detected.append(fault)

        # 3. Cross-Sensor Inconsistency Check
        # e.g., Upstream water is surging (h1 > 8 cm) but pump inflow is zero
        h1_reading = latest_readings.get("US_UPSTREAM_01")
        q_reading = latest_readings.get("PUMP_INFLOW_01")
        if h1_reading and q_reading:
            if h1_reading.value > 10.0 and q_reading.value <= 0.1:
                fault = FaultEventContract(
                    target_id="US_UPSTREAM_01",
                    fault_type=FaultType.SENSOR_INCONSISTENT,
                    severity=AlertSeverity.HIGH,
                    description="Severe water head rise observed while pump inflow reads zero.",
                    context={"h1": h1_reading.value, "q_in": q_reading.value}
                )
                state_store.record_fault(fault)
                faults_detected.append(fault)

        return faults_detected


fault_detector = FaultDetector()
