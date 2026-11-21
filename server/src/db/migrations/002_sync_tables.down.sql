-- Migration: 002_sync_tables (Down)
-- Description: Rolls back sync infrastructure tables, triggers, and indexes.
-- Author: Person 2
-- Date: 2026-11-12

BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
DROP TRIGGER IF EXISTS trg_sync_devices_updated_at ON sync_devices;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS sync_tombstones CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS sync_devices CASCADE;
DROP TABLE IF EXISTS sync_op_log CASCADE;

COMMIT;
