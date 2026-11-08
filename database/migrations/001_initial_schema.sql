-- ====================================================================
-- DRAIN-X Initial Schema Migration
-- Target: Supabase / PostgreSQL 15+
-- Description: Core tables for telemetry, alerts, blockages, and experiments
-- ====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Drainage Sections Registry
CREATE TABLE IF NOT EXISTS drainage_sections (
    section_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    length_cm NUMERIC(8, 2) NOT NULL,
    width_cm NUMERIC(8, 2) NOT NULL,
    depth_cm NUMERIC(8, 2) NOT NULL,
    critical_level_cm NUMERIC(8, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Sensor Metadata Registry
CREATE TABLE IF NOT EXISTS sensor_metadata (
    sensor_id VARCHAR(64) PRIMARY KEY,
    section_id VARCHAR(64) NOT NULL REFERENCES drainage_sections(section_id) ON DELETE CASCADE,
    sensor_type VARCHAR(32) NOT NULL, -- WATER_LEVEL, FLOW_RATE, TEMPERATURE, DEBRIS_PRESENCE
    unit VARCHAR(16) NOT NULL,        -- cm, L/min, degC, flag
    baseline_offset_cm NUMERIC(8, 2) DEFAULT 0.0,
    status VARCHAR(16) NOT NULL DEFAULT 'OK',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Raw Sensor Telemetry
CREATE TABLE IF NOT EXISTS sensor_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id VARCHAR(64) NOT NULL REFERENCES sensor_metadata(sensor_id) ON DELETE CASCADE,
    section_id VARCHAR(64) NOT NULL,
    sensor_type VARCHAR(32) NOT NULL,
    value NUMERIC(10, 3) NOT NULL,
    unit VARCHAR(16) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'SIMULATED', -- PHYSICAL, SIMULATED, REPLAY
    status VARCHAR(16) NOT NULL DEFAULT 'OK',
    timestamp TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient time-series range queries
CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_ts ON sensor_readings (sensor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_section_ts ON sensor_readings (section_id, timestamp DESC);

-- 4. Rollup Telemetry (1-minute aggregations for long-term trends)
CREATE TABLE IF NOT EXISTS sensor_readings_rollup (
    bucket_time TIMESTAMPTZ NOT NULL,
    sensor_id VARCHAR(64) NOT NULL REFERENCES sensor_metadata(sensor_id) ON DELETE CASCADE,
    avg_value NUMERIC(10, 3) NOT NULL,
    min_value NUMERIC(10, 3) NOT NULL,
    max_value NUMERIC(10, 3) NOT NULL,
    sample_count INTEGER NOT NULL,
    PRIMARY KEY (bucket_time, sensor_id)
);

-- 5. System Alerts Log
CREATE TABLE IF NOT EXISTS alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id VARCHAR(64) NOT NULL REFERENCES drainage_sections(section_id) ON DELETE CASCADE,
    alert_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'WARNING', -- INFO, WARNING, HIGH, CRITICAL
    message TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    resolved_at TIMESTAMPTZ,
    context_data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts (resolved, timestamp DESC);

-- 6. Blockage Events Log
CREATE TABLE IF NOT EXISTS blockage_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id VARCHAR(64) NOT NULL REFERENCES drainage_sections(section_id) ON DELETE CASCADE,
    probable_segment VARCHAR(128) NOT NULL,
    confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    differential_head_cm NUMERIC(8, 2) NOT NULL,
    estimated_flow_drop_lpm NUMERIC(8, 2) DEFAULT 0.0,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 7. Prediction Records (Time-To-Critical & Flood Risk)
CREATE TABLE IF NOT EXISTS predictions (
    prediction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id VARCHAR(64) NOT NULL REFERENCES drainage_sections(section_id) ON DELETE CASCADE,
    state VARCHAR(32) NOT NULL DEFAULT 'STABLE', -- STABLE, ESTIMATING, OVERFLOW, UNAVAILABLE
    ttc_seconds NUMERIC(8, 1),
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.0,
    rate_of_rise_cm_s NUMERIC(8, 4) NOT NULL DEFAULT 0.0,
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. Experiment and Benchmarking Sessions
CREATE TABLE IF NOT EXISTS experiment_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL,
    description TEXT,
    scenario_type VARCHAR(64) NOT NULL, -- CLEAN_FLOW, GRADUAL_DEBRIS, FLASH_SURGE, SENSOR_FAULT
    source VARCHAR(16) NOT NULL DEFAULT 'SIMULATION', -- SIMULATION or PHYSICAL
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    ended_at TIMESTAMPTZ,
    metrics JSONB DEFAULT '{}'::jsonb
);

-- Seed Baseline Drainage Network Topology
INSERT INTO drainage_sections (section_id, name, description, length_cm, width_cm, depth_cm, critical_level_cm)
VALUES 
    ('SEC_INFLOW', 'Inflow Sump & Pump Channel', 'Water circulation inlet section', 30.0, 10.0, 15.0, 12.0),
    ('SEC_SCREENING', 'Primary Screening & Winch Zone', 'Mechanical screening and lifting tray', 30.0, 10.0, 15.0, 12.0),
    ('SEC_OUTLET', 'Downstream Outlet & Weir Zone', 'Sharp-crested contracted measurement weir', 40.0, 10.0, 15.0, 12.0)
ON CONFLICT (section_id) DO NOTHING;

-- Seed Baseline Sensors
INSERT INTO sensor_metadata (sensor_id, section_id, sensor_type, unit, baseline_offset_cm, status)
VALUES 
    ('US_UPSTREAM_01', 'SEC_SCREENING', 'WATER_LEVEL', 'cm', 0.0, 'OK'),
    ('US_WEIR_02', 'SEC_OUTLET', 'WATER_LEVEL', 'cm', 0.0, 'OK'),
    ('PUMP_INFLOW_01', 'SEC_INFLOW', 'FLOW_RATE', 'L/min', 0.0, 'OK')
ON CONFLICT (sensor_id) DO NOTHING;
