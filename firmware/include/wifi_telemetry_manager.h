#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <stdint.h>
#include <stdio.h>
#include "config.h"
#include "telemetry.h"

/**
 * @file wifi_telemetry_manager.h
 * @brief Non-blocking Wi-Fi association and HTTP telemetry transmission for DRAIN-X ESP32.
 * 
 * Milestone: P0.3F ESP32 Wi-Fi Telemetry & FastAPI Integration.
 * 
 * Key Principles:
 * 1. Strictly Non-Blocking: Never executes while-loops waiting for Wi-Fi or HTTP.
 * 2. Bounded HTTP Operations: Strict 2-second timeout prevents network lag from starving
 *    ultrasonic sampling, turbine pulse counting, or manual gate actuation.
 * 3. Exponential Backoff: Exponential reconnection backoff on Wi-Fi loss or backend outage.
 * 4. Mode Isolation: Telemetry payload source strictly matches active mode (PHYSICAL vs SIMULATION).
 * 5. Open-Loop Actuation Guard: Backend gate directives are logged for diagnostic visibility
 *    only; network responses NEVER trigger automatic gate motion in this milestone.
 */

namespace DrainX {

class WifiTelemetryManager {
public:
    enum class NetworkState : uint8_t {
        NET_DISABLED = 0,
        NET_DISCONNECTED = 1,
        NET_CONNECTING = 2,
        NET_CONNECTED = 3,
        NET_BACKOFF = 4
    };

    WifiTelemetryManager()
        : _state(Config::WIFI_ENABLED ? NetworkState::NET_DISCONNECTED : NetworkState::NET_DISABLED),
          _last_state_change_ms(0),
          _last_tx_ms(0),
          _current_backoff_ms(Config::WIFI_INITIAL_RETRY_MS),
          _tx_success_count(0),
          _tx_failure_count(0),
          _consecutive_http_errors(0)
    {}

    /**
     * @brief Initialize Wi-Fi subsystem in station mode without blocking.
     */
    void begin() {
        if (!Config::WIFI_ENABLED) {
            _state = NetworkState::NET_DISABLED;
            return;
        }

        WiFi.mode(WIFI_STA);
        WiFi.disconnect(true);
        _state = NetworkState::NET_DISCONNECTED;
        _last_state_change_ms = millis();
        _current_backoff_ms = 0; // Trigger immediate initial connection attempt
    }

    /**
     * @brief Non-blocking state machine periodic update.
     * Must be called in each iteration of loop(). Execution takes < 1 ms.
     */
    void update(uint32_t now_ms) {
        if (_state == NetworkState::NET_DISABLED) return;

        switch (_state) {
            case NetworkState::NET_DISCONNECTED: {
                if (now_ms - _last_state_change_ms >= _current_backoff_ms) {
                    initiateConnection(now_ms);
                }
                break;
            }

            case NetworkState::NET_CONNECTING: {
                if (WiFi.status() == WL_CONNECTED) {
                    _state = NetworkState::NET_CONNECTED;
                    _last_state_change_ms = now_ms;
                    _current_backoff_ms = Config::WIFI_INITIAL_RETRY_MS;
                    _consecutive_http_errors = 0;
                    logWifiConnected();
                } else if (now_ms - _last_state_change_ms >= Config::WIFI_CONNECT_TIMEOUT_MS) {
                    WiFi.disconnect();
                    _state = NetworkState::NET_BACKOFF;
                    _last_state_change_ms = now_ms;
                    logWifiTimeout();
                    increaseBackoff();
                }
                break;
            }

            case NetworkState::NET_CONNECTED: {
                if (WiFi.status() != WL_CONNECTED) {
                    _state = NetworkState::NET_BACKOFF;
                    _last_state_change_ms = now_ms;
                    logWifiDisconnected();
                    increaseBackoff();
                }
                break;
            }

            case NetworkState::NET_BACKOFF: {
                if (now_ms - _last_state_change_ms >= _current_backoff_ms) {
                    _state = NetworkState::NET_DISCONNECTED;
                    _last_state_change_ms = now_ms;
                }
                break;
            }

            default:
                break;
        }
    }

    /**
     * @brief Serialize and transmit telemetry to FastAPI endpoint.
     * Enforces rate limiting, bounded timeouts, and operational mode matching.
     */
    bool sendTelemetry(const TelemetryPacket& packet, uint32_t now_ms) {
        if (_state != NetworkState::NET_CONNECTED) return false;

        // Apply transmission cadence rate-limit
        if (now_ms - _last_tx_ms < Config::TELEMETRY_TX_INTERVAL_MS) {
            return false;
        }

        // Apply backoff delay if experiencing consecutive HTTP errors
        if (_consecutive_http_errors > 3 && (now_ms - _last_tx_ms < _current_backoff_ms)) {
            return false;
        }

        _last_tx_ms = now_ms;

        // 1. Construct standard JSON payload matching FastAPI SensorReadingContract
        char payload[1024];
        buildJsonPayload(packet, payload, sizeof(payload));

        // 2. Perform bounded HTTP POST
        HTTPClient http;
        WiFiClient client;
        char url[128];
        snprintf(url, sizeof(url), "http://%s:%u%s",
                 Secrets::BACKEND_HOST, Secrets::BACKEND_PORT, Secrets::INGEST_PATH);

        http.setTimeout(Config::HTTP_TIMEOUT_MS);
        if (!http.begin(client, url)) {
            logTxError("Failed to initiate HTTP client connection");
            _tx_failure_count++;
            _consecutive_http_errors++;
            return false;
        }

        http.addHeader("Content-Type", "application/json");
        // Attach edge device authentication key if configured (P0.6.1)
        if (Secrets::DEVICE_API_KEY != nullptr && Secrets::DEVICE_API_KEY[0] != '\0') {
            http.addHeader("X-Device-Key", Secrets::DEVICE_API_KEY);
        }

        int httpCode = http.POST(reinterpret_cast<uint8_t*>(payload), strlen(payload));

        bool success = false;
        if (httpCode == HTTP_CODE_CREATED || httpCode == HTTP_CODE_OK) {
            _tx_success_count++;
            _consecutive_http_errors = 0;
            success = true;
            logTxSuccess(packet.sequence_number, httpCode);
        } else if (httpCode == 401 || httpCode == 403) {
            // Authentication rejection: Device key missing or rejected by FastAPI
            logAuthFailure(httpCode);
            _tx_failure_count++;
            _consecutive_http_errors++;
            increaseBackoff();
        } else if (httpCode == 409) {
            // Mode conflict: ESP32 mode does not match backend operational mode
            logModeConflict(packet.modeToString());
            _tx_failure_count++;
            _consecutive_http_errors++;
        } else {
            char reason[64];
            snprintf(reason, sizeof(reason), "HTTP Error %d: %s", httpCode, http.errorToString(httpCode).c_str());
            logTxError(reason);
            _tx_failure_count++;
            _consecutive_http_errors++;
            increaseBackoff();
        }

        http.end();
        return success;
    }

    bool isConnected() const {
        return _state == NetworkState::NET_CONNECTED && WiFi.status() == WL_CONNECTED;
    }

    NetworkState getState() const {
        return _state;
    }

    const char* getStateName() const {
        switch (_state) {
            case NetworkState::NET_DISABLED:     return "DISABLED";
            case NetworkState::NET_DISCONNECTED: return "DISCONNECTED";
            case NetworkState::NET_CONNECTING:   return "CONNECTING";
            case NetworkState::NET_CONNECTED:    return "CONNECTED";
            case NetworkState::NET_BACKOFF:      return "BACKOFF";
            default:                             return "UNKNOWN";
        }
    }

    String getIpAddress() const {
        if (_state == NetworkState::NET_CONNECTED) {
            return WiFi.localIP().toString();
        }
        return "0.0.0.0";
    }

    int8_t getRssi() const {
        if (_state == NetworkState::NET_CONNECTED) {
            return WiFi.RSSI();
        }
        return 0;
    }

    uint32_t getSuccessCount() const { return _tx_success_count; }
    uint32_t getFailureCount() const { return _tx_failure_count; }

private:
    NetworkState _state;
    uint32_t _last_state_change_ms;
    uint32_t _last_tx_ms;
    uint32_t _current_backoff_ms;
    uint32_t _tx_success_count;
    uint32_t _tx_failure_count;
    uint32_t _consecutive_http_errors;

    void initiateConnection(uint32_t now_ms) {
        _state = NetworkState::NET_CONNECTING;
        _last_state_change_ms = now_ms;
        WiFi.begin(Secrets::WIFI_SSID, Secrets::WIFI_PASSWORD);

        Serial.println();
        Serial.print(">>> [WIFI] Initiating association with SSID: '");
        Serial.print(Secrets::WIFI_SSID);
        Serial.println("' (Non-blocking)...");
    }

    void increaseBackoff() {
        if (_current_backoff_ms == 0) {
            _current_backoff_ms = Config::WIFI_INITIAL_RETRY_MS;
        } else {
            _current_backoff_ms = _current_backoff_ms * 2;
            if (_current_backoff_ms > Config::WIFI_MAX_BACKOFF_MS) {
                _current_backoff_ms = Config::WIFI_MAX_BACKOFF_MS;
            }
        }
    }

    void buildJsonPayload(const TelemetryPacket& packet, char* buffer, size_t max_len) {
        // Determine values and health strings conforming to SensorReadingContract
        const char* src_str = (packet.source == DataSource::PHYSICAL) ? "PHYSICAL" : "SIMULATED";
        const char* us_status = packet.is_valid ? "OK" : "FAULT";
        float us_val = packet.is_valid ? packet.water_depth_cm : 0.0f;
        float raw_dist = packet.is_valid ? packet.raw_distance_cm : 0.0f;

        const char* flow_status = packet.flow_valid ? "OK" : "FAULT";
        float flow_val = packet.flow_valid ? packet.flow_rate_l_min : 0.0f;
        float total_vol = packet.flow_valid ? packet.total_volume_liters : 0.0f;

        // Generate batch array containing WATER_LEVEL and FLOW_RATE readings
        snprintf(
            buffer, max_len,
            "["
              "{"
                "\"sensor_id\":\"%s\","
                "\"section_id\":\"%s\","
                "\"sensor_type\":\"WATER_LEVEL\","
                "\"value\":%.2f,"
                "\"unit\":\"cm\","
                "\"source\":\"%s\","
                "\"status\":\"%s\","
                "\"metadata\":{"
                  "\"device_id\":\"%s\","
                  "\"firmware_version\":\"%s\","
                  "\"raw_distance_cm\":%.2f,"
                  "\"is_valid\":%s,"
                  "\"is_filtered\":%s,"
                  "\"fault_code\":\"%s\","
                  "\"validation_stage\":\"%s\","
                  "\"gate_state\":\"%s\","
                  "\"gate_angle_deg\":%.1f,"
                  "\"uptime_ms\":%lu,"
                  "\"sequence_number\":%lu"
                "}"
              "},"
              "{"
                "\"sensor_id\":\"%s\","
                "\"section_id\":\"%s\","
                "\"sensor_type\":\"FLOW_RATE\","
                "\"value\":%.2f,"
                "\"unit\":\"L/min\","
                "\"source\":\"%s\","
                "\"status\":\"%s\","
                "\"metadata\":{"
                  "\"device_id\":\"%s\","
                  "\"firmware_version\":\"%s\","
                  "\"is_valid\":%s,"
                  "\"total_volume_liters\":%.3f,"
                  "\"flow_pulse_count\":%lu,"
                  "\"fault_code\":\"%s\","
                  "\"validation_stage\":\"%s\","
                  "\"uptime_ms\":%lu,"
                  "\"sequence_number\":%lu"
                "}"
              "}"
            "]",
            // Item 1: Ultrasonic Level
            Config::SENSOR_ID,
            Config::SECTION_ID,
            us_val,
            src_str,
            us_status,
            Config::DEVICE_ID,
            Config::FIRMWARE_VERSION,
            raw_dist,
            packet.is_valid ? "true" : "false",
            packet.is_filtered ? "true" : "false",
            packet.faultToString(),
            packet.validationStageToString(),
            packet.gateStateToString(),
            std::isnan(packet.gate_angle_deg) ? 0.0f : packet.gate_angle_deg,
            static_cast<unsigned long>(packet.uptime_ms),
            static_cast<unsigned long>(packet.sequence_number),
            // Item 2: Flow Sensor
            Config::FLOW_SENSOR_ID,
            Config::SECTION_ID,
            flow_val,
            src_str,
            flow_status,
            Config::DEVICE_ID,
            Config::FIRMWARE_VERSION,
            packet.flow_valid ? "true" : "false",
            total_vol,
            static_cast<unsigned long>(packet.flow_pulse_count),
            packet.faultToString(),
            packet.validationStageToString(),
            static_cast<unsigned long>(packet.uptime_ms),
            static_cast<unsigned long>(packet.sequence_number)
        );
    }

    void logWifiConnected() {
        Serial.println();
        Serial.println("================================================================================");
        Serial.print(">>> [WIFI CONNECTED] IP: ");
        Serial.print(WiFi.localIP());
        Serial.print(" | Subnet: ");
        Serial.print(WiFi.subnetMask());
        Serial.print(" | Gateway: ");
        Serial.print(WiFi.gatewayIP());
        Serial.print(" | RSSI: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");
        Serial.print(">>> Ingestion Target: http://");
        Serial.print(Secrets::BACKEND_HOST);
        Serial.print(":");
        Serial.print(Secrets::BACKEND_PORT);
        Serial.println(Secrets::INGEST_PATH);
        if (Secrets::DEVICE_API_KEY != nullptr && Secrets::DEVICE_API_KEY[0] != '\0') {
            Serial.println(">>> Device Auth: X-Device-Key configured (masked: [PROTECTED_KEY_ATTACHED])");
        } else {
            Serial.println(">>> Device Auth: X-Device-Key unconfigured (Open development mode)");
        }
        Serial.println("================================================================================");
        Serial.println();
    }

    void logWifiTimeout() {
        Serial.println();
        Serial.print(">>> [WIFI TIMEOUT] Failed to connect to '");
        Serial.print(Secrets::WIFI_SSID);
        Serial.print("'. Retrying in ");
        Serial.print(_current_backoff_ms / 1000);
        Serial.println("s (Physical sensors remain operational)...");
        Serial.println();
    }

    void logWifiDisconnected() {
        Serial.println();
        Serial.print(">>> [WIFI DISCONNECTED] Carrier lost. Retrying in ");
        Serial.print(_current_backoff_ms / 1000);
        Serial.println("s (Physical sensors remain operational)...");
        Serial.println();
    }

    void logTxSuccess(uint32_t seq, int http_code) {
        Serial.print(" [NET TX] #");
        if (seq < 10) Serial.print("00");
        else if (seq < 100) Serial.print("0");
        Serial.print(seq);
        Serial.print(" Ingested (HTTP ");
        Serial.print(http_code);
        Serial.print(") -> http://");
        Serial.print(Secrets::BACKEND_HOST);
        Serial.print(":");
        Serial.print(Secrets::BACKEND_PORT);
        Serial.println(Secrets::INGEST_PATH);
    }

    void logModeConflict(const char* current_mode) {
        Serial.println();
        Serial.print(">>> [NET TX REJECTED - HTTP 409 CONFLICT] Operational mode mismatch! ESP32 sent ");
        Serial.print(current_mode);
        Serial.println(", but FastAPI backend is in different mode.");
        Serial.println(">>> Use FastAPI '/api/v1/status/mode' to synchronize backend operational mode.");
        Serial.println();
    }

    void logAuthFailure(int http_code) {
        Serial.println();
        Serial.print(">>> [NET TX REJECTED - HTTP ");
        Serial.print(http_code);
        Serial.println(" UNAUTHORIZED] Backend rejected device authentication!");
        Serial.println(">>> Ensure Secrets::DEVICE_API_KEY in secrets.h matches backend DEVICE_INGEST_API_KEY.");
        Serial.println();
    }

    void logTxError(const char* reason) {
        Serial.print(" [NET TX ERROR] ");
        Serial.print(reason);
        Serial.print(" (Total failures: ");
        Serial.print(_tx_failure_count + 1);
        Serial.println(")");
    }
};

} // namespace DrainX
