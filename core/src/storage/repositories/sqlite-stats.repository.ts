import type { StatsRepository, Topic } from '../../types';
import type { DatabaseAdapter } from '../adapter';

interface StatsCountRow {
  attempted: number;
  solved: number;
}

interface TotalProblemsRow {
  total: number;
}

interface SolveDateRow {
  solve_date: string;
}

interface TopicStatRow {
  topic: string;
  attempted: number;
  solved: number;
}

export class SqliteStatsRepository implements StatsRepository {
  constructor(private adapter: DatabaseAdapter) {}

  async getUserStats(userId: string): Promise<{
    attempted: number;
    solved: number;
    totalProblems: number;
    streak: number;
  }> {
    const statsRow = await this.adapter.queryOne<StatsCountRow>(
      `SELECT
        COUNT(*) as attempted,
        TOTAL(CASE WHEN solved = 1 THEN 1 ELSE 0 END) as solved
       FROM user_problem_stats
       WHERE user_id = ?`,
      [userId]
    );

    const totalRow = await this.adapter.queryOne<TotalProblemsRow>(
      'SELECT COUNT(*) as total FROM problems WHERE is_published = 1'
    );

    const dateRows = await this.adapter.query<SolveDateRow>(
      `SELECT DISTINCT date(first_solved_at) as solve_date
       FROM user_problem_stats
       WHERE user_id = ? AND solved = 1 AND first_solved_at IS NOT NULL
       ORDER BY solve_date DESC`,
      [userId]
    );

    const attempted = Number(statsRow?.attempted || 0);
    const solved = Number(statsRow?.solved || 0);
    const totalProblems = Number(totalRow?.total || 0);

    let streak = 0;
    const dates = dateRows.map((r) => new Date(r.solve_date));
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
    const rows = await this.adapter.query<TopicStatRow>(
      `SELECT
        p.topic,
        COUNT(*) as attempted,
        TOTAL(CASE WHEN ups.solved = 1 THEN 1 ELSE 0 END) as solved
       FROM user_problem_stats ups
       JOIN problems p ON ups.problem_id = p.id
       WHERE ups.user_id = ?
       GROUP BY p.topic
       ORDER BY p.topic ASC`,
      [userId]
    );

    return rows.map((r) => ({
      topic: r.topic as Topic,
      attempted: Number(r.attempted),
      solved: Number(r.solved),
    }));
  }
}
