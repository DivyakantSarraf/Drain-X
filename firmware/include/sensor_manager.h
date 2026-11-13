#pragma once

#include <stdint.h>
#include <cmath>
#include "config.h"
#include "telemetry.h"
#include "median_filter.h"
#include "jsn_sr04t_driver.h"
#include "yfs201_driver.h"

/**
 * @file sensor_manager.h
 * @brief Unified Sensor Manager coordinating ultrasonic and flow sensing with strict mode isolation.
 * 
 * Milestone: P0.3D YFS201 Physical Flow Sensor Integration.
 * 
 * Core Invariants:
 * 1. In SIMULATION mode: Physical drivers (JSN-SR04T and YFS201) are NEVER invoked,
 *    GPIO interrupts remain detached, and hardware lines are isolated.
 * 2. In PHYSICAL mode: Simulation generator is NEVER invoked. Any physical hardware failure
 *    is emitted with an explicit fault code and NaN values.
 * 3. Zero-flow (0.0 L/min) when water is stagnant is a valid physical state, not an error.
 */

namespace DrainX {

class SensorManager {
public:
    SensorManager() 
        : _mode(Config::DEFAULT_MODE),
          _scenario(Config::DEFAULT_SCENARIO),
          _validation_stage(HardwareValidationStage::SOFTWARE_ONLY),
          _reference_height_cm(Config::MOUNTING_HEIGHT_CM),
          _filter_enabled(Config::FILTER_DEFAULT_ENABLED),
          _step_count(0),
          _sequence_num(0),
          _rising_step(0.0f),
          _simulated_volume_liters(0.0f),
          _ultrasonic_installed(true),
          _flow_installed(true),
          _servo_installed(true)
    {
        _latest_packet = TelemetryPacket::createInvalid(
            0, 0, FaultCode::NONE, DataSource::SIMULATED, OperatingMode::SIMULATION
        );
    }

    HardwareValidationStage getValidationStage() const {
        return _validation_stage;
    }

    void setValidationStage(HardwareValidationStage stage) {
        _validation_stage = stage;
    }

    const char* getValidationStageName() const {
        switch (_validation_stage) {
            case HardwareValidationStage::SOFTWARE_ONLY:            return "SOFTWARE_ONLY";
            case HardwareValidationStage::CONNECTIVITY_READY:       return "CONNECTIVITY_READY";
            case HardwareValidationStage::PARTIALLY_ASSEMBLED:      return "PARTIALLY_ASSEMBLED";
            case HardwareValidationStage::SENSOR_VALIDATION:        return "SENSOR_VALIDATION";
            case HardwareValidationStage::FULL_PHYSICAL_VALIDATION: return "FULL_PHYSICAL_VALIDATION";
            default:                                                return "UNKNOWN";
        }
    }

    void setUltrasonicInstalled(bool installed) { _ultrasonic_installed = installed; }
    void setFlowInstalled(bool installed) { _flow_installed = installed; }
    void setServoInstalled(bool installed) { _servo_installed = installed; }

    bool isUltrasonicInstalled() const { return _ultrasonic_installed; }
    bool isFlowInstalled() const { return _flow_installed; }
    bool isServoInstalled() const { return _servo_installed; }

    /**
     * @brief Explicitly switch operational mode between SIMULATION and PHYSICAL.
     * Manages hardware GPIO lifecycle cleanly.
     */
    void setMode(OperatingMode target_mode) {
        if (_mode == target_mode) return;

        _mode = target_mode;
        _filter.reset();

        if (_mode == OperatingMode::PHYSICAL) {
            _physical_driver.begin();
            _flow_driver.begin();
        } else {
            _physical_driver.stop();
            _flow_driver.stop();
            _step_count = 0;
            _rising_step = 0.0f;
            _simulated_volume_liters = 0.0f;
        }
    }

    OperatingMode getMode() const {
        return _mode;
    }

    const char* getModeName() const {
        switch (_mode) {
            case OperatingMode::SIMULATION: return "SIMULATION";
            case OperatingMode::PHYSICAL:   return "PHYSICAL (Hardware Active)";
            case OperatingMode::SAFE_HOLD:  return "SAFE_HOLD";
            default:                        return "UNKNOWN";
        }
    }

    void setScenario(Config::SimulationScenario scenario) {
        _scenario = scenario;
        _step_count = 0;
        _rising_step = 0.0f;
        _simulated_volume_liters = 0.0f;
    }

    Config::SimulationScenario getScenario() const {
        return _scenario;
    }

    const char* getScenarioName() const {
        switch (_scenario) {
            case Config::SimulationScenario::NORMAL:
                return "NORMAL (Steady flow: ~4.6cm, ~2.8 L/min)";
            case Config::SimulationScenario::RISING_WATER:
                return "RISING_WATER (Simulated surge: ~4.0->14.5cm, ~3.0->12.0 L/min)";
            case Config::SimulationScenario::INVALID_READING:
                return "INVALID_READING (Echo loss / timeout fault)";
            default:
                return "UNKNOWN";
        }
    }

    void setReferenceHeightCm(float height_cm) {
        if (height_cm > 0.0f) {
            _reference_height_cm = height_cm;
        }
    }

    float getReferenceHeightCm() const {
        return _reference_height_cm;
    }

    void setFilterEnabled(bool enabled) {
        _filter_enabled = enabled;
        if (!enabled) {
            _filter.reset();
        }
    }

    bool isFilterEnabled() const {
        return _filter_enabled;
    }

    void resetFlowVolume() {
        if (_mode == OperatingMode::PHYSICAL) {
            _flow_driver.resetVolume();
        } else {
            _simulated_volume_liters = 0.0f;
        }
    }

    /**
     * @brief Execute a sampling cycle based on the active operational mode.
     */
    TelemetryPacket sample(
        uint32_t uptime_ms,
        GateState gate_state = GateState::HOLD,
        float gate_angle = Config::GATE_CLOSED_ANGLE
    ) {
        _sequence_num++;

        if (_mode == OperatingMode::SIMULATION) {
            return sampleSimulation(uptime_ms, gate_state, gate_angle);
        } else if (_mode == OperatingMode::PHYSICAL) {
            return samplePhysical(uptime_ms, gate_state, gate_angle);
        } else {
            _latest_packet = TelemetryPacket::createInvalid(
                uptime_ms,
                _sequence_num,
                FaultCode::NONE,
                DataSource::PHYSICAL,
                OperatingMode::SAFE_HOLD,
                gate_state,
                gate_angle
            );
            return _latest_packet;
        }
    }

    const TelemetryPacket& getLatestPacket() const {
        return _latest_packet;
    }

    uint32_t getSequenceNumber() const {
        return _sequence_num;
    }

    JsnSr04tDriver& getUltrasonicDriver() {
        return _physical_driver;
    }

    Yfs201Driver& getFlowDriver() {
        return _flow_driver;
    }

private:
    OperatingMode _mode;
    Config::SimulationScenario _scenario;
    HardwareValidationStage _validation_stage;
    float _reference_height_cm;
    bool _filter_enabled;
    uint32_t _step_count;
    uint32_t _sequence_num;
    float _rising_step;
    float _simulated_volume_liters;
    bool _ultrasonic_installed;
    bool _flow_installed;
    bool _servo_installed;
    TelemetryPacket _latest_packet;

    JsnSr04tDriver _physical_driver;
    Yfs201Driver   _flow_driver;
    MovingMedianFilter<Config::FILTER_WINDOW_SIZE> _filter;

    /**
     * @brief PHYSICAL SAMPLING PATH: Strictly interacts with hardware drivers.
     * Enforces sensor independence: failure of one sensor does not invalidate the other.
     */
    TelemetryPacket samplePhysical(uint32_t uptime_ms, GateState gate_state, float gate_angle) {
        // 1. Sample physical flow sensor (or report NOT_INSTALLED)
        Yfs201Driver::FlowReading flow;
        if (_flow_installed) {
            flow = _flow_driver.sample(uptime_ms);
        } else {
            flow.is_valid = false;
            flow.flow_rate_l_min = NAN;
            flow.total_volume_liters = NAN;
            flow.interval_pulses = 0;
            flow.total_pulses = 0;
            flow.interval_ms = 0;
            flow.fault = FaultCode::SENSOR_NOT_INSTALLED;
        }

        // 2. Sample physical ultrasonic sensor (or report NOT_INSTALLED)
        JsnSr04tDriver::RawReading raw;
        if (_ultrasonic_installed) {
            raw = _physical_driver.readDistance();
        } else {
            raw.success = false;
            raw.distance_cm = NAN;
            raw.duration_us = 0;
            raw.fault = FaultCode::SENSOR_NOT_INSTALLED;
        }

        bool us_valid = false;
        float raw_dist = NAN;
        float water_depth = NAN;
        FaultCode primary_fault = FaultCode::NONE;

        if (!raw.success) {
            primary_fault = raw.fault;
        } else {
            raw_dist = raw.distance_cm;
            float effective_dist = raw_dist;
            if (_filter_enabled) {
                _filter.addSample(raw_dist);
                effective_dist = _filter.getMedian();
            }
            water_depth = _reference_height_cm - effective_dist;
            if (water_depth < 0.0f) {
                primary_fault = FaultCode::NEGATIVE_WATER_DEPTH;
                water_depth = NAN;
                raw_dist = NAN;
            } else {
                us_valid = true;
            }
        }

        // Sensor Independence & System Health Assessment:
        // - Both sensors valid -> OK (or DEGRADED if water depth is at/above critical threshold)
        // - One sensor valid, one failed/not installed -> DEGRADED (operational awareness maintained for remaining sensor)
        // - Both sensors failed/not installed -> FAULT
        SensorHealth health = SensorHealth::OK;
        if (us_valid && flow.is_valid) {
            health = (water_depth >= Config::THRESHOLD_CRITICAL_CM) ? SensorHealth::DEGRADED : SensorHealth::OK;
        } else if (us_valid || flow.is_valid) {
            health = SensorHealth::DEGRADED;
            if (primary_fault == FaultCode::NONE && !flow.is_valid) {
                primary_fault = flow.fault;
            }
        } else {
            health = SensorHealth::FAULT;
            primary_fault = (primary_fault != FaultCode::NONE) ? primary_fault : flow.fault;
        }

        TelemetryPacket p;
        p.device_id = Config::DEVICE_ID;
        p.firmware_version = Config::FIRMWARE_VERSION;
        p.sensor_id = Config::SENSOR_ID;
        p.section_id = Config::SECTION_ID;
        p.uptime_ms = uptime_ms;
        p.sequence_number = _sequence_num;
        p.source = DataSource::PHYSICAL;
        p.mode = OperatingMode::PHYSICAL;
        p.health = health;
        p.fault_code = primary_fault;
        p.validation_stage = _validation_stage;

        // Ultrasonic fields
        p.is_valid = us_valid;
        p.is_filtered = _filter_enabled;
        p.raw_distance_cm = raw_dist;
        p.water_depth_cm = water_depth;

        // Gate fields (Commanded Open-Loop Position)
        p.gate_state = gate_state;
        p.gate_angle_deg = gate_angle;

        // Flow fields
        p.flow_valid = flow.is_valid;
        p.flow_rate_l_min = flow.is_valid ? flow.flow_rate_l_min : NAN;
        p.total_volume_liters = flow.is_valid ? flow.total_volume_liters : NAN;
        p.flow_pulse_count = flow.total_pulses;

        _latest_packet = p;
        return _latest_packet;
    }

    /**
     * @brief SIMULATION SAMPLING PATH: Strictly synthetic generator.
     */
    TelemetryPacket sampleSimulation(uint32_t uptime_ms, GateState gate_state, float gate_angle) {
        _step_count++;

        switch (_scenario) {
            case Config::SimulationScenario::NORMAL: {
                float ripple = 0.4f * sinf(_step_count * 0.35f) + 0.15f * cosf(_step_count * 0.85f);
                float water_depth = 4.6f + ripple;
                float raw_distance = _reference_height_cm - water_depth;

                // Synthetic baseline flow: ~2.8 L/min
                float flow_rate = 2.8f + 0.25f * sinf(_step_count * 0.4f);
                _simulated_volume_liters += (flow_rate / 60.0f) * (Config::SAMPLE_INTERVAL_MS / 1000.0f);
                uint32_t simulated_pulses = static_cast<uint32_t>(_simulated_volume_liters * Config::YFS201_PULSES_PER_LITER);

                _latest_packet = TelemetryPacket::createValid(
                    uptime_ms,
                    _sequence_num,
                    raw_distance,
                    water_depth,
                    DataSource::SIMULATED,
                    OperatingMode::SIMULATION,
                    false,
                    gate_state,
                    gate_angle,
                    flow_rate,
                    _simulated_volume_liters,
                    simulated_pulses,
                    true
                );
                _latest_packet.validation_stage = _validation_stage;
                return _latest_packet;
            }

            case Config::SimulationScenario::RISING_WATER: {
                float base_depth = 4.0f + (_rising_step * 0.35f);
                float ripple = 0.15f * sinf(_step_count * 0.5f);
                float water_depth = base_depth + ripple;

                // Synthetic surge flow: ramps from 3.0 L/min to ~11.5 L/min
                float flow_rate = 3.0f + (_rising_step * 0.28f);

                _rising_step += 1.0f;
                if (base_depth > 14.5f) {
                    _rising_step = 0.0f;
                }

                _simulated_volume_liters += (flow_rate / 60.0f) * (Config::SAMPLE_INTERVAL_MS / 1000.0f);
                uint32_t simulated_pulses = static_cast<uint32_t>(_simulated_volume_liters * Config::YFS201_PULSES_PER_LITER);

                float raw_distance = _reference_height_cm - water_depth;

                _latest_packet = TelemetryPacket::createValid(
                    uptime_ms,
                    _sequence_num,
                    raw_distance,
                    water_depth,
                    DataSource::SIMULATED,
                    OperatingMode::SIMULATION,
                    false,
                    gate_state,
                    gate_angle,
                    flow_rate,
                    _simulated_volume_liters,
                    simulated_pulses,
                    true
                );
                _latest_packet.validation_stage = _validation_stage;

                if (water_depth >= Config::THRESHOLD_CRITICAL_CM) {
                    _latest_packet.health = SensorHealth::DEGRADED;
                }
                return _latest_packet;
            }

            case Config::SimulationScenario::INVALID_READING: {
                FaultCode code;
                if (_step_count % 3 == 0) {
                    code = FaultCode::ACOUSTIC_DEADBAND_VIOLATION;
                } else if (_step_count % 3 == 1) {
                    code = FaultCode::SENSOR_TIMEOUT;
                } else {
                    code = FaultCode::SIMULATED_INJECTED_FAULT;
                }

                _latest_packet = TelemetryPacket::createInvalid(
                    uptime_ms,
                    _sequence_num,
                    code,
                    DataSource::SIMULATED,
                    OperatingMode::SIMULATION,
                    gate_state,
                    gate_angle
                );
                _latest_packet.validation_stage = _validation_stage;
                return _latest_packet;
            }

            default: {
                return sampleSimulation(uptime_ms, gate_state, gate_angle);
            }
        }
    }
};

} // namespace DrainX
