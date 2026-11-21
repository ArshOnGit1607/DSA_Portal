# Infrastructure & Local Development Setup

## Overview

Person 2 manages the infrastructure layer (`/infra`, `/docs/infra`, docker files). For local development and CI testing, we provide a containerized environment running **PostgreSQL 16** and **Redis 7**.

---

## Services

### 1. PostgreSQL 16 (`dsa_portal_postgres`)
- **Port**: `5432`
- **Database**: `dsa_portal`
- **User / Password**: `postgres / postgres`
- **Connection URL**: `postgresql://postgres:postgres@localhost:5432/dsa_portal`
- **Init Script**: Mounts `server/src/db/migrations/001_initial_schema.sql` directly into `/docker-entrypoint-initdb.d/01_init.sql:ro` so the database is automatically ready with the full 11-table schema on initial boot.
- **Healthcheck**: Uses `pg_isready` polling every 5s with 5 retries.
- **Volume**: `dsa_portal_postgres_data` persistent volume.

### 2. Redis 7 (`dsa_portal_redis`)
- **Port**: `6379`
- **Connection URL**: `redis://localhost:6379`
- **Purpose**: BullMQ submission queue (used by Person 1's `/workers`) and caching (used by Person 3's `/server/src/cache`).
- **Healthcheck**: Uses `redis-cli ping` every 5s with 5 retries.
- **Volume**: `dsa_portal_redis_data` persistent volume.

---

## Usage Commands

### Start containers in background
```bash
docker compose -f infra/docker-compose.yml up -d
```

### Check status and health
```bash
docker compose -f infra/docker-compose.yml ps
```

### View container logs
```bash
docker compose -f infra/docker-compose.yml logs -f postgres
docker compose -f infra/docker-compose.yml logs -f redis
```

### Connect to PostgreSQL via psql CLI inside container
```bash
docker compose -f infra/docker-compose.yml exec postgres psql -U postgres -d dsa_portal
```

### Stop containers (preserving data)
```bash
docker compose -f infra/docker-compose.yml stop
```

### Tear down containers and wipe data volumes
```bash
docker compose -f infra/docker-compose.yml down -v
```

---

## Design Decisions (for Viva)

1. **Postgres 16 Alpine + Redis 7 Alpine**: Minimal image footprints (~40MB vs ~150MB standard Debian images), faster pull times in CI.
2. **Automated schema bootstrap via `docker-entrypoint-initdb.d`**: Developers can run `docker compose up -d` and immediately have a fully migrated database without needing to run separate CLI migration commands first.
3. **Bridge network isolation**: Services communicate over a dedicated bridge network (`dsa_portal_network`) preventing port pollution and allowing clean multi-container naming in docker.
