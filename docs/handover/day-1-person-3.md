# Day 1 — Person 3 (auth + stats API)

## What was built
- `server/src/modules/auth/` — register, login, refresh, logout and me, as specified in `docs/openapi.yaml`.
  - `store.ts`: `AuthStore` interface with `InMemoryAuthStore` (tests, no DB) and `PostgresAuthStore` (existing `users` + `sessions` tables).
  - Passwords: bcrypt (`bcryptjs`, cost 10). Access token: JWT `{ sub: userId }`, 15 min, signed with `app.jwt` (`JWT_SECRET`). Refresh token: 32 random bytes, 7 days, stored only as `sha256` in `sessions`, sent as an `HttpOnly; SameSite=Strict` cookie at `Path=/api/v1/auth` (`Secure` when `NODE_ENV=production`).
- `server/src/modules/stats/` — `GET /stats/me` and `GET /stats/me/topics`, using core's `StatsRepository` (Person 2's `PostgresStatsRepository` in production; `InMemoryStatsRepository` derives the same numbers from submissions).
- `server/__tests__/auth-stats.test.ts` — 7 tests; every response is also validated against `openapi.yaml` with Ajv.
- New dependency: `bcryptjs` (+ `@types/bcryptjs`) in `server/package.json`. No new env variables (`JWT_SECRET` already exists in `.env.example`).

## How to run
```bash
npm install
npx jest server/__tests__/auth-stats.test.ts   # 7/7
npx jest                                        # 91 passed, 5 skipped (Postgres e2e needs TEST_DATABASE_URL)
```

## Not live yet: needs Person 1 (CR-010)
The routes are Fastify plugins (`authRoutes`, `statsRoutes`) but are not registered in `server/src/app.ts` (Person 1's file). CR-010 has the exact lines. Until then the test registers them the same way.

## Endpoints others can use (once wired)
| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/v1/auth/register` | none | 201 `User` · 400 · 409 `CONFLICT` |
| POST | `/api/v1/auth/login` | none | 200 `{accessToken, refreshToken, expiresIn: 900}` + cookie · 401 |
| POST | `/api/v1/auth/refresh` | `refresh_token` cookie | 200 `{accessToken}` · 401 |
| POST | `/api/v1/auth/logout` | cookie (optional) | 204, session deleted, cookie cleared |
| GET | `/api/v1/auth/me` | Bearer | 200 `User` · 401 |
| GET | `/api/v1/stats/me` | Bearer | 200 `{attempted, solved, totalProblems, topics[]}` |
| GET | `/api/v1/stats/me/topics` | Bearer | 200 `{topics: [{topic, attempted, solved}]}` |

Tables used: `users`, `sessions` (read/write); `user_problem_stats`, `problems` (read, via `PostgresStatsRepository`). No schema changes.

## Known issues
1. Not registered in `app.ts` yet (CR-010).
2. Seed users can't log in: the seed's bcrypt hash is invalid (CR-012).
3. `streak` is left out of `/stats/me` until the repository returns the full `StreakStat` (CR-011).
4. No refresh-token rotation or reuse detection yet; logout only revokes the current device's session.
5. Expo can't easily send cookies back to `/auth/refresh` (CR-013).
6. No rate limit on `/auth/login` yet (brute force); planned for the Day 8 security pass.
7. No Redis cache for stats: CR-005 removed Redis; stats are 2–3 indexed queries per call.
8. Web, desktop and mobile clients have not been started yet.

## Design decisions (for the viva)
- **Short access JWT + long refresh session in the DB:** access tokens are checked without a DB hit, while refresh tokens can be revoked (logout deletes the row). 15 min caps how long a stolen access token works.
- **Store only `sha256(refreshToken)`:** a database leak doesn't hand out live sessions. SHA-256 is enough here because the token is 256 random bits (no dictionary to attack), unlike passwords.
- **bcrypt for passwords, `bcryptjs` package:** slow, salted hashing; the pure-JS build avoids native compilation in Docker and Electron. Cost 10 is the common default: slow for an attacker, but quick enough for one login.
- **Same 401 and the same timing for an unknown email and a wrong password:** a dummy bcrypt compare runs when the email isn't found, so attackers can't find out which emails are registered.
- **HttpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`:** JavaScript can't read the refresh token (XSS), other sites can't trigger a refresh (CSRF), and it isn't sent with every API call.
- **Emails are lowercased:** `Alice@x.com` and `alice@x.com` are one account, which matches the unique index.
- **Auth has its own `AuthStore` interface instead of changing core's `UserRepository`:** no change to another team member's contract; in-memory and Postgres stores can be swapped, like Person 1's repositories.
- **Role is not put in the JWT:** admin checks will read the role from the DB, so demoting a user takes effect immediately.
