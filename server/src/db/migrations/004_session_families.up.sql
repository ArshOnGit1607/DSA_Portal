-- CR-014 (Person 3): refresh-token families for rotation with reuse detection.
-- family_id: every refresh token issued from one login shares it; revoked_at: set when the token is
-- rotated (used up) or its family is revoked. Presenting a revoked token = reuse → revoke the family.
ALTER TABLE sessions ADD COLUMN family_id UUID;
ALTER TABLE sessions ADD COLUMN revoked_at TIMESTAMPTZ;

UPDATE sessions SET family_id = id WHERE family_id IS NULL;
-- Rows rotated under the old scheme were marked with expires_at = epoch.
UPDATE sessions SET revoked_at = now() WHERE expires_at = 'epoch'::timestamptz;

ALTER TABLE sessions ALTER COLUMN family_id SET NOT NULL;
CREATE INDEX idx_sessions_family ON sessions (family_id);
