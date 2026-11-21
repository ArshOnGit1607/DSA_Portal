# DSA Practice Platform — Monorepo

> A DSA problem-practice platform extended from a Node.js CLI to a multi-client platform (CLI, Web, Desktop, Mobile) over 10 days by a 3-person team.

---

## Stack
`Node.js 20` · `TypeScript` · `Fastify` · `PostgreSQL 16` · `SQLite (better-sqlite3)` · `Redis + BullMQ` · `Socket.IO` · `React + Vite` · `Electron` · `Expo (React Native)` · `Jest` · `Docker` · `GitHub Actions`

---

## Workspaces
| Package | Description |
| :------ | :---------- |
| `@dsa-portal/core` | Shared engine — types, problem loader, executor, sync engine, storage abstractions |
| `@dsa-portal/server` | Fastify REST API + sync push/pull endpoints |
| `@dsa-portal/workers` | BullMQ submission judge workers |
| `@dsa-portal/cli` | Interactive Node.js terminal client |
| `web` | React + Vite web client |
| `desktop` | Electron desktop client |
| `mobile` | Expo (React Native) mobile client |

---

## Quick Start (Development)

```bash
# 1. Start PostgreSQL + Redis
npm run db:up

# 2. Install all workspace dependencies
npm install

# 3. Run database migrations
npm run db:migrate

# 4. Seed the development database
npm run db:seed

# 5. Run the full test suite
npm test

# 6. Start the API server in dev mode
npm run dev:server
```

---

## Available Scripts
| Script | Description |
| :----- | :---------- |
| `npm test` | Run all 91 tests across 19 suites |
| `npm run db:up` | Start PostgreSQL + Redis via Docker Compose |
| `npm run db:migrate` | Apply all pending SQL migrations |
| `npm run db:seed` | Seed 40 DSA problems |
| `npm run db:seed-load` | Bulk-seed 10k users + 100k submissions |
| `npm run db:backup` | Create a compressed, checksummed backup |
| `npm run db:restore` | Restore from the latest verified backup |
| `npm run lint` | ESLint across all packages |
| `npm run format` | Prettier format check |

---

## Production Deployment

```bash
# Start the full production stack (Nginx + Server + Workers + PostgreSQL + Redis)
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Nginx is exposed on port `:80`. All API traffic routes through the reverse proxy with rate limiting (30 req/s, burst 50).

---

## Documentation
| Document | Description |
| :------- | :---------- |
| [`docs/db/sync-design.md`](docs/db/sync-design.md) | Offline-first sync design specification |
| [`docs/db/optimization-report.md`](docs/db/optimization-report.md) | DB benchmark before/after report |
| [`docs/db/viva-defense-dossier.md`](docs/db/viva-defense-dossier.md) | 10-topic viva Q&A with architectural rationale |
| [`docs/db/backup-and-dr.md`](docs/db/backup-and-dr.md) | Disaster recovery runbook |
| [`docs/db/security-hardening.md`](docs/db/security-hardening.md) | RBAC and audit log security guide |
| [`docs/infra/docker-production.md`](docs/infra/docker-production.md) | Production container architecture |
| [`docs/infra/ci-cd.md`](docs/infra/ci-cd.md) | GitHub Actions CI/CD guide |
| [`docs/infra/monitoring.md`](docs/infra/monitoring.md) | Health probes and Prometheus metrics |
| [`docs/infra/runbook.md`](docs/infra/runbook.md) | Incident response procedures |
| [`docs/openapi.yaml`](docs/openapi.yaml) | REST API OpenAPI specification |
| [`docs/CHANGE_REQUESTS.md`](docs/CHANGE_REQUESTS.md) | Cross-team change requests |

---

## Test Status

```
Test Suites: 19 passed, 19 total
Tests:       91 passed, 91 total
Time:        ~1.0s
```

---

## Team
| Person | Role | Branches |
| :----- | :--- | :------- |
| Person 1 | Backend API, Core Engine, Workers | `person-1/day-*` |
| **Person 2** | **Database, Sync, DevOps** | `person-2/day-0` → `person-2/day-10` |
| Person 3 | Clients (Web/Desktop/Mobile), Auth, Stats | `person-3/day-*` |
