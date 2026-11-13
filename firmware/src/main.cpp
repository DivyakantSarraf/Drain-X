/**
 * @file main.cpp
 * @brief DRAIN-X ESP32 Firmware Entry Point
 * 
 * Milestone: P0.3D YFS201 Physical Flow Sensor Integration & Mode Isolation
 * 
 * Implements non-blocking scheduling, physical JSN-SR04T ultrasonic driver,
 * physical YFS201 turbine flow meter driver, modular servo gate control,
 * and strict operational mode isolation.
 */

#include <Arduino.h>
#include "config.h"
#include "telemetry.h"
#include "sensor_manager.h"
#include "servo_driver.h"
#include "diagnostics.h"
#include "wifi_telemetry_manager.h"

// --- Global Sensor Engine, Actuator, Network & Scheduler State ---
static DrainX::SensorManager        sensorManager;
static DrainX::ServoDriver          servoDriver;
static DrainX::WifiTelemetryManager wifiTelemetryManager;

static uint32_t lastSampleTime = 0;
static uint32_t lastHeartbeatTime = 0;
static uint32_t scenarioCycleCounter = 0;
static bool autoCycleEnabled = true;

void setup() {
    // Initialize Serial diagnostics interface
    Serial.begin(DrainX::Config::SERIAL_BAUD_RATE);
    
    // Allow transient enumeration window for hardware USB serial
    uint32_t startWait = millis();
    while (!Serial && (millis() - startWait < 1500)) {
        delay(10);
    }

    // Print banner and initial operational status
    DrainX::Diagnostics::printBootBanner(
        sensorManager.getMode(),
        sensorManager.isFilterEnabled(),
        sensorManager.getReferenceHeightCm(),
        servoDriver.getServoModelName(),
        servoDriver.getState(),
        servoDriver.getCurrentAngle(),
        sensorManager.getFlowDriver().getPulsesPerLiter(),
        sensorManager.getValidationStageName()
    );
    DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());

    // Initialize Wi-Fi subsystem (strictly non-blocking)
    wifiTelemetryManager.begin();

    lastSampleTime = millis();
    lastHeartbeatTime = millis();
}

void loop() {
    uint32_t now = millis();

    // -------------------------------------------------------------------------
    // 1. Process Interactive Serial Commands (Non-blocking)
    // -------------------------------------------------------------------------
    while (Serial.available() > 0) {
        int inChar = Serial.read();

        // Manual Gate Actuator Commands ('g' = Open, 'c' = Close, 'x' = Hold)
        if (inChar == 'g' || inChar == 'G') {
            if (sensorManager.getMode() == DrainX::OperatingMode::SIMULATION) {
                DrainX::Diagnostics::logGateCommandRejected(
                    "OPEN",
                    "Actuation blocked in SIMULATION mode. Switch to PHYSICAL ('p') mode first."
                );
            } else if (servoDriver.isHoldEngaged()) {
                DrainX::Diagnostics::logGateCommandRejected(
                    "OPEN",
                    "Actuation blocked: Gate is in SOFTWARE_HOLD ('x'). Release hold before moving."
                );
            } else {
                if (servoDriver.openGate()) {
                    DrainX::Diagnostics::logGateCommandAck(
                        "OPEN (Diversion Bypass)",
                        servoDriver.getOpenAngle(),
                        servoDriver.getStateName()
                    );
                } else {
                    DrainX::Diagnostics::logGateCommandRejected("OPEN", "Failed to issue PWM duty cycle.");
                }
            }
        } else if (inChar == 'c' || inChar == 'C') {
            if (sensorManager.getMode() == DrainX::OperatingMode::SIMULATION) {
                DrainX::Diagnostics::logGateCommandRejected(
                    "CLOSE",
                    "Actuation blocked in SIMULATION mode. Switch to PHYSICAL ('p') mode first."
                );
            } else if (servoDriver.isHoldEngaged()) {
                DrainX::Diagnostics::logGateCommandRejected(
                    "CLOSE",
                    "Actuation blocked: Gate is in SOFTWARE_HOLD ('x'). Release hold before moving."
                );
            } else {
                if (servoDriver.closeGate()) {
                    DrainX::Diagnostics::logGateCommandAck(
                        "CLOSE (Main Channel)",
                        servoDriver.getClosedAngle(),
                        servoDriver.getStateName()
                    );
                } else {
                    DrainX::Diagnostics::logGateCommandRejected("CLOSE", "Failed to issue PWM duty cycle.");
                }
            }
        } else if (inChar == 'x' || inChar == 'X') {
            servoDriver.engageHold();
            DrainX::Diagnostics::logGateCommandAck(
                "SOFTWARE COMMAND HOLD",
                servoDriver.getCurrentAngle(),
                servoDriver.getStateName()
            );
        }

        // Flow Sensor Volume Totalizer Reset ('z')
        else if (inChar == 'z' || inChar == 'Z') {
            sensorManager.resetFlowVolume();
            DrainX::Diagnostics::logFlowTotalizerReset();
        }

        // Operational Mode Selection ('p' = PHYSICAL, 's' = SIMULATION)
        else if (inChar == 'p' || inChar == 'P') {
            const char* old_mode = sensorManager.getModeName();
            autoCycleEnabled = false;
            sensorManager.setMode(DrainX::OperatingMode::PHYSICAL);
            servoDriver.releaseHold();
            DrainX::Diagnostics::logModeChange(old_mode, sensorManager.getModeName());
        } else if (inChar == 's' || inChar == 'S') {
            const char* old_mode = sensorManager.getModeName();
            sensorManager.setMode(DrainX::OperatingMode::SIMULATION);
            servoDriver.stop(); // De-energizes physical servo
            DrainX::Diagnostics::logModeChange(old_mode, sensorManager.getModeName());
        }

        // Filter Configuration ('f' = Toggle Median Filter)
        else if (inChar == 'f' || inChar == 'F') {
            bool next_state = !sensorManager.isFilterEnabled();
            sensorManager.setFilterEnabled(next_state);
            DrainX::Diagnostics::logFilterToggle(next_state);
        }

        // Simulation Scenario Commands (effective in SIMULATION mode)
        else if (inChar == 'n' || inChar == 'N') {
            autoCycleEnabled = false;
            if (sensorManager.getMode() != DrainX::OperatingMode::SIMULATION) {
                sensorManager.setMode(DrainX::OperatingMode::SIMULATION);
                servoDriver.stop();
            }
            sensorManager.setScenario(DrainX::Config::SimulationScenario::NORMAL);
            DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
        } else if (inChar == 'r' || inChar == 'R') {
            autoCycleEnabled = false;
            if (sensorManager.getMode() != DrainX::OperatingMode::SIMULATION) {
                sensorManager.setMode(DrainX::OperatingMode::SIMULATION);
                servoDriver.stop();
            }
            sensorManager.setScenario(DrainX::Config::SimulationScenario::RISING_WATER);
            DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
        } else if (inChar == 'i' || inChar == 'I') {
            autoCycleEnabled = false;
            if (sensorManager.getMode() != DrainX::OperatingMode::SIMULATION) {
                sensorManager.setMode(DrainX::OperatingMode::SIMULATION);
                servoDriver.stop();
            }
            sensorManager.setScenario(DrainX::Config::SimulationScenario::INVALID_READING);
            DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
        } else if (inChar == 'a' || inChar == 'A') {
            autoCycleEnabled = true;
            scenarioCycleCounter = 0;
            if (sensorManager.getMode() != DrainX::OperatingMode::SIMULATION) {
                sensorManager.setMode(DrainX::OperatingMode::SIMULATION);
                servoDriver.stop();
            }
            sensorManager.setScenario(DrainX::Config::SimulationScenario::NORMAL);
            Serial.println();
            Serial.println(">>> AUTO-CYCLE MODE: Progressing through Normal, Rising, and Invalid scenarios.");
            DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
        }
        // Network Diagnostic Status ('w')
        else if (inChar == 'w' || inChar == 'W') {
            Serial.println();
            Serial.println("================================================================================");
            Serial.print(">>> [NETWORK STATUS] Wi-Fi State: "); Serial.println(wifiTelemetryManager.getStateName());
            Serial.print(">>> Assigned IP  : "); Serial.println(wifiTelemetryManager.getIpAddress());
            Serial.print(">>> Signal (RSSI): "); Serial.print(wifiTelemetryManager.getRssi()); Serial.println(" dBm");
            Serial.print(">>> Ingest Target: http://"); Serial.print(DrainX::Secrets::BACKEND_HOST);
            Serial.print(":"); Serial.print(DrainX::Secrets::BACKEND_PORT); Serial.println(DrainX::Secrets::INGEST_PATH);
            Serial.print(">>> Ingested Pkts: "); Serial.print(wifiTelemetryManager.getSuccessCount());
            Serial.print(" | Errors: "); Serial.println(wifiTelemetryManager.getFailureCount());
            Serial.println("================================================================================");
            Serial.println();
        } else if (inChar == '?' || inChar == 'h' || inChar == 'H') {
            DrainX::Diagnostics::printBootBanner(
                sensorManager.getMode(),
                sensorManager.isFilterEnabled(),
                sensorManager.getReferenceHeightCm(),
                servoDriver.getServoModelName(),
                servoDriver.getState(),
                servoDriver.getCurrentAngle(),
                sensorManager.getFlowDriver().getPulsesPerLiter(),
                sensorManager.getValidationStageName()
            );
        }
    }

    // -------------------------------------------------------------------------
    // 2. Non-blocking Wi-Fi State Machine Update (< 1 ms execution time)
    // -------------------------------------------------------------------------
    wifiTelemetryManager.update(now);

    // -------------------------------------------------------------------------
    // 3. Periodic Sensor Sampling & Telemetry Transmission
    // -------------------------------------------------------------------------
    if (now - lastSampleTime >= DrainX::Config::SAMPLE_INTERVAL_MS) {
        lastSampleTime = now;

        // Auto-cycle progression when in SIMULATION mode and unattended
        if (sensorManager.getMode() == DrainX::OperatingMode::SIMULATION && autoCycleEnabled) {
            scenarioCycleCounter++;
            if (scenarioCycleCounter == 12) {
                sensorManager.setScenario(DrainX::Config::SimulationScenario::RISING_WATER);
                DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
            } else if (scenarioCycleCounter == 36) {
                sensorManager.setScenario(DrainX::Config::SimulationScenario::INVALID_READING);
                DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
            } else if (scenarioCycleCounter >= 46) {
                scenarioCycleCounter = 0;
                sensorManager.setScenario(DrainX::Config::SimulationScenario::NORMAL);
                DrainX::Diagnostics::logScenarioChange(sensorManager.getScenarioName());
            }
        }

        // Execute sampling cycle: captures ultrasonic, flow, and gate state
        DrainX::TelemetryPacket packet = sensorManager.sample(
            now,
            servoDriver.getState(),
            servoDriver.getCurrentAngle()
        );
        DrainX::Diagnostics::logTelemetry(packet);

        // Transmit telemetry to FastAPI backend via HTTP (non-blocking / rate-limited)
        wifiTelemetryManager.sendTelemetry(packet, now);
    }

    // -------------------------------------------------------------------------
    // 4. Periodic Diagnostic Heartbeat (Non-blocking)
    // -------------------------------------------------------------------------
    if (now - lastHeartbeatTime >= DrainX::Config::HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = now;
        DrainX::Diagnostics::logHeartbeat(
            now,
            sensorManager.getSequenceNumber(),
            sensorManager.getMode(),
            sensorManager.isFilterEnabled(),
            servoDriver.getState(),
            servoDriver.getCurrentAngle(),
            sensorManager.getLatestPacket().total_volume_liters,
            wifiTelemetryManager.getStateName(),
            wifiTelemetryManager.getIpAddress()
        );
    }

    // Yield control to FreeRTOS background tasks
    yield();
}
