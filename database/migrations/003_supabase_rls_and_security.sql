-- ====================================================================
-- DRAIN-X Schema Migration 003: Supabase Row Level Security & RBAC Policies
-- Target: Supabase / PostgreSQL 15+
-- Milestone: P0.6 / P0.6.1 Cloud Provisioning & Security Validation
-- Description:
--   1. Enables Row Level Security (RLS) across all 10 core tables.
--   2. Enforces Principle of Least Privilege:
--      - `service_role` (Backend FastAPI): Full CRUD across all tables.
--      - `anon` (Public Frontend / Digital Twin): Read-only on public telemetry,
--        sanitized device status, drainage sections, active alerts, and predictions.
--        No access to operational mode history or internal experiment logs.
--      - `authenticated` (Standard Citizens): Read-only access to public telemetry and alerts.
--      - `authenticated` with `app_metadata.role` IN ('worker', 'municipality', 'admin'):
--        Can read operational mode audit trails and update/acknowledge alerts.
--   3. Explicitly rejects client-controlled `user_metadata` for role elevation.
--      Roles MUST originate from trusted JWT `app_metadata` set by server/admin.
--   4. Adds high-efficiency composite indexes for time-series range queries.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Enable Row Level Security (RLS) on all core tables
-- --------------------------------------------------------------------
ALTER TABLE drainage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_mode_history ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 2. Drop legacy / broad policies if they exist (Clean Idempotency)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS service_role_drainage_sections ON drainage_sections;
DROP POLICY IF EXISTS service_role_sensor_metadata ON sensor_metadata;
DROP POLICY IF EXISTS service_role_sensor_readings ON sensor_readings;
DROP POLICY IF EXISTS service_role_sensor_readings_rollup ON sensor_readings_rollup;
DROP POLICY IF EXISTS service_role_alerts ON alerts;
DROP POLICY IF EXISTS service_role_blockage_events ON blockage_events;
DROP POLICY IF EXISTS service_role_predictions ON predictions;
DROP POLICY IF EXISTS service_role_experiment_sessions ON experiment_sessions;
DROP POLICY IF EXISTS service_role_devices ON devices;
DROP POLICY IF EXISTS service_role_operational_mode_history ON operational_mode_history;

DROP POLICY IF EXISTS anon_read_drainage_sections ON drainage_sections;
DROP POLICY IF EXISTS anon_read_sensor_metadata ON sensor_metadata;
DROP POLICY IF EXISTS anon_read_sensor_readings ON sensor_readings;
DROP POLICY IF EXISTS anon_read_sensor_readings_rollup ON sensor_readings_rollup;
DROP POLICY IF EXISTS anon_read_alerts ON alerts;
DROP POLICY IF EXISTS anon_read_blockage_events ON blockage_events;
DROP POLICY IF EXISTS anon_read_predictions ON predictions;
DROP POLICY IF EXISTS anon_read_devices ON devices;

DROP POLICY IF EXISTS authenticated_read_sensor_readings ON sensor_readings;
DROP POLICY IF EXISTS municipal_read_mode_history ON operational_mode_history;
DROP POLICY IF EXISTS municipal_update_alerts ON alerts;

-- --------------------------------------------------------------------
-- 3. Service Role Policies (Backend FastAPI Ingestion & System Automation)
-- --------------------------------------------------------------------
-- The service_role key is held exclusively in backend environment variables.
-- It has full access to persist sensor telemetry, record devices, and log mode history.

CREATE POLICY service_role_drainage_sections ON drainage_sections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_sensor_metadata ON sensor_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_sensor_readings ON sensor_readings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_sensor_readings_rollup ON sensor_readings_rollup FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_alerts ON alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_blockage_events ON blockage_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_predictions ON predictions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_experiment_sessions ON experiment_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_devices ON devices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_operational_mode_history ON operational_mode_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- 4. Anonymous / Public Read-Only Policies (SCADA Twin & Public Dashboard)
-- --------------------------------------------------------------------
-- Public access is strictly limited to SELECT on verified public telemetry, topology, and alerts.
-- Mutation (INSERT, UPDATE, DELETE) is completely prohibited for anon.
-- Operational mode history and experiment sessions are never exposed to anon.

CREATE POLICY anon_read_drainage_sections ON drainage_sections FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_sensor_metadata ON sensor_metadata FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_sensor_readings ON sensor_readings FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_sensor_readings_rollup ON sensor_readings_rollup FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_alerts ON alerts FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_blockage_events ON blockage_events FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_predictions ON predictions FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_devices ON devices FOR SELECT TO anon USING (is_active = true);

-- --------------------------------------------------------------------
-- 5. Authenticated RBAC Policies (Citizens, Workers, Municipal Operators)
-- --------------------------------------------------------------------
-- Least-Privilege Rules:
-- 1. Standard authenticated users (Citizens) can read public telemetry and drainage models.
-- 2. Privileged operations strictly check `auth.jwt() -> 'app_metadata' ->> 'role'`.
--    Client-editable `user_metadata` is NEVER trusted for role authorization!

-- Standard read access for all logged-in users
CREATE POLICY authenticated_read_sensor_readings ON sensor_readings FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_drainage_sections ON drainage_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_sensor_metadata ON sensor_metadata FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_alerts ON alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_predictions ON predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_devices ON devices FOR SELECT TO authenticated USING (is_active = true);

-- Municipal Operators & Field Workers: Read Operational Mode Transition History
CREATE POLICY municipal_read_mode_history ON operational_mode_history FOR SELECT TO authenticated 
USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('worker', 'municipality', 'admin')
);

-- Municipal Operators & Field Workers: Acknowledge and resolve alerts
CREATE POLICY municipal_update_alerts ON alerts FOR UPDATE TO authenticated 
USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('worker', 'municipality', 'admin')
)
WITH CHECK (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('worker', 'municipality', 'admin')
);

-- --------------------------------------------------------------------
-- 6. Performance Composite Indexes
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sensor_readings_composite_lookup
    ON sensor_readings (sensor_id, source, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_devices_active_validation
    ON devices (is_active, validation_stage);

CREATE INDEX IF NOT EXISTS idx_mode_history_to_mode_ts
    ON operational_mode_history (to_mode, timestamp DESC);
