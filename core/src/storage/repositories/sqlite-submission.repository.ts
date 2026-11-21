import type { Submission, SubmissionRepository, ExecutionResult } from '../../types';
import type { DatabaseAdapter } from '../adapter';

interface SubmissionRow {
  id: string;
  user_id: string;
  problem_slug: string;
  code: string;
  status: 'queued' | 'running' | 'judged' | 'failed';
  passed: number;
  total: number;
  results: string | null;
  created_at: string;
  judged_at: string | null;
}

export class SqliteSubmissionRepository implements SubmissionRepository {
  constructor(private adapter: DatabaseAdapter) {}

  async save(submission: Submission): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      // Find problem id
      const probRow = await tx.queryOne<{ id: string }>(
        'SELECT id FROM problems WHERE slug = ? OR id = ? LIMIT 1',
        [submission.problemId, submission.problemId]
      );

      if (!probRow) {
        throw new Error(`Problem not found: ${submission.problemId}`);
      }

      const problemId = probRow.id;
      const subId = submission.id || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const passed = submission.result?.passed ?? 0;
      const total = submission.result?.total ?? 0;
      const resultsJson = submission.result?.results
        ? JSON.stringify(submission.result.results)
        : null;

      const existing = await tx.queryOne<{ id: string }>(
        'SELECT id FROM submissions WHERE id = ? LIMIT 1',
        [subId]
      );

      if (existing) {
        await tx.execute(
          `UPDATE submissions SET
            status = ?, passed = ?, total = ?, results = ?, judged_at = datetime('now')
           WHERE id = ?`,
          [submission.status, passed, total, resultsJson, subId]
        );
      } else {
        await tx.execute(
          `INSERT INTO submissions (id, user_id, problem_id, code, status, passed, total, results, created_at, judged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), CASE WHEN ? IN ('judged', 'failed') THEN datetime('now') ELSE NULL END)`,
          [subId, submission.userId, problemId, submission.code, submission.status, passed, total, resultsJson, submission.status]
        );
      }

      // Update user_problem_stats
      if (submission.status === 'judged') {
        const isSolved = passed === total && total > 0 ? 1 : 0;
        const statsRow = await tx.queryOne<{ id: string; attempts: number; solved: number }>(
          'SELECT id, attempts, solved FROM user_problem_stats WHERE user_id = ? AND problem_id = ? LIMIT 1',
          [submission.userId, problemId]
        );

        if (statsRow) {
          await tx.execute(
            `UPDATE user_problem_stats SET
              attempts = attempts + 1,
              solved = MAX(solved, ?),
              first_solved_at = COALESCE(first_solved_at, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END),
              last_attempted_at = datetime('now')
             WHERE id = ?`,
            [isSolved, isSolved, statsRow.id]
          );
        } else {
          await tx.execute(
            `INSERT INTO user_problem_stats (id, user_id, problem_id, attempts, solved, first_solved_at, last_attempted_at)
             VALUES (?, ?, ?, 1, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, datetime('now'))`,
            [`ups-${subId}`, submission.userId, problemId, isSolved, isSolved]
          );
        }
      }
    });
  }

  async findById(id: string): Promise<Submission | null> {
    const row = await this.adapter.queryOne<SubmissionRow>(
      `SELECT s.*, p.slug as problem_slug
       FROM submissions s
       JOIN problems p ON s.problem_id = p.id
       WHERE s.id = ? LIMIT 1`,
      [id]
    );

    if (!row) return null;
    return this.mapRow(row);
  }

  async findByUser(userId: string): Promise<Submission[]> {
    const rows = await this.adapter.query<SubmissionRow>(
      `SELECT s.*, p.slug as problem_slug
       FROM submissions s
       JOIN problems p ON s.problem_id = p.id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC`,
      [userId]
    );

    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: SubmissionRow): Submission {
    let result: ExecutionResult | undefined = undefined;
    if (row.results || row.status === 'judged') {
      let parsedResults: any[] = [];
      try {
        parsedResults = row.results ? JSON.parse(row.results) : [];
      } catch {
        parsedResults = [];
      }
      result = {
        problemId: row.problem_slug,
        passed: row.passed,
        total: row.total,
        results: parsedResults,
      };
    }

    return {
      id: row.id,
      problemId: row.problem_slug,
      userId: row.user_id,
      code: row.code,
      status: row.status,
      result,
      createdAt: new Date(row.created_at),
    };
  }
}
