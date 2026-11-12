DROP TRIGGER IF EXISTS submissions_notify_queued ON submissions;
DROP FUNCTION IF EXISTS notify_submission_queued();
DROP INDEX IF EXISTS idx_submissions_queued;
DROP INDEX IF EXISTS submissions_user_idempotency_uq;
ALTER TABLE submissions DROP COLUMN IF EXISTS idempotency_key;
