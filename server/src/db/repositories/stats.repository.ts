import type { StatsRepository, Topic } from '@dsa-portal/core';
import { pool } from '../pool';

export class PostgresStatsRepository implements StatsRepository {
  async getUserStats(userId: string): Promise<{
    attempted: number;
    solved: number;
    totalProblems: number;
    streak: number;
  }> {
    const statsSql = `
      SELECT
        COUNT(*)::int AS attempted,
        COUNT(*) FILTER (WHERE solved)::int AS solved
      FROM user_problem_stats
      WHERE user_id = $1::uuid;
    `;

    const totalProblemsSql = `
      SELECT COUNT(*)::int AS total
      FROM problems
      WHERE is_published = true;
    `;

    const solveDatesSql = `
      SELECT DISTINCT first_solved_at::date AS solve_date
      FROM user_problem_stats
      WHERE user_id = $1::uuid AND solved = true AND first_solved_at IS NOT NULL
      ORDER BY solve_date DESC;
    `;

    const [statsRes, totalRes, datesRes] = await Promise.all([
      pool.query(statsSql, [userId]),
      pool.query(totalProblemsSql),
      pool.query(solveDatesSql, [userId]),
    ]);

    const attempted = statsRes.rows[0]?.attempted || 0;
    const solved = statsRes.rows[0]?.solved || 0;
    const totalProblems = totalRes.rows[0]?.total || 0;

    // Calculate daily streak
    let streak = 0;
    const dates = datesRes.rows.map((r) => new Date(r.solve_date));
    if (dates.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const expected = dates[0].getTime() === today.getTime() ? today : yesterday;
      if (dates[0].getTime() === expected.getTime()) {
        streak = 1;
        for (let i = 1; i < dates.length; i++) {
          expected.setDate(expected.getDate() - 1);
          if (dates[i].getTime() === expected.getTime()) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    return { attempted, solved, totalProblems, streak };
  }

  async getTopicStats(userId: string): Promise<
    Array<{
      topic: Topic;
      attempted: number;
      solved: number;
    }>
  > {
    const sql = `
      SELECT
        p.topic,
        COUNT(*)::int AS attempted,
        COUNT(*) FILTER (WHERE ups.solved)::int AS solved
      FROM user_problem_stats ups
      JOIN problems p ON ups.problem_id = p.id
      WHERE ups.user_id = $1::uuid
      GROUP BY p.topic
      ORDER BY p.topic ASC;
    `;

    const res = await pool.query(sql, [userId]);
    return res.rows.map((r) => ({
      topic: r.topic as Topic,
      attempted: r.attempted,
      solved: r.solved,
    }));
  }
}
