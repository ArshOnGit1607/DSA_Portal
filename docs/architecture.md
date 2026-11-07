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
        Cache["Redis cache + BullMQ queue"]
        Realtime["Socket.IO (leaderboard/submission events)"]
    end

    subgraph Data ["Data stores"]
        PG[(PostgreSQL)]
        SQLite[(SQLite — local/offline)]
    end

    ClientLayer --> API
    API --> Engine
    API --> Judge
    API --> Cache
    API --> Realtime
    Judge --> Cache
    Realtime --> PG
    Engine --> PG
    Engine --> SQLite
    API --> PG
    Sync --> PG
    Sync --> SQLite
```

## 2. Sequence diagram — submit → queue → worker → sandbox → result → client

```mermaid
sequenceDiagram
    participant C as Client (Web/Desktop/Mobile/CLI)
    participant API as API (Fastify)
    participant Q as Queue (BullMQ + Redis)
    participant W as Worker (@dsa-portal/workers)
    participant S as Sandbox (node child_process)
    participant PG as PostgreSQL
    participant WS as Socket.IO

    C->>API: POST /api/v1/submissions {problemId, code}
    API->>PG: store submission (status: queued)
    API->>Q: add job {submissionId, problemId, code}
    Q-->>API: job enqueued
    API-->>C: 202 {submissionId, status: queued}
    W->>Q: claim job
    W->>S: run code against test cases
    S-->>W: {passed, total, results}
    W->>PG: update submission (status: judged, results)
    W->>WS: publish submission:result {submissionId, passed, total}
    WS-->>C: push result (realtime)
    C->>API: GET /api/v1/submissions/:id
    API->>PG: fetch submission
    API-->>C: 200 submission result
```

## 3. Deployment view

```mermaid
flowchart LR
    subgraph Dev ["Developer machine"]
        ClientDev["Client (dev mode)"]
        ServerDev["API (tsx watch)"]
        RedisDev["Redis (docker)"]
        PGDev["PostgreSQL (docker)"]
    end

    subgraph Prod ["Production (Docker / fly or Railway)"]
        LB["Load balancer / HTTPS"]
        APIPod["API pod (Fastify)"]
        WorkerPod["Worker pod (BullMQ)"]
        PGProd[(PostgreSQL)]
        RedisProd[(Redis)]
    end

    ClientDev --> ServerDev
    ServerDev --> RedisDev
    ServerDev --> PGDev
    LB --> APIPod
    APIPod --> RedisProd
    APIPod --> PGProd
    WorkerPod --> RedisProd
    WorkerPod --> PGProd
```

## 4. Modular monolith vs microservices — why this fits a 10-day project

We chose a **modular monolith with one separate worker process** rather than microservices.

**Modular monolith (API + core engine):**
- Single codebase, single deployable unit — one repo, one `npm install`, one test run. Critical for a 10-day, 3-person project where CI/CD setup time must be minimal.
- Shared in-memory types between `@dsa-portal/core`, `server`, and `workers` via npm workspaces — no API contracts between internal modules to version.
- Domain boundaries are enforced by folder ownership (Person 1/2/3) rather than network boundaries, so refactoring between modules is cheap.
- Downsides: a crash in one module can affect the whole process; scaling is coarse-grained. Acceptable for 10 days and modest user load.

**Separate worker process (BullMQ + Redis):**
- Submission judging runs untrusted user code in `child_process` sandboxes — CPU-heavy and potentially slow. Isolating it from the API keeps request latency low and lets the worker be restarted/scaled independently.
- Redis is the only cross-process message bus; the API enqueues jobs, workers consume them. Clean separation with minimal operational complexity (one Redis instance).

**Why not full microservices:**
- 10 days is too short to design, containerize, orchestrate, and observe 6–8 independent services, plus handle service discovery, retries, circuit breakers, and distributed tracing.
- Network boundaries between `problems`, `submissions`, `stats`, etc. would slow development and add failure modes the team can't afford to debug.

**Trade-off summary:** Monolith for development speed and shared types; separate worker for CPU isolation; Redis+BullMQ as the single async bridge. Re-evaluate service splits only after the MVP ships.

## 5. Stack & folder ownership

**Stack:** Node 20, TypeScript, Fastify, zod, pino, PostgreSQL (server), SQLite via better-sqlite3 (local/offline), Redis + BullMQ, Socket.IO, JWT + bcrypt, React + Vite, Monaco editor, Zustand, Recharts, Electron, Expo, Jest/Vitest, Playwright, Docker, GitHub Actions.

**Folder ownership (hard rule — edit only your own folders):**
- Person 1: `/core` (excl. `storage`/`sync`), `/server/src/app.ts`, `/server/src/modules/{problems,hints,solutions,submissions,realtime,leaderboard,daily}`, `/workers`, `/docs/architecture.md`, `/docs/openapi.yaml`, `/docs/websocket-events.md`.
- Person 2: `/server/src/db`, `/server/src/sync`, `/core/src/storage`, `/core/src/sync`, `/infra`, `/scripts`, `/.github`, `/docs/db`, `/docs/infra`, docker files.
- Person 3: `/web`, `/desktop`, `/mobile`, `/ui-core`, `/server/src/modules/{auth,admin,stats}`, `/server/src/cache`, `/docs/design`.

**Contract:** OpenAPI at `/docs/openapi.yaml` is the source of truth for `/api/v1`. Never change an agreed endpoint, table column, or WebSocket event directly — propose in `/docs/CHANGE_REQUESTS.md`.
