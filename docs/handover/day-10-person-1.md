# Handover: Day 10, Person 1 (API docs, report, demo)

## What was built

- **API reference at `GET /docs`** (Redoc) and the raw spec at `GET /docs/openapi.yaml`, both served by the API from the same `docs/openapi.yaml` the contract test checks. The contract test calls every `/api/v1` route and validates its responses against the spec, so "openapi.yaml matches the real behaviour" is enforced by `npm test`, not by hand. Redoc is a pinned CDN script (no new dependency). That one page gets a CSP allowing only that script; every other route keeps `default-src 'none'`.
- **`docs/report/part-1.md`**: architecture, execution engine and sandbox security, queue design, real-time design, hardening, scalability (with the load-test numbers), trade-offs, future work. Six Mermaid diagrams: components, sequence, sandbox walls, queue state machine, plus the existing ones it links.
- **`docs/demo-script.md`**: a 5-minute demo of submit → live feedback, with what to say and show, hostile samples, chaos, load numbers and a "if something breaks" section.
- **`server/README.md`** (backend: start in ~5 minutes, configuration, tests, layout, troubleshooting) and a short root `README.md` that points to it.
- **Dead code:** scanned every export in Person 1's folders. All are used (the in-memory stores are the test doubles). The remaining lint errors are all in Person 2's folders (already in CR-020). `docs/api-examples.md` and `architecture.md` now cover Days 8–10.

## Fresh-clone check

Done on 2026-11-14 from a new `git clone` of this commit, following `server/README.md` literally (local PostgreSQL in place of `npm run db:up`):

- `npm ci` → `npm run build` → `npm run db:migrate && npm run db:seed`: **18 s** with a warm npm cache. Expect 1–3 min on a cold cache, still well under 10 minutes.
- API + worker started, then the README's curl flow ran verbatim: register → login → random problem → submit → **judged 5/5** → stats `attempted 1, solved 1, streak 1`. `/docs` returned 200, and `/docs/openapi.yaml` was the spec.
- `npm test` (no database): **148 passed, 17 skipped** (the PostgreSQL suites).
- `TEST_DATABASE_URL=… npx jest --runInBand` on a fresh database: **165 / 165 passed** (full flow, queue e2e, chaos, real time, security).

## How to run

```bash
npm ci && npm run db:up && npm run build && npm run db:migrate && npm run db:seed
npm run start -w server     # http://localhost:3000/docs
npm run start -w workers
```

## For Persons 2 and 3

- Open CRs from Person 1: **CR-023** (FYI: 413/429, headers, CORS, Fastify 5), **CR-024** (worker container hardening, P2), **CR-025** (client dependency upgrades + a test-order fix, P3), **CR-026** (CI workflow, P2), **CR-027** (seeded users' password hash, P2). Older: CR-019/020/021 (P2 reviews), CR-022 (P3 Day 7 merge).
- Demo day: start the server with `SUBMIT_QUOTA_PER_MINUTE=100` so live demos never hit the quota.

## Known issues

1. The seeded `student`/`admin` users can't log in until CR-027 lands. Register a user instead (README shows how).
2. `/docs` loads Redoc from `cdn.redoc.ly` (pinned version, no SRI hash), so the docs page needs internet. The spec itself is served locally.
3. CI isn't running until CR-026 is merged. Locally and on a fresh clone the full suite is green (165/165).

## Design decisions (for the viva)

- **The spec is enforced, not just documented:** the contract test fails the build if a route or response leaves the spec. Docs are rendered from the same file, so the page can't be stale.
- **Redoc from a CDN:** zero dependencies and one route. The cost is a third-party script, so the page's CSP allows exactly that origin and nothing else.
- **README tested by a fresh clone:** the instructions were followed literally from a new clone, so they reflect what actually works.

## Final scan after Persons 2 and 3 merged (2026-11-14)

Done with the whole team's folders unlocked. Nothing committed yet.

- **Build:** `server` compiles again (pool exports, sync controller reads `req.user.sub`). Core now also builds
  `src/storage` and `src/sync` (CR-020); `verdictOf` moved to core and is shared by the Postgres and SQLite repositories.
- **Sync (CR-028):** `/api/v1/sync/{push,pull,bootstrap}` mounted when `buildApp({ postgresRoutes: true })` (set in
  `server/src/index.ts`), plus `/health`, `/health/live`, `/health/ready` and `/metrics` at the root (the Dockerfile
  health check and Prometheus already pointed there). Fixed two sync bugs: a user could overwrite another user's
  submission by id, and the stats recompute wrote an integer into the boolean `solved` (every push failed).
  OpenAPI sync section matches the code; `ui-core` types regenerated. Test: `server/__tests__/sync-routes.test.ts`.
- **Database:** migration `007_audit_log_actor_delete` lets `ON DELETE SET NULL` clear `audit_log.actor_id`, so users
  can be deleted again; any other UPDATE/DELETE on `audit_log` is still rejected (tested).
- **Ops:** worker images build `server` (the worker imports its repositories) and start `main.js`, not the library
  `index.js`. Prod compose uses `CORS_ORIGINS`. Backups fail loudly (`pipefail`, no fake fallback file); restore runs
  in one transaction with `ON_ERROR_STOP`.
- **CI:** lint (22 errors) and Prettier (230 files) were failing; both clean now (`.prettierignore` for generated
  files). CI sets `TEST_DATABASE_URL` and runs the client suites.
- **Restored:** `docs/CHANGE_REQUESTS.md` (CR-002..CR-027 lost in a merge) and `.env.example` variables.
- **Results:** `npm run build`, lint and format clean; jest 31/31 suites (215 passed, 2 skipped) on a fresh DB;
  ui-core 54, web 15, mobile 18; every workspace typechecks.
- **better-sqlite3 + Docker (later the same day):** better-sqlite3 is an optional dependency of core (server
  images can't compile it and don't need it); the adapter's silent in-memory fallback is removed (it "saved" offline
  data into memory). Real-SQLite tests: `core/__tests__/storage/sqlite-repositories.test.ts`; the sync-engine tests
  now run on real SQLite too. Production stack fixed and verified with Docker: images ship `core/problems`,
  migrations and `openapi.yaml`; a one-shot `migrate` service replaces a broken init mount (pointed at a missing
  file and only ever applied 001); nginx waits for a healthy API, re-resolves it after redeploys (1.27 `resolve`),
  no longer sends conflicting security headers, and hides `/metrics`. Smoke test through nginx: 20/20 (register,
  login, problems, submit judged by the worker container, sandbox timeout, stats, leaderboard, daily, sync, docs,
  headers). Jest 32/32 suites (217 passed, 2 skipped).
- **Known issues:** offline submissions pushed through `/sync/push` are trusted as judged by the client.
  The API's per-test results don't include the error text (timeouts look like wrong answers). Old local dev DBs that recorded `004_session_families` need `npm run db:reset`.

## CLI brief gaps closed (2026-11-15)

### What was built

1. **Persistent CLI stats (JSON).** `cli/src/stats.ts` saves attempted and solved problem IDs plus a submission count to `~/.dsa-practice/stats.json` after every submission and loads them at start-up. Writes go to a temp file that is then renamed over the old one, so a crash mid-write never corrupts the file. An unreadable file is moved to `stats.json.bak` and the CLI starts fresh with a warning. The main menu has a new **2. View my stats** option (solved list and attempted-but-unsolved list); Exit is now **3**.
2. **Full problem bank in the CLI.** `core/problems/` now holds 41 problems (8 topics × Easy/Medium/Hard, 5 per topic) instead of 3, so topic and difficulty choices in the CLI are meaningful. See CR-030.

### How to run it

```
npm run build -w core && npm run build -w cli
node cli/dist/index.js
```

### Tests

- `cli/__tests__/stats.test.ts`: first run, save and reload after a restart, no duplicate IDs, corrupt files kept as `.bak`.
- `core/__tests__/problems.test.ts`: every topic and difficulty is covered, and every problem's reference solution passes its own tests in the sandbox (41 runs).
- Three tests used "Graphs + Hard" as an empty pair; they now use "Sorting + Hard", which still has no problem.

### For others

- No endpoint, table or event changed. The server's in-memory mode (`InMemoryProblemRepository` default) now also serves 41 problems.
- The root `tsconfig.json` must not extend `expo/tsconfig.base`. Expo adds that line when `npx expo start` is run from the repo root (run it from `mobile/`), and it sets `noEmit`, which silently stops every `tsc` build.

### Known issues

- Seed problems are duplicated in `core/problems/` (CR-030).
- The CLI keeps one stats file per OS user, and its stats are separate from the web/desktop/mobile account stats.

## Interactive CLI menus (2026-11-16)

### What was built

- **Keyboard-driven menus** in the CLI (`cli/src/ui.ts`, `select()`): ↑/↓ or j/k to move, Enter to select, 1-9 to jump, q/Esc to go back. Used for the main menu, topic, difficulty and the per-problem actions. The difficulty list only shows levels that exist for the chosen topic.
- **Colour and layout**: solved-progress bar, difficulty in green/yellow/red, green/red test results. Off when `NO_COLOR` is set or output is not a terminal.
- **Write the solution in your own editor**: opens `$VISUAL` / `$EDITOR` (default `vi`, `notepad` on Windows) on `~/.dsa-practice/drafts/<problem-id>.js`, pre-filled with the starter code. Save and quit to submit; an unchanged starter is not submitted. Paste-then-`END` is still available.
- **Stay on the problem**: after a hint, the reference solution or a failed submission you return to the problem's action menu. Hints are revealed one level at a time.
- **Scriptable fallback**: with piped stdin the menus are numbered prompts, read through one buffered line iterator (the old `rl.question` loop could drop piped lines).
- Package version bumped to **1.1.0** (not published yet: `npm publish -w cli` when ready).

### How to run

```bash
npm run build -w cli && npm run start -w cli
npx jest cli            # stats + menu key handling
```

### For others

No endpoint, table or WebSocket event changed. The CLI is still fully offline and its stats file format (`~/.dsa-practice/stats.json`) is unchanged.

### Design decisions (for the viva)

- **No prompt library.** The menu is about 60 lines on Node's `readline` keypress events, so the npm package stays one bundled file with nothing extra to audit.
- **Key handling is a pure function** (`handleKey(index, count, key)`), so it is unit-tested without a terminal; the terminal drawing around it is thin.
- **Inline menus, not full-screen.** Each menu redraws in place and collapses to one line once chosen, so the scrollback stays a readable transcript of the session.
- **The user's editor instead of an embedded one.** Any embedded editor would be worse than vim/VS Code and far more code. `shell: true` lets values like `EDITOR="code -w"` work; the only interpolated path is the CLI's own drafts folder.
- **Drafts live next to the stats file**, not in the shared temp folder, so other users on the machine cannot pre-create or read them.

### Known issues

- Menus with more than 9 rows can only be reached by arrows past row 9 (no menu is that long today: 8 topics).
- A very long menu is not scrolled; it assumes the list fits in the terminal height.
- After Esc there is a short delay (Node waits to see whether it is the start of an arrow-key sequence); `q` is instant.
- On Windows the editor path was not tested (no Windows machine); paste mode is the fallback.

## Full-screen CLI (2026-11-16)

### What was built

- The CLI now runs as a **full-screen terminal UI** (alternate screen, restored on quit). `select()` in `cli/src/ui.ts` draws every screen: block logo with the version, a bordered panel with right-aligned details per row, and a key-hint footer.
- **Home screen**: topics with `solved/total` per topic and overall, plus "My stats". Choosing a topic goes straight to its difficulties.
- **Search** (`/` on the home screen): filters all 41 problems by title, topic or difficulty as you type and opens the chosen one directly. Solved problems are ticked.
- **Problem screen**: the statement, hints, test results or reference solution stay above the action menu. Text is word-wrapped to the terminal width and scrolls with d/u (or PgUp/PgDn) when it does not fit.
- The version shown comes from `cli/package.json`, injected at build time by `cli/build.mjs`.

### How to run it

```bash
npm run build -w cli && npm run start -w cli
npx jest cli
```

### Design decisions (for the viva)

- **One drawing function for every screen** instead of a screen per feature: a screen is "optional text + one panel of rows", so home, difficulty, problem and stats are all the same `select()` call with different data.
- **Whole-frame redraw on each key** (cursor home, rewrite, clear the rest). At this size it is instant and there is no diffing code to get wrong; it also makes terminal resize a one-line handler.
- **Still no TUI library** (blessed/ink): the layout is about 150 lines on `readline`, and the npm package stays one bundled file.
- **Alternate screen is re-entered on every menu**, because an editor such as vim switches back to the normal screen when it quits.
- **Piped input keeps the plain numbered prompts**, so the CLI is still scriptable and testable without a terminal.

### Known issues

- Number keys reach rows 1-9 only; the home screen has exactly 9 rows today.
- Characters that are two columns wide (the ✅/❌ marks) are counted as one when wrapping, so a line containing them can wrap one column late.
- On terminals shorter than about 20 rows the logo is replaced by a one-line title, and very small windows cut the panel.
- A corrupt-stats warning is printed after you quit (the full-screen UI would wipe it at start-up).
