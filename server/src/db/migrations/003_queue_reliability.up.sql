-- Day 6 (Person 1): retries with backoff, stalled-job recovery (leases) and a dead-letter list.
-- See /docs/queue-design.md. Dead letter = status 'failed' (last_error says why).

ALTER TABLE submissions
    ADD COLUMN attempts     INTEGER NOT NULL DEFAULT 0,   -- claims so far; counts crashed runs too
    ADD COLUMN run_after    TIMESTAMPTZ NOT NULL DEFAULT now(), -- retry backoff: not claimable before this
    ADD COLUMN lock_token   UUID,                          -- changes on every claim; fences out zombie workers
    ADD COLUMN locked_until TIMESTAMPTZ,                   -- lease; a running row past it is stalled
    ADD COLUMN last_error   TEXT;

-- Stalled-job scan: running rows whose lease ran out.
CREATE INDEX idx_submissions_running_lease
    ON submissions (locked_until)
    WHERE status = 'running';

-- Admin dead-letter list, newest first.
CREATE INDEX idx_submissions_failed
    ON submissions (judged_at DESC, id DESC)
    WHERE status = 'failed';

-- Also wake workers when a row goes back to 'queued' (retry, admin requeue), not only on insert.
DROP TRIGGER submissions_notify_queued ON submissions;
CREATE TRIGGER submissions_notify_queued
    AFTER INSERT OR UPDATE OF status ON submissions
    FOR EACH ROW WHEN (NEW.status = 'queued')
    EXECUTE FUNCTION notify_submission_queued();
