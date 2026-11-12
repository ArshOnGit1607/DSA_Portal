// Worker process entry point: `npm run start -w workers` (after `npm run build`).
import { pool, closePool } from '@dsa-portal/server/dist/db/pool';
import {
  PostgresProblemRepository,
  PostgresSubmissionRepository,
} from '@dsa-portal/server/dist/db/repositories';
import { statsServiceStub } from './judge';
import { startWorker } from './pg-queue';

async function main() {
  const worker = await startWorker({
    pool,
    deps: {
      problems: new PostgresProblemRepository(),
      submissions: new PostgresSubmissionRepository(),
      stats: statsServiceStub,
    },
    concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 2),
    pollMs: Math.max(100, Number(process.env.WORKER_POLL_MS) || 2000),
  });

  // Finish in-flight submissions, then exit (Day 6 extends this with stalled-job recovery).
  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal}: finishing current jobs...`);
    await worker.stop();
    await closePool();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (err) => {
  console.error('[worker] failed to start', err);
  await closePool().catch(() => {});
  process.exit(1);
});
