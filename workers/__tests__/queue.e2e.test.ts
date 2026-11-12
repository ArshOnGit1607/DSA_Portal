/**
 * Day 5 end-to-end: API (in this process) → PostgreSQL queue → worker (a SEPARATE process) → result.
 * Needs a migrated database:  TEST_DATABASE_URL=postgresql://postgres@localhost:5432/dsa_portal_test npx jest workers
 */
import { execSync, spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

const DB_URL = process.env.TEST_DATABASE_URL;
const ROOT = path.join(__dirname, '../..');
const USER_ID = '00000000-0000-0000-0000-0000000e2e01';
const TWO_SUM_OK =
  'function solve({ nums, target }) { const m = new Map(); for (let i = 0; i < nums.length; i++) { if (m.has(target - nums[i])) return [m.get(target - nums[i]), i]; m.set(nums[i], i); } }';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(DB_URL ? describe : describe.skip)('submission queue end-to-end (PostgreSQL + separate worker process)', () => {
  let worker: ChildProcess;
  let workerLog = '';
  // Loaded after DATABASE_URL is set: Person 2's pool reads it at import time.
  let app: ReturnType<typeof import('../../server/src/app').buildApp>;
  let pool: typeof import('../../server/src/db/pool').pool;
  let closePool: () => Promise<void>;
  let auth: { authorization: string };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    const db = await import('../../server/src/db/pool');
    const { migrateUp } = await import('../../server/src/db/migrate');
    const repos = await import('../../server/src/db/repositories');
    const { buildApp } = await import('../../server/src/app');
    const { PROBLEMS } = await import('@dsa-portal/core');
    ({ pool, closePool } = db);

    await migrateUp();
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash) VALUES ($1, 'e2e_user', 'e2e@test.dev', 'x')
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID]
    );
    const problems = new repos.PostgresProblemRepository();
    if (!(await problems.findById('two-sum'))) await problems.save(PROBLEMS.find((p) => p.id === 'two-sum')!);

    app = buildApp({ logger: false, problems, submissions: new repos.PostgresSubmissionRepository() });
    await app.ready();
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: USER_ID })}` };

    // Run the real built worker, exactly as `npm run start -w workers` would.
    execSync('npm run -s build', { cwd: ROOT, stdio: 'ignore' });
    worker = spawn(process.execPath, [path.join(ROOT, 'workers/dist/main.js')], {
      env: { PATH: process.env.PATH, DATABASE_URL: DB_URL, WORKER_CONCURRENCY: '2', WORKER_POLL_MS: '500' },
    });
    worker.stdout!.on('data', (d) => (workerLog += d));
    worker.stderr!.on('data', (d) => (workerLog += d));
    for (let i = 0; i < 50 && !workerLog.includes('started'); i++) await sleep(100);
    expect(workerLog).toContain('[worker] started');
  }, 60000);

  afterAll(async () => {
    if (worker && worker.exitCode === null) worker.kill('SIGKILL');
    if (pool) await pool.query('DELETE FROM users WHERE id = $1', [USER_ID]); // cascades to submissions + stats
    await app?.close();
    await closePool?.();
  });

  const submit = (code: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/v1/submissions', headers: { ...auth, ...headers }, payload: { problemId: 'two-sum', code } });

  async function waitForResult(id: string) {
    for (let i = 0; i < 150; i++) {
      const s = (await app.inject({ url: `/api/v1/submissions/${id}`, headers: auth })).json();
      if (s.status === 'judged' || s.status === 'failed') return s;
      await sleep(100);
    }
    throw new Error(`submission ${id} was never judged`);
  }

  it('a submission sent to the API is judged by the separate worker process', async () => {
    const res = await submit(TWO_SUM_OK);
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('queued');

    const done = await waitForResult(res.json().submissionId);
    expect(done).toMatchObject({ status: 'judged', passed: 5, total: 5 });
    expect(done.judgedAt).not.toBeNull();
    expect(workerLog).toContain(res.json().submissionId); // judged over there, not in this process
  }, 20000);

  it('judges every submission exactly once, including hostile ones, with concurrency 2', async () => {
    const before = await pool.query(`SELECT COALESCE(SUM(attempts), 0)::int AS n FROM user_problem_stats WHERE user_id = $1`, [USER_ID]);
    const codes = [TWO_SUM_OK, 'function solve() { return [9, 9]; }', 'function solve() { while (true) {} }', TWO_SUM_OK];
    const ids = await Promise.all(codes.map(async (c) => (await submit(c)).json().submissionId));
    const results = await Promise.all(ids.map(waitForResult));

    expect(results.map((r) => r.passed)).toEqual([5, 0, 0, 5]);
    const after = await pool.query(`SELECT SUM(attempts)::int AS n FROM user_problem_stats WHERE user_id = $1`, [USER_ID]);
    expect(after.rows[0].n - before.rows[0].n).toBe(codes.length); // no double judging
  }, 30000);

  it('Idempotency-Key: concurrent retries create exactly one submission', async () => {
    const headers = { 'idempotency-key': `e2e-${Date.now()}` };
    const [a, b, c] = await Promise.all([submit(TWO_SUM_OK, headers), submit(TWO_SUM_OK, headers), submit(TWO_SUM_OK, headers)]);
    expect([a.statusCode, b.statusCode, c.statusCode]).toEqual([202, 202, 202]);
    expect(new Set([a, b, c].map((r) => r.json().submissionId)).size).toBe(1);
    const rows = await pool.query(`SELECT count(*)::int AS n FROM submissions WHERE user_id = $1 AND idempotency_key = $2`, [USER_ID, headers['idempotency-key']]);
    expect(rows.rows[0].n).toBe(1);
  }, 20000);

  it('stops cleanly on SIGTERM after finishing its current job', async () => {
    const res = await submit('function solve() { while (true) {} }'); // ~5 tests x 2 s timeout
    await sleep(300); // let the worker claim it
    const exited = new Promise<number | null>((r) => worker.once('exit', (code) => r(code)));
    worker.kill('SIGTERM');
    expect(await exited).toBe(0);
    const s = (await app.inject({ url: `/api/v1/submissions/${res.json().submissionId}`, headers: auth })).json();
    expect(s.status).toBe('judged'); // finished, not left 'running'
  }, 30000);

  // Runs after the SIGTERM test, so the separate worker is gone and this in-process one gets the job.
  it('a failing stats hook never erases a saved result', async () => {
    const repos = await import('../../server/src/db/repositories');
    const { startWorker } = await import('../src/pg-queue');
    const res = await submit('function solve() { return [0, 1]; }'); // passes 2 of 5
    const w = await startWorker({
      pool,
      concurrency: 1,
      pollMs: 100,
      log: { info() {}, error() {} },
      deps: {
        problems: new repos.PostgresProblemRepository(),
        submissions: new repos.PostgresSubmissionRepository(),
        stats: { onSubmissionJudged: async () => { throw new Error('stats service down'); } },
      },
    });
    await waitForResult(res.json().submissionId);
    await w.stop(); // lets the worker's error handler finish before we look
    const s = (await app.inject({ url: `/api/v1/submissions/${res.json().submissionId}`, headers: auth })).json();
    expect(s).toMatchObject({ status: 'judged', passed: 2, total: 5 });
  }, 20000);
});
