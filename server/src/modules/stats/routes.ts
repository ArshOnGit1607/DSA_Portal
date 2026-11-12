import type { FastifyPluginAsync } from 'fastify';
import type { StatsRepository } from '@dsa-portal/core';

/**
 * `streak` is left out of GET /stats/me: the spec's StreakStat needs currentStreak, longestStreak
 * and lastSolvedAt, but StatsRepository only returns the current streak (see CR-011).
 */
export const statsRoutes: FastifyPluginAsync<{ stats: StatsRepository }> = async (app, { stats }) => {
  app.get('/stats/me', { preHandler: app.authenticate }, async (req) => {
    const [summary, topics] = await Promise.all([
      stats.getUserStats(req.user.sub),
      stats.getTopicStats(req.user.sub),
    ]);
    return { attempted: summary.attempted, solved: summary.solved, totalProblems: summary.totalProblems, topics };
  });

  app.get('/stats/me/topics', { preHandler: app.authenticate }, async (req) => ({
    topics: await stats.getTopicStats(req.user.sub),
  }));
};
