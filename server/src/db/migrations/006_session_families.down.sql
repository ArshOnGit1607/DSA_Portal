DROP INDEX IF EXISTS idx_sessions_family;
ALTER TABLE sessions DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE sessions DROP COLUMN IF EXISTS family_id;
