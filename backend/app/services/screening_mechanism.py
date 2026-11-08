import time
from datetime import datetime, timezone
from typing import Optional

from app.models.contracts import MechanismState, MechanismStatusContract


class ScreeningMechanismSimulator:
    """
    Configurable Simulation of the DRAIN-X electromechanical waste-removal mechanism.
    Models:
    - Primary stationary vertical screening net
    - Horizontal perforated lifting platform/tray on drain bed
    - Servo-actuated backup net (0 deg standby to 90 deg vertical barrier)
    - Overhead DC winch lifting mechanism
    - Full mechanical collection, discharge, and reset cycle
    - Configurable speeds, jams, timeouts, and failure injection
    """

    def __init__(
        self,
        stroke_height_cm: float = 18.0,
        winch_speed_cm_s: float = 4.5,
        servo_speed_deg_s: float = 180.0,
        discharge_dwell_s: float = 2.0,
    ):
        self.stroke_height_cm = stroke_height_cm
        self.winch_speed_cm_s = winch_speed_cm_s
        self.servo_speed_deg_s = servo_speed_deg_s
        self.discharge_dwell_s = discharge_dwell_s

        # Live State
        self.state = MechanismState.IDLE
        self.backup_net_angle_deg = 0.0  # 0 = horizontal (standby), 90 = vertical (barrier)
        self.tray_height_cm = 0.0        # 0 = drain bed (collection position)
        self.debris_retained_pct = 0.0   # Percentage of debris currently accumulated on tray
        self.cycle_count = 0
        self.elapsed_in_state = 0.0
        self.current_action = "Mechanism idle on drain bed"
        self.is_jammed = False
        self.is_fault = False
        self.error_code: Optional[str] = None
        self.last_cycle_completed_at: Optional[datetime] = None

        # Fault Injection Triggers
        self.inject_jam_on_hoist = False
        self.inject_servo_failure = False

    def trigger_cycle(self) -> bool:
        """Initiates an automated waste-removal cycle if currently IDLE."""
        if self.state != MechanismState.IDLE:
            return False
        if self.is_jammed or self.is_fault:
            return False

        self.state = MechanismState.DEPLOYING_BACKUP_NET
        self.elapsed_in_state = 0.0
        self.current_action = "Deploying backup net (servo rotating to 90 deg)"
        return True

    def manual_reset(self) -> None:
        """Resets mechanism from JAMMED or FAILED state back to IDLE on the drain bed."""
        self.state = MechanismState.IDLE
        self.backup_net_angle_deg = 0.0
        self.tray_height_cm = 0.0
        self.elapsed_in_state = 0.0
        self.is_jammed = False
        self.is_fault = False
        self.error_code = None
        self.inject_jam_on_hoist = False
        self.inject_servo_failure = False
        self.current_action = "Mechanism reset to drain bed (IDLE)"

    def accumulate_debris(self, delta_pct: float) -> None:
        """Simulates accumulation of debris on the tray/net during normal water flow."""
        self.debris_retained_pct = min(100.0, max(0.0, self.debris_retained_pct + delta_pct))

    def step(self, dt: float) -> MechanismStatusContract:
        """
        Advances the mechanical simulation by dt seconds.
        Handles kinematics and state machine transitions.
        """
        self.elapsed_in_state += dt

        if self.state == MechanismState.IDLE:
            self.current_action = "Tray resting on drain bed; backup net in standby"
            self.tray_height_cm = 0.0
            self.backup_net_angle_deg = 0.0

        elif self.state == MechanismState.DEPLOYING_BACKUP_NET:
            if self.inject_servo_failure:
                self.state = MechanismState.FAILED
                self.is_fault = True
                self.error_code = "FAULT_SERVO_ACTUATOR_STALLED"
                self.current_action = "Servo failed to deploy backup net"
                return self.get_status()

            # Rotate servo towards 90 deg
            angle_step = self.servo_speed_deg_s * dt
            self.backup_net_angle_deg = min(90.0, self.backup_net_angle_deg + angle_step)
            self.current_action = f"Rotating backup net: {self.backup_net_angle_deg:.0f}°/90°"

            if self.backup_net_angle_deg >= 90.0:
                self.state = MechanismState.HOISTING
                self.elapsed_in_state = 0.0
                self.current_action = "Backup net locked vertical; winch hoisting tray"

        elif self.state == MechanismState.HOISTING:
            # Hoist tray upwards
            height_step = self.winch_speed_cm_s * dt
            self.tray_height_cm = min(self.stroke_height_cm, self.tray_height_cm + height_step)
            self.current_action = f"Hoisting collection tray: {self.tray_height_cm:.1f} cm / {self.stroke_height_cm:.1f} cm"

            if self.inject_jam_on_hoist and self.tray_height_cm >= (self.stroke_height_cm * 0.4):
                self.state = MechanismState.JAMMED
                self.is_jammed = True
                self.error_code = "FAULT_WINCH_MECHANICAL_JAM"
                self.current_action = f"Winch carriage jammed at {self.tray_height_cm:.1f} cm"
                return self.get_status()

            if self.tray_height_cm >= self.stroke_height_cm:
                self.state = MechanismState.DISCHARGING
                self.elapsed_in_state = 0.0
                self.current_action = "Dumping solid waste into surface hopper"

        elif self.state == MechanismState.DISCHARGING:
            self.current_action = f"Discharging waste ({self.elapsed_in_state:.1f}s / {self.discharge_dwell_s:.1f}s)"
            # Gradually clear debris during dump
            dump_fraction = min(1.0, self.elapsed_in_state / self.discharge_dwell_s)
            self.debris_retained_pct = max(0.0, self.debris_retained_pct * (1.0 - dump_fraction * dt * 2.0))

            if self.elapsed_in_state >= self.discharge_dwell_s:
                self.debris_retained_pct = 0.0  # Cleared
                self.state = MechanismState.LOWERING
                self.elapsed_in_state = 0.0
                self.current_action = "Waste dumped; lowering empty tray to drain bed"

        elif self.state == MechanismState.LOWERING:
            # Lower tray downwards
            height_step = self.winch_speed_cm_s * dt
            self.tray_height_cm = max(0.0, self.tray_height_cm - height_step)
            self.current_action = f"Lowering collection tray: {self.tray_height_cm:.1f} cm"

            if self.tray_height_cm <= 0.0:
                self.tray_height_cm = 0.0
                self.state = MechanismState.RETRACTING_BACKUP_NET
                self.elapsed_in_state = 0.0
                self.current_action = "Tray seated on drain bed; retracting backup net"

        elif self.state == MechanismState.RETRACTING_BACKUP_NET:
            # Rotate servo back to 0 deg
            angle_step = self.servo_speed_deg_s * dt
            self.backup_net_angle_deg = max(0.0, self.backup_net_angle_deg - angle_step)
            self.current_action = f"Retracting backup net: {self.backup_net_angle_deg:.0f}° -> 0°"

            if self.backup_net_angle_deg <= 0.0:
                self.backup_net_angle_deg = 0.0
                self.state = MechanismState.IDLE
                self.elapsed_in_state = 0.0
                self.cycle_count += 1
                self.last_cycle_completed_at = datetime.now(timezone.utc)
                self.current_action = "Intervention cycle completed successfully; mechanism idle"

        return self.get_status()

    def get_status(self) -> MechanismStatusContract:
        return MechanismStatusContract(
            state=self.state,
            backup_net_angle_deg=round(self.backup_net_angle_deg, 1),
            tray_height_cm=round(self.tray_height_cm, 1),
            cycle_count=self.cycle_count,
            current_action=self.current_action,
            elapsed_in_state_s=round(self.elapsed_in_state, 2),
            is_jammed=self.is_jammed,
            is_fault=self.is_fault,
            debris_retained_pct=round(self.debris_retained_pct, 1),
            last_cycle_completed_at=self.last_cycle_completed_at,
        )
