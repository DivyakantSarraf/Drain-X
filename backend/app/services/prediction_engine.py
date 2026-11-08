from datetime import datetime, timezone
from typing import Optional

from app.models.contracts import (
    PredictionContract,
    PredictionState,
    SensorHealthStatus,
)
from app.services.state_store import state_store
from app.core.config import settings


class PredictionEngine:
    """
    Time-to-Critical (TTC) and Trend Estimation Engine.
    Employs robust moving-window linear regression on water depth:
      dh/dt = Cov(t, h) / Var(t)
    Predicts time remaining until overflow lip h_crit is breached.
    """

    def __init__(
        self,
        upstream_sensor_id: str = "US_UPSTREAM_01",
        window_size: int = 10,
        min_samples: int = 4,
        rising_threshold_cm_s: float = 0.015,
        horizon_s: float = 300.0,
    ):
        self.upstream_sensor_id = upstream_sensor_id
        self.window_size = window_size
        self.min_samples = min_samples
        self.rising_threshold_cm_s = rising_threshold_cm_s
        self.horizon_s = horizon_s
        self.critical_level_cm = settings.CRITICAL_WATER_DEPTH_CM

    def evaluate(self, sensor_id: Optional[str] = None) -> PredictionContract:
        """Computes water level rate of rise and TTC."""
        target_sensor = sensor_id or self.upstream_sensor_id
        history = state_store.get_sensor_history(target_sensor, limit=self.window_size)

        # Fallback to any active water level sensor if default is not populated
        if not history and sensor_id is None:
            latest = state_store.get_latest_readings()
            for sid, r in latest.items():
                if r.unit.value == "cm":
                    candidate_hist = state_store.get_sensor_history(sid, limit=self.window_size)
                    if candidate_hist:
                        target_sensor = sid
                        history = candidate_hist
                        break

        now = datetime.now(timezone.utc)

        # 1. Check data availability & sensor health
        if not history:
            pred = PredictionContract(
                section_id="SEC_SCREENING",
                state=PredictionState.UNAVAILABLE,
                ttc_seconds=None,
                confidence=0.0,
                rate_of_rise_cm_s=0.0,
                projected_level_cm=0.0,
                predicted_at=now,
            )
            state_store.set_prediction(pred)
            return pred

        latest_sample = history[-1]
        if latest_sample.status == SensorHealthStatus.FAULT:
            pred = PredictionContract(
                section_id="SEC_SCREENING",
                state=PredictionState.UNAVAILABLE,
                ttc_seconds=None,
                confidence=0.0,
                rate_of_rise_cm_s=0.0,
                projected_level_cm=0.0,
                predicted_at=now,
            )
            state_store.set_prediction(pred)
            return pred

        current_h = latest_sample.value

        # 2. Check immediate overflow condition
        if current_h >= self.critical_level_cm:
            pred = PredictionContract(
                section_id="SEC_SCREENING",
                state=PredictionState.OVERFLOW,
                ttc_seconds=0.0,
                confidence=1.0,
                rate_of_rise_cm_s=0.0,
                projected_level_cm=current_h,
                predicted_at=now,
            )
            state_store.set_prediction(pred)
            return pred

        # 3. Require minimum window size for trend linear regression
        if len(history) < self.min_samples:
            pred = PredictionContract(
                section_id="SEC_SCREENING",
                state=PredictionState.UNAVAILABLE,
                ttc_seconds=None,
                confidence=0.0,
                rate_of_rise_cm_s=0.0,
                projected_level_cm=0.0,
                predicted_at=now,
            )
            state_store.set_prediction(pred)
            return pred

        # 3. Calculate Rate of Rise (dh/dt) via Linear Regression
        # Normalize time offsets relative to oldest sample in window
        t0 = history[0].timestamp.timestamp()
        times = [s.timestamp.timestamp() - t0 for s in history]
        depths = [s.value for s in history]

        n = len(times)
        mean_t = sum(times) / n
        mean_h = sum(depths) / n

        var_t = sum((t - mean_t) ** 2 for t in times)
        cov_th = sum((t - mean_t) * (h - mean_h) for t, h in zip(times, depths))

        dh_dt = cov_th / var_t if var_t > 0.001 else 0.0

        # Calculate R^2 (coefficient of determination)
        ss_tot = sum((h - mean_h) ** 2 for h in depths)
        ss_res = sum((h - (mean_h + dh_dt * (t - mean_t))) ** 2 for t, h in zip(times, depths))
        r2 = max(0.0, 1.0 - (ss_res / ss_tot)) if ss_tot > 0.001 else 1.0

        projected_level = current_h + (dh_dt * 60.0)  # Projected in 1 minute

        # 4. State Determination: STABLE vs ESTIMATING
        if dh_dt <= self.rising_threshold_cm_s:
            # Water level is stable, falling, or negligible rise
            pred = PredictionContract(
                section_id="SEC_SCREENING",
                state=PredictionState.STABLE,
                ttc_seconds=None,
                confidence=round(r2, 2),
                rate_of_rise_cm_s=round(dh_dt, 4),
                projected_level_cm=round(projected_level, 2),
                predicted_at=now,
            )
        else:
            # Water level is rising significantly
            remaining_head = self.critical_level_cm - current_h
            ttc = remaining_head / dh_dt

            if ttc <= self.horizon_s:
                pred = PredictionContract(
                    section_id="SEC_SCREENING",
                    state=PredictionState.ESTIMATING,
                    ttc_seconds=round(ttc, 1),
                    confidence=round(r2, 2),
                    rate_of_rise_cm_s=round(dh_dt, 4),
                    projected_level_cm=round(projected_level, 2),
                    predicted_at=now,
                )
            else:
                # Rising, but does not threaten critical level within horizon
                pred = PredictionContract(
                    section_id="SEC_SCREENING",
                    state=PredictionState.STABLE,
                    ttc_seconds=None,
                    confidence=round(r2, 2),
                    rate_of_rise_cm_s=round(dh_dt, 4),
                    projected_level_cm=round(projected_level, 2),
                    predicted_at=now,
                )

        state_store.set_prediction(pred)
        return pred


prediction_engine = PredictionEngine()
