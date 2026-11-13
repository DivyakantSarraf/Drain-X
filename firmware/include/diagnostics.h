#pragma once

#include <Arduino.h>
#include <stdio.h>
#include "config.h"
#include "telemetry.h"

/**
 * @file diagnostics.h
 * @brief Serial diagnostic logging, banners, and telemetry formatting.
 * 
 * Milestone: P0.3D YFS201 Physical Flow Sensor Integration & Mode Isolation.
 */

namespace DrainX {
namespace Diagnostics {

    // ANSI Color Escape Codes
    namespace Color {
        constexpr const char* RESET   = "\033[0m";
        constexpr const char* BOLD    = "\033[1m";
        constexpr const char* RED     = "\033[31m";
        constexpr const char* GREEN   = "\033[32m";
        constexpr const char* YELLOW  = "\033[33m";
        constexpr const char* BLUE    = "\033[34m";
        constexpr const char* MAGENTA = "\033[35m";
        constexpr const char* CYAN    = "\033[36m";
        constexpr const char* WHITE   = "\033[37m";
    }

    /**
     * @brief Print an ISO-style uptime timestamp: [HH:MM:SS.mmm]
     */
    inline void printUptimeTag(uint32_t uptime_ms) {
        uint32_t total_sec = uptime_ms / 1000;
        uint32_t ms = uptime_ms % 1000;
        uint32_t hours = total_sec / 3600;
        uint32_t mins = (total_sec % 3600) / 60;
        uint32_t secs = total_sec % 60;

        char buf[32];
        snprintf(
            buf, 
            sizeof(buf), 
            "[%02lu:%02lu:%02lu.%03lu]", 
            static_cast<unsigned long>(hours), 
            static_cast<unsigned long>(mins), 
            static_cast<unsigned long>(secs), 
            static_cast<unsigned long>(ms)
        );
        Serial.print(buf);
    }

    /**
     * @brief Print system initialization banner and diagnostic metadata.
     */
    inline void printBootBanner(
        OperatingMode active_mode,
        bool filter_active,
        float ref_height_cm,
        const char* servo_model_name,
        GateState gate_state,
        float gate_angle,
        float flow_cal_k,
        const char* validation_stage_name = "SOFTWARE_ONLY"
    ) {
        Serial.println();
        Serial.println("================================================================================");
        Serial.println("    ____  ____  ___    _____   __       _  __");
        Serial.println("   / __ \\/ __ \\/   |  /  _/ | / /      | |/ /");
        Serial.println("  / / / / /_/ / /| |  / / |  |/ / ______ |   / ");
        Serial.println(" / /_/ / _, _/ ___ |_/ /  | /| | /_____//   |  ");
        Serial.println("/_____/_/ |_/_/  |_/___/  |/ |_|       /_/|_|  ");
        Serial.println();
        Serial.println(" Integrated Predictive Urban Drainage Intelligence System");
        Serial.println(" Embedded Node Firmware - P0.3G Incremental Hardware Readiness & Validation");
        Serial.println("================================================================================");
        
        Serial.print(" Device ID          : "); Serial.println(Config::DEVICE_ID);
        Serial.print(" Firmware Version   : "); Serial.println(Config::FIRMWARE_VERSION);
        Serial.print(" Target Platform    : "); Serial.println(Config::HARDWARE_MODEL);
        Serial.print(" CPU Frequency      : "); Serial.print(ESP.getCpuFreqMHz()); Serial.println(" MHz");
        Serial.print(" Free Heap Memory   : "); Serial.print(ESP.getFreeHeap()); Serial.println(" bytes");
        Serial.print(" Ultrasonic Sensor  : "); Serial.println(Config::SENSOR_ID);
        Serial.print(" Reference Datum    : "); Serial.print(ref_height_cm, 1); Serial.println(" cm (Transducer to dry bed)");
        Serial.print(" Ultrasonic Pinout  : ");
        Serial.print("TRIG = GPIO "); Serial.print(Config::PIN_JSN_TRIG);
        Serial.print(" (Safe non-strapping) | ECHO = GPIO "); Serial.print(Config::PIN_JSN_ECHO);
        Serial.println(" (via 1k/2k ohm divider)");
        Serial.print(" Flow Sensor (YFS)  : "); Serial.println(Config::FLOW_SENSOR_ID);
        Serial.print(" Flow Pinout        : "); Serial.print("PULSE = GPIO "); Serial.print(Config::PIN_YFS201_FLOW);
        Serial.print(" (Interrupt via divider) | Cal Factor: "); Serial.print(flow_cal_k, 1); Serial.println(" pulses/L");
        Serial.print(" Gate Actuator      : "); Serial.println(servo_model_name);
        Serial.print(" Gate Pinout        : "); Serial.print("GPIO "); Serial.print(Config::PIN_SERVO_GATE);
        Serial.print(" (PWM 50 Hz, 14-bit) | Commanded: ");
        if (gate_state == GateState::OPEN) Serial.print("OPEN");
        else if (gate_state == GateState::CLOSED) Serial.print("CLOSED");
        else if (gate_state == GateState::HOLD) Serial.print("SOFTWARE_HOLD");
        else Serial.print("UNINITIALIZED");
        Serial.print(" @ "); Serial.print(std::isnan(gate_angle) ? 0.0f : gate_angle, 1); Serial.println(" deg (Open-Loop Directive)");
        Serial.print(" Wi-Fi Target SSID  : "); Serial.println(Secrets::WIFI_SSID);
        Serial.print(" FastAPI Ingestion  : http://"); Serial.print(Secrets::BACKEND_HOST); Serial.print(":"); Serial.print(Secrets::BACKEND_PORT); Serial.println(Secrets::INGEST_PATH);
        Serial.print(" Active Mode        : "); 
        Serial.println(active_mode == OperatingMode::PHYSICAL ? "PHYSICAL (Hardware Active)" : "SIMULATION (Hardware Isolated)");
        Serial.print(" 5-Sample Filter    : "); 
        Serial.println(filter_active ? "ENABLED (Moving median, +2.0s phase lag)" : "DISABLED (Raw measurements)");
        Serial.print(" Validation Stage   : "); Serial.println(validation_stage_name != nullptr ? validation_stage_name : "SOFTWARE_ONLY");
        Serial.println("--------------------------------------------------------------------------------");
        Serial.println(" ELECTRICAL SAFETY & ISOLATION REQUIREMENTS:");
        Serial.println(" 1. Dedicated external 5V/2A PSU for servo and 5V sensors.");
        Serial.println(" 2. DO NOT power servo from ESP32 3.3V or USB rail.");
        Serial.println(" 3. YFS201 and JSN-SR04T Echo are 5.0V pulses: 1k/2k ohm dividers are mandatory.");
        Serial.println(" 4. Water pump MUST be powered from dedicated supply; separate from ESP32/sensors.");
        Serial.println(" 5. Common system ground is strictly required across all DC supplies.");
        Serial.println(" 6. Zero pulses indicates zero flow (normal physical state, not a fault).");
        Serial.println(" 7. Gate commands are open-loop directives; no physical position feedback exists.");
        Serial.println(" 8. Wi-Fi operations are strictly non-blocking; network loss never stalls sensors.");
        Serial.println("--------------------------------------------------------------------------------");
        Serial.println(" COMMANDS:");
        Serial.println("   'p' - Switch to PHYSICAL operational mode (live hardware sensing & actuation)");
        Serial.println("   's' - Switch to SIMULATION mode (isolates physical sensors & servo)");
        Serial.println("   'g' - Manual command: OPEN gate (PHYSICAL mode only)");
        Serial.println("   'c' - Manual command: CLOSE gate (PHYSICAL mode only)");
        Serial.println("   'x' - Enter SOFTWARE COMMAND HOLD (lock out new gate movements)");
        Serial.println("   'z' - Reset/Zero flow totalizer volume counter");
        Serial.println("   'w' - Print Wi-Fi & network ingestion diagnostic status");
        Serial.println("   'f' - Toggle Moving Median Filter (ON / OFF)");
        Serial.println("   'h' - Reprint diagnostic help & status");
        Serial.println("================================================================================");
        Serial.println();
    }

    /**
     * @brief Format and log a telemetry packet to Serial.
     * Integrated Physical Diagnostics meeting P0.3E validation standards.
     */
    inline void logTelemetry(const TelemetryPacket& packet) {
        printUptimeTag(packet.uptime_ms);
        Serial.print(" ");

        // Operational Mode & Telemetry Origin
        Serial.print("[");
        Serial.print(packet.modeToString());
        Serial.print(packet.source == DataSource::PHYSICAL ? " (HW)" : " (SIM)");
        if (packet.is_filtered) {
            Serial.print("-FLTR");
        }
        Serial.print("] #");
        if (packet.sequence_number < 10) Serial.print("00");
        else if (packet.sequence_number < 100) Serial.print("0");
        Serial.print(packet.sequence_number);
        Serial.print(" | ");

        // Ultrasonic Water Level Channel
        Serial.print("US: ");
        if (packet.is_valid) {
            Serial.print("Dist=");
            Serial.print(packet.raw_distance_cm, 1);
            Serial.print("cm Depth=");
            Serial.print(packet.water_depth_cm, 1);
            Serial.print("cm [OK]");
        } else {
            Serial.print("[FAIL: ");
            Serial.print(packet.faultToString());
            Serial.print("]");
        }

        // Flow Sensor Channel
        Serial.print(" | FLOW: ");
        if (packet.flow_valid) {
            Serial.print(packet.flow_rate_l_min, 2);
            Serial.print(" L/min (Tot: ");
            Serial.print(packet.total_volume_liters, 3);
            Serial.print(" L, ");
            Serial.print(packet.flow_pulse_count);
            Serial.print(" pls) [OK]");
        } else {
            Serial.print("[INVALID/UNINIT]");
        }

        // Commanded Gate Posture (Explicitly Open-Loop)
        Serial.print(" | GATE[CMD]: ");
        Serial.print(packet.gateStateToString());
        Serial.print(" @ ");
        Serial.print(std::isnan(packet.gate_angle_deg) ? 0.0f : packet.gate_angle_deg, 1);
        Serial.print(" deg (Open-Loop)");

        // Overall Node Health & Alarms
        Serial.print(" | Node: ");
        if (packet.health == SensorHealth::OK) {
            Serial.print("[OK]");
        } else if (packet.health == SensorHealth::DEGRADED) {
            Serial.print("[DEGRADED: ");
            Serial.print(packet.faultToString());
            Serial.print("]");
        } else {
            Serial.print("[FAULT: ");
            Serial.print(packet.faultToString());
            Serial.print("]");
        }

        if (packet.is_valid && packet.water_depth_cm >= Config::THRESHOLD_CRITICAL_CM) {
            Serial.print(" *** CRITICAL WATER LEVEL ***");
        } else if (packet.is_valid && packet.water_depth_cm >= Config::THRESHOLD_WARNING_CM) {
            Serial.print(" ** WARNING: HIGH WATER **");
        }
        Serial.println();
    }

    /**
     * @brief Log gate command acknowledgment.
     */
    inline void logGateCommandAck(const char* action, float target_angle, const char* state_name) {
        Serial.println();
        Serial.print(">>> [GATE COMMAND ACK] Requested: ");
        Serial.print(action);
        Serial.print(" | Commanded Angle: ");
        Serial.print(target_angle, 1);
        Serial.print(" deg | New State: ");
        Serial.println(state_name);
        Serial.println();
    }

    /**
     * @brief Log gate command rejection with detailed reason.
     */
    inline void logGateCommandRejected(const char* action, const char* reason) {
        Serial.println();
        Serial.print(">>> [GATE COMMAND REJECTED] Action '");
        Serial.print(action);
        Serial.print("' BLOCKED: ");
        Serial.println(reason);
        Serial.println();
    }

    /**
     * @brief Log flow totalizer reset event.
     */
    inline void logFlowTotalizerReset() {
        Serial.println();
        Serial.println(">>> [FLOW TOTALIZER RESET] Accumulated volume and pulse counter reset to 0.000 L.");
        Serial.println();
    }

    /**
     * @brief Log operational mode change event.
     */
    inline void logModeChange(const char* from_mode, const char* to_mode) {
        Serial.println();
        Serial.println("********************************************************************************");
        Serial.print(">>> OPERATIONAL MODE SWITCH: ");
        Serial.print(from_mode);
        Serial.print(" ---> ");
        Serial.println(to_mode);
        Serial.println("********************************************************************************");
        Serial.println();
    }

    /**
     * @brief Log scenario transition event.
     */
    inline void logScenarioChange(const char* scenario_name) {
        Serial.println();
        Serial.print(">>> SCENARIO SWITCHED >>> Active: ");
        Serial.println(scenario_name);
        Serial.println();
    }

    /**
     * @brief Log filter toggle event.
     */
    inline void logFilterToggle(bool enabled) {
        Serial.println();
        Serial.print(">>> FILTER TOGGLE: Moving Median (N=5) is now ");
        Serial.println(enabled ? "ENABLED (+2.0s phase lag)" : "DISABLED (Raw pass-through)");
        Serial.println();
    }

    /**
     * @brief Log periodic system diagnostic heartbeat.
     */
    inline void logHeartbeat(
        uint32_t uptime_ms,
        uint32_t total_samples,
        OperatingMode mode,
        bool filter_enabled,
        GateState gate_state,
        float gate_angle,
        float total_volume_liters,
        const char* net_state = "IDLE",
        const String& ip_str = "0.0.0.0"
    ) {
        printUptimeTag(uptime_ms);
        Serial.print(" [DIAGNOSTIC HEARTBEAT] Uptime: ");
        Serial.print(uptime_ms / 1000);
        Serial.print("s | Samples: ");
        Serial.print(total_samples);
        Serial.print(" | Mode: ");
        Serial.print(mode == OperatingMode::PHYSICAL ? "PHYSICAL" : "SIMULATION");
        Serial.print(" | Vol: ");
        Serial.print(total_volume_liters, 3);
        Serial.print(" L | Net: ");
        Serial.print(net_state);
        if (ip_str != "0.0.0.0") {
            Serial.print(" (");
            Serial.print(ip_str);
            Serial.print(")");
        }
        Serial.print(" | Gate: ");
        if (gate_state == GateState::OPEN) Serial.print("OPEN");
        else if (gate_state == GateState::CLOSED) Serial.print("CLOSED");
        else if (gate_state == GateState::HOLD) Serial.print("HOLD");
        else Serial.print("UNINIT");
        Serial.print(" | Filter: ");
        Serial.print(filter_enabled ? "ON" : "OFF");
        Serial.print(" | Heap: ");
        Serial.print(ESP.getFreeHeap());
        Serial.println(" B");
    }

} // namespace Diagnostics
} // namespace DrainX
