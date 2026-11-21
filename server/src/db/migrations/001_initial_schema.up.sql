-- Migration: 001_initial_schema
-- Description: Creates the full DSA Practice Platform database schema.
-- Author: Person 2
-- Date: 2026-11-09
--
-- Tables created:
--   users, sessions, problems, test_cases, hints, solutions,
--   submissions, user_problem_stats, daily_challenges, audit_log, sync_operations
--
-- Custom types: user_role, difficulty, submission_status

BEGIN;

-- ============================================================================
-- Custom enum types
-- ============================================================================

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE difficulty AS ENUM ('Easy', 'Medium', 'Hard');
CREATE TYPE submission_status AS ENUM ('queued', 'running', 'judged', 'failed');

-- ============================================================================
-- 1. users
-- ============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT NOT NULL,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT users_username_uq UNIQUE (username),
    CONSTRAINT users_email_uq    UNIQUE (email),
    CONSTRAINT users_username_len CHECK (char_length(username) BETWEEN 3 AND 30),
    CONSTRAINT users_email_fmt   CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

COMMENT ON TABLE users IS 'Registered platform users (students and admins).';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash of the user password. Never store plaintext.';

-- ============================================================================
-- 2. sessions (hashed refresh tokens)
-- ============================================================================

CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sessions_token_hash_uq UNIQUE (token_hash)
);

COMMENT ON TABLE sessions IS 'Refresh-token sessions. Stores sha256(refresh_token), not the raw token.';

-- Cleanup expired sessions (cron job)
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- FK index: cascade delete, logout-all, list user sessions
CREATE INDEX idx_sessions_user_id ON sessions (user_id);

-- ============================================================================
-- 3. problems
-- ============================================================================

CREATE TABLE problems (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT NOT NULL,
    title        TEXT NOT NULL,
    topic        TEXT NOT NULL,
    difficulty   difficulty NOT NULL,
    description  TEXT NOT NULL,
    starter_code TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT problems_slug_uq    UNIQUE (slug),
    CONSTRAINT problems_topic_chk  CHECK (topic IN (
        'Arrays', 'Strings', 'LinkedList', 'Trees',
        'Graphs', 'Dynamic Programming', 'Sorting', 'Searching'
    ))
);

COMMENT ON TABLE problems IS 'DSA problems. slug is the human-readable URL identifier (e.g. "two-sum").';
COMMENT ON COLUMN problems.topic IS 'TEXT with CHECK — easier to extend than a PG ENUM type.';
COMMENT ON COLUMN problems.is_published IS 'Draft problems (false) are hidden from non-admin users.';

-- Q1: random problem by topic + difficulty; Q: filtered problem list
CREATE INDEX idx_problems_topic_difficulty
    ON problems (topic, difficulty)
    WHERE is_published = true;

-- Keyset cursor pagination for problem list
CREATE INDEX idx_problems_cursor
    ON problems (created_at, id)
    WHERE is_published = true;

-- ============================================================================
-- 4. test_cases
-- ============================================================================

CREATE TABLE test_cases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    input       JSONB NOT NULL,
    expected    JSONB NOT NULL,
    is_sample   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT test_cases_sort_uq UNIQUE (problem_id, sort_order)
);

COMMENT ON TABLE test_cases IS 'Test cases for problems. JSONB input/expected matches core engine unknown type.';
COMMENT ON COLUMN test_cases.is_sample IS 'Sample test cases are visible to users; non-sample are judge-only.';

-- Note: UNIQUE (problem_id, sort_order) already creates an index covering
-- the main query: SELECT ... WHERE problem_id = $1 ORDER BY sort_order.

-- ============================================================================
-- 5. hints
-- ============================================================================

CREATE TABLE hints (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    level       INTEGER NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hints_level_uq  UNIQUE (problem_id, level),
    CONSTRAINT hints_level_chk CHECK (level >= 1)
);

COMMENT ON TABLE hints IS 'Progressive hints for problems. Level 1 = most subtle, higher = more direct.';

-- Note: UNIQUE (problem_id, level) already creates an index covering
-- the main query: SELECT ... WHERE problem_id = $1 AND level <= $2 ORDER BY level.

-- ============================================================================
-- 6. solutions (one per problem)
-- ============================================================================

CREATE TABLE solutions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    explanation TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT solutions_problem_uq UNIQUE (problem_id)
);

COMMENT ON TABLE solutions IS 'Reference solutions. One per problem (enforced by UNIQUE). Separate table to avoid loading solution code when listing problems.';

-- ============================================================================
-- 7. submissions
-- ============================================================================

CREATE TABLE submissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    status      submission_status NOT NULL DEFAULT 'queued',
    passed      INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    results     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    judged_at   TIMESTAMPTZ,

    CONSTRAINT submissions_passed_chk CHECK (passed >= 0 AND passed <= total)
);

COMMENT ON TABLE submissions IS 'Code submissions. Status transitions: queued → running → judged|failed.';
COMMENT ON COLUMN submissions.results IS 'JSONB array of per-test-case results: [{testCaseIndex, passed, actual, expected, error}].';
COMMENT ON COLUMN submissions.passed IS 'Denormalized from results — enables WHERE passed = total without JSONB parsing.';

-- Q2: user submission history with keyset cursor pagination (newest first)
CREATE INDEX idx_submissions_user_cursor
    ON submissions (user_id, created_at DESC, id DESC);

-- Q2: filter by problem within user submissions
CREATE INDEX idx_submissions_user_problem
    ON submissions (user_id, problem_id, created_at DESC);

-- Solution unlock check: has user solved this problem?
CREATE INDEX idx_submissions_solved
    ON submissions (user_id, problem_id)
    WHERE status = 'judged' AND passed = total AND total > 0;

-- Q6: sync pull — all user submissions since timestamp
CREATE INDEX idx_submissions_sync
    ON submissions (user_id, created_at);

-- ============================================================================
-- 8. user_problem_stats (deliberate denormalization)
-- ============================================================================

CREATE TABLE user_problem_stats (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id        UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    attempts          INTEGER NOT NULL DEFAULT 0,
    solved            BOOLEAN NOT NULL DEFAULT false,
    first_solved_at   TIMESTAMPTZ,
    last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ups_user_problem_uq UNIQUE (user_id, problem_id),
    CONSTRAINT ups_attempts_chk    CHECK (attempts >= 0)
);

COMMENT ON TABLE user_problem_stats IS 'Denormalized per-user-per-problem stats. Updated via upsert on every submission. Avoids expensive GROUP BY on submissions for stats/leaderboard queries.';

-- Q3: per-topic stats aggregation; Q4: leaderboard aggregation
CREATE INDEX idx_ups_user_id ON user_problem_stats (user_id);

-- ============================================================================
-- 9. daily_challenges
-- ============================================================================

CREATE TABLE daily_challenges (
    challenge_date  DATE PRIMARY KEY,
    problem_id      UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE daily_challenges IS 'One challenge per day. PK on date = instant lookup for today.';

-- ============================================================================
-- 10. audit_log
-- ============================================================================

CREATE TABLE audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_log IS 'Append-only admin action log. BIGINT IDENTITY PK for sequential ordering and smaller index size.';

-- Admin tooling: history of a specific entity
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);

-- Admin tooling: all actions by a specific user
CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at DESC);

-- ============================================================================
-- 11. sync_operations
-- ============================================================================

CREATE TABLE sync_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL,
    records_count   INTEGER NOT NULL DEFAULT 0,
    payload_summary JSONB,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sync_dir_chk CHECK (direction IN ('push', 'pull'))
);

COMMENT ON TABLE sync_operations IS 'Log of sync operations for debugging and auditing.';

-- User sync history
CREATE INDEX idx_sync_user ON sync_operations (user_id, synced_at DESC);

-- ============================================================================
-- updated_at trigger function (reusable)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to tables with updated_at columns
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_problems_updated_at
    BEFORE UPDATE ON problems
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_solutions_updated_at
    BEFORE UPDATE ON solutions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
