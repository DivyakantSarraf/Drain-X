-- ====================================================================
-- DRAIN-X Schema Migration 002: Devices Registry & Operational Mode History
-- Target: Supabase / PostgreSQL 15+
-- Description:
--   1. Devices registry table for physical and simulated IoT edge nodes.
--   2. Operational mode history audit trail (SIMULATION, PHYSICAL, SAFE_HOLD).
--   3. Foreign key linkages connecting sensors to physical devices.
--   4. Performance indexes for time-range and source-isolated queries.
-- ====================================================================

-- 1. Devices Registry Table
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    hardware_model VARCHAR(64) NOT NULL DEFAULT 'ESP32 DevKit V1 (ESP-WROOM-32)',
    firmware_version VARCHAR(32) NOT NULL DEFAULT '0.3.7-p0.3g',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    validation_stage VARCHAR(32) NOT NULL DEFAULT 'SOFTWARE_ONLY',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Seed Default Prototype Node
INSERT INTO devices (device_id, name, hardware_model, firmware_version, validation_stage)
VALUES 
    ('DRAINX-ESP32-NODE-01', 'Primary Flume ESP32 Node', 'ESP32 DevKit V1 (ESP-WROOM-32)', '0.3.7-p0.3g', 'CONNECTIVITY_READY')
ON CONFLICT (device_id) DO UPDATE 
SET firmware_version = EXCLUDED.firmware_version,
    validation_stage = EXCLUDED.validation_stage;

-- 2. Add device_id reference and indexes to sensor_readings
ALTER TABLE sensor_readings 
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(64) REFERENCES devices(device_id) ON DELETE SET NULL;

-- Composite indexes for time-series range queries isolated by operational source
CREATE INDEX IF NOT EXISTS idx_sensor_readings_source_ts 
    ON sensor_readings (source, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_source_ts 
    ON sensor_readings (sensor_id, source, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_ts 
    ON sensor_readings (device_id, timestamp DESC);

-- 3. Operational Mode Transition History Audit Table
CREATE TABLE IF NOT EXISTS operational_mode_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_mode VARCHAR(32) NOT NULL,
    to_mode VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    reason TEXT NOT NULL,
    operator_id VARCHAR(64) DEFAULT 'SYSTEM',
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mode_history_timestamp 
    ON operational_mode_history (timestamp DESC);
