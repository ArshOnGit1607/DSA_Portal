# Day 6 — Person 3: Expo mobile app

## What was built (`/mobile`, Expo SDK 51, TypeScript, Expo Router)
- Screens: sign in, register, practice (topic + difficulty chips → random problem), problem (description, examples, progressive hints, solution behind a confirm alert, code editor, submit, per-test results), stats (tiles, attempted/solved bars by topic and difficulty, 12-week streak calendar, pull to refresh). Tabs: Practice / Stats; everything under `app/(app)` requires sign-in.
- Same logic as web/desktop: all state comes from `/ui-core` stores and hooks (`createDsa`, `useAuth`, `useProblem`, `useSubmission`, `useStats`).
- React Native adapters (`mobile/src/adapters.ts`): `expo-secure-store` for the refresh token, NetInfo for the offline banner, and an `expo-sqlite` `LocalStore` (`mobile/src/local-store.ts`) that caches every problem the user opens so it can still be read offline.
- Editor: native `TextInput` + symbol key bar; decision and trade-offs in `docs/design/mobile-editor-decision.md`.
- Phones and tablets: description and editor side by side at ≥ 768 pt wide; `KeyboardAvoidingView`, `keyboardShouldPersistTaps`, 44–48 pt touch targets, screen-reader labels on every control.
- Code runs on the server only; the app submits with an Idempotency-Key and polls until judged (ui-core submission store). Sockets arrive Day 7.
- Fixes in shared code found on mobile: `ui-core` used `URLSearchParams.set`, which React Native doesn't implement (now `append`).
- `server/src/modules/auth/dev-server.ts`: TEMP server with Person 3's routes wired in (as CR-010 proposes) on PostgreSQL, so clients can run end to end until CR-010 lands.

## How to run
```bash
npm test -w mobile                      # 14 tests (jest-expo): screens on a fake API, editor helpers, SQLite cache, offline fallback

# API + worker (PostgreSQL, migrated + seeded)
DATABASE_URL=postgresql://postgres@localhost:5432/dsa_portal PORT=3100 npx tsx server/src/modules/auth/dev-server.ts
npm run build -w workers && DATABASE_URL=postgresql://postgres@localhost:5432/dsa_portal node workers/dist/main.js

# App (see mobile/.env.example for the API URL per device)
cd mobile && EXPO_PUBLIC_API_URL=http://localhost:3100 npx expo start
adb reverse tcp:3100 tcp:3100            # Android emulator/phone over USB: device localhost → this computer
```
Monorepo notes: `mobile/index.js` imports `expo-router/entry` (it is hoisted to the root `node_modules`); `metro.config.js` watches the repo root so Metro can bundle `/ui-core` from source. Install Watchman (`brew install watchman`): without it the first Metro build crawls the whole monorepo (≈15 min here, 8 s once cached).

## Stats response shapes
Same as Day 4 (`docs/handover/day-4-person-3.md`); the mobile stats screen uses `summary.topics`, `summary.difficulties` and `streak.days`.

## Notes for Person 2
`LocalStore` (in `ui-core/src/adapters/types.ts`: `saveProblem`, `getProblem`, `listProblems`) is the client-side subset of the storage API asked for on Day 5. The expo-sqlite version is `mobile/src/local-store.ts` (table `problems(id, title, topic, difficulty, json, saved_at)`). When your storage interface exists, I'll adapt this file to it.

## Known issues
1. Expo Go is not usable on this machine's emulators: the SDK 51 Expo Go (2.31.2) crashes natively on Android 16 (16 KB pages) and fails to start on Android 14 here. The app is run as a development build instead: `npx expo run:android` (JDK 17–21; Metro on another port → `adb reverse tcp:8081 tcp:<port>`).
2. No syntax highlighting in the mobile editor (see the decision note).
3. Offline: only problems opened before are readable; submitting and stats need the server.
4. Settings (theme) follow the system and aren't persisted on mobile yet.
5. The TEMP `dev-server.ts` should be deleted once CR-010 is applied.

## Design decisions (viva)
- **Expo SDK 51:** the newest SDK on React 18.2, the version `/ui-core` and the web app use; newer SDKs need React 19, which would put two Reacts in one bundle.
- **One brain, three faces:** web, desktop and mobile share the same stores and API client; mobile only adds adapters (SecureStore, NetInfo, SQLite) and screens.
- **Refresh token in SecureStore, sent as a Cookie header:** the same endpoint as the browser, no API change; the rotated token comes back in `Set-Cookie`.
- **Native editor over Monaco-in-WebView:** reliable typing, selection and screen-reader support on phones beat syntax highlighting for short exercises.
- **Cache what you open:** offline reading costs one SQLite upsert per problem view and never hides real server errors (only network failures fall back to the cache).
