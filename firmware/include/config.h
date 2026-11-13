#pragma once

#include <stdint.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

/**
 * @file config.h
 * @brief Centralized configuration constants for DRAIN-X ESP32 firmware node.
 * 
 * Milestone: P0.3F ESP32 Wi-Fi Telemetry & FastAPI Integration.
 * 
 * ============================================================================
 * ELECTRICAL SAFETY, ISOLATION & WIRING REQUIREMENTS (BENCH PROTOTYPE):
 * ============================================================================
 * 1. ESP32 GPIOs are 3.3V logic ONLY and are NOT 5V tolerant.
 * 
 * 2. ULTRASONIC SENSOR (JSN-SR04T):
 *    - VCC: 5.0V external DC power supply.
 *    - TRIG: GPIO 25 (Output, 3.3V logic accepted directly by sensor).
 *      NOTE: Replaces GPIO 5 to prevent MTDO strapping conflict during boot.
 *    - ECHO: GPIO 18 (Input, 5.0V pulse MUST BE STEPPED DOWN via 1k/2k divider).
 * 
 * 3. FLOW SENSOR (YFS201 Turbine Hall Effect Meter):
 *    - VCC (Red wire): 5.0V external DC power supply (operating range: 4.5V - 18V).
 *    - GND (Black wire): Tied directly to common system ground.
 *    - SIGNAL (Yellow wire): Hall pulse output (5V square wave when powered at 5V).
 *      WARNING: ESP32 GPIOs are NOT 5V tolerant!
 *      A passive 1k/2k ohm voltage divider or 3.3V logic level shifter MUST be placed
 *      between the YFS201 Yellow signal wire and ESP32 GPIO 27:
 *        YFS201 Yellow Wire ----[ 1k ohm ]----+----> ESP32 GPIO 27
 *                                                |
 *                                            [ 2k ohm ]
 *                                                |
 *                                               GND
 *      Divided Voltage: 5.0V * (2000 / (1000 + 2000)) = 3.33V (Safe for ESP32).
 * 
 * 4. ACTUATOR (SG90 / MG996R Servo):
 *    - VCC (Red wire): Dedicated external 5.0V / 2.0A power rail.
 *      WARNING: NEVER POWER SERVO FROM ESP32 3.3V PIN (destroys LDO regulator).
 *      WARNING: DO NOT RELY ON USB 5V (servo stall current: SG90 ~500-800mA, 
 *               MG996R ~1.5-2.5A; causes brownout resets).
 *    - GND (Brown/Black wire): Tied directly to common system ground.
 *    - SIGNAL (Orange/Yellow wire): GPIO 19 (ESP32 3.3V PWM output).
 *    - Decoupling capacitor (100uF - 470uF) across servo 5V and GND strongly recommended.
 * 
 * 5. WATER CIRCULATION PUMP (INDUCTIVE LOAD ISOLATION):
 *    - The miniature submersible water pump circulates water through the PVC model flume.
 *    - Water pumps generate high inductive kickback and electrical motor noise.
 *    - Dedicated power supply (e.g. separate 12V or 5V DC supply) MUST power the pump.
 *    - NEVER power the pump from ESP32 USB 5V or 3.3V rails.
 *    - If switched via relay or MOSFET, an anti-parallel flyback diode (1N4007) across the pump
 *      motor leads and optocoupler isolation are mandatory to prevent MCU brownout/crashes.
 *    - Route pump motor wiring away from ultrasonic echo (GPIO 18) and flow pulse (GPIO 27) lines.
 * 
 * 6. COMMON GROUND: Sensor GND, Flow GND, Servo GND, ESP32 GND, and External 5V PSU GND
 *    MUST ALL BE TIED TOGETHER.
 * ============================================================================
 */

namespace DrainX {

enum class OperatingMode : uint8_t {
    SIMULATION = 0,
    PHYSICAL = 1,
    SAFE_HOLD = 2
};

enum class GateState : uint8_t {
    CLOSED = 0,
    OPEN = 1,
    HOLD = 2,
    UNINITIALIZED = 3
};

enum class ServoModel : uint8_t {
    SG90_MICRO = 0,        // Lightweight nylon-gear micro servo
    MG996R_HIGH_TORQUE = 1 // Metal-gear high-torque servo (candidate upgrade)
};

namespace Config {

    // --- Device Identification ---
    constexpr const char* DEVICE_ID        = "DRAINX-ESP32-NODE-01";
    constexpr const char* FIRMWARE_VERSION = "0.3.7-p0.3g";
    constexpr const char* HARDWARE_MODEL   = "ESP32 DevKit V1 (ESP-WROOM-32)";
    constexpr const char* SECTION_ID       = "SEC_SCREENING_01";
    constexpr const char* SENSOR_ID        = "US_UPSTREAM_01";
    constexpr const char* FLOW_SENSOR_ID   = "FS_FLUME_01";
    constexpr const char* ACTUATOR_ID      = "GATE_DIVERSION_01";

    // --- Network & Wi-Fi Configuration ---
    constexpr bool WIFI_ENABLED                = true;
    constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 8000;   // 8-second non-blocking connection window
    constexpr uint32_t WIFI_INITIAL_RETRY_MS   = 5000;   // 5-second initial retry backoff
    constexpr uint32_t WIFI_MAX_BACKOFF_MS     = 30000;  // 30-second maximum retry backoff
    constexpr uint32_t HTTP_TIMEOUT_MS         = 2000;   // 2-second bounded HTTP timeout
    constexpr uint32_t TELEMETRY_TX_INTERVAL_MS = 2000;  // 0.5 Hz network transmission cadence (2s)

    // --- Serial & Diagnostics ---
    constexpr uint32_t SERIAL_BAUD_RATE    = 115200;
    constexpr bool ENABLE_COLOR_OUTPUT     = true;
    constexpr bool LOG_VERBOSE             = true;

    // --- Timing & Loop Scheduling ---
    constexpr uint32_t SAMPLE_INTERVAL_MS  = 1000;  // 1 Hz sampling cadence
    constexpr uint32_t HEARTBEAT_INTERVAL_MS = 5000; // 5-second diagnostic heartbeat

    // --- Hardware Pin Assignment (VERIFIED BENCH CONFIGURATION) ---
    // Note: GPIO 25 replaces GPIO 5 to eliminate ESP32 MTDO strapping-pin boot conflict
    constexpr int8_t PIN_JSN_TRIG          = 25;  // GPIO 25 (Output): 10us ultrasonic trigger pulse
    constexpr int8_t PIN_JSN_ECHO          = 18;  // GPIO 18 (Input): Ultrasonic echo via 1k/2k divider
    constexpr int8_t PIN_SERVO_GATE        = 19;  // GPIO 19 (PWM Output): Servo gate signal (50 Hz)
    constexpr int8_t PIN_YFS201_FLOW       = 27;  // GPIO 27 (Interrupt Input): YFS201 flow pulse via divider

    // --- JSN-SR04T Transducer Specs & Timing ---
    constexpr uint32_t JSN_TRIGGER_PULSE_US = 10;     // 10us trigger duration
    constexpr uint32_t JSN_ECHO_TIMEOUT_US  = 25000;  // 25ms timeout (~4.28m max range)
    constexpr float SPEED_OF_SOUND_CM_PER_US = 0.0343f; // 343 m/s at 20 degC in dry air

    // --- YFS201 Flow Sensor Calibration & Specifications ---
    // Standard datasheet nominal: f = 7.5 * Q (Hz) => 450 pulses per liter.
    // NOTE: Subject to experimental bucket calibration on actual bench fluid loop.
    constexpr float YFS201_PULSES_PER_LITER = 450.0f;  // Pulses / Liter calibration constant
    constexpr float YFS201_MIN_FLOW_L_MIN   = 0.3f;   // Measurement threshold below which flow is considered 0
    constexpr float YFS201_MAX_FLOW_L_MIN   = 35.0f;  // Maximum plausible flow rate for 1/2" meter

    // --- Flume Physical & Sensor Geometry ---
    constexpr float MOUNTING_HEIGHT_CM     = 35.0f; // Baseline mounting height above bed
    constexpr float CHANNEL_HEIGHT_CM      = 15.0f; // Maximum physical channel capacity
    constexpr float SENSOR_DEADBAND_MIN_CM = 20.0f; // JSN-SR04T acoustic deadband (blind zone)
    constexpr float SENSOR_RANGE_MAX_CM    = 400.0f;// Plausible ultrasound range limit

    // --- Operational Thresholds (Hydraulic Safety Limits) ---
    constexpr float THRESHOLD_WARNING_CM   = 8.0f;  // Advisory warning threshold
    constexpr float THRESHOLD_CRITICAL_CM  = 12.0f; // Critical flood diversion trigger

    // --- Servo Gate Actuator Configuration ---
    constexpr ServoModel ACTIVE_SERVO_MODEL = ServoModel::SG90_MICRO;

    constexpr uint32_t SERVO_PWM_FREQ_HZ    = 50;     // Standard 50 Hz PWM (20 ms period)
    constexpr uint8_t  SERVO_PWM_RESOLUTION = 14;     // 14-bit resolution (0..16383)

    constexpr uint32_t SG90_PULSE_MIN_US    = 544;
    constexpr uint32_t SG90_PULSE_MAX_US    = 2400;

    constexpr uint32_t MG996R_PULSE_MIN_US  = 500;
    constexpr uint32_t MG996R_PULSE_MAX_US  = 2500;

    constexpr uint32_t SERVO_PULSE_MIN_US   = (ACTIVE_SERVO_MODEL == ServoModel::MG996R_HIGH_TORQUE)
                                                ? MG996R_PULSE_MIN_US : SG90_PULSE_MIN_US;
    constexpr uint32_t SERVO_PULSE_MAX_US   = (ACTIVE_SERVO_MODEL == ServoModel::MG996R_HIGH_TORQUE)
                                                ? MG996R_PULSE_MAX_US : SG90_PULSE_MAX_US;

    // Provisional Calibrated Gate Positions (Bench Placeholders)
    constexpr float GATE_CLOSED_ANGLE       = 0.0f;   // Channel gate closed: downstream flow
    constexpr float GATE_OPEN_ANGLE         = 90.0f;  // Channel gate open: bypass diversion

    constexpr float SERVO_MIN_SAFE_ANGLE    = 0.0f;   // Lower mechanical boundary
    constexpr float SERVO_MAX_SAFE_ANGLE    = 90.0f;  // Upper mechanical boundary

    constexpr float SERVO_DEADBAND_DEG      = 0.5f;   // Deadband to suppress jitter
    constexpr uint32_t SERVO_SETTLE_MS      = 500;    // Mechanical settling time

    // --- Filtering Configuration ---
    constexpr bool FILTER_DEFAULT_ENABLED  = false; // Raw by default for transparency
    constexpr uint8_t FILTER_WINDOW_SIZE   = 5;

    // --- Operational Mode Defaults ---
    constexpr OperatingMode DEFAULT_MODE   = OperatingMode::SIMULATION;

    // --- Simulation Configuration ---
    constexpr bool SIMULATION_MODE_ENABLED = true;

    enum class SimulationScenario : uint8_t {
        NORMAL = 0,         // Normal steady flow (4.0 - 5.5 cm, ~2.8 L/min)
        RISING_WATER = 1,   // Progressive flood wave (4.0 -> 14.5 cm, ~3.0 -> 12.0 L/min)
        INVALID_READING = 2 // Acoustic echo loss / out-of-range dropout
    };

    constexpr SimulationScenario DEFAULT_SCENARIO = SimulationScenario::NORMAL;

} // namespace Config
} // namespace DrainX
