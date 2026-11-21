import type { DatabaseAdapter } from './adapter';

export const SQLITE_SYNC_MIGRATION_DDL = `
CREATE TABLE IF NOT EXISTS local_op_log (
  op_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  client_timestamp TEXT NOT NULL,
  hybrid_logical_clock TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  settings TEXT NOT NULL DEFAULT '{}',
  version_hlc TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS local_tombstones (
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  deleted_at_hlc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sqlite_local_op_log_status ON local_op_log (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sqlite_local_op_log_entity ON local_op_log (entity, user_id);
`;

/**
 * Applies the sync tables migration to an existing local SQLite database instance.
 */
export async function migrateSqliteSync(adapter: DatabaseAdapter): Promise<void> {
  const statements = SQLITE_SYNC_MIGRATION_DDL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of statements) {
    await adapter.execute(sql);
  }
}
