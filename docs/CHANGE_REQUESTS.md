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
