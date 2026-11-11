import type {
  Submission,
  SubmissionRepository,
  ExecutionResult,
} from '@dsa-portal/core';
import { pool, withTransaction } from '../pool';

interface SubmissionRow {
  id: string;
  user_id: string;
  problem_slug: string;
  code: string;
  status: 'queued' | 'running' | 'judged' | 'failed';
  passed: number;
  total: number;
  results: any;
  created_at: Date;
  judged_at?: Date;
}

export class PostgresSubmissionRepository implements SubmissionRepository {
  async save(submission: Submission): Promise<void> {
    await withTransaction(async (client) => {
      // Resolve problem UUID from slug or id
      const probRes = await client.query<{ id: string }>(
        `SELECT id FROM problems WHERE slug = $1 OR id::text = $1 LIMIT 1`,
        [submission.problemId]
      );

      if (probRes.rows.length === 0) {
        throw new Error(`Problem not found: ${submission.problemId}`);
      }
      const problemUuid = probRes.rows[0].id;

      const passed = submission.result?.passed ?? 0;
      const total = submission.result?.total ?? 0;
      const resultsJson = submission.result?.results
        ? JSON.stringify(submission.result.results)
        : null;

      const insertOrUpdateSql = `
        INSERT INTO submissions (id, user_id, problem_id, code, status, passed, total, results, created_at, judged_at)
        VALUES (
          COALESCE($1::uuid, gen_random_uuid()),
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          CASE WHEN $5 IN ('judged', 'failed') THEN now() ELSE NULL END
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          passed = EXCLUDED.passed,
          total = EXCLUDED.total,
          results = EXCLUDED.results,
          judged_at = EXCLUDED.judged_at;
      `;

      await client.query(insertOrUpdateSql, [
        submission.id || null,
        submission.userId,
        problemUuid,
        submission.code,
        submission.status,
        passed,
        total,
        resultsJson,
        submission.createdAt || new Date(),
      ]);

      // If submission is judged, update user_problem_stats
      if (submission.status === 'judged') {
        const isSolved = passed === total && total > 0;
        const statsUpsertSql = `
          INSERT INTO user_problem_stats (user_id, problem_id, attempts, solved, first_solved_at, last_attempted_at)
          VALUES (
            $1::uuid,
            $2::uuid,
            1,
            $3,
            CASE WHEN $3 THEN now() ELSE NULL END,
            now()
          )
          ON CONFLICT (user_id, problem_id) DO UPDATE SET
            attempts = user_problem_stats.attempts + 1,
            solved = user_problem_stats.solved OR EXCLUDED.solved,
            first_solved_at = COALESCE(user_problem_stats.first_solved_at, EXCLUDED.first_solved_at),
            last_attempted_at = now();
        `;
        await client.query(statsUpsertSql, [submission.userId, problemUuid, isSolved]);
      }
    });
  }

  async findById(id: string): Promise<Submission | null> {
    const sql = `
      SELECT s.*, p.slug AS problem_slug
      FROM submissions s
      JOIN problems p ON s.problem_id = p.id
      WHERE s.id = $1::uuid
      LIMIT 1;
    `;
    const res = await pool.query<SubmissionRow>(sql, [id]);
    if (res.rows.length === 0) return null;

    return this.mapRowToSubmission(res.rows[0]);
  }

  async findByUser(userId: string): Promise<Submission[]> {
    const sql = `
      SELECT s.*, p.slug AS problem_slug
      FROM submissions s
      JOIN problems p ON s.problem_id = p.id
      WHERE s.user_id = $1::uuid
      ORDER BY s.created_at DESC;
    `;
    const res = await pool.query<SubmissionRow>(sql, [userId]);
    return res.rows.map((row) => this.mapRowToSubmission(row));
  }

  private mapRowToSubmission(row: SubmissionRow): Submission {
    let result: ExecutionResult | undefined = undefined;
    if (row.results || row.status === 'judged') {
      result = {
        problemId: row.problem_slug,
        passed: row.passed,
        total: row.total,
        results: Array.isArray(row.results) ? row.results : [],
      };
    }

    return {
      id: row.id,
      problemId: row.problem_slug,
      userId: row.user_id,
      code: row.code,
      status: row.status,
      result,
      createdAt: row.created_at,
    };
  }
}
