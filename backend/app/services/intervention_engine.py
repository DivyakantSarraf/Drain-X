from datetime import datetime, timezone
from typing import Optional

from app.models.contracts import (
    MechanismState,
    PredictionState,
    AlertSeverity,
    ActuatorDirectiveContract,
    FaultType,
    SensorType,
)
from app.services.state_store import state_store
from app.services.screening_mechanism import ScreeningMechanismSimulator
from app.core.config import settings


class InterventionEngine:
    """
    Predictive Intervention & Closed-Loop Verification Decision Engine.
    Evaluates blockage severity, flood risk, and TTC to command the automated
    screening waste-removal cycle and compute diversion gate directives for physical
    ESP32 actuators or simulated diversion gates.
    """

    def __init__(
        self,
        mechanism: Optional[ScreeningMechanismSimulator] = None,
        ttc_trigger_threshold_s: float = 45.0,
        severity_trigger_threshold: float = 0.55,
        verification_window_s: float = 15.0,
    ):
        self.mechanism = mechanism
        self.ttc_trigger_threshold_s = ttc_trigger_threshold_s
        self.severity_trigger_threshold = severity_trigger_threshold
        self.verification_window_s = verification_window_s

        # Verification Tracking
        self.verifying = False
        self.verification_timer = 0.0
        self.pre_intervention_head = 0.0
        self.last_intervention_result: Optional[str] = None
        self.successful_interventions = 0
        self.total_interventions = 0

    def compute_gate_directive(self) -> ActuatorDirectiveContract:
        """
        Computes the target diversion gate position and action directive based on
        current real-time analytics (predictions, blockage, water depth, and hardware faults).
        Safe for both physical ESP32 and simulated scenarios.
        """
        readings = state_store.get_latest_readings()
        pred = state_store.get_prediction()
        blockage = state_store.get_active_blockage()
        active_faults = state_store.get_active_faults()

        # Determine highest water level reported
        max_h = 0.0
        for r in readings.values():
            if r.unit.value == "cm":
                if r.value > max_h:
                    max_h = r.value

        has_sensor_fault = any(f.fault_type == FaultType.SENSOR_DISCONNECTED for f in active_faults)
        has_critical_jam = any(f.fault_type == FaultType.MECHANISM_JAM for f in active_faults)

        # 1. Critical depth overflow
        if max_h >= settings.CRITICAL_WATER_DEPTH_CM:
            return ActuatorDirectiveContract(
                gate_target_angle=90.0,
                action="EMERGENCY_OVERFLOW_RELIEF",
                reason=f"Water level ({max_h:.1f} cm) reached or exceeded critical overflow limit ({settings.CRITICAL_WATER_DEPTH_CM:.1f} cm).",
                risk_level=AlertSeverity.CRITICAL,
                emergency_stop=has_critical_jam,
            )

        # 2. Predictive Overflow (TTC = 0)
        if pred and pred.state == PredictionState.OVERFLOW:
            return ActuatorDirectiveContract(
                gate_target_angle=90.0,
                action="EMERGENCY_OVERFLOW_RELIEF",
                reason="Prediction engine detected immediate overflow threshold breached.",
                risk_level=AlertSeverity.CRITICAL,
                emergency_stop=has_critical_jam,
            )

        # 3. Predictive Early Warning (TTC <= threshold)
        if pred and pred.state == PredictionState.ESTIMATING and pred.ttc_seconds is not None:
            if pred.ttc_seconds <= self.ttc_trigger_threshold_s:
                return ActuatorDirectiveContract(
                    gate_target_angle=90.0,
                    action="DIVERT_FLOW",
                    reason=f"Predictive Time-to-Critical breached threshold ({pred.ttc_seconds:.1f}s <= {self.ttc_trigger_threshold_s:.1f}s).",
                    risk_level=AlertSeverity.HIGH,
                    emergency_stop=has_critical_jam,
                )

        # 4. Severe Blockage Diagnosed
        if blockage and blockage.severity >= self.severity_trigger_threshold:
            return ActuatorDirectiveContract(
                gate_target_angle=90.0,
                action="DIVERT_FLOW",
                reason=f"Hydraulic blockage severity ({blockage.severity:.2f}) exceeded trigger threshold ({self.severity_trigger_threshold:.2f}).",
                risk_level=AlertSeverity.HIGH if blockage.severity >= 0.75 else AlertSeverity.WARNING,
                emergency_stop=has_critical_jam,
            )

        # 5. Sensor Fault Fail-Safe Warning
        if has_sensor_fault:
            return ActuatorDirectiveContract(
                gate_target_angle=0.0,
                action="SENSOR_FAULT_HOLD",
                reason="Sensor disconnection detected; maintaining current gate position and alerting operator.",
                risk_level=AlertSeverity.CRITICAL,
                emergency_stop=False,
            )

        # 6. Approaching High Water Warning (elevated head)
        if max_h >= (settings.CRITICAL_WATER_DEPTH_CM - 2.0):  # e.g. >= 10.0 cm
            return ActuatorDirectiveContract(
                gate_target_angle=0.0,
                action="MONITOR_HIGH_WATER",
                reason=f"Water level elevated at {max_h:.1f} cm (approaching {settings.CRITICAL_WATER_DEPTH_CM:.1f} cm critical threshold).",
                risk_level=AlertSeverity.WARNING,
                emergency_stop=has_critical_jam,
            )

        # 7. Nominal Flow
        return ActuatorDirectiveContract(
            gate_target_angle=0.0,
            action="MAINTAIN_NORMAL",
            reason="Channel hydraulics and trends within nominal safe bounds.",
            risk_level=AlertSeverity.INFO,
            emergency_stop=has_critical_jam,
        )

    def get_gate_directive(self) -> ActuatorDirectiveContract:
        """Alias for compute_gate_directive."""
        return self.compute_gate_directive()

    def evaluate_and_act(self, dt: float) -> Optional[str]:
        """
        Main decision loop step for physical mechanism simulation.
        Returns action taken description, or None if in standby.
        """
        if self.mechanism is None:
            return None

        # 1. Handle Active Post-Cycle Verification
        if self.verifying:
            self.verification_timer += dt
            if self.verification_timer >= self.verification_window_s:
                # Conclude verification
                readings = state_store.get_latest_readings()
                h1_reading = readings.get("US_UPSTREAM_01")
                current_head = h1_reading.value if h1_reading else self.pre_intervention_head
                head_reduction = self.pre_intervention_head - current_head

                if head_reduction >= 1.0 or current_head < 5.0:
                    self.last_intervention_result = "VERIFIED_SUCCESSFUL"
                    self.successful_interventions += 1
                    state_store.create_alert(
                        section_id="SEC_SCREENING",
                        alert_type="INTERVENTION_VERIFIED",
                        severity=AlertSeverity.INFO,
                        message=f"Waste-removal cycle verified: head dropped by {head_reduction:.1f} cm to {current_head:.1f} cm.",
                    )
                else:
                    self.last_intervention_result = "UNVERIFIED_INSUFFICIENT_RELIEF"
                    state_store.create_alert(
                        section_id="SEC_SCREENING",
                        alert_type="INTERVENTION_UNVERIFIED",
                        severity=AlertSeverity.HIGH,
                        message="Waste-removal cycle did not sufficiently lower upstream head. Secondary blockage suspected.",
                    )
                self.verifying = False
                self.verification_timer = 0.0

        # 2. Check if Mechanism is currently busy
        mech_status = self.mechanism.get_status()
        state_store.update_mechanism_status(mech_status)

        if mech_status.state != MechanismState.IDLE:
            return f"Mechanism busy in state {mech_status.state.value}"

        # 3. Check for blocking hardware faults
        active_faults = state_store.get_active_faults()
        if any(f.fault_type.value in ("MECHANISM_JAM", "COMMUNICATION_LOSS") for f in active_faults):
            return "Intervention suppressed due to active hardware fault"

        # 4. Evaluate Intervention Decision Criteria
        pred = state_store.get_prediction()
        blockage = state_store.get_active_blockage()
        readings = state_store.get_latest_readings()
        h1 = readings.get("US_UPSTREAM_01").value if readings.get("US_UPSTREAM_01") else 0.0

        trigger_reason = None

        if pred and pred.state == PredictionState.ESTIMATING and pred.ttc_seconds is not None:
            if pred.ttc_seconds <= self.ttc_trigger_threshold_s:
                trigger_reason = f"Predictive TTC threshold reached ({pred.ttc_seconds:.1f}s <= {self.ttc_trigger_threshold_s}s)"

        if not trigger_reason and blockage and blockage.severity >= self.severity_trigger_threshold:
            trigger_reason = f"High blockage severity diagnosed ({blockage.severity:.2f} >= {self.severity_trigger_threshold})"

        if not trigger_reason and h1 >= 10.5:
            trigger_reason = f"Critical upstream head reached ({h1:.1f} cm >= 10.5 cm)"

        # 5. Trigger Waste-Removal Cycle
        if trigger_reason:
            self.pre_intervention_head = h1
            self.total_interventions += 1
            success = self.mechanism.trigger_cycle()
            if success:
                state_store.create_alert(
                    section_id="SEC_SCREENING",
                    alert_type="PREVENTIVE_INTERVENTION_TRIGGERED",
                    severity=AlertSeverity.WARNING,
                    message=f"Autonomous intervention initiated: {trigger_reason}",
                )
                self.verifying = True
                self.verification_timer = 0.0
                return f"Triggered: {trigger_reason}"

        return None


# Global singleton instance for direct hardware and API access
intervention_engine = InterventionEngine()
