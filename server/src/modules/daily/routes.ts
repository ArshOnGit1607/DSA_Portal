import type { FastifyPluginAsync } from 'fastify';
import type { ProblemRepository } from '@dsa-portal/core';
import { notFound } from '../../lib/http';
import type { Cache } from '../../cache/cache';
import { pool } from '../../db/pool';
import { toApiProblem } from '../problems/routes';

/** A problem an admin pinned for a date (daily_challenges), if any. */
export interface DailyStore {
  pinned(date: string): Promise<string | null>;
}

export const DAILY_TTL_S = 300;

export class PostgresDailyStore implements DailyStore {
  async pinned(date: string) {
    const res = await pool.query<{ slug: string }>(
      `SELECT p.slug FROM daily_challenges dc JOIN problems p ON p.id = dc.problem_id
       WHERE dc.challenge_date = $1::date AND p.is_published`,
      [date]
    );
    return res.rows[0]?.slug ?? null;
  }
}

export const noPinnedDaily: DailyStore = { pinned: async () => null };

/**
 * Today's problem (UTC date): the pinned one if an admin set it, otherwise a rotation through the
 * published problems by day number, so there is always a challenge without a daily cron job.
 */
export async function dailyProblemId(date: string, daily: DailyStore, problems: ProblemRepository) {
  const pinned = await daily.pinned(date);
  if (pinned) return pinned;
  const ids = (await problems.findAll()).map((p) => p.id).sort();
  if (ids.length === 0) return null;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return ids[day % ids.length];
}

export const dailyRoutes: FastifyPluginAsync<{ daily: DailyStore; problems: ProblemRepository; cache: Cache }> = async (app, { daily, problems, cache }) => {
  app.get('/daily-challenge', { onRequest: app.authenticate }, async () => {
    const date = new Date().toISOString().slice(0, 10);
    const key = await cache.genKey('daily', date);
    const body = await cache.getOrLoad(key, DAILY_TTL_S, async () => {
      const id = await dailyProblemId(date, daily, problems);
      const problem = id ? await problems.findById(id) : null;
      return problem ? { date, problemId: problem.id, problem: toApiProblem(problem) } : null;
    });
    if (!body) throw notFound('Daily challenge');
    return body;
  });
};
