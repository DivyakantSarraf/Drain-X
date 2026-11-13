#pragma once

#include <stdint.h>

/**
 * @file secrets.example.h
 * @brief Template configuration for local Wi-Fi and backend network credentials.
 * 
 * Instructions:
 * 1. Copy this file to firmware/include/secrets.h
 * 2. Fill in your actual Wi-Fi SSID, Password, and FastAPI backend host IP.
 * 3. Note that secrets.h is excluded from Git via .gitignore.
 */

namespace DrainX {
namespace Secrets {

    // --- Local Wi-Fi Credentials ---
    constexpr const char* WIFI_SSID         = "YOUR_WIFI_SSID";
    constexpr const char* WIFI_PASSWORD     = "YOUR_WIFI_PASSWORD";

    // --- Backend Ingestion Server Endpoint ---
    constexpr const char* BACKEND_HOST      = "192.168.1.100"; // IPv4 address of machine running FastAPI
    constexpr uint16_t    BACKEND_PORT      = 8000;            // FastAPI default port
    constexpr const char* INGEST_PATH       = "/api/v1/telemetry/ingest";

    // --- Edge Device Authentication (P0.6.1) ---
    // Configurable API key matching backend DEVICE_INGEST_API_KEY. Leave empty ("") if unconfigured.
    constexpr const char* DEVICE_API_KEY    = "";

} // namespace Secrets
} // namespace DrainX
