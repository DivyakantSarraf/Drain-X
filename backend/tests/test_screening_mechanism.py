import pytest
from app.services.screening_mechanism import ScreeningMechanismSimulator
from app.models.contracts import MechanismState


def test_mechanism_initial_state():
    sim = ScreeningMechanismSimulator()
    status = sim.get_status()
    assert status.state == MechanismState.IDLE
    assert status.tray_height_cm == 0.0
    assert status.backup_net_angle_deg == 0.0
    assert status.is_jammed is False


def test_mechanism_full_successful_cycle():
    sim = ScreeningMechanismSimulator(
        stroke_height_cm=18.0,
        winch_speed_cm_s=18.0,   # Fast for testing (1.0s to hoist)
        servo_speed_deg_s=180.0, # Fast for testing (0.5s to deploy)
        discharge_dwell_s=1.0,
    )
    sim.accumulate_debris(80.0)
    assert sim.debris_retained_pct == 80.0

    # 1. Trigger cycle
    assert sim.trigger_cycle() is True
    assert sim.state == MechanismState.DEPLOYING_BACKUP_NET

    # Cannot trigger while running
    assert sim.trigger_cycle() is False

    # 2. Step through backup net deployment (0.5s)
    sim.step(0.6)
    assert sim.state == MechanismState.HOISTING
    assert sim.backup_net_angle_deg == 90.0

    # 3. Step through hoisting (1.0s)
    sim.step(1.1)
    assert sim.state == MechanismState.DISCHARGING
    assert sim.tray_height_cm == 18.0

    # 4. Step through discharge dwell (1.0s)
    sim.step(1.1)
    assert sim.state == MechanismState.LOWERING
    assert sim.debris_retained_pct == 0.0  # Waste cleared

    # 5. Step through lowering (1.0s)
    sim.step(1.1)
    assert sim.state == MechanismState.RETRACTING_BACKUP_NET
    assert sim.tray_height_cm == 0.0

    # 6. Step through backup net retraction (0.5s)
    sim.step(0.6)
    assert sim.state == MechanismState.IDLE
    assert sim.backup_net_angle_deg == 0.0
    assert sim.cycle_count == 1


def test_mechanism_jam_injection():
    sim = ScreeningMechanismSimulator(
        stroke_height_cm=18.0,
        winch_speed_cm_s=10.0,
        servo_speed_deg_s=360.0,
    )
    sim.inject_jam_on_hoist = True
    sim.trigger_cycle()

    # Step to deploy backup net
    sim.step(0.3)
    assert sim.state == MechanismState.HOISTING

    # Step into jam threshold (40% of 18cm = 7.2cm)
    sim.step(1.0)
    assert sim.state == MechanismState.JAMMED
    assert sim.is_jammed is True
    assert sim.error_code == "FAULT_WINCH_MECHANICAL_JAM"

    # Reset
    sim.manual_reset()
    assert sim.state == MechanismState.IDLE
    assert sim.is_jammed is False
    assert sim.tray_height_cm == 0.0
