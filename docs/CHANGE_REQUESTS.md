# Change Requests

Log any proposed change to an agreed endpoint, table column, or WebSocket event here before editing. Format:

## CR-001
- **Proposed by:** Person 1
- **Field:** /api/v1/problems response shape
- **Proposed change:** add `description` field
- **Reason:** frontend needs description in list view
- **Status:** pending
- **Approved by:** —

## CR-002
- **Proposed by:** Person 1 (Day 4)
- **Field:** `GET /api/v1/health`
- **Proposed change:** add it to openapi.yaml (`200 {status, service}`, no auth).
- **Reason:** the route has existed since Day 1 but is not in the spec; Docker/infra health checks (Person 2) need it documented. The contract test currently exempts it.
- **Status:** pending
- **Approved by:** —

## CR-003
- **Proposed by:** Person 1 (Day 4)
- **Field:** responses of `/problems`, `/problems/random`, `/problems/{id}`, `/problems/{id}/hints`, `/problems/{id}/solution`, `GET /submissions`
- **Proposed change:** document `400 BadRequest` and `401 Unauthorized` (they all require a bearer token and validate query params).
- **Reason:** the server already returns these in the standard Error format; clients should see them in the spec.
- **Status:** pending
- **Approved by:** —

## CR-004
- **Proposed by:** Person 1 (Day 4)
- **Field:** `Problem` schema used by `GET /problems/random` and `GET /problems/{id}`
- **Proposed change:** drop `solution` (and later, hidden test cases) from the `Problem` response; keep it only on `GET /problems/{id}/solution`.
- **Reason:** the spec requires `solution` in `Problem`, so the "locked until solved" solution endpoint can be bypassed by reading the problem. Day 4 follows the spec as written.
- **Status:** pending
- **Approved by:** —

## CR-005
- **Proposed by:** Person 1 (Day 5)
- **Field:** Stack — submission queue
- **Proposed change:** use the PostgreSQL `submissions` table as the job queue (`FOR UPDATE SKIP LOCKED` + `LISTEN/NOTIFY`) instead of BullMQ + Redis. The old BullMQ worker code and the `bullmq`/`ioredis` dependencies were removed from `/workers`.
- **Reason:** team decision on Day 5 to run on PostgreSQL only. One service fewer; job and result share one transactional store. Redis can still be added later for Person 3's caching and the Day 7 Socket.IO adapter.
- **Status:** implemented on Day 5, needs team sign-off
- **Approved by:** Person 1's user (Day 5 session)

## CR-006
- **Proposed by:** Person 1 (Day 5)
- **Field:** `POST /api/v1/submissions` in openapi.yaml
- **Proposed change:** document the optional `Idempotency-Key` request header (1–128 chars, unique per user) and a `409 IDEMPOTENCY_KEY_REUSED` response (same key, different body). A replayed key returns `202` with the original `submissionId` and its current status.
- **Reason:** Day 5 requirement; the server already behaves like this.
- **Status:** pending
- **Approved by:** —

## CR-007
- **Proposed by:** Person 1 (Day 5), **for Person 2** (owner of `/server/src/db`)
- **Field:** `/server/src/db` and the `submissions` table
- **Change already made (approved by Person 1's user so Day 5 could run):**
  1. Added `pg` + `@types/pg` and the `db:*` scripts to `server/package.json` (the root `npm run db:*` scripts pointed at scripts that did not exist).
  2. `migrate.ts`: `001_initial_schema.sql` and `.up.sql` share one key, so a fresh database applied 001 twice and crashed ("type already exists"). Now each key is applied once.
  3. `PostgresSubmissionRepository`: it read `result.passed/total/results`, which don't exist on core's `ExecutionResult` (`{status, perTest}`), so results were saved as 0/0. It now stores `perTest` (+ `testCaseIndex`) in `results`, rebuilds `ExecutionResult` on read, and maps `judged_at` and `idempotency_key`. Added `findByIdempotencyKey`.
  4. `pool.ts` generic typing fix; unused import removed from `seed.ts`; repository test updated to the core shape.
  5. New migration `002_submission_queue` (+ down): `idempotency_key` column with unique index per user, a partial index on queued rows, and a `pg_notify` trigger.
- **Please review:** `PostgresProblemRepository.findAll` runs 1 + 3 queries per problem (40 problems → 121 queries per list call); worth a JOIN before the Day 9 load test. Docker's init script only mounts 001, so docker users must still run `npm run db:migrate` for 002.
- **Status:** done, needs Person 2's review
- **Approved by:** —

## CR-008
- **Proposed by:** Person 1 (audit after Day 5), **for Person 2**
- **Changes already made (approved by Person 1's user):**
  1. `infra/docker-compose.yml`: removed the `docker-entrypoint-initdb.d` mount and deleted the duplicate `001_initial_schema.sql`. The init script created the schema without recording it in `_migrations`, so `npm run db:migrate` then crashed ("type user_role already exists") and never applied 002. Setup is now `npm run db:up && npm run db:migrate && npm run db:seed`. `docs/infra/docker.md` updated.
  2. `seeds/problems-data.ts`: `binary-tree-level-order-traversal` test 5 used LeetCode's tree format (`[1, null, 2, null, 3]`) while every solution uses heap order, so the reference solution failed it. Now `[1, null, 2, null, null, null, 3]`, and all five tree descriptions say the array is in heap order (children of `i` at `2i + 1` and `2i + 2`).
- **Checked:** all 40 seed reference solutions (and the 3 core ones) pass their own tests; a fresh database migrates 001 + 002 once.
- **Status:** done, needs Person 2's review
- **Approved by:** —

## CR-009
- **Proposed by:** Person 3 (Day 1), **for Person 2**
- **Field:** `UserRepository` (core) / `PostgresUserRepository`
- **Proposed change:** none required now. FYI: core's `UserRepository` has no `findByEmail`, no password hash and no sessions, so auth uses its own `AuthStore` interface in `server/src/modules/auth/store.ts` (`InMemoryAuthStore` + `PostgresAuthStore`, which reads/writes the existing `users` and `sessions` tables; columns unchanged). If you prefer all SQL under `/server/src/db`, move `PostgresAuthStore` there and I'll import it.
- **Status:** pending review
- **Approved by:** —

## CR-010
- **Proposed by:** Person 3 (Day 3), **for Person 1** (owner of `server/src/app.ts`, `server/src/index.ts`, `/workers`)
- **Field:** route wiring only, no endpoint change
- **Proposed change:** in `app.ts`:
  - `AppOptions` gets `auth?: AuthStore`, `stats?: StatsStore`, `deleteProblem?: (id: string) => Promise<boolean>`; defaults `new InMemoryAuthStore()`, `new InMemoryStatsRepository(deps.problems, deps.submissions)`, `async () => false`.
  - Swap the TEMP decorator for Person 3's: `app.decorate('authenticate', authenticate)` (from `modules/auth/hooks`; same behaviour, so nothing else changes).
  - Inside the `/api/v1` plugin: `await api.register(authRoutes, { auth: deps.auth });`, `await api.register(adminRoutes, { auth: deps.auth, problems: deps.problems, deleteProblem: deps.deleteProblem });`, `await api.register(statsRoutes, { stats: deps.stats });`.
  - In `index.ts`: `auth: new PostgresAuthStore()`, `stats: new PostgresStatsStore()`, `deleteProblem: unpublishProblem`.
  - `server/__tests__/helpers/person3-app.ts` (`buildPerson3App`) shows the exact wiring and can be deleted afterwards. Then add the auth/admin/stats routes to `openapi-contract.test.ts`.
  - `statsServiceStub` in `/workers` can stay a no-op: counters are written in the submission transaction (see CR-017).
- **Status:** pending
- **Approved by:** —

## CR-011
- **Proposed by:** Person 3 (Day 1), **for Person 2**
- **Field:** `StatsRepository.getUserStats()` return shape (core)
- **Proposed change:** return `streak: { currentStreak, longestStreak, lastSolvedAt }` (the spec's `StreakStat`) instead of `streak: number`.
- **Reason:** `GET /stats/me` must return a full `StreakStat` or nothing. Also: the streak is computed with the server's local timezone.
- **Update (Day 4):** no longer blocking. Person 3's stats module now computes the full `StreakStat` itself (UTC days) from `user_problem_stats.first_solved_at` (`PostgresStatsStore.getFirstSolves`). `getUserStats().streak` is unused by the API; Person 2 may keep or drop it.
- **Status:** superseded
- **Approved by:** —

## CR-012
- **Proposed by:** Person 3 (Day 1), **for Person 2**
- **Field:** `server/src/db/seed.ts` dev password hash
- **Proposed change:** replace `$2b$10$wO3P6P6E0.0eK3.yF8iUSeVqjYh4c9qK2M5A1hU6d2Y/F4kH6v6y.` with `$2a$10$iBVruH6tb4eMv2wF.RPFT.XkkhjjPIQ/wpSU2mR.2VuHIDY8E1T2y`.
- **Reason:** the current value is not a valid bcrypt hash of `password123` (`bcrypt.compare` returns false), so `admin@dsa.portal` / `student@dsa.portal` cannot log in.
- **Status:** pending
- **Approved by:** —

## CR-013
- **Proposed by:** Person 3 (Day 1), **for Person 1** (openapi owner)
- **Field:** `POST /api/v1/auth/refresh` and `/auth/logout`
- **Proposed change:** also accept `{ "refreshToken": "..." }` in the JSON body when there is no `refresh_token` cookie.
- **Reason:** the mobile (Expo) client has no reliable cookie jar; login already returns `refreshToken` in the body, but today it can only be sent back as a cookie. Not implemented until approved.
- **Update (Day 5):** withdrawn. Native clients (Electron main, Expo) send the stored token in a `Cookie: refresh_token=...` header and read the rotated one from `Set-Cookie` (`nativeRefresh` in `/ui-core`), which the spec already allows.
- **Status:** withdrawn
- **Approved by:** —

## CR-014
- **Proposed by:** Person 3 (Day 3), **for Person 2**
- **Field:** `sessions` table
- **Proposed change:** add `revoked_at TIMESTAMPTZ NULL` and `family_id UUID NOT NULL` (one family per login).
- **Reason:** refresh rotation with reuse detection is implemented today without a schema change: a rotated session keeps its row with `expires_at = 'epoch'`, and presenting it again revokes all of the user's sessions. That works, but (1) a cleanup job deleting expired rows also forgets rotated ones, and (2) reuse revokes *every* device instead of only the stolen family. With the two columns, `PostgresAuthStore.consumeSession` changes in one place.
- **Status:** pending
- **Approved by:** —

## CR-015
- **Proposed by:** Person 3 (Day 3), **for Person 1** (core `ProblemRepository`) and **Person 2** (`PostgresProblemRepository`)
- **Field:** `ProblemRepository` interface
- **Proposed change:** add `delete(id): Promise<boolean>` (soft delete: `is_published = false`), and make `findById` skip unpublished problems for non-admin reads.
- **Reason:** `DELETE /admin/problems` needs it. Until then the admin module takes a `deleteProblem` function and the server passes `unpublishProblem` (an `UPDATE problems SET is_published = false` in `modules/admin/routes.ts`). Known gap: `GET /problems/{id}` still returns an unpublished problem because `findById` doesn't filter.
- **Status:** pending
- **Approved by:** —

## CR-016
- **Proposed by:** Person 3 (Day 4), **for Person 1** (openapi owner)
- **Field:** stats endpoints in `openapi.yaml`
- **Proposed change (already served by the stats module, additive only):**
  1. New `GET /api/v1/stats/me/streak` (bearer) → `200 StreakStat & { days: string[] }` (`days` = UTC dates `YYYY-MM-DD`, ascending, on which the user first solved a problem; for the streak calendar).
  2. `GET /api/v1/stats/me` additionally returns `difficulties: [{ difficulty, attempted, solved }]` (difficulty chart) and now always includes `streak`.
  3. Document `429 TOO_MANY_REQUESTS` (+ `Retry-After` header) on `POST /auth/login` (login throttling), `409` already exists on register, `403 FORBIDDEN` on admin routes already exists.
- **Reason:** Day 4 stats dashboard (streak calendar, difficulty breakdown) and the Day 3 login throttling.
- **Status:** pending
- **Approved by:** —

## CR-017
- **Proposed by:** Person 3 (Day 4), **for Person 2**
- **Field:** `PostgresSubmissionRepository.save()`
- **Proposed change:** replace the inline `user_problem_stats` upsert with `await updateStatsOnSubmission(client, submission)` from `server/src/modules/stats/stats.service.ts` (same SQL, same transaction).
- **Reason:** one owner for the stats model (Person 3), no duplicate SQL. Behaviour is identical; `person3-postgres.test.ts` checks it under 10 concurrent transactions.
- **Status:** pending
- **Approved by:** —

## CR-018
- **Proposed by:** Person 3 (Day 5), **for Person 1** (`/core`)
- **Field:** `SandboxOptions` in `core/src/sandbox.ts`
- **Proposed change:** optional `nodePath?: string` and `extraEnv?: Record<string, string>` used by `childCommand` instead of the hard-coded `'node'` from `PATH`.
- **Reason:** the desktop app judges offline with core's sandbox. Today that needs a Node.js install on the user's machine; with the option the app can run its own Electron binary as Node (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`), so installers work on machines without Node.
- **Status:** pending
- **Approved by:** —

## CR-014
- **Proposed by:** Person 1 (Day 6), **for Person 2** (owner of `/server/src/db`) and **for Person 3** (API additions)
- **Changes already made (approved by Person 1's user), so the queue can retry, recover stalled jobs and dead-letter:**
  1. New migration `server/src/db/migrations/003_queue_reliability` (up + down, checked both ways): `submissions.attempts`, `run_after`, `lock_token`, `locked_until`, `last_error`; partial indexes on `running` rows (lease) and `failed` rows (dead-letter list). The `submissions_notify_queued` trigger now also fires on `UPDATE OF status` to `queued` (retries, requeue). No existing column changed. `PostgresSubmissionRepository` is unchanged and ignores the new columns.
  2. API additions in `/docs/openapi.yaml` (no existing behaviour changed): `POST /submissions` may return `429 QUEUE_FULL` with `Retry-After`; the `409 IDEMPOTENCY_KEY_REUSED` from CR-006 is now documented; new admin endpoints `GET /admin/queue/failed` and `POST /admin/queue/failed/{id}/requeue` (schema `FailedJob`). They live in `server/src/modules/submissions/admin-routes.ts` because they are queue operations, not problem admin (Person 3's `/admin` module is untouched). The role is read through Person 3's `AuthStore.findById`.
- **Please note (Person 2):** two migrations now share the number `002` (`002_submission_queue`, `002_sync_tables`). Both apply because `_migrations` stores the full name, but please renumber new ones from `004`.
- **Status:** done, needs Person 2's review
- **Approved by:** —

## CR-015
- **Proposed by:** Person 1 (Day 6), **for Person 2**
- **Problem:** `main` did not build after PR #7/#8. `core/src/storage/repositories/sqlite-submission.repository.ts` uses `result.passed/total/results`, which don't exist on core's `ExecutionResult` (same issue CR-007 fixed for PostgreSQL), and lacks `findByIdempotencyKey`. `core/src/sync/__tests__/hlc.test.ts:56` also fails to type-check. `server/src/db/repositories/audit.repository.ts` imported `AuditRepository`/`AuditEntry` from `@dsa-portal/core`, which did not export them.
- **Changes already made (Person 1's files only):** `core/src/index.ts` now re-exports the `AuditEntry` and `AuditRepository` types (type-only, so SQLite never loads in the server). `core/tsconfig.json` excludes `src/storage` and `src/sync` from core's build (nothing imports them yet), so `npm run build` is green again.
- **Proposed change (Person 2):** fix the SQLite submission repository to the `{ status, perTest }` shape, add `findByIdempotencyKey`, fix the HLC test, then remove the two excludes in `core/tsconfig.json`. Also, `npx eslint` reports an unused `PoolClient` import in `submission.repository.ts:1` (the only lint error in the repo).
- **Status:** pending
- **Approved by:** —
