DROP INDEX IF EXISTS idx_ups_leaderboard;
DROP TRIGGER IF EXISTS daily_challenges_notify_new ON daily_challenges;
DROP FUNCTION IF EXISTS notify_daily_challenge();
DROP TRIGGER IF EXISTS submissions_notify_event ON submissions;
DROP FUNCTION IF EXISTS notify_submission_event();
