-- Migration: 002_sync_tables
-- Description: Creates offline-first sync infrastructure tables:
--   - sync_op_log (distributed operation log with server_seq, op_id, HLC, idempotency)
--   - sync_devices (registered client devices, last-seen HLC, cursors)
--   - user_settings (synchronized user preferences with LWW versioning)
--   - sync_tombstones (tombstone markers for deleted entities with TTL)
-- Author: Person 2
-- Date: 2026-11-12

BEGIN;

-- ============================================================================
-- 1. sync_op_log (Append-Only Distributed Operation Log)
-- ============================================================================

CREATE TABLE sync_op_log (
    server_seq              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    op_id                   UUID NOT NULL,
    device_id               TEXT NOT NULL,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity                  TEXT NOT NULL,
    operation_type          TEXT NOT NULL,
    payload                 JSONB NOT NULL,
    client_timestamp        TIMESTAMPTZ NOT NULL,
    hybrid_logical_clock    TEXT NOT NULL,
    schema_version          INTEGER NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sync_op_log_op_id_uq UNIQUE (op_id),
    CONSTRAINT sync_op_log_entity_chk CHECK (
        entity IN ('submission', 'attempt', 'user_stats', 'settings', 'tombstone', 'problem')
    ),
    CONSTRAINT sync_op_log_op_type_chk CHECK (
        operation_type IN ('INSERT', 'UPDATE', 'DELETE', 'UPSERT')
    )
);

COMMENT ON TABLE sync_op_log IS 'Distributed operation log capturing all client mutations for offline-first replication.';
COMMENT ON COLUMN sync_op_log.server_seq IS 'Monotonically increasing sequence assigned exclusively by PostgreSQL; serves as the incremental pull cursor.';
COMMENT ON COLUMN sync_op_log.op_id IS 'Client-generated UUID for idempotency deduplication.';
COMMENT ON COLUMN sync_op_log.hybrid_logical_clock IS 'Hybrid Logical Clock string (physical_ms.logical_counter.device_id) for causal ordering.';

-- Keyset cursor pagination index for incremental pull
CREATE INDEX idx_sync_op_log_server_seq
    ON sync_op_log (server_seq ASC);

-- User-scoped incremental pull index
CREATE INDEX idx_sync_op_log_user_seq
    ON sync_op_log (user_id, server_seq ASC);

-- Device sync history & troubleshooting
CREATE INDEX idx_sync_op_log_device
    ON sync_op_log (device_id, created_at DESC);

-- Entity lookup & audit
CREATE INDEX idx_sync_op_log_entity
    ON sync_op_log (entity, user_id);

-- Causal order / HLC inspection
CREATE INDEX idx_sync_op_log_hlc
    ON sync_op_log (hybrid_logical_clock);

-- ============================================================================
-- 2. sync_devices (Device Registration & Watermark Tracker)
-- ============================================================================

CREATE TABLE sync_devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       TEXT NOT NULL,
    device_name     TEXT,
    client_version  TEXT,
    last_seen_hlc   TEXT,
    last_synced_seq BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sync_devices_user_device_uq UNIQUE (user_id, device_id)
);

COMMENT ON TABLE sync_devices IS 'Registered user client devices with watermarks and last-seen HLC for clone detection.';

CREATE INDEX idx_sync_devices_user
    ON sync_devices (user_id);

CREATE TRIGGER trg_sync_devices_updated_at
    BEFORE UPDATE ON sync_devices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. user_settings (LWW Synchronized User Preferences)
-- ============================================================================

CREATE TABLE user_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    version_hlc     TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_settings IS 'User application settings and preferences synced via Last-Write-Wins (LWW) based on HLC.';

CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. sync_tombstones (Tombstones for Soft Deletion Propagation)
-- ============================================================================

CREATE TABLE sync_tombstones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity          TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    deleted_at_hlc  TEXT NOT NULL,
    server_seq      BIGINT REFERENCES sync_op_log(server_seq) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sync_tombstones_user_entity_id_uq UNIQUE (user_id, entity, entity_id)
);

COMMENT ON TABLE sync_tombstones IS 'Tombstone markers preventing resurrection of deleted records across partitioned clients.';

-- Tombstone cleanup index for 90-day TTL expiration
CREATE INDEX idx_sync_tombstones_created_at
    ON sync_tombstones (created_at);

-- User-scoped tombstone sync index
CREATE INDEX idx_sync_tombstones_user_seq
    ON sync_tombstones (user_id, server_seq ASC);

COMMIT;
