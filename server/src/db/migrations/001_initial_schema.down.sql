-- Migration Down: 001_initial_schema.down.sql
-- Description: Drops all tables, triggers, and types in reverse dependency order.

BEGIN;

-- 1. Drop Triggers & Helper Functions
DROP TRIGGER IF EXISTS trg_solutions_updated_at ON solutions;
DROP TRIGGER IF EXISTS trg_problems_updated_at ON problems;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at();

-- 2. Drop Tables (in reverse foreign-key dependency order)
DROP TABLE IF EXISTS sync_operations CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS daily_challenges CASCADE;
DROP TABLE IF EXISTS user_problem_stats CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS solutions CASCADE;
DROP TABLE IF EXISTS hints CASCADE;
DROP TABLE IF EXISTS test_cases CASCADE;
DROP TABLE IF EXISTS problems CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 3. Drop Custom Enum Types
DROP TYPE IF EXISTS submission_status CASCADE;
DROP TYPE IF EXISTS difficulty CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

COMMIT;
