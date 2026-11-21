-- Day 5 (Person 1): PostgreSQL-backed submission queue. See /docs/architecture.md §2.

-- Idempotency-Key header: a retried POST /submissions returns the first submission.
ALTER TABLE submissions ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX submissions_user_idempotency_uq
    ON submissions (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Workers claim the oldest queued row (FOR UPDATE SKIP LOCKED); the partial index keeps that scan tiny.
CREATE INDEX idx_submissions_queued
    ON submissions (created_at, id)
    WHERE status = 'queued';

-- Wake idle workers immediately instead of waiting for their next poll.
CREATE FUNCTION notify_submission_queued() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('submission_queued', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submissions_notify_queued
    AFTER INSERT ON submissions
    FOR EACH ROW WHEN (NEW.status = 'queued')
    EXECUTE FUNCTION notify_submission_queued();
