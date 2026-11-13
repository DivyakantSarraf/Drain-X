#pragma once

#include <Arduino.h>
#include <stdint.h>
#include <cmath>
#include "config.h"

/**
 * @file servo_driver.h
 * @brief Modular servo gate driver for DRAIN-X physical demonstrator.
 * 
 * Mechanical Context:
 * - Hinged sheet-metal gate mounted in miniature PVC drainage channel.
 * - Actuator: SG90 micro-servo or MG996R high-torque servo.
 * - Linkage, horn arm, hinge orientation, and mounting angles are subject to physical bench calibration.
 * 
 * Safety & Position Feedback Notice:
 * - STANDARD HOBBY SERVOS (SG90 / MG996R) ARE STRICTLY OPEN-LOOP ACTUATORS.
 * - The microcontroller transmits an angular PWM directive; the servo provides NO mechanical
 *   position feedback, limit switch status, or torque-sensing telemetry.
 * - Commanded position is an open-loop directive, NOT a verified physical posture.
 * - Software hold ('x') freezes command processing; it is NOT a physical mechanical lock.
 */

namespace DrainX {

class ServoDriver {
public:
    ServoDriver(
        int8_t pin = Config::PIN_SERVO_GATE,
        uint32_t pulse_min_us = Config::SERVO_PULSE_MIN_US,
        uint32_t pulse_max_us = Config::SERVO_PULSE_MAX_US,
        float min_safe_angle = Config::SERVO_MIN_SAFE_ANGLE,
        float max_safe_angle = Config::SERVO_MAX_SAFE_ANGLE,
        float closed_angle = Config::GATE_CLOSED_ANGLE,
        float open_angle = Config::GATE_OPEN_ANGLE
    ) : _pin(pin),
        _pulse_min_us(pulse_min_us),
        _pulse_max_us(pulse_max_us),
        _min_safe_angle(min_safe_angle),
        _max_safe_angle(max_safe_angle),
        _closed_angle(closed_angle),
        _open_angle(open_angle),
        _current_angle(NAN),
        _target_angle(NAN),
        _state(GateState::UNINITIALIZED),
        _hold_engaged(false),
        _is_attached(false),
        _servo_model(Config::ACTIVE_SERVO_MODEL)
    {}

    /**
     * @brief Safe initialization of LEDC PWM channel.
     * Enforces safe startup: attaches channel without issuing a motion command.
     */
    bool begin() {
        if (_pin < 0) return false;

        // Attach LEDC PWM: 50 Hz, 14-bit resolution (Arduino-ESP32 3.x API)
        if (ledcAttach(_pin, Config::SERVO_PWM_FREQ_HZ, Config::SERVO_PWM_RESOLUTION)) {
            _is_attached = true;
            _state = GateState::HOLD;
            _hold_engaged = false;
            return true;
        }
        return false;
    }

    /**
     * @brief Detach PWM channel and return pin to high-Z state.
     */
    void stop() {
        if (_is_attached && _pin >= 0) {
            ledcDetach(_pin);
            _is_attached = false;
            _state = GateState::UNINITIALIZED;
            _current_angle = NAN;
            _target_angle = NAN;
        }
    }

    bool isAttached() const {
        return _is_attached;
    }

    /**
     * @brief Configure servo profile for SG90 vs MG996R at runtime.
     */
    void setServoModel(ServoModel model) {
        _servo_model = model;
        if (model == ServoModel::MG996R_HIGH_TORQUE) {
            _pulse_min_us = Config::MG996R_PULSE_MIN_US;
            _pulse_max_us = Config::MG996R_PULSE_MAX_US;
        } else {
            _pulse_min_us = Config::SG90_PULSE_MIN_US;
            _pulse_max_us = Config::SG90_PULSE_MAX_US;
        }
    }

    ServoModel getServoModel() const {
        return _servo_model;
    }

    const char* getServoModelName() const {
        return (_servo_model == ServoModel::MG996R_HIGH_TORQUE)
            ? "MG996R (Metal-Gear High-Torque)"
            : "SG90 (Micro-Servo)";
    }

    /**
     * @brief Update calibrated open and closed angles.
     */
    void setCalibratedAngles(float closed_angle, float open_angle) {
        _closed_angle = closed_angle;
        _open_angle = open_angle;
    }

    void setTravelLimits(float min_safe, float max_safe) {
        _min_safe_angle = min_safe;
        _max_safe_angle = max_safe;
    }

    /**
     * @brief Command the servo to a specific calibrated angle.
     * 
     * Invariants:
     * - Rejects movement if software hold is engaged.
     * - Strictly clamps target angle to [_min_safe_angle, _max_safe_angle] to prevent overtravel.
     * - Deadband check suppresses redundant PWM writes if within deadband.
     * 
     * @param target_deg Desired angular target in degrees.
     * @return true if command accepted and PWM updated; false if rejected by hold or uninitialized.
     */
    bool commandAngle(float target_deg) {
        if (_hold_engaged) {
            return false;
        }

        // Mechanical overtravel clamp
        float clamped_deg = target_deg;
        if (clamped_deg < _min_safe_angle) clamped_deg = _min_safe_angle;
        if (clamped_deg > _max_safe_angle) clamped_deg = _max_safe_angle;

        _target_angle = clamped_deg;

        // Redundant command suppression: Deadband filter
        if (_is_attached && !std::isnan(_current_angle)) {
            if (fabsf(clamped_deg - _current_angle) < Config::SERVO_DEADBAND_DEG) {
                return true; // Already at commanded angle within deadband
            }
        }

        // Lazy attach if not already active
        if (!_is_attached) {
            if (!begin()) return false;
        }

        // Convert angle (0..180 deg scale) to pulse width in microseconds
        float pulse_us = _pulse_min_us + (clamped_deg / 180.0f) * (_pulse_max_us - _pulse_min_us);

        // Convert pulse width to 14-bit duty ticks (period = 20,000 us = 16383 ticks)
        constexpr uint32_t max_duty = (1 << Config::SERVO_PWM_RESOLUTION) - 1;
        uint32_t duty = static_cast<uint32_t>((pulse_us * max_duty) / 20000.0f);

        // Output PWM to hardware timer channel
        ledcWrite(_pin, duty);

        _current_angle = clamped_deg;
        return true;
    }

    /**
     * @brief Request gate opening to calibrated open posture.
     */
    bool openGate() {
        if (commandAngle(_open_angle)) {
            _state = GateState::OPEN;
            return true;
        }
        return false;
    }

    /**
     * @brief Request gate closing to calibrated closed posture.
     */
    bool closeGate() {
        if (commandAngle(_closed_angle)) {
            _state = GateState::CLOSED;
            return true;
        }
        return false;
    }

    /**
     * @brief Enter software command hold.
     * Locks out all incoming movement commands until explicitly released.
     * Note: This is an embedded software latch, NOT a mechanical position lock.
     */
    void engageHold() {
        _hold_engaged = true;
        _state = GateState::HOLD;
    }

    /**
     * @brief Release software command hold.
     */
    void releaseHold() {
        _hold_engaged = false;
    }

    bool isHoldEngaged() const {
        return _hold_engaged;
    }

    GateState getState() const {
        return _state;
    }

    float getCurrentAngle() const {
        return _current_angle;
    }

    float getClosedAngle() const {
        return _closed_angle;
    }

    float getOpenAngle() const {
        return _open_angle;
    }

    const char* getStateName() const {
        switch (_state) {
            case GateState::CLOSED:        return "CLOSED";
            case GateState::OPEN:          return "OPEN";
            case GateState::HOLD:          return "SOFTWARE_HOLD (Locked out)";
            case GateState::UNINITIALIZED: return "UNINITIALIZED";
            default:                       return "UNKNOWN";
        }
    }

private:
    int8_t _pin;
    uint32_t _pulse_min_us;
    uint32_t _pulse_max_us;
    float _min_safe_angle;
    float _max_safe_angle;
    float _closed_angle;
    float _open_angle;

    float _current_angle;
    float _target_angle;
    GateState _state;
    bool _hold_engaged;
    bool _is_attached;
    ServoModel _servo_model;
};

} // namespace DrainX
