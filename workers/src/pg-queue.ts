import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import { judgeSubmission, type JudgeDeps } from './judge';

export const QUEUE_CHANNEL = 'submission_queued'; // fired by the trigger in migration 002

/**
 * Atomically moves the oldest queued submission to `running` and returns its id.
 * SKIP LOCKED lets many workers (threads or machines) claim in parallel without
 * ever handing the same submission to two of them.
 */
export async function claimNext(pool: Pool): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE submissions SET status = 'running'
     WHERE id = (
       SELECT id FROM submissions
       WHERE status = 'queued'
       ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id`
  );
  return rows[0]?.id ?? null;
}

export interface WorkerOptions {
  pool: Pool;
  deps: JudgeDeps;
  concurrency: number;
  pollMs: number;
  log?: Pick<Console, 'info' | 'error'>;
}

/** Starts `concurrency` claim-and-judge loops. stop() lets in-flight jobs finish first. */
export async function startWorker({ pool, deps, concurrency, pollMs, log = console }: WorkerOptions) {
  let stopping = false;
  const wake = new EventEmitter();
  wake.setMaxListeners(0);

  // shortcut: if this LISTEN connection drops we fall back to polling every pollMs; Day 6 can add reconnects.
  const listener = await pool.connect();
  listener.on('error', (err) => log.error('[worker] LISTEN connection error', err));
  listener.on('notification', () => wake.emit('job'));
  await listener.query(`LISTEN ${QUEUE_CHANNEL}`);

  const idle = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wake.off('job', done);
        resolve();
      };
      const timer = setTimeout(done, pollMs);
      wake.once('job', done);
    });

  const loop = async (n: number) => {
    while (!stopping) {
      let id: string | null = null;
      try {
        id = await claimNext(pool);
        if (!id) {
          await idle();
          continue;
        }
        const s = await judgeSubmission(id, deps);
        log.info(`[worker ${n}] ${id} ${s.status} ${s.result?.status ?? ''}`);
      } catch (err) {
        log.error(`[worker ${n}] job ${id ?? '(claim)'} failed`, err);
        // shortcut: no retry yet, the submission is marked failed; Day 6 adds retries + a dead-letter list.
        // Only if still running: an error after the result was saved (e.g. the stats hook) must not erase it.
        if (id) {
          await pool
            .query(`UPDATE submissions SET status = 'failed', judged_at = now() WHERE id = $1 AND status = 'running'`, [id])
            .catch(() => {});
        }
        if (!id) await idle(); // DB down: back off instead of spinning
      }
    }
  };

  const loops = Array.from({ length: concurrency }, (_, i) => loop(i + 1));
  log.info(`[worker] started: concurrency=${concurrency}, poll=${pollMs}ms`);

  return {
    async stop() {
      stopping = true;
      wake.emit('job'); // release idle loops now
      await Promise.all(loops);
      await listener.query(`UNLISTEN ${QUEUE_CHANNEL}`).catch(() => {});
      listener.release();
    },
  };
}
