# DSA Practice Platform — Architecture

## Overview
Monorepo (npm workspaces) with four front ends (CLI, Web, Desktop, Mobile) sharing a core engine and a Fastify/PostgreSQL backend. Offline-first local SQLite syncs to the server; Redis + BullMQ handle async submission judging; Socket.IO powers realtime leaderboards.

## Stack
- Node 20, TypeScript, Fastify, zod, pino
- PostgreSQL (server), SQLite via better-sqlite3 (local/offline)
- Redis + BullMQ, Socket.IO, JWT + bcrypt
- React + Vite (web), Electron (desktop), Expo (React Native, mobile)
- Shared ui-core (design system), Monaco editor, Zustand, Recharts

## Folder ownership
- Person 1: /core (excl. storage/sync), /server/src/app.ts, /server/src/modules/{problems,hints,solutions,submissions,realtime,leaderboard,daily}, /workers, /docs/architecture.md, /docs/openapi.yaml, /docs/websocket-events.md
- Person 2: /server/src/db, /server/src/sync, /core/src/storage, /core/src/sync, /infra, /scripts, /.github, /docs/db, /docs/infra
- Person 3: /web, /desktop, /mobile, /ui-core, /server/src/modules/{auth,admin,stats}, /server/src/cache, /docs/design

## Contract
OpenAPI at /docs/openapi.yaml is the source of truth for /api/v1. Never change an agreed endpoint/table/WebSocket event directly — propose in /docs/CHANGE_REQUESTS.md.
