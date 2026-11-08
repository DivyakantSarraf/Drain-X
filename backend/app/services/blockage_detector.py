import math
from datetime import datetime, timezone
from typing import Optional

from app.models.contracts import (
    BlockageEventContract,
    SensorHealthStatus,
)
from app.services.state_store import state_store


class BlockageDetector:
    """
    Hydraulic Blockage Detection and Localization Engine.
    Calculates excess differential head loss across the primary net:
      Delta_h_excess = (h_upstream - (P_weir + h_weir)) - Delta_h_baseline(Qin)
    Estimates obstruction severity fraction and outputs localized segment with confidence.
    """

    def __init__(
        self,
        upstream_sensor_id: str = "US_UPSTREAM_01",
        downstream_sensor_id: str = "US_WEIR_02",
        inflow_sensor_id: str = "PUMP_INFLOW_01",
        weir_crest_height_cm: float = 4.0,
        baseline_resistance_coeff: float = 0.12,
        blockage_threshold_cm: float = 1.8,
    ):
        self.upstream_sensor_id = upstream_sensor_id
        self.downstream_sensor_id = downstream_sensor_id
        self.inflow_sensor_id = inflow_sensor_id
        self.pw = weir_crest_height_cm
        self.baseline_coeff = baseline_resistance_coeff
        self.blockage_threshold_cm = blockage_threshold_cm

    def evaluate(self) -> Optional[BlockageEventContract]:
        """Evaluates latest telemetry to detect and localize restrictions."""
        readings = state_store.get_latest_readings()

        r_up = readings.get(self.upstream_sensor_id)
        r_down = readings.get(self.downstream_sensor_id)
        r_q = readings.get(self.inflow_sensor_id)

        if not r_up or not r_down:
            # Flexible fallback for physical or differently named dual-sensor flumes
            water_sensors = [r for r in readings.values() if r.unit.value == "cm"]
            if len(water_sensors) >= 2:
                sorted_sensors = sorted(
                    water_sensors,
                    key=lambda s: (0 if ("UP" in s.sensor_id or "SCREEN" in s.section_id) else 1, s.value),
                    reverse=True
                )
                r_up = r_up or sorted_sensors[0]
                r_down = r_down or sorted_sensors[-1]

        if not r_up or not r_down:
            return None

        # Check sensor validity
        if r_up.status == SensorHealthStatus.FAULT or r_down.status == SensorHealthStatus.FAULT:
            return None

        h_up = r_up.value
        hw = r_down.value
        h_down = self.pw + hw
        q_in = r_q.value if r_q else 5.0

        # Calculate differential head
        delta_h_observed = max(0.0, h_up - h_down)

        # Baseline clean friction loss compensation
        delta_h_baseline = self.baseline_coeff * (q_in / 5.0)
        delta_h_excess = max(0.0, delta_h_observed - delta_h_baseline)

        # Blockage Severity Fraction beta in [0.0, 1.0]
        # At delta_h_excess = 0 -> beta = 0.0; at delta_h_excess >= 6.0 cm -> beta ~ 0.95
        severity = min(0.98, max(0.0, 1.0 - math.exp(-0.45 * delta_h_excess)))

        # Confidence calculation based on measurement stability and magnitude
        history_up = state_store.get_sensor_history(self.upstream_sensor_id, limit=5)
        if len(history_up) >= 3:
            variance = sum((x.value - h_up) ** 2 for x in history_up) / len(history_up)
            # Higher variance (turbulence/noise) reduces confidence slightly
            confidence = max(0.5, min(0.98, 1.0 - math.sqrt(variance) * 0.1))
        else:
            confidence = 0.70

        if delta_h_excess >= self.blockage_threshold_cm:
            event = BlockageEventContract(
                section_id="SEC_SCREENING",
                probable_segment="PRIMARY_SCREENING_NET",
                severity=round(severity, 3),
                confidence=round(confidence, 2),
                differential_head_cm=round(delta_h_excess, 2),
                estimated_flow_drop_lpm=round(q_in * severity * 0.6, 2),
                detected_at=datetime.now(timezone.utc),
                is_active=True,
            )
            state_store.record_blockage(event)
            return event
        else:
            state_store.clear_active_blockage()
            return None


blockage_detector = BlockageDetector()
