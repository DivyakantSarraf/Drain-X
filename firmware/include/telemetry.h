#pragma once

#include <stdint.h>
#include <cmath>
#include "config.h"

/**
 * @file telemetry.h
 * @brief Telemetry data structures, health flags, and operational modes.
 * 
 * Strict Invariant: Missing or failed measurements MUST NEVER be represented 
 * as valid zero readings. When is_valid is false, numeric readings are set to NAN.
 * Zero-flow (0.0 L/min) when no water is moving is valid and NOT an error.
 */

namespace DrainX {

/**
 * @brief Telemetry data source classification matching backend DataSource.
 */
enum class DataSource : uint8_t {
    SIMULATED = 0,
    PHYSICAL = 1
};

/**
 * @brief Sensor health state matching backend SensorHealthStatus contract.
 */
enum class SensorHealth : uint8_t {
    OK = 0,
    DEGRADED = 1,
    FAULT = 2,
    CALIBRATING = 3
};

/**
 * @brief Specific fault code when sensor health is not OK.
 */
enum class FaultCode : uint8_t {
    NONE = 0,
    SENSOR_TIMEOUT = 1,
    ACOUSTIC_DEADBAND_VIOLATION = 2,
    OUT_OF_RANGE_MAX = 3,
    ERRATIC_RATE_OF_RISE = 4,
    SIMULATED_INJECTED_FAULT = 5,
    NEGATIVE_WATER_DEPTH = 6,
    HARDWARE_NOT_INITIALIZED = 7,
    FLOW_CALIBRATION_INVALID = 8,
    SENSOR_NOT_INSTALLED = 9,
    SENSOR_NOT_VALIDATED = 10
};

/**
 * @brief Hardware Readiness and Validation Progress States.
 * Note: These represent incremental validation stages of the physical testbench,
 * NOT the operational runtime mode (SIMULATION / PHYSICAL / SAFE_HOLD).
 */
enum class HardwareValidationStage : uint8_t {
    SOFTWARE_ONLY = 0,
    CONNECTIVITY_READY = 1,
    PARTIALLY_ASSEMBLED = 2,
    SENSOR_VALIDATION = 3,
    FULL_PHYSICAL_VALIDATION = 4
};

/**
 * @brief Canonical telemetry packet structure.
 */
struct TelemetryPacket {
    // Identity & Meta
    const char* device_id;
    const char* firmware_version;
    const char* sensor_id;
    const char* section_id;
    
    // Timing
    uint32_t uptime_ms;
    uint32_t sequence_number;

    // Classification & Operational State
    DataSource source;
    OperatingMode mode;
    SensorHealth health;
    FaultCode fault_code;

    HardwareValidationStage validation_stage;

    // Water Depth Measurements (Ultrasonic Transducer)
    // INVARIANT: If is_valid is false, depth readings MUST be NAN, never 0.0f.
    bool is_valid;
    bool is_filtered;
    float raw_distance_cm;
    float water_depth_cm;

    // Water Flow Measurements (YFS201 Turbine Flow Meter)
    // NOTE: Zero flow (0.0 L/min) is a normal physical state and valid.
    bool flow_valid;
    float flow_rate_l_min;
    float total_volume_liters;
    uint32_t flow_pulse_count;

    // Gate Actuator State (Commanded Open-Loop Position)
    GateState gate_state;
    float gate_angle_deg;

    /**
     * @brief Factory constructor for a valid telemetry record.
     */
    static TelemetryPacket createValid(
        uint32_t uptime,
        uint32_t seq,
        float raw_dist,
        float depth,
        DataSource src = DataSource::SIMULATED,
        OperatingMode op_mode = OperatingMode::SIMULATION,
        bool filtered = false,
        GateState g_state = GateState::HOLD,
        float g_angle = Config::GATE_CLOSED_ANGLE,
        float flow_rate = 0.0f,
        float total_vol = 0.0f,
        uint32_t flow_pulses = 0,
        bool flow_ok = true
    ) {
        TelemetryPacket p;
        p.device_id = Config::DEVICE_ID;
        p.firmware_version = Config::FIRMWARE_VERSION;
        p.sensor_id = Config::SENSOR_ID;
        p.section_id = Config::SECTION_ID;
        p.uptime_ms = uptime;
        p.sequence_number = seq;
        p.source = src;
        p.mode = op_mode;
        p.health = SensorHealth::OK;
        p.fault_code = FaultCode::NONE;
        p.validation_stage = HardwareValidationStage::SOFTWARE_ONLY;
        p.is_valid = true;
        p.is_filtered = filtered;
        p.raw_distance_cm = raw_dist;
        p.water_depth_cm = depth;
        p.gate_state = g_state;
        p.gate_angle_deg = g_angle;
        p.flow_valid = flow_ok;
        p.flow_rate_l_min = flow_rate;
        p.total_volume_liters = total_vol;
        p.flow_pulse_count = flow_pulses;
        return p;
    }

    /**
     * @brief Factory constructor for an invalid / failed measurement record.
     */
    static TelemetryPacket createInvalid(
        uint32_t uptime,
        uint32_t seq,
        FaultCode reason,
        DataSource src = DataSource::SIMULATED,
        OperatingMode op_mode = OperatingMode::SIMULATION,
        GateState g_state = GateState::HOLD,
        float g_angle = Config::GATE_CLOSED_ANGLE
    ) {
        TelemetryPacket p;
        p.device_id = Config::DEVICE_ID;
        p.firmware_version = Config::FIRMWARE_VERSION;
        p.sensor_id = Config::SENSOR_ID;
        p.section_id = Config::SECTION_ID;
        p.uptime_ms = uptime;
        p.sequence_number = seq;
        p.source = src;
        p.mode = op_mode;
        p.health = SensorHealth::FAULT;
        p.fault_code = reason;
        p.validation_stage = HardwareValidationStage::SOFTWARE_ONLY;
        p.is_valid = false;
        p.is_filtered = false;
        p.raw_distance_cm = NAN;
        p.water_depth_cm = NAN;
        p.gate_state = g_state;
        p.gate_angle_deg = g_angle;
        p.flow_valid = false;
        p.flow_rate_l_min = NAN;
        p.total_volume_liters = NAN;
        p.flow_pulse_count = 0;
        return p;
    }

    const char* sourceToString() const {
        return (source == DataSource::PHYSICAL) ? "PHYSICAL" : "SIMULATED";
    }

    const char* modeToString() const {
        switch (mode) {
            case OperatingMode::SIMULATION: return "SIMULATION";
            case OperatingMode::PHYSICAL:   return "PHYSICAL";
            case OperatingMode::SAFE_HOLD:  return "SAFE_HOLD";
            default:                        return "UNKNOWN";
        }
    }

    const char* healthToString() const {
        switch (health) {
            case SensorHealth::OK:          return "OK";
            case SensorHealth::DEGRADED:    return "DEGRADED";
            case SensorHealth::FAULT:       return "FAULT";
            case SensorHealth::CALIBRATING: return "CALIBRATING";
            default:                        return "UNKNOWN";
        }
    }

    const char* faultToString() const {
        switch (fault_code) {
            case FaultCode::NONE:                        return "NONE";
            case FaultCode::SENSOR_TIMEOUT:              return "TIMEOUT_NO_ECHO";
            case FaultCode::ACOUSTIC_DEADBAND_VIOLATION: return "DEADBAND_VIOLATION";
            case FaultCode::OUT_OF_RANGE_MAX:            return "MAX_RANGE_EXCEEDED";
            case FaultCode::ERRATIC_RATE_OF_RISE:        return "ERRATIC_DELTA";
            case FaultCode::SIMULATED_INJECTED_FAULT:    return "SIMULATED_FAULT";
            case FaultCode::NEGATIVE_WATER_DEPTH:        return "NEGATIVE_WATER_DEPTH_IMPOSSIBLE";
            case FaultCode::HARDWARE_NOT_INITIALIZED:    return "HARDWARE_NOT_INITIALIZED";
            case FaultCode::FLOW_CALIBRATION_INVALID:    return "FLOW_CALIBRATION_INVALID";
            case FaultCode::SENSOR_NOT_INSTALLED:        return "SENSOR_NOT_INSTALLED";
            case FaultCode::SENSOR_NOT_VALIDATED:        return "SENSOR_NOT_VALIDATED";
            default:                                     return "UNKNOWN_FAULT";
        }
    }

    const char* validationStageToString() const {
        switch (validation_stage) {
            case HardwareValidationStage::SOFTWARE_ONLY:            return "SOFTWARE_ONLY";
            case HardwareValidationStage::CONNECTIVITY_READY:       return "CONNECTIVITY_READY";
            case HardwareValidationStage::PARTIALLY_ASSEMBLED:      return "PARTIALLY_ASSEMBLED";
            case HardwareValidationStage::SENSOR_VALIDATION:        return "SENSOR_VALIDATION";
            case HardwareValidationStage::FULL_PHYSICAL_VALIDATION: return "FULL_PHYSICAL_VALIDATION";
            default:                                                return "UNKNOWN_STAGE";
        }
    }

    const char* gateStateToString() const {
        switch (gate_state) {
            case GateState::CLOSED:        return "CLOSED";
            case GateState::OPEN:          return "OPEN";
            case GateState::HOLD:          return "SAFE_HOLD";
            case GateState::UNINITIALIZED: return "UNINITIALIZED";
            default:                       return "UNKNOWN";
        }
    }
};

} // namespace DrainX
