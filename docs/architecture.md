# DSA Practice Platform — Architecture

## 1. Component diagram

```mermaid
flowchart TD
    subgraph ClientLayer ["Clients"]
        CLI["CLI (Node terminal)"]
        Web["Web (React + Vite)"]
        Desktop["Desktop (Electron)"]
        Mobile["Mobile (Expo + React Native)"]
    end

    subgraph API ["API Layer (Fastify, Node 20)"]
        Auth["auth: register/login/refresh/logout/me"]
        Problems["problems: list/random/by-id"]
        Submissions["submissions: create/status"]
        Stats["stats: me/per-topic/streak"]
        Leaderboard["leaderboard"]
        Daily["daily-challenge"]
        Admin["admin: CRUD problems + test cases"]
        Sync["sync: push/pull"]
    end

    subgraph Services ["Backend services"]
        Engine["Core engine (@dsa-portal/core)"]
        Judge["Submission judge (sandboxed child_process)"]
        Cache["Redis cache (Person 3, optional)"]
        Realtime["Socket.IO (leaderboard/submission events)"]
    end

    subgraph Data ["Data stores"]
        PG[(PostgreSQL)]
        SQLite[(SQLite — local/offline)]
    end

    ClientLayer --> API
    API --> Engine
    API --> PG
    API --> Cache
    API --> Realtime
    Judge --> PG
    Realtime --> PG
    Engine --> PG
    Engine --> SQLite
    API --> PG
    Sync --> PG
    Sync --> SQLite
```

## 2. Sequence diagram — submit → queue → worker → sandbox → result → client

Day 5: the queue is the `submissions` table in PostgreSQL (no Redis). See CR-005.

```mermaid
sequenceDiagram
    participant C as Client (Web/Desktop/Mobile/CLI)
    participant API as API (Fastify)
    participant PG as PostgreSQL (submissions = queue)
    participant W as Worker process (@dsa-portal/workers)
    participant S as Sandbox (node child_process + vm)

    C->>API: POST /api/v1/submissions {problemId, code} + Idempotency-Key?
    API->>PG: key already used by this user? → return that submission
    API->>PG: INSERT submission (status: queued)
    PG-->>W: NOTIFY submission_queued (trigger, migration 002)
    API-->>C: 202 {submissionId, status: queued}
    W->>PG: UPDATE … SET status = running WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)
    W->>PG: load submission + problem (repositories)
    W->>S: run code against each test case (async, per-test timeout)
    S-->>W: ExecutionResult {status, perTest[]}
    W->>PG: save (status: judged, results, judged_at) + upsert user_problem_stats
    W->>W: stats service hook (Person 3, stubbed)
    loop until judged/failed
        C->>API: GET /api/v1/submissions/:id
        API->>PG: fetch submission
        API-->>C: 200 {status, passed, total, results}
    end
    Note over C,API: Day 7 adds Socket.IO push (submission:finished) so clients can stop polling.
```

**Why this is safe with several workers:** `FOR UPDATE SKIP LOCKED` hands each queued row to exactly one worker; `judgeSubmission` ignores rows that are already judged; the unique index `(user_id, idempotency_key)` stops duplicate POSTs even when retries race. If a NOTIFY is missed, workers still poll every `WORKER_POLL_MS`.

## 3. Deployment view

```mermaid
flowchart LR
    subgraph Dev ["Developer machine"]
        ClientDev["Client (dev mode)"]
        ServerDev["API (tsx watch)"]
        WorkerDev["Worker (node workers/dist/main.js)"]
        PGDev["PostgreSQL (local or docker)"]
    end

    subgraph Prod ["Production (Docker / fly or Railway)"]
        LB["Load balancer / HTTPS"]
        APIPod["API pod (Fastify)"]
        WorkerPod["Worker pods (N, PostgreSQL queue)"]
        PGProd[(PostgreSQL)]
    end

    ClientDev --> ServerDev
    WorkerDev --> PGDev
    ServerDev --> PGDev
    LB --> APIPod
    APIPod --> PGProd
    WorkerPod --> PGProd
```

## 4. Modular monolith vs microservices — why this fits a 10-day project

We chose a **modular monolith with one separate worker process** rather than microservices.

**Modular monolith (API + core engine):**
- Single codebase, single deployable unit — one repo, one `npm install`, one test run. Critical for a 10-day, 3-person project where CI/CD setup time must be minimal.
- Shared in-memory types between `@dsa-portal/core`, `server`, and `workers` via npm workspaces — no API contracts between internal modules to version.
- Domain boundaries are enforced by folder ownership (Person 1/2/3) rather than network boundaries, so refactoring between modules is cheap.
- Downsides: a crash in one module can affect the whole process; scaling is coarse-grained. Acceptable for 10 days and modest user load.

**Separate worker process (PostgreSQL queue, since Day 5):**
- Submission judging runs untrusted user code in `child_process` sandboxes — CPU-heavy and potentially slow. Isolating it from the API keeps request latency low and lets the worker be restarted/scaled independently.
- PostgreSQL is the only cross-process bridge: the API inserts a `queued` row, workers claim rows with `FOR UPDATE SKIP LOCKED` and are woken by `LISTEN/NOTIFY`. One less service to run; the job and its result live in the same transactional store. Trade-off: no built-in retries/dashboards like BullMQ, so Day 6 adds retries, stalled-job recovery and metrics ourselves.

**Why not full microservices:**
- 10 days is too short to design, containerize, orchestrate, and observe 6–8 independent services, plus handle service discovery, retries, circuit breakers, and distributed tracing.
- Network boundaries between `problems`, `submissions`, `stats`, etc. would slow development and add failure modes the team can't afford to debug.

**Trade-off summary:** Monolith for development speed and shared types; separate worker for CPU isolation; the PostgreSQL submissions table as the single async bridge. Re-evaluate service splits only after the MVP ships.

## 5. Stack & folder ownership

**Stack:** Node 20, TypeScript, Fastify, zod, pino, PostgreSQL (server), SQLite via better-sqlite3 (local/offline), Redis + BullMQ, Socket.IO, JWT + bcrypt, React + Vite, Monaco editor, Zustand, Recharts, Electron, Expo, Jest/Vitest, Playwright, Docker, GitHub Actions.

**Folder ownership (hard rule — edit only your own folders):**
- Person 1: `/core` (excl. `storage`/`sync`), `/server/src/app.ts`, `/server/src/modules/{problems,hints,solutions,submissions,realtime,leaderboard,daily}`, `/workers`, `/docs/architecture.md`, `/docs/openapi.yaml`, `/docs/websocket-events.md`.
- Person 2: `/server/src/db`, `/server/src/sync`, `/core/src/storage`, `/core/src/sync`, `/infra`, `/scripts`, `/.github`, `/docs/db`, `/docs/infra`, docker files.
- Person 3: `/web`, `/desktop`, `/mobile`, `/ui-core`, `/server/src/modules/{auth,admin,stats}`, `/server/src/cache`, `/docs/design`.

**Contract:** OpenAPI at `/docs/openapi.yaml` is the source of truth for `/api/v1`. Never change an agreed endpoint, table column, or WebSocket event directly — propose in `/docs/CHANGE_REQUESTS.md`.
