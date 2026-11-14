PROJECT: DSA Practice Platform. It started as "DSA Practice CLI", a Node.js terminal app (choose
topic + difficulty, random problems, hints and solutions, submit JavaScript run locally through
child processes against predefined test cases, persistent JSON stats of attempted and solved
problems). We are extending it into one platform with 4 front ends: CLI, Web (React), Desktop
(Electron), Mobile (React Native / Expo).
TEAM OF 3, 10 DAYS.
- Person 1 = backend, core engine, system design.
- Person 2 = database, sync, DevOps.
- Person 3 = clients (web, desktop, mobile) + auth + stats model + Redis caching.
MONOREPO (npm workspaces): /core, /server, /workers, /web, /desktop, /mobile, /ui-core, /docs,
/infra, /scripts.
STACK: Node.js 20, TypeScript, Fastify, zod, pino, PostgreSQL (server), SQLite via
better-sqlite3 (local/offline), Redis + BullMQ, Socket.IO, JWT + bcrypt, React + Vite, Monaco
editor, Zustand, Recharts, Electron, Expo (React Native), Jest/Vitest, Playwright, Docker,
GitHub Actions.
API CONTRACT: REST /api/v1, JSON, JWT bearer auth. /docs/openapi.yaml is the source of truth.
Never change an agreed endpoint, table column or WebSocket event on your own: write the proposed
change in /docs/CHANGE_REQUESTS.md and tell me.
FOLDER OWNERSHIP (edit only your own folders):
- Person 1: /core (except /core/src/storage and /core/src/sync), /server/src/app.ts,
/server/src/modules/{problems,hints,solutions,submissions,realtime,leaderboard,daily},
/workers, /docs/architecture.md, /docs/openapi.yaml, /docs/websocket-events.md.
- Person 2: /server/src/db, /server/src/sync, /core/src/storage, /core/src/sync, /infra,
/scripts, /.github, /docs/db, /docs/infra, docker files.
- Person 3: /web, /desktop, /mobile, /ui-core, /server/src/modules/{auth,admin,stats},
/server/src/cache, /docs/design.
If you need a change in a folder you do not own, add it to /docs/CHANGE_REQUESTS.md instead of
editing it.
WORKING RULES FOR CLAUDE CODE:
1. Read CLAUDE.md and /docs first. Start every task in plan mode: outline a short plan, wait for
my OK, then implement.
2. Work on branch person-<number>/day-<n>. Commit small, with clear messages. Never push to
main.
3. Write tests together with the code, run them, and fix failures before you finish.
4. At the end of every task write /docs/handover/day-<n>-person-<number>.md: what was built,
how to run it, endpoints/tables/events others can use, known issues.
5. Explain the main design decisions and trade-offs in 5-10 lines so I can defend them in the
viva.
6. Never commit secrets. Provide .env.example for every new variable.
7. If something in these instructions conflicts with the code that already exists, tell me and
propose a fix instead of guessing.
I AM PERSON 2 (Database, Sync and Dev). Follow the folder ownership above for my folders, and
use branch names person-2/day-<n>.