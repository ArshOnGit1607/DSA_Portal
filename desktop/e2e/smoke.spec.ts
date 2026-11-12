/**
 * Desktop smoke test: launch → log in against a real API → API goes away → run and submit a
 * problem with the offline engine. Needs `npm run build -w desktop` first (web/dist + desktop/dist).
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { FastifyInstance } from 'fastify';

process.env.BCRYPT_COST = '4'; // read when the auth module loads (dynamic import below)
const USER = { username: 'desk_user', email: 'desk@dsa.dev', password: 'blue-kettle-42' };

let api: FastifyInstance;
let app: ElectronApplication;
let win: Page;

test.beforeAll(async () => {
  // The real server app with Person 3's modules, as CR-010 wires them (in-memory stores).
  const { buildApp } = await import('../../server/src/app');
  const { authRoutes } = await import('../../server/src/modules/auth/routes');
  const { InMemoryAuthStore } = await import('../../server/src/modules/auth/store');
  api = buildApp({ logger: false });
  api.register(async (v1) => v1.register(authRoutes, { auth: new InMemoryAuthStore() }), { prefix: '/api/v1' });
  const url = await api.listen({ port: 0, host: '127.0.0.1' });
  const reg = await fetch(`${url}/api/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(USER) });
  expect(reg.status).toBe(201);

  app = await electron.launch({
    args: [path.join(__dirname, '../dist/main.js')],
    env: { ...process.env, DSA_API_URL: url, DSA_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-desktop-')), DSA_NETWORK_POLL_MS: '300' } as Record<string, string>,
  });
  win = await app.firstWindow();
  win.on('pageerror', (e) => console.error('renderer error:', e));
});

test.afterAll(async () => {
  await app?.close();
  await api?.close();
});

test('logs in online, then practises offline with the local sandbox', async () => {
  await expect(win.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(win.getByText('● Online')).toBeVisible();

  // The window is locked down: no Node in the page, only the typed bridge.
  expect(await win.evaluate(() => [typeof (globalThis as { require?: unknown }).require, typeof (globalThis as { process?: unknown }).process, typeof (window as { dsaDesktop?: { offline: { run: unknown } } }).dsaDesktop?.offline.run])).toEqual(['undefined', 'undefined', 'function']);

  await win.getByLabel('Email').fill(USER.email);
  await win.getByLabel('Password').fill(USER.password);
  await expect(win.getByLabel('Email')).toHaveValue(USER.email);
  await win.getByRole('button', { name: 'Sign in' }).click();
  await expect(win.getByRole('heading', { name: 'Practice' })).toBeVisible();

  // "Network off": the API stops answering, the app switches to offline mode by itself.
  await api.close();
  await expect(win.getByText('○ Offline: local practice')).toBeVisible({ timeout: 10_000 });

  await win.getByLabel('Topic').selectOption('Arrays');
  await win.getByRole('radio', { name: 'Easy' }).check();
  await win.getByRole('button', { name: 'Start' }).click();
  const title = (await win.getByRole('heading', { level: 1 }).textContent())!;
  await expect(win.getByRole('button', { name: 'Run tests' })).toBeVisible();
  await expect(win.getByLabel('Code editor')).toBeVisible({ timeout: 20_000 });

  // Starter code runs in the local sandbox and fails.
  await win.getByRole('button', { name: 'Run tests' }).click();
  await expect(win.getByText('Some tests fail')).toBeVisible({ timeout: 30_000 });

  // Paste the reference solution of whatever problem we got and submit: judged offline.
  const { SEED_PROBLEMS } = await import('../../server/src/db/seeds/problems-data');
  const solution = SEED_PROBLEMS.find((p) => p.title === title)!.solution.code;
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), solution);
  await win.locator('.monaco-editor .view-lines').click();
  await win.keyboard.press('ControlOrMeta+A');
  await win.keyboard.press('ControlOrMeta+V');
  await win.getByRole('button', { name: 'Submit' }).click();
  await expect(win.getByText('Accepted')).toBeVisible({ timeout: 30_000 });

  // Solved locally → the solution unlocks offline too.
  await win.getByRole('button', { name: 'Reveal solution…' }).click();
  await win.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(win.locator('pre.solution')).toContainText('function solve');
  await win.screenshot({ path: path.join(__dirname, '../test-results/offline-solved.png') });
});
