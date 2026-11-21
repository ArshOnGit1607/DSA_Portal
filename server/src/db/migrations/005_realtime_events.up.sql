-- Day 7 (Person 1): real-time events over PostgreSQL LISTEN/NOTIFY instead of Redis pub/sub (CR-021).
-- Every API instance LISTENs on 'dsa_events' and forwards to its own Socket.IO clients, so no adapter is needed.
-- Payloads stay small (NOTIFY caps them at 8000 bytes): clients fetch details over REST.

CREATE FUNCTION notify_submission_event() RETURNS trigger AS $$
DECLARE
    slug TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
        RETURN NEW; -- e.g. a stalled job re-claimed while already running
    END IF;
    SELECT p.slug INTO slug FROM problems p WHERE p.id = NEW.problem_id;
    PERFORM pg_notify('dsa_events', json_build_object(
        'event', CASE NEW.status
                   WHEN 'queued'  THEN 'submission:queued'
                   WHEN 'running' THEN 'submission:running'
                   ELSE 'submission:finished' END,
        'userId', NEW.user_id,
        'data', json_build_object('submissionId', NEW.id, 'problemId', slug, 'status', NEW.status,
                                  'passed', NEW.passed, 'total', NEW.total)
    )::text);
    -- A fully passing submission can change the ranking; everyone refetches GET /leaderboard.
    IF NEW.status = 'judged' AND NEW.total > 0 AND NEW.passed = NEW.total THEN
        PERFORM pg_notify('dsa_events', json_build_object(
            'event', 'leaderboard:updated',
            'data', json_build_object('userId', NEW.user_id, 'problemId', slug))::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submissions_notify_event
    AFTER INSERT OR UPDATE OF status ON submissions
    FOR EACH ROW EXECUTE FUNCTION notify_submission_event();

-- Inserting today's row is what announces it, so daily:new fires exactly once per day
-- however many workers or requests race to create it (ON CONFLICT DO NOTHING inserts nothing).
CREATE FUNCTION notify_daily_challenge() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('dsa_events', json_build_object(
        'event', 'daily:new',
        'data', json_build_object('date', NEW.challenge_date,
                                  'problemId', (SELECT slug FROM problems WHERE id = NEW.problem_id)))::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_challenges_notify_new
    AFTER INSERT ON daily_challenges
    FOR EACH ROW EXECUTE FUNCTION notify_daily_challenge();

-- Leaderboard: only solved rows, filtered by first_solved_at for period=week.
CREATE INDEX idx_ups_leaderboard
    ON user_problem_stats (first_solved_at)
    WHERE solved;
