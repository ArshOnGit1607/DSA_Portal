DROP TRIGGER IF EXISTS submissions_notify_queued ON submissions;
CREATE TRIGGER submissions_notify_queued
    AFTER INSERT ON submissions
    FOR EACH ROW WHEN (NEW.status = 'queued')
    EXECUTE FUNCTION notify_submission_queued();
DROP INDEX IF EXISTS idx_submissions_failed;
DROP INDEX IF EXISTS idx_submissions_running_lease;
ALTER TABLE submissions
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS locked_until,
    DROP COLUMN IF EXISTS lock_token,
    DROP COLUMN IF EXISTS run_after,
    DROP COLUMN IF EXISTS attempts;
