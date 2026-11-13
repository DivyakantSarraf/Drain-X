#pragma once

#include <Arduino.h>
#include <stdint.h>
#include <cmath>
#include "config.h"
#include "telemetry.h"

/**
 * @file jsn_sr04t_driver.h
 * @brief Physical sensor driver for JSN-SR04T / AJ-SR04M waterproof ultrasonic transducer.
 * 
 * Hardware Safety Warnings:
 * 1. JSN-SR04T requires 5.0V VCC.
 * 2. Echo pin outputs 5.0V pulses and MUST pass through a voltage divider (1kΩ/2kΩ)
 *    to provide 3.3V to the ESP32 Echo GPIO.
 * 3. Never connect Echo directly to an ESP32 GPIO.
 * 4. Common ground between sensor PSU and ESP32 GND is mandatory.
 */

namespace DrainX {

class JsnSr04tDriver {
public:
    struct RawReading {
        bool success;
        float distance_cm;
        uint32_t duration_us;
        FaultCode fault;
    };

    JsnSr04tDriver(
        int8_t trig_pin = Config::PIN_JSN_TRIG,
        int8_t echo_pin = Config::PIN_JSN_ECHO,
        uint32_t timeout_us = Config::JSN_ECHO_TIMEOUT_US
    ) : _trig_pin(trig_pin),
        _echo_pin(echo_pin),
        _timeout_us(timeout_us),
        _is_initialized(false)
    {}

    /**
     * @brief Configure GPIO pins for physical transducer.
     * MUST NOT be called in SIMULATION mode to enforce complete pin isolation.
     */
    void begin() {
        if (_trig_pin >= 0 && _echo_pin >= 0) {
            pinMode(_trig_pin, OUTPUT);
            digitalWrite(_trig_pin, LOW);
            pinMode(_echo_pin, INPUT);
            _is_initialized = true;
        }
    }

    /**
     * @brief Safe de-initialization returning pins to high-impedance state.
     */
    void stop() {
        if (_is_initialized && _trig_pin >= 0 && _echo_pin >= 0) {
            digitalWrite(_trig_pin, LOW);
            pinMode(_trig_pin, INPUT);
            _is_initialized = false;
        }
    }

    bool isInitialized() const {
        return _is_initialized;
    }

    /**
     * @brief Trigger transducer and capture raw echo pulse duration.
     * 
     * Timing & Blocking Characteristics:
     * - Trigger LOW stabilization: 4 microseconds.
     * - Trigger HIGH burst: 10 microseconds.
     * - Echo capture: Bounded by _timeout_us (default 25,000 µs = 25 ms).
     * - Total worst-case blocking duration: ~25.02 ms.
     * 
     * @return RawReading struct containing status, raw distance, pulse duration, and fault code.
     */
    RawReading readDistance() {
        RawReading r;
        r.success = false;
        r.distance_cm = NAN;
        r.duration_us = 0;
        r.fault = FaultCode::NONE;

        if (!_is_initialized) {
            r.fault = FaultCode::HARDWARE_NOT_INITIALIZED;
            return r;
        }

        // Step 1: Ensure clean LOW on Trigger line before pulsing
        digitalWrite(_trig_pin, LOW);
        delayMicroseconds(4);

        // Step 2: Emit 10 microsecond HIGH pulse to initiate 40 kHz ultrasonic burst
        digitalWrite(_trig_pin, HIGH);
        delayMicroseconds(Config::JSN_TRIGGER_PULSE_US);
        digitalWrite(_trig_pin, LOW);

        // Step 3: Measure HIGH pulse duration on Echo line with bounded timeout
        uint32_t duration = pulseIn(_echo_pin, HIGH, _timeout_us);
        r.duration_us = duration;

        // Step 4: Validate echo reception
        if (duration == 0) {
            // No echo pulse returned within timeout window (disconnected, out of range, or target absorb)
            r.fault = FaultCode::SENSOR_TIMEOUT;
            return r;
        }

        // Step 5: Convert pulse duration to one-way distance
        // Speed of sound at 20 degC: 343 m/s = 0.0343 cm/µs
        // Round trip: distance = (duration * 0.0343) / 2 = duration * 0.01715
        float distance = (duration * Config::SPEED_OF_SOUND_CM_PER_US) / 2.0f;

        // Step 6: Validate against physical transducer acoustic deadband (blind zone: 20 cm)
        if (distance < Config::SENSOR_DEADBAND_MIN_CM) {
            r.fault = FaultCode::ACOUSTIC_DEADBAND_VIOLATION;
            return r;
        }

        // Step 7: Validate against maximum plausible channel range (400 cm)
        if (distance > Config::SENSOR_RANGE_MAX_CM) {
            r.fault = FaultCode::OUT_OF_RANGE_MAX;
            return r;
        }

        r.success = true;
        r.distance_cm = distance;
        return r;
    }

    int8_t getTrigPin() const { return _trig_pin; }
    int8_t getEchoPin() const { return _echo_pin; }
    uint32_t getTimeoutUs() const { return _timeout_us; }

private:
    int8_t _trig_pin;
    int8_t _echo_pin;
    uint32_t _timeout_us;
    bool _is_initialized;
};

} // namespace DrainX
