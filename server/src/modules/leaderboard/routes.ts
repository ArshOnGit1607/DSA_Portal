import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { decodeCursor, encodeCursor, HttpError } from '../../lib/http';
import type { Cache } from '../../cache/cache';
import { pool } from '../../db/pool';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  solved: number;
  totalScore: number;
  rank: number;
}

/** Ranked users who solved at least one problem; `offset` rows skipped, at most `limit` returned. */
export interface LeaderboardStore {
  page(offset: number, limit: number): Promise<LeaderboardEntry[]>;
}

export const LEADERBOARD_TTL_S = 30;

/** Score: Easy 1, Medium 2, Hard 3 per solved problem (Person 2's Day 1 handover). Ties share a rank. */
export class PostgresLeaderboard implements LeaderboardStore {
  async page(offset: number, limit: number) {
    const res = await pool.query<LeaderboardEntry>(
      `SELECT u.id AS "userId", u.username,
              COUNT(*) FILTER (WHERE ups.solved)::int AS solved,
              COALESCE(SUM(CASE p.difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Hard' THEN 3 END)
                       FILTER (WHERE ups.solved), 0)::int AS "totalScore",
              RANK() OVER (ORDER BY COUNT(*) FILTER (WHERE ups.solved) DESC,
                                    COALESCE(SUM(CASE p.difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Hard' THEN 3 END)
                                             FILTER (WHERE ups.solved), 0) DESC)::int AS rank
       FROM users u
       JOIN user_problem_stats ups ON ups.user_id = u.id
       JOIN problems p ON p.id = ups.problem_id
       GROUP BY u.id, u.username
       HAVING COUNT(*) FILTER (WHERE ups.solved) > 0
       ORDER BY rank, u.username
       OFFSET $1 LIMIT $2`,
      [offset, limit]
    );
    return res.rows;
  }
}

/** The in-memory server keeps no users table to rank, so its leaderboard is empty. */
export const emptyLeaderboard: LeaderboardStore = { page: async () => [] };

const Query = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });

// shortcut: the cursor is an opaque offset (rows shift if ranks change between pages); fine for a ≤30 s cached board, switch to a (rank, username) keyset if it grows large.
export const leaderboardRoutes: FastifyPluginAsync<{ leaderboard: LeaderboardStore; cache: Cache }> = async (app, { leaderboard, cache }) => {
  app.get('/leaderboard', async (req) => {
    const { cursor, limit } = Query.parse(req.query);
    const raw = decodeCursor(cursor);
    const offset = raw === undefined ? 0 : Number(raw);
    if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, 'VALIDATION_ERROR', 'cursor is invalid');
    // One extra row tells whether another page exists. Public data, so it is cached for everyone.
    const key = await cache.genKey('leaderboard', String(offset), String(limit));
    const rows = await cache.getOrLoad(key, LEADERBOARD_TTL_S, () => leaderboard.page(offset, limit + 1));
    return {
      data: rows.slice(0, limit),
      nextCursor: rows.length > limit ? encodeCursor(String(offset + limit)) : null,
    };
  });
};
