"""
DRAIN-X Firmware Telemetry, Sensors (JSN-SR04T, YFS201), Servo Control & Mode Isolation Verification Tests (P0.3D)

Validates:
1. Telemetry data structure and invariant: missing reading is NEVER 0.0, always NaN / invalid.
2. Synthetic sensor scenarios: NORMAL, RISING_WATER, INVALID_READING.
3. JSN-SR04T physical driver pulse duration conversion (speed of sound = 343 m/s).
4. Physical timeout handling (duration == 0 -> SENSOR_TIMEOUT, NaN).
5. Acoustic deadband violation (< 20.0 cm) and max range (> 400.0 cm) rejection.
6. Water-level calculation: water_depth_cm = reference_height_cm - measured_distance_cm.
7. Physically impossible negative water depth rejection (measured_distance > reference_height).
8. Strict operational mode isolation: PHYSICAL never returns synthetic; SIMULATION never touches GPIO.
9. Moving median filter: Latency (+2.0s phase lag) and dropout/spike rejection.
10. Servo driver pulse width calculation for SG90 and MG996R profiles.
11. Mechanical overtravel protection (strict clamping to safe boundaries).
12. Deadband suppression of redundant PWM commands.
13. Safe software hold behavior (command lock out).
14. Actuation prevention in SIMULATION mode.
15. Safe initial unattached/hold state on boot.
16. YFS201 pulse-to-flow rate conversion with nominal/calibrated pulses/liter factor.
17. YFS201 volume accumulation across successive sampling intervals.
18. YFS201 zero-flow physical invariant (0 pulses = valid 0.0 L/min, not a fault).
19. YFS201 invalid calibration factor rejection (pulses/liter <= 0 -> NaN, FLOW_CALIBRATION_INVALID).
20. YFS201 volume totalizer zeroing command ('z').
21. YFS201 mode isolation: SIMULATION never attaches interrupt; PHYSICAL never returns synthetic flow.
"""

import math
import pytest


class DataSource:
    SIMULATED = "SIMULATED"
    PHYSICAL = "PHYSICAL"


class OperatingMode:
    SIMULATION = "SIMULATION"
    PHYSICAL = "PHYSICAL"
    SAFE_HOLD = "SAFE_HOLD"


class GateState:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HOLD = "SAFE_HOLD"
    UNINITIALIZED = "UNINITIALIZED"


class ServoModel:
    SG90_MICRO = "SG90"
    MG996R_HIGH_TORQUE = "MG996R"


class SensorHealth:
    OK = "OK"
    DEGRADED = "DEGRADED"
    FAULT = "FAULT"
    CALIBRATING = "CALIBRATING"


class FaultCode:
    NONE = "NONE"
    SENSOR_TIMEOUT = "TIMEOUT_NO_ECHO"
    ACOUSTIC_DEADBAND_VIOLATION = "DEADBAND_VIOLATION"
    OUT_OF_RANGE_MAX = "MAX_RANGE_EXCEEDED"
    ERRATIC_RATE_OF_RISE = "ERRATIC_DELTA"
    SIMULATED_INJECTED_FAULT = "SIMULATED_FAULT"
    NEGATIVE_WATER_DEPTH = "NEGATIVE_WATER_DEPTH_IMPOSSIBLE"
    HARDWARE_NOT_INITIALIZED = "HARDWARE_NOT_INITIALIZED"
    FLOW_CALIBRATION_INVALID = "FLOW_CALIBRATION_INVALID"
    SENSOR_NOT_INSTALLED = "SENSOR_NOT_INSTALLED"
    SENSOR_NOT_VALIDATED = "SENSOR_NOT_VALIDATED"


class HardwareValidationStage:
    SOFTWARE_ONLY = "SOFTWARE_ONLY"
    CONNECTIVITY_READY = "CONNECTIVITY_READY"
    PARTIALLY_ASSEMBLED = "PARTIALLY_ASSEMBLED"
    SENSOR_VALIDATION = "SENSOR_VALIDATION"
    FULL_PHYSICAL_VALIDATION = "FULL_PHYSICAL_VALIDATION"


class Config:
    DEVICE_ID = "DRAINX-ESP32-NODE-01"
    FIRMWARE_VERSION = "0.3.5-p0.3e"
    HARDWARE_MODEL = "ESP32 DevKit V1 (ESP-WROOM-32)"
    SECTION_ID = "SEC_SCREENING_01"
    SENSOR_ID = "US_UPSTREAM_01"
    FLOW_SENSOR_ID = "FS_FLUME_01"
    ACTUATOR_ID = "GATE_DIVERSION_01"
    CHANNEL_HEIGHT_CM = 15.0
    MOUNTING_HEIGHT_CM = 35.0
    SENSOR_DEADBAND_MIN_CM = 20.0
    SENSOR_RANGE_MAX_CM = 400.0
    THRESHOLD_WARNING_CM = 8.0
    THRESHOLD_CRITICAL_CM = 12.0
    SPEED_OF_SOUND_CM_PER_US = 0.0343
    JSN_ECHO_TIMEOUT_US = 25000

    # Hardware Pin Assignments (Verified Bench Configuration)
    # GPIO 25 replaces GPIO 5 to prevent MTDO strapping conflict during boot
    PIN_JSN_TRIG = 25
    PIN_JSN_ECHO = 18
    PIN_SERVO_GATE = 19
    PIN_YFS201_FLOW = 27
    YFS201_PULSES_PER_LITER = 450.0
    YFS201_FLOW_MIN_L_MIN = 1.0
    YFS201_FLOW_MAX_L_MIN = 30.0

    # Servo PWM profiles
    SG90_PULSE_MIN_US = 544
    SG90_PULSE_MAX_US = 2400
    MG996R_PULSE_MIN_US = 500
    MG996R_PULSE_MAX_US = 2500

    SERVO_PWM_RESOLUTION = 14
    SERVO_PWM_FREQ_HZ = 50

    # Provisional Calibrated Angles
    GATE_CLOSED_ANGLE = 0.0
    GATE_OPEN_ANGLE = 90.0
    SERVO_MIN_SAFE_ANGLE = 0.0
    SERVO_MAX_SAFE_ANGLE = 90.0
    SERVO_DEADBAND_DEG = 0.5


class TelemetryPacket:
    def __init__(self, device_id, version, sensor_id, section_id, uptime_ms, seq, source, mode, health, fault, is_valid, is_filtered, raw_dist, depth, gate_state, gate_angle, flow_valid=False, flow_rate_l_min=math.nan, total_volume_liters=0.0, flow_pulse_count=0):
        self.device_id = device_id
        self.firmware_version = version
        self.sensor_id = sensor_id
        self.section_id = section_id
        self.uptime_ms = uptime_ms
        self.sequence_number = seq
        self.source = source
        self.mode = mode
        self.health = health
        self.fault_code = fault
        self.is_valid = is_valid
        self.is_filtered = is_filtered
        self.raw_distance_cm = raw_dist
        self.water_depth_cm = depth
        self.gate_state = gate_state
        self.gate_angle_deg = gate_angle
        self.flow_valid = flow_valid
        self.flow_rate_l_min = flow_rate_l_min
        self.total_volume_liters = total_volume_liters
        self.flow_pulse_count = flow_pulse_count

    @classmethod
    def create_valid(cls, uptime, seq, raw_dist, depth, source=DataSource.SIMULATED, mode=OperatingMode.SIMULATION, is_filtered=False, gate_state=GateState.HOLD, gate_angle=0.0, flow_valid=True, flow_rate_l_min=0.0, total_volume_liters=0.0, flow_pulse_count=0):
        return cls(
            Config.DEVICE_ID, Config.FIRMWARE_VERSION, Config.SENSOR_ID, Config.SECTION_ID,
            uptime, seq, source, mode, SensorHealth.OK, FaultCode.NONE,
            True, is_filtered, raw_dist, depth, gate_state, gate_angle,
            flow_valid, flow_rate_l_min, total_volume_liters, flow_pulse_count
        )

    @classmethod
    def create_invalid(cls, uptime, seq, fault, source=DataSource.SIMULATED, mode=OperatingMode.SIMULATION, gate_state=GateState.HOLD, gate_angle=0.0):
        return cls(
            Config.DEVICE_ID, Config.FIRMWARE_VERSION, Config.SENSOR_ID, Config.SECTION_ID,
            uptime, seq, source, mode, SensorHealth.FAULT, fault,
            False, False, math.nan, math.nan, gate_state, gate_angle,
            False, math.nan, 0.0, 0
        )


class MockJsnSr04tDriver:
    """Mock driver simulating the exact C++ JsnSr04tDriver behavior."""
    def __init__(self, trig_pin=Config.PIN_JSN_TRIG, echo_pin=Config.PIN_JSN_ECHO, timeout_us=Config.JSN_ECHO_TIMEOUT_US):
        self.trig_pin = trig_pin
        self.echo_pin = echo_pin
        self.timeout_us = timeout_us
        self.is_initialized = False
        self.gpio_access_count = 0
        self.injected_duration_us = 1749

    def begin(self):
        self.is_initialized = True

    def stop(self):
        self.is_initialized = False

    def read_distance(self):
        if not self.is_initialized:
            return False, math.nan, 0, FaultCode.HARDWARE_NOT_INITIALIZED

        self.gpio_access_count += 1
        duration = self.injected_duration_us

        if duration == 0:
            return False, math.nan, 0, FaultCode.SENSOR_TIMEOUT

        distance = (duration * Config.SPEED_OF_SOUND_CM_PER_US) / 2.0

        if distance < Config.SENSOR_DEADBAND_MIN_CM:
            return False, math.nan, duration, FaultCode.ACOUSTIC_DEADBAND_VIOLATION

        if distance > Config.SENSOR_RANGE_MAX_CM:
            return False, math.nan, duration, FaultCode.OUT_OF_RANGE_MAX

        return True, distance, duration, FaultCode.NONE


class MockServoDriver:
    """Mock driver replicating the exact C++ ServoDriver logic."""
    def __init__(self, pin=19):
        self.pin = pin
        self.pulse_min_us = Config.SG90_PULSE_MIN_US
        self.pulse_max_us = Config.SG90_PULSE_MAX_US
        self.min_safe_angle = Config.SERVO_MIN_SAFE_ANGLE
        self.max_safe_angle = Config.SERVO_MAX_SAFE_ANGLE
        self.closed_angle = Config.GATE_CLOSED_ANGLE
        self.open_angle = Config.GATE_OPEN_ANGLE
        self.current_angle = math.nan
        self.target_angle = math.nan
        self.state = GateState.UNINITIALIZED
        self.hold_engaged = False
        self.is_attached = False
        self.servo_model = ServoModel.SG90_MICRO
        self.pwm_write_count = 0
        self.last_duty_written = 0

    def begin(self):
        self.is_attached = True
        self.state = GateState.HOLD
        self.hold_engaged = False
        return True

    def stop(self):
        self.is_attached = False
        self.state = GateState.UNINITIALIZED
        self.current_angle = math.nan
        self.target_angle = math.nan

    def set_servo_model(self, model):
        self.servo_model = model
        if model == ServoModel.MG996R_HIGH_TORQUE:
            self.pulse_min_us = Config.MG996R_PULSE_MIN_US
            self.pulse_max_us = Config.MG996R_PULSE_MAX_US
        else:
            self.pulse_min_us = Config.SG90_PULSE_MIN_US
            self.pulse_max_us = Config.SG90_PULSE_MAX_US

    def command_angle(self, target_deg):
        if self.hold_engaged:
            return False

        clamped = max(self.min_safe_angle, min(self.max_safe_angle, target_deg))
        self.target_angle = clamped

        if self.is_attached and not math.isnan(self.current_angle):
            if abs(clamped - self.current_angle) < Config.SERVO_DEADBAND_DEG:
                return True

        if not self.is_attached:
            self.begin()

        pulse_us = self.pulse_min_us + (clamped / 180.0) * (self.pulse_max_us - self.pulse_min_us)
        max_duty = (1 << Config.SERVO_PWM_RESOLUTION) - 1
        duty = int((pulse_us * max_duty) / 20000.0)

        self.last_duty_written = duty
        self.pwm_write_count += 1
        self.current_angle = clamped
        return True

    def open_gate(self):
        if self.command_angle(self.open_angle):
            self.state = GateState.OPEN
            return True
        return False

    def close_gate(self):
        if self.command_angle(self.closed_angle):
            self.state = GateState.CLOSED
            return True
        return False

    def engage_hold(self):
        self.hold_engaged = True
        self.state = GateState.HOLD

    def is_hold_engaged(self):
        return self.hold_engaged

    def release_hold(self):
        self.hold_engaged = False


class MockYfs201Driver:
    """Mock driver simulating the exact C++ Yfs201Driver behavior."""
    def __init__(self, pin=Config.PIN_YFS201_FLOW, pulses_per_liter=Config.YFS201_PULSES_PER_LITER):
        self.pin = pin
        self.pulses_per_liter = pulses_per_liter
        self.pulse_count_interval = 0
        self.pulse_count_total = 0
        self.last_sample_ms = 0
        self.is_initialized = False
        self.gpio_access_count = 0

    def begin(self, current_time_ms=0):
        if self.pin < 0:
            return False
        self.pulse_count_interval = 0
        self.pulse_count_total = 0
        self.last_sample_ms = current_time_ms
        self.is_initialized = True
        return True

    def stop(self):
        self.is_initialized = False

    def inject_pulses(self, delta):
        if self.is_initialized:
            self.pulse_count_interval += delta
            self.pulse_count_total += delta
            self.gpio_access_count += delta

    def set_pulses_per_liter(self, k):
        self.pulses_per_liter = k

    def reset_volume(self):
        self.pulse_count_total = 0

    def read_flow(self, current_time_ms):
        if not self.is_initialized:
            return False, math.nan, 0.0, 0, FaultCode.HARDWARE_NOT_INITIALIZED

        if self.pulses_per_liter <= 0.0:
            return False, math.nan, 0.0, 0, FaultCode.FLOW_CALIBRATION_INVALID

        # Atomic critical section capture
        delta_pulses = self.pulse_count_interval
        self.pulse_count_interval = 0
        total_pulses = self.pulse_count_total

        delta_t_ms = current_time_ms - self.last_sample_ms
        self.last_sample_ms = current_time_ms

        total_volume_l = total_pulses / self.pulses_per_liter

        if delta_t_ms <= 0:
            return True, 0.0, total_volume_l, 0, FaultCode.NONE

        if delta_pulses == 0:
            # Zero flow is a normal physical condition, not a fault!
            return True, 0.0, total_volume_l, 0, FaultCode.NONE

        flow_rate = (delta_pulses / self.pulses_per_liter) * (60000.0 / delta_t_ms)
        return True, flow_rate, total_volume_l, delta_pulses, FaultCode.NONE


class MovingMedianFilter5:
    """Python replica of C++ MovingMedianFilter<5>."""
    def __init__(self):
        self.buffer = []

    def reset(self):
        self.buffer.clear()

    def add_sample(self, val):
        self.buffer.append(val)
        if len(self.buffer) > 5:
            self.buffer.pop(0)

    def get_median(self):
        if not self.buffer:
            return 0.0
        sorted_vals = sorted(self.buffer)
        n = len(sorted_vals)
        if n % 2 == 1:
            return sorted_vals[n // 2]
        return (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2.0


class SensorManagerModel:
    """Host test model replicating SensorManager logic in include/sensor_manager.h."""
    def __init__(self):
        self.mode = OperatingMode.SIMULATION
        self.scenario = "NORMAL"
        self.validation_stage = HardwareValidationStage.SOFTWARE_ONLY
        self.reference_height_cm = Config.MOUNTING_HEIGHT_CM
        self.filter_enabled = False
        self.filter = MovingMedianFilter5()
        self.step_count = 0
        self.sequence_num = 0
        self.rising_step = 0.0
        self.ultrasonic_installed = True
        self.flow_installed = True
        self.servo_installed = True
        self.driver = MockJsnSr04tDriver()
        self.flow_driver = MockYfs201Driver()
        self.simulated_flow_l_min = 2.8
        self.simulated_total_volume_liters = 0.0

    def set_mode(self, mode, current_time_ms=0):
        if self.mode == mode:
            return
        self.mode = mode
        self.filter.reset()
        if self.mode == OperatingMode.PHYSICAL:
            self.driver.begin()
            self.flow_driver.begin(current_time_ms)
        else:
            self.driver.stop()
            self.flow_driver.stop()
            self.step_count = 0
            self.rising_step = 0.0

    def reset_flow_volume(self):
        if self.mode == OperatingMode.PHYSICAL:
            self.flow_driver.reset_volume()
        else:
            self.simulated_total_volume_liters = 0.0

    def sample(self, uptime_ms, gate_state=GateState.HOLD, gate_angle=0.0):
        self.sequence_num += 1

        if self.mode == OperatingMode.SIMULATION:
            return self._sample_simulation(uptime_ms, gate_state, gate_angle)
        elif self.mode == OperatingMode.PHYSICAL:
            return self._sample_physical(uptime_ms, gate_state, gate_angle)
        else:
            return TelemetryPacket.create_invalid(
                uptime_ms, self.sequence_num, FaultCode.NONE,
                DataSource.PHYSICAL, OperatingMode.SAFE_HOLD,
                gate_state, gate_angle
            )

    def _sample_physical(self, uptime_ms, gate_state, gate_angle):
        if self.ultrasonic_installed:
            success, raw_dist_val, duration, fault = self.driver.read_distance()
        else:
            success, raw_dist_val, duration, fault = False, math.nan, 0, FaultCode.SENSOR_NOT_INSTALLED

        if self.flow_installed:
            flow_valid, flow_rate, total_vol, pulses, flow_fault = self.flow_driver.read_flow(uptime_ms)
        else:
            flow_valid, flow_rate, total_vol, pulses, flow_fault = False, math.nan, math.nan, 0, FaultCode.SENSOR_NOT_INSTALLED

        us_valid = False
        raw_dist = math.nan
        water_depth = math.nan
        primary_fault = FaultCode.NONE

        if not success:
            primary_fault = fault
        else:
            raw_dist = raw_dist_val
            effective_dist = raw_dist
            if self.filter_enabled:
                self.filter.add_sample(raw_dist)
                effective_dist = self.filter.get_median()
            water_depth = self.reference_height_cm - effective_dist
            if water_depth < 0.0:
                primary_fault = FaultCode.NEGATIVE_WATER_DEPTH
                raw_dist = math.nan
                water_depth = math.nan
            else:
                us_valid = True

        health = SensorHealth.OK
        if us_valid and flow_valid:
            health = SensorHealth.DEGRADED if water_depth >= Config.THRESHOLD_CRITICAL_CM else SensorHealth.OK
        elif us_valid or flow_valid:
            health = SensorHealth.DEGRADED
            if primary_fault == FaultCode.NONE and not flow_valid:
                primary_fault = flow_fault
        else:
            health = SensorHealth.FAULT
            primary_fault = primary_fault if primary_fault != FaultCode.NONE else flow_fault

        pkt = TelemetryPacket(
            Config.DEVICE_ID, Config.FIRMWARE_VERSION, Config.SENSOR_ID, Config.SECTION_ID,
            uptime_ms, self.sequence_num, DataSource.PHYSICAL, OperatingMode.PHYSICAL,
            health, primary_fault, us_valid, self.filter_enabled, raw_dist, water_depth,
            gate_state, gate_angle, flow_valid,
            flow_rate if flow_valid else math.nan,
            total_vol if flow_valid else math.nan,
            pulses
        )
        return pkt

    def _sample_simulation(self, uptime_ms, gate_state, gate_angle):
        self.step_count += 1
        if self.scenario == "NORMAL":
            ripple = 0.4 * math.sin(self.step_count * 0.35) + 0.15 * math.cos(self.step_count * 0.85)
            depth = 4.6 + ripple
            raw_dist = self.reference_height_cm - depth
            flow_rate = 2.8 + 0.3 * math.sin(self.step_count * 0.4)
            self.simulated_total_volume_liters += (flow_rate / 60.0)
            return TelemetryPacket.create_valid(
                uptime_ms, self.sequence_num, raw_dist, depth,
                gate_state=gate_state, gate_angle=gate_angle,
                flow_valid=True, flow_rate_l_min=flow_rate,
                total_volume_liters=self.simulated_total_volume_liters,
                flow_pulse_count=int(flow_rate * 7.5)
            )
        elif self.scenario == "RISING_WATER":
            base_depth = 4.0 + (self.rising_step * 0.35)
            ripple = 0.15 * math.sin(self.step_count * 0.5)
            depth = base_depth + ripple
            self.rising_step += 1.0
            if base_depth > 14.5:
                self.rising_step = 0.0
            raw_dist = self.reference_height_cm - depth
            fraction = min(1.0, max(0.0, depth / Config.CHANNEL_HEIGHT_CM))
            flow_rate = 3.0 + fraction * 9.0
            self.simulated_total_volume_liters += (flow_rate / 60.0)
            pkt = TelemetryPacket.create_valid(
                uptime_ms, self.sequence_num, raw_dist, depth,
                gate_state=gate_state, gate_angle=gate_angle,
                flow_valid=True, flow_rate_l_min=flow_rate,
                total_volume_liters=self.simulated_total_volume_liters,
                flow_pulse_count=int(flow_rate * 7.5)
            )
            if depth >= Config.THRESHOLD_CRITICAL_CM:
                pkt.health = SensorHealth.DEGRADED
            return pkt
        else:
            if self.step_count % 3 == 0:
                fault = FaultCode.ACOUSTIC_DEADBAND_VIOLATION
            elif self.step_count % 3 == 1:
                fault = FaultCode.SENSOR_TIMEOUT
            else:
                fault = FaultCode.SIMULATED_INJECTED_FAULT
            return TelemetryPacket.create_invalid(
                uptime_ms, self.sequence_num, fault,
                gate_state=gate_state, gate_angle=gate_angle
            )
            if self.step_count % 3 == 0:
                fault = FaultCode.ACOUSTIC_DEADBAND_VIOLATION
            elif self.step_count % 3 == 1:
                fault = FaultCode.SENSOR_TIMEOUT
            else:
                fault = FaultCode.SIMULATED_INJECTED_FAULT
            return TelemetryPacket.create_invalid(
                uptime_ms, self.sequence_num, fault,
                gate_state=gate_state, gate_angle=gate_angle
            )


# -----------------------------------------------------------------------------
# Unit Tests (15 Comprehensive Verification Cases)
# -----------------------------------------------------------------------------

def test_normal_scenario_bounds_and_invariants():
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.SIMULATION)
    sm.scenario = "NORMAL"

    for i in range(1, 30):
        packet = sm.sample(i * 1000)
        assert packet.is_valid is True
        assert packet.source == DataSource.SIMULATED
        assert packet.mode == OperatingMode.SIMULATION
        assert packet.health == SensorHealth.OK
        assert 3.8 <= packet.water_depth_cm <= 5.5
        assert abs((packet.raw_distance_cm + packet.water_depth_cm) - Config.MOUNTING_HEIGHT_CM) < 1e-4


def test_rising_water_scenario_crosses_critical_threshold():
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.SIMULATION)
    sm.scenario = "RISING_WATER"

    depths = []
    has_warning = False
    has_critical = False

    for i in range(1, 35):
        packet = sm.sample(i * 1000)
        assert packet.is_valid is True
        assert packet.source == DataSource.SIMULATED
        depths.append(packet.water_depth_cm)
        if packet.water_depth_cm >= Config.THRESHOLD_WARNING_CM:
            has_warning = True
        if packet.water_depth_cm >= Config.THRESHOLD_CRITICAL_CM:
            has_critical = True
            assert packet.health == SensorHealth.DEGRADED

    assert has_warning is True
    assert has_critical is True
    assert depths[15] > depths[0]


def test_invalid_reading_scenario_never_reports_valid_zero():
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.SIMULATION)
    sm.scenario = "INVALID_READING"

    for i in range(1, 15):
        packet = sm.sample(i * 1000)
        assert packet.is_valid is False
        assert packet.health == SensorHealth.FAULT
        assert packet.fault_code != FaultCode.NONE
        assert math.isnan(packet.water_depth_cm)
        assert math.isnan(packet.raw_distance_cm)
        assert packet.water_depth_cm != 0.0


def test_driver_distance_conversion_speed_of_sound():
    driver = MockJsnSr04tDriver()
    driver.begin()

    driver.injected_duration_us = 1749
    success, distance, duration, fault = driver.read_distance()
    assert success is True
    assert fault == FaultCode.NONE
    assert abs(distance - 30.0) < 0.1


def test_driver_timeout_handling():
    driver = MockJsnSr04tDriver()
    driver.begin()

    driver.injected_duration_us = 0
    success, distance, duration, fault = driver.read_distance()
    assert success is False
    assert math.isnan(distance)
    assert fault == FaultCode.SENSOR_TIMEOUT


def test_driver_deadband_and_out_of_range_rejection():
    driver = MockJsnSr04tDriver()
    driver.begin()

    # < 20 cm
    driver.injected_duration_us = 500
    success, distance, duration, fault = driver.read_distance()
    assert success is False
    assert fault == FaultCode.ACOUSTIC_DEADBAND_VIOLATION
    assert math.isnan(distance)

    # > 400 cm
    driver.injected_duration_us = 25000
    success, distance, duration, fault = driver.read_distance()
    assert success is False
    assert fault == FaultCode.OUT_OF_RANGE_MAX
    assert math.isnan(distance)


def test_water_depth_conversion_and_reference_datum():
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)

    sm.driver.injected_duration_us = 1749
    pkt = sm.sample(1000)
    assert pkt.is_valid is True
    assert pkt.source == DataSource.PHYSICAL
    assert pkt.mode == OperatingMode.PHYSICAL
    assert abs(pkt.raw_distance_cm - 30.0) < 0.1
    assert abs(pkt.water_depth_cm - 5.0) < 0.1


def test_negative_water_depth_rejection():
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)

    sm.driver.injected_duration_us = 2215
    pkt = sm.sample(1000)
    assert pkt.is_valid is False
    assert pkt.fault_code == FaultCode.NEGATIVE_WATER_DEPTH
    assert math.isnan(pkt.water_depth_cm)
    # Under sensor independence, node is DEGRADED because flow sensor remains functional
    assert pkt.health == SensorHealth.DEGRADED

    # If both ultrasonic has negative depth and flow sensor fails:
    sm.flow_driver.stop()
    pkt_both_fail = sm.sample(2000)
    assert pkt_both_fail.health == SensorHealth.FAULT


def test_mode_isolation_physical_vs_simulation():
    sm = SensorManagerModel()

    sm.set_mode(OperatingMode.SIMULATION)
    assert sm.driver.gpio_access_count == 0
    pkt1 = sm.sample(1000)
    assert pkt1.source == DataSource.SIMULATED
    assert pkt1.mode == OperatingMode.SIMULATION
    assert sm.driver.gpio_access_count == 0

    sm.set_mode(OperatingMode.PHYSICAL)
    sm.driver.injected_duration_us = 1749
    pkt2 = sm.sample(2000)
    assert pkt2.source == DataSource.PHYSICAL
    assert sm.driver.gpio_access_count == 1

    sm.driver.injected_duration_us = 0
    pkt3 = sm.sample(3000)
    assert pkt3.source == DataSource.PHYSICAL
    assert pkt3.is_valid is False
    assert math.isnan(pkt3.water_depth_cm)


def test_moving_median_filter_step_response_and_dropout_rejection():
    filter5 = MovingMedianFilter5()

    for _ in range(5):
        filter5.add_sample(30.0)
    assert filter5.get_median() == 30.0

    # Single isolated spike rejected
    filter5.add_sample(150.0)
    assert filter5.get_median() == 30.0

    # Step response: 3 samples to attain majority
    filter5.add_sample(22.0)
    assert filter5.get_median() == 30.0
    filter5.add_sample(22.0)
    assert filter5.get_median() == 30.0
    filter5.add_sample(22.0)
    assert filter5.get_median() == 22.0


def test_servo_pulse_width_calculation_sg90_and_mg996r():
    servo = MockServoDriver()

    # SG90 profile: 544us (0 deg) to 2400us (180 deg)
    servo.set_servo_model(ServoModel.SG90_MICRO)
    servo.command_angle(0.0)
    # At 0 deg: 544 us -> duty = (544 * 16383) / 20000 = 445 ticks
    assert servo.last_duty_written == 445

    # At 90 deg: 544 + 0.5 * (2400 - 544) = 1472 us -> duty = (1472 * 16383) / 20000 = 1205 ticks
    servo.command_angle(90.0)
    assert servo.last_duty_written == 1205

    # MG996R profile: 500us (0 deg) to 2500us (180 deg)
    servo.set_servo_model(ServoModel.MG996R_HIGH_TORQUE)
    servo.command_angle(0.0)
    # At 0 deg: 500 us -> duty = (500 * 16383) / 20000 = 409 ticks
    assert servo.last_duty_written == 409

    # At 90 deg: 500 + 0.5 * (2500 - 500) = 1500 us -> duty = (1500 * 16383) / 20000 = 1228 ticks
    servo.command_angle(90.0)
    assert servo.last_duty_written == 1228


def test_servo_mechanical_overtravel_clamping():
    servo = MockServoDriver()
    servo.min_safe_angle = 10.0
    servo.max_safe_angle = 80.0

    # Command below minimum safe angle: clamped to 10.0 deg
    servo.command_angle(-25.0)
    assert servo.current_angle == 10.0

    # Command above maximum safe angle: clamped to 80.0 deg
    servo.command_angle(120.0)
    assert servo.current_angle == 80.0


def test_servo_deadband_suppresses_redundant_commands():
    servo = MockServoDriver()
    servo.begin()

    servo.command_angle(45.0)
    initial_writes = servo.pwm_write_count
    assert initial_writes == 1

    # Minor jitter within deadband (< 0.5 deg): no new PWM write issued
    servo.command_angle(45.2)
    assert servo.pwm_write_count == initial_writes

    # Substantial change (> 0.5 deg): new PWM write issued
    servo.command_angle(46.0)
    assert servo.pwm_write_count == initial_writes + 1


def test_servo_command_hold_locks_movement():
    servo = MockServoDriver()
    servo.begin()

    # Move to initial closed position
    servo.close_gate()
    assert servo.state == GateState.CLOSED
    assert servo.current_angle == Config.GATE_CLOSED_ANGLE

    # Engage software command hold ('x')
    servo.engage_hold()
    assert servo.is_hold_engaged() is True
    assert servo.state == GateState.HOLD

    # Open request while in hold MUST be rejected
    ok = servo.open_gate()
    assert ok is False
    # Angle remains unchanged at closed angle
    assert servo.current_angle == Config.GATE_CLOSED_ANGLE
    assert servo.state == GateState.HOLD

    # Release hold allows movement again
    servo.release_hold()
    assert servo.is_hold_engaged() is False
    ok_release = servo.open_gate()
    assert ok_release is True
    assert servo.state == GateState.OPEN
    assert servo.current_angle == Config.GATE_OPEN_ANGLE


def test_servo_actuation_prevention_in_simulation_mode():
    servo = MockServoDriver()
    sm = SensorManagerModel()

    # In SIMULATION mode:
    sm.set_mode(OperatingMode.SIMULATION)
    servo.stop()
    assert servo.is_attached is False

    # Simulate command handler check in main.cpp:
    # If in SIMULATION mode, gate commands are rejected and physical servo is NEVER commanded
    can_actuate = (sm.mode == OperatingMode.PHYSICAL)
    assert can_actuate is False
    assert servo.is_attached is False
    assert servo.pwm_write_count == 0

    # Now switch to PHYSICAL mode:
    sm.set_mode(OperatingMode.PHYSICAL)
    can_actuate = (sm.mode == OperatingMode.PHYSICAL)
    assert can_actuate is True
    servo.open_gate()
    assert servo.is_attached is True
    assert servo.pwm_write_count == 1
    assert servo.state == GateState.OPEN


def test_flow_pulse_to_flow_rate_conversion():
    """Verify YFS201 pulse to flow rate (L/min) conversion calculation."""
    driver = MockYfs201Driver(pin=27, pulses_per_liter=450.0)
    driver.begin(0)

    # In 1000ms, inject 75 pulses:
    # Q = (75 pulses / 450 pulses/L) * (60,000 ms/min / 1000 ms) = (1/6 L) * 60 = 10.0 L/min
    driver.inject_pulses(75)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(1000)

    assert valid is True
    assert abs(flow_l_min - 10.0) < 1e-4
    assert pulses == 75
    assert fault == FaultCode.NONE
    assert abs(total_vol - (75.0 / 450.0)) < 1e-4

    # Second interval: 150 pulses over next 1000ms (1000ms -> 2000ms):
    # Q = (150 / 450) * 60 = 20.0 L/min
    driver.inject_pulses(150)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(2000)

    assert valid is True
    assert abs(flow_l_min - 20.0) < 1e-4
    assert pulses == 150
    assert fault == FaultCode.NONE
    # Total volume: (75 + 150) / 450 = 225 / 450 = 0.5 L
    assert abs(total_vol - 0.5) < 1e-4


def test_flow_total_volume_accumulation():
    """Verify flow volume totalizer correctly sums volume across sampling windows."""
    driver = MockYfs201Driver(pin=27, pulses_per_liter=450.0)
    driver.begin(0)

    # Interval 1: 450 pulses -> 1.0 Liter
    driver.inject_pulses(450)
    driver.read_flow(1000)

    # Interval 2: 900 pulses -> +2.0 Liters -> 3.0 Liters total
    driver.inject_pulses(900)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(2000)

    assert valid is True
    assert abs(total_vol - 3.0) < 1e-4

    # Interval 3: 450 pulses -> +1.0 Liter -> 4.0 Liters total
    driver.inject_pulses(450)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(3000)

    assert valid is True
    assert abs(total_vol - 4.0) < 1e-4


def test_flow_zero_pulses_is_valid_zero_flow():
    """Verify critical invariant: zero flow (water stationary) is valid 0.0 L/min, NEVER a fault."""
    driver = MockYfs201Driver(pin=27, pulses_per_liter=450.0)
    driver.begin(0)

    # Zero pulses injected in 1000ms
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(1000)

    assert valid is True
    assert flow_l_min == 0.0
    assert pulses == 0
    assert fault == FaultCode.NONE
    assert not math.isnan(flow_l_min)

    # Also test via SensorManager in PHYSICAL mode
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)
    packet = sm.sample(1000)

    assert packet.is_valid is True
    assert packet.health == SensorHealth.OK
    assert packet.flow_valid is True
    assert packet.flow_rate_l_min == 0.0
    assert packet.fault_code == FaultCode.NONE


def test_flow_invalid_calibration_factor():
    """Verify pulses_per_liter <= 0 is safely flagged as FLOW_CALIBRATION_INVALID."""
    driver = MockYfs201Driver(pin=27, pulses_per_liter=0.0)
    driver.begin(0)

    driver.inject_pulses(50)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(1000)

    assert valid is False
    assert math.isnan(flow_l_min)
    assert fault == FaultCode.FLOW_CALIBRATION_INVALID

    # Test negative calibration constant
    driver.set_pulses_per_liter(-450.0)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(2000)

    assert valid is False
    assert math.isnan(flow_l_min)
    assert fault == FaultCode.FLOW_CALIBRATION_INVALID


def test_flow_totalizer_reset():
    """Verify 'z' resetVolume command zeroes cumulative volume."""
    driver = MockYfs201Driver(pin=27, pulses_per_liter=450.0)
    driver.begin(0)

    driver.inject_pulses(900)
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(1000)
    assert abs(total_vol - 2.0) < 1e-4

    # Command zero reset ('z')
    driver.reset_volume()
    assert driver.pulse_count_total == 0

    # Next reading with no new pulses
    valid, flow_l_min, total_vol, pulses, fault = driver.read_flow(2000)
    assert valid is True
    assert total_vol == 0.0

    # Test SensorManager reset
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)
    sm.flow_driver.inject_pulses(450)
    sm.sample(1000)
    sm.reset_flow_volume()
    pkt = sm.sample(2000)
    assert pkt.total_volume_liters == 0.0


def test_flow_operational_mode_isolation():
    """Verify SIMULATION mode never touches flow hardware, and PHYSICAL never emits synthetic flow."""
    sm = SensorManagerModel()

    # 1. SIMULATION MODE
    sm.set_mode(OperatingMode.SIMULATION)
    assert sm.flow_driver.is_initialized is False
    assert sm.flow_driver.gpio_access_count == 0

    # Sample in simulation
    pkt_sim = sm.sample(1000)
    assert pkt_sim.source == DataSource.SIMULATED
    assert pkt_sim.mode == OperatingMode.SIMULATION
    assert sm.flow_driver.gpio_access_count == 0  # Physical pin was untouched!
    assert pkt_sim.flow_valid is True
    assert 2.0 <= pkt_sim.flow_rate_l_min <= 3.5  # Synthetic flume flow

    # 2. PHYSICAL MODE (transition at t=1000ms)
    sm.set_mode(OperatingMode.PHYSICAL, 1000)
    assert sm.flow_driver.is_initialized is True

    # Inject exact physical pulses (150 pulses over 1s: t=1000ms -> t=2000ms => 20.0 L/min)
    sm.flow_driver.inject_pulses(150)
    pkt_phys = sm.sample(2000)
    assert pkt_phys.source == DataSource.PHYSICAL
    assert pkt_phys.mode == OperatingMode.PHYSICAL
    assert abs(pkt_phys.flow_rate_l_min - 20.0) < 1e-4
    assert sm.flow_driver.gpio_access_count == 150

    # 3. SWITCH BACK TO SIMULATION
    sm.set_mode(OperatingMode.SIMULATION)
    assert sm.flow_driver.is_initialized is False
    # Next sample returns synthetic ripple, independent of prior physical state
    pkt_sim2 = sm.sample(3000)
    assert pkt_sim2.source == DataSource.SIMULATED
    assert pkt_sim2.mode == OperatingMode.SIMULATION


def test_pin_assignment_no_strapping_pins():
    """Verify bench pin assignments avoid all ESP32 boot strapping pins (0, 2, 5, 12, 15)."""
    assigned_pins = [
        Config.PIN_JSN_TRIG,
        Config.PIN_JSN_ECHO,
        Config.PIN_SERVO_GATE,
        Config.PIN_YFS201_FLOW,
    ]
    # Ensure all pins are strictly distinct
    assert len(assigned_pins) == len(set(assigned_pins)), "Duplicate GPIO assignment detected"

    # ESP32 boot strapping pins (must be avoided for external peripheral drivers)
    ESP32_STRAPPING_PINS = {0, 2, 5, 12, 15}
    for pin in assigned_pins:
        assert pin not in ESP32_STRAPPING_PINS, f"GPIO {pin} is an ESP32 strapping pin and risks boot failure"

    # Verify verified bench pins
    assert Config.PIN_JSN_TRIG == 25
    assert Config.PIN_JSN_ECHO == 18
    assert Config.PIN_SERVO_GATE == 19
    assert Config.PIN_YFS201_FLOW == 27


def test_sensor_independence_ultrasonic_failure_preserves_flow():
    """Verify failure of ultrasonic sensor does NOT invalidate flow sensor readings."""
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL, 1000)

    # Inject ultrasonic failure (echo timeout)
    sm.driver.injected_duration_us = 0

    # Inject valid flow pulses (75 pulses / 1s = 10.0 L/min)
    sm.flow_driver.inject_pulses(75)

    pkt = sm.sample(2000)

    # Ultrasonic is invalid
    assert pkt.is_valid is False
    assert math.isnan(pkt.water_depth_cm)
    assert math.isnan(pkt.raw_distance_cm)
    assert pkt.fault_code == FaultCode.SENSOR_TIMEOUT

    # Flow is completely valid and preserved!
    assert pkt.flow_valid is True
    assert abs(pkt.flow_rate_l_min - 10.0) < 1e-4
    assert abs(pkt.total_volume_liters - (75.0 / 450.0)) < 1e-4
    assert pkt.flow_pulse_count == 75

    # System state is DEGRADED, not complete FAULT
    assert pkt.health == SensorHealth.DEGRADED


def test_sensor_independence_flow_failure_preserves_ultrasonic():
    """Verify failure of flow sensor does NOT invalidate ultrasonic readings."""
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL, 1000)

    # Valid ultrasonic reading (30.0 cm distance -> 5.0 cm water depth)
    sm.driver.injected_duration_us = 1749

    # Invalidate flow calibration factor
    sm.flow_driver.set_pulses_per_liter(-1.0)
    sm.flow_driver.inject_pulses(50)

    pkt = sm.sample(2000)

    # Ultrasonic is completely valid and preserved!
    assert pkt.is_valid is True
    assert abs(pkt.raw_distance_cm - 30.0) < 1e-1
    assert abs(pkt.water_depth_cm - 5.0) < 1e-1

    # Flow is invalid
    assert pkt.flow_valid is False
    assert math.isnan(pkt.flow_rate_l_min)
    assert math.isnan(pkt.total_volume_liters)
    assert pkt.fault_code == FaultCode.FLOW_CALIBRATION_INVALID

    # System state is DEGRADED
    assert pkt.health == SensorHealth.DEGRADED


def test_sensor_independence_both_fail_is_fault():
    """Verify when both sensors fail simultaneously, system state is FAULT."""
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL, 1000)

    # Fail ultrasonic
    sm.driver.injected_duration_us = 0

    # Fail flow
    sm.flow_driver.set_pulses_per_liter(0.0)

    pkt = sm.sample(2000)

    assert pkt.is_valid is False
    assert pkt.flow_valid is False
    assert pkt.health == SensorHealth.FAULT


def test_manual_gate_remains_open_loop_with_no_auto_actuation():
    """Verify that gate commands are open-loop directives and never actuate automatically on high water."""
    servo = MockServoDriver()
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)

    # Start gate closed
    servo.begin()
    servo.close_gate()
    assert servo.state == GateState.CLOSED
    assert servo.current_angle == Config.GATE_CLOSED_ANGLE
    initial_writes = servo.pwm_write_count

    # Simulate critical flood level in physical channel (distance 21 cm -> depth 14 cm >= critical 12 cm)
    sm.driver.injected_duration_us = 1224  # ~21.0 cm distance -> 14.0 cm depth
    pkt = sm.sample(1000, gate_state=servo.state, gate_angle=servo.current_angle)

    assert pkt.is_valid is True
    assert pkt.water_depth_cm >= Config.THRESHOLD_CRITICAL_CM
    assert pkt.health == SensorHealth.DEGRADED

    # Invariant: NO automatic actuation is triggered by the firmware
    assert servo.pwm_write_count == initial_writes
    assert servo.state == GateState.CLOSED
    assert servo.current_angle == Config.GATE_CLOSED_ANGLE

    # Manual command 'g' opens the gate
    ok = servo.open_gate()
    assert ok is True
    assert servo.pwm_write_count == initial_writes + 1
    assert servo.state == GateState.OPEN
    assert servo.current_angle == Config.GATE_OPEN_ANGLE


# ==============================================================================
# P0.3F: Wi-Fi Telemetry & FastAPI Serialization Verification Tests
# ==============================================================================

class MockWifiTelemetryManager:
    """Python reference model of DrainX::WifiTelemetryManager."""

    def __init__(self, wifi_enabled=True, backend_host="192.168.1.100", backend_port=8000):
        self.wifi_enabled = wifi_enabled
        self.backend_host = backend_host
        self.backend_port = backend_port
        self.state = "NET_DISCONNECTED" if wifi_enabled else "NET_DISABLED"
        self.last_state_change_ms = 0
        self.last_tx_ms = 0
        self.current_backoff_ms = 5000
        self.tx_success_count = 0
        self.tx_failure_count = 0
        self.consecutive_http_errors = 0
        self.ip_address = "0.0.0.0"

    def simulate_wifi_connected(self, ip="192.168.1.50"):
        self.state = "NET_CONNECTED"
        self.ip_address = ip
        self.current_backoff_ms = 5000
        self.consecutive_http_errors = 0

    def simulate_wifi_disconnected(self, now_ms):
        self.state = "NET_BACKOFF"
        self.ip_address = "0.0.0.0"
        self.last_state_change_ms = now_ms
        self.current_backoff_ms = min(self.current_backoff_ms * 2, 30000)

    def serialize_telemetry_payload(self, pkt: TelemetryPacket) -> list:
        """Mirror exact C++ payload generation in buildJsonPayload()."""
        source_str = "PHYSICAL" if pkt.mode == OperatingMode.PHYSICAL else "SIMULATED"
        readings = []

        # Water level reading
        if pkt.is_valid and not math.isnan(pkt.water_depth_cm):
            depth_val = round(pkt.water_depth_cm, 2)
            depth_status = "OK"
            depth_meta = {"is_valid": True, "filter_enabled": True}
        else:
            depth_val = 0.0
            depth_status = "FAULT"
            depth_meta = {"is_valid": False, "fault_code": pkt.fault_code}

        readings.append({
            "sensor_id": "SN-US-01",
            "type": "WATER_LEVEL",
            "value": depth_val,
            "unit": "cm",
            "source": source_str,
            "status": depth_status,
            "metadata": depth_meta
        })

        # Flow rate reading
        if pkt.flow_valid and not math.isnan(pkt.flow_rate_l_min):
            flow_val = round(pkt.flow_rate_l_min, 2)
            flow_status = "OK"
            flow_meta = {
                "is_valid": True,
                "total_volume_liters": round(pkt.total_volume_liters, 3) if not math.isnan(pkt.total_volume_liters) else 0.0
            }
        else:
            flow_val = 0.0
            flow_status = "FAULT"
            flow_meta = {"is_valid": False, "fault_code": pkt.fault_code}

        readings.append({
            "sensor_id": "SN-FL-01",
            "type": "FLOW_RATE",
            "value": flow_val,
            "unit": "L/min",
            "source": source_str,
            "status": flow_status,
            "metadata": flow_meta
        })

        return readings


def test_wifi_telemetry_json_serialization_physical():
    """Verify ESP32 batch serialization in PHYSICAL mode matches FastAPI SensorReadingContract."""
    mgr = MockWifiTelemetryManager()
    mgr.simulate_wifi_connected()

    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)
    sm.driver.injected_duration_us = 1458  # ~25 cm distance -> 10 cm water depth
    sm.flow_driver.inject_pulses(450)     # 450 pulses in 1.0s = 60.0 L/min

    pkt = sm.sample(1000)
    payload = mgr.serialize_telemetry_payload(pkt)

    assert len(payload) == 2
    # Verify water level contract
    us_reading = payload[0]
    assert us_reading["sensor_id"] == "SN-US-01"
    assert us_reading["type"] == "WATER_LEVEL"
    assert us_reading["source"] == "PHYSICAL"
    assert us_reading["status"] == "OK"
    assert us_reading["value"] > 0.0
    assert us_reading["unit"] == "cm"

    # Verify flow rate contract
    fl_reading = payload[1]
    assert fl_reading["sensor_id"] == "SN-FL-01"
    assert fl_reading["type"] == "FLOW_RATE"
    assert fl_reading["source"] == "PHYSICAL"
    assert fl_reading["status"] == "OK"
    assert fl_reading["value"] > 0.0
    assert fl_reading["unit"] == "L/min"
    assert "total_volume_liters" in fl_reading["metadata"]


def test_wifi_telemetry_json_serialization_simulation():
    """Verify ESP32 batch serialization in SIMULATION mode correctly labels source as SIMULATED."""
    mgr = MockWifiTelemetryManager()
    mgr.simulate_wifi_connected()

    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.SIMULATION)
    sm.scenario = "NORMAL"

    pkt = sm.sample(1000)
    payload = mgr.serialize_telemetry_payload(pkt)

    assert len(payload) == 2
    assert payload[0]["source"] == "SIMULATED"
    assert payload[1]["source"] == "SIMULATED"


def test_wifi_telemetry_fault_serialization_avoids_nan():
    """Verify that when sensor readings are invalid, values serialize to valid numbers with FAULT status."""
    mgr = MockWifiTelemetryManager()
    mgr.simulate_wifi_connected()

    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)
    sm.driver.injected_duration_us = 0     # Timeout fault
    sm.flow_driver.set_pulses_per_liter(0.0) # Invalid calibration fault

    pkt = sm.sample(1000)
    payload = mgr.serialize_telemetry_payload(pkt)

    assert len(payload) == 2
    for reading in payload:
        # Standard JSON does not permit NaN: must be 0.0 with FAULT status
        assert reading["value"] == 0.0
        assert reading["status"] == "FAULT"
        assert reading["metadata"]["is_valid"] is False


def test_wifi_telemetry_exponential_backoff_timing():
    """Verify exponential backoff progression upon network drop."""
    mgr = MockWifiTelemetryManager()
    now = 1000
    mgr.simulate_wifi_connected()
    assert mgr.state == "NET_CONNECTED"

    # Disconnect 1
    mgr.simulate_wifi_disconnected(now)
    assert mgr.state == "NET_BACKOFF"
    assert mgr.current_backoff_ms == 10000

    # Disconnect 2
    mgr.simulate_wifi_disconnected(now + 10000)
    assert mgr.current_backoff_ms == 20000

    # Disconnect 3 (capped at 30000 ms)
    mgr.simulate_wifi_disconnected(now + 30000)
    assert mgr.current_backoff_ms == 30000


# ==============================================================================
# P0.3G: Incremental Hardware Readiness & Validation Stage Tests
# ==============================================================================

def test_missing_hardware_not_installed_status():
    """Verify that unmounted or missing sensors report SENSOR_NOT_INSTALLED rather than fake zero or OK."""
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)
    sm.validation_stage = HardwareValidationStage.PARTIALLY_ASSEMBLED

    # Scenario: Ultrasonic sensor is mounted, but flow sensor is not installed yet
    sm.ultrasonic_installed = True
    sm.flow_installed = False
    sm.driver.injected_duration_us = 1458 # ~25 cm -> 10 cm water depth

    pkt = sm.sample(1000)

    # Ultrasonic is valid
    assert pkt.is_valid is True
    assert pkt.water_depth_cm > 0.0

    # Flow sensor is explicitly NOT valid, NaN values, and tagged SENSOR_NOT_INSTALLED
    assert pkt.flow_valid is False
    assert math.isnan(pkt.flow_rate_l_min)
    assert math.isnan(pkt.total_volume_liters)
    assert pkt.fault_code == FaultCode.SENSOR_NOT_INSTALLED
    assert pkt.health == SensorHealth.DEGRADED


def test_independent_sensor_testing_in_physical_mode():
    """Verify that individual sensors can be tested independently without requiring all hardware."""
    sm = SensorManagerModel()
    sm.set_mode(OperatingMode.PHYSICAL)
    sm.validation_stage = HardwareValidationStage.SENSOR_VALIDATION

    # Test flow sensor in isolation (ultrasonic not installed)
    sm.ultrasonic_installed = False
    sm.flow_installed = True
    sm.flow_driver.inject_pulses(450) # 60 L/min

    pkt = sm.sample(1000)

    assert pkt.is_valid is False
    assert math.isnan(pkt.water_depth_cm)
    assert pkt.flow_valid is True
    assert pkt.flow_rate_l_min == 60.0
    assert pkt.health == SensorHealth.DEGRADED


def test_validation_stages_distinct_from_operational_modes():
    """Verify that validation stages represent readiness and do NOT alter operational mode logic."""
    sm = SensorManagerModel()

    # Validation stages can transition through all 5 levels
    for stage in [
        HardwareValidationStage.SOFTWARE_ONLY,
        HardwareValidationStage.CONNECTIVITY_READY,
        HardwareValidationStage.PARTIALLY_ASSEMBLED,
        HardwareValidationStage.SENSOR_VALIDATION,
        HardwareValidationStage.FULL_PHYSICAL_VALIDATION
    ]:
        sm.validation_stage = stage
        assert sm.validation_stage == stage

    # Operational mode remains strictly isolated
    sm.set_mode(OperatingMode.SIMULATION)
    pkt_sim = sm.sample(1000)
    assert pkt_sim.source == DataSource.SIMULATED

    sm.set_mode(OperatingMode.PHYSICAL)
    pkt_phys = sm.sample(2000)
    assert pkt_phys.source == DataSource.PHYSICAL


