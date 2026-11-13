#pragma once

#include <Arduino.h>
#include <stdint.h>
#include <cmath>
#include "config.h"
#include "telemetry.h"

/**
 * @file yfs201_driver.h
 * @brief Physical hardware driver for the YFS201 Hall-effect turbine water flow meter.
 * 
 * Hardware Safety Warnings:
 * 1. YFS201 operates at 5.0V VCC and emits a 5.0V square wave pulse output.
 * 2. ESP32 GPIOs are 3.3V logic ONLY and are NOT 5V tolerant!
 * 3. An external voltage divider (1kΩ/2kΩ) or logic level shifter MUST be placed
 *    between the YFS201 Yellow pulse wire and the ESP32 input pin (GPIO 27).
 * 4. Common system ground is strictly required.
 * 
 * Measurement Invariants:
 * - Interrupt handler (ISR) is minimal, executes in IRAM, and contains zero floating-point
 *   calculations or serial printing.
 * - Critical section synchronization (`noInterrupts()` / `interrupts()`) guarantees atomic
 *   reads and resets of the pulse counter.
 * - Zero pulses during a measurement interval indicates zero flow (0.0 L/min); it is a normal,
 *   valid physical state and MUST NOT be flagged as a sensor fault.
 */

namespace DrainX {

class Yfs201Driver {
public:
    struct FlowReading {
        bool is_valid;
        float flow_rate_l_min;
        float total_volume_liters;
        uint32_t interval_pulses;
        uint32_t total_pulses;
        uint32_t interval_ms;
        FaultCode fault;
    };

    Yfs201Driver(
        int8_t pin = Config::PIN_YFS201_FLOW,
        float pulses_per_liter = Config::YFS201_PULSES_PER_LITER
    ) : _pin(pin),
        _pulses_per_liter(pulses_per_liter),
        _pulse_count_interval(0),
        _pulse_count_total(0),
        _last_sample_ms(0),
        _is_initialized(false)
    {}

    /**
     * @brief Minimal IRAM interrupt service routine counting incoming turbine pulses.
     */
    static void IRAM_ATTR isrHandler(void* arg) {
        if (arg != nullptr) {
            auto* self = static_cast<Yfs201Driver*>(arg);
            self->_pulse_count_interval = self->_pulse_count_interval + 1;
            self->_pulse_count_total = self->_pulse_count_total + 1;
        }
    }

    /**
     * @brief Configure GPIO and attach rising-edge hardware interrupt.
     * MUST NOT be called in SIMULATION mode to enforce complete pin isolation.
     */
    bool begin() {
        if (_pin < 0) return false;

        pinMode(_pin, INPUT);
        _pulse_count_interval = 0;
        _pulse_count_total = 0;
        _last_sample_ms = millis();

        attachInterruptArg(digitalPinToInterrupt(_pin), isrHandler, this, RISING);
        _is_initialized = true;
        return true;
    }

    /**
     * @brief Detach hardware interrupt and release GPIO.
     */
    void stop() {
        if (_is_initialized && _pin >= 0) {
            detachInterrupt(digitalPinToInterrupt(_pin));
            _is_initialized = false;
        }
    }

    bool isInitialized() const {
        return _is_initialized;
    }

    /**
     * @brief Reset total pulse accumulation and volume counters.
     */
    void resetVolume() {
        noInterrupts();
        _pulse_count_interval = 0;
        _pulse_count_total = 0;
        _last_sample_ms = millis();
        interrupts();
    }

    /**
     * @brief Update the experimental calibration factor (pulses per liter).
     */
    void setPulsesPerLiter(float k) {
        if (k > 0.0f) {
            _pulses_per_liter = k;
        }
    }

    float getPulsesPerLiter() const {
        return _pulses_per_liter;
    }

    int8_t getPin() const {
        return _pin;
    }

    /**
     * @brief Sample flow rate and accumulated volume over the elapsed interval.
     * 
     * Formula:
     *   flow_rate_L_min = (pulses / pulses_per_liter) * (60,000 / dt_ms)
     *   total_volume_L  = total_pulses / pulses_per_liter
     * 
     * @param uptime_ms Current system timestamp in milliseconds.
     * @return FlowReading containing flow rate, volume, pulse counts, and validity.
     */
    FlowReading sample(uint32_t uptime_ms) {
        FlowReading r;
        r.is_valid = false;
        r.flow_rate_l_min = NAN;
        r.total_volume_liters = NAN;
        r.interval_pulses = 0;
        r.total_pulses = 0;
        r.interval_ms = 0;
        r.fault = FaultCode::NONE;

        if (!_is_initialized) {
            r.fault = FaultCode::HARDWARE_NOT_INITIALIZED;
            return r;
        }

        // Validate calibration constant
        if (_pulses_per_liter <= 0.0f) {
            r.fault = FaultCode::FLOW_CALIBRATION_INVALID;
            return r;
        }

        // Critical section: Atomically capture and reset interval counter
        noInterrupts();
        uint32_t pulses = _pulse_count_interval;
        _pulse_count_interval = 0;
        uint32_t total = _pulse_count_total;
        interrupts();

        uint32_t dt_ms = (uptime_ms >= _last_sample_ms) ? (uptime_ms - _last_sample_ms) : 1000;
        _last_sample_ms = uptime_ms;

        // Guard against zero elapsed duration
        if (dt_ms == 0) {
            dt_ms = 1;
        }

        r.interval_pulses = pulses;
        r.total_pulses = total;
        r.interval_ms = dt_ms;

        // Total accumulated volume in liters
        r.total_volume_liters = static_cast<float>(total) / _pulses_per_liter;

        // Instantaneous flow rate in Liters / minute
        if (pulses == 0) {
            // Zero pulses indicates no water is flowing through the turbine.
            // This is a normal, valid physical state.
            r.flow_rate_l_min = 0.0f;
            r.is_valid = true;
            return r;
        }

        float flow_rate = (static_cast<float>(pulses) * 60000.0f) / (_pulses_per_liter * static_cast<float>(dt_ms));

        // Cutoff noise below mechanical threshold
        if (flow_rate < Config::YFS201_MIN_FLOW_L_MIN) {
            flow_rate = 0.0f;
        }

        r.flow_rate_l_min = flow_rate;
        r.is_valid = true;
        return r;
    }

private:
    int8_t _pin;
    float _pulses_per_liter;
    volatile uint32_t _pulse_count_interval;
    volatile uint32_t _pulse_count_total;
    uint32_t _last_sample_ms;
    bool _is_initialized;
};

} // namespace DrainX
