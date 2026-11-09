import type {
  Problem,
  ProblemRepository,
  Topic,
  Difficulty,
  TestCase,
  Hint,
  Solution,
} from '@dsa-portal/core';
import { pool, withTransaction } from '../pool';

interface ProblemRow {
  id: string;
  slug: string;
  title: string;
  topic: Topic;
  difficulty: Difficulty;
  description: string;
  starter_code: string;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
}

interface TestCaseRow {
  id: string;
  problem_id: string;
  sort_order: number;
  input: any;
  expected: any;
  is_sample: boolean;
}

interface HintRow {
  id: string;
  problem_id: string;
  level: number;
  content: string;
}

interface SolutionRow {
  id: string;
  problem_id: string;
  code: string;
  explanation?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PostgresProblemRepository implements ProblemRepository {
  async findById(idOrSlug: string): Promise<Problem | null> {
    const isUuid = UUID_REGEX.test(idOrSlug);
    const queryText = isUuid
      ? 'SELECT * FROM problems WHERE id = $1 LIMIT 1'
      : 'SELECT * FROM problems WHERE slug = $1 LIMIT 1';

    const probRes = await pool.query<ProblemRow>(queryText, [idOrSlug]);
    if (probRes.rows.length === 0) {
      return null;
    }

    const problemRow = probRes.rows[0];
    const problemId = problemRow.id;

    // Fetch related test_cases, hints, and solution in parallel
    const [tcRes, hintRes, solRes] = await Promise.all([
      pool.query<TestCaseRow>(
        'SELECT input, expected FROM test_cases WHERE problem_id = $1 ORDER BY sort_order ASC',
        [problemId]
      ),
      pool.query<HintRow>(
        'SELECT level, content FROM hints WHERE problem_id = $1 ORDER BY level ASC',
        [problemId]
      ),
      pool.query<SolutionRow>(
        'SELECT code, explanation FROM solutions WHERE problem_id = $1 LIMIT 1',
        [problemId]
      ),
    ]);

    const testCases: TestCase[] = tcRes.rows.map((r) => ({
      input: r.input,
      expected: r.expected,
    }));

    const hints: Hint[] = hintRes.rows.map((r) => ({
      level: r.level,
      content: r.content,
    }));

    const solution: Solution = solRes.rows[0]
      ? {
          code: solRes.rows[0].code,
          explanation: solRes.rows[0].explanation || undefined,
        }
      : { code: '' };

    return {
      id: problemRow.slug, // Keep slug as canonical id for core engine compatibility
      title: problemRow.title,
      topic: problemRow.topic,
      difficulty: problemRow.difficulty,
      description: problemRow.description,
      starterCode: problemRow.starter_code,
      testCases,
      hints,
      solution,
    };
  }

  async findAll(filters?: { topic?: Topic; difficulty?: Difficulty }): Promise<Problem[]> {
    const conditions: string[] = ['is_published = true'];
    const values: any[] = [];

    if (filters?.topic) {
      values.push(filters.topic);
      conditions.push(`topic = $${values.length}`);
    }

    if (filters?.difficulty) {
      values.push(filters.difficulty);
      conditions.push(`difficulty = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const probRes = await pool.query<ProblemRow>(
      `SELECT * FROM problems ${whereClause} ORDER BY created_at ASC`,
      values
    );

    if (probRes.rows.length === 0) {
      return [];
    }

    // Fetch full details for all matching problems
    return Promise.all(probRes.rows.map((row) => this.findById(row.id))) as Promise<Problem[]>;
  }

  async save(problem: Problem): Promise<void> {
    await withTransaction(async (client) => {
      // 1. Upsert problem by slug
      const probUpsert = `
        INSERT INTO problems (slug, title, topic, difficulty, description, starter_code)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          topic = EXCLUDED.topic,
          difficulty = EXCLUDED.difficulty,
          description = EXCLUDED.description,
          starter_code = EXCLUDED.starter_code,
          updated_at = now()
        RETURNING id;
      `;
      const res = await client.query<{ id: string }>(probUpsert, [
        problem.id,
        problem.title,
        problem.topic,
        problem.difficulty,
        problem.description,
        problem.starterCode,
      ]);
      const dbProblemId = res.rows[0].id;

      // 2. Refresh test cases
      await client.query('DELETE FROM test_cases WHERE problem_id = $1', [dbProblemId]);
      for (let i = 0; i < problem.testCases.length; i++) {
        const tc = problem.testCases[i];
        await client.query(
          `INSERT INTO test_cases (problem_id, sort_order, input, expected, is_sample)
           VALUES ($1, $2, $3, $4, $5)`,
          [dbProblemId, i, JSON.stringify(tc.input), JSON.stringify(tc.expected), i === 0]
        );
      }

      // 3. Refresh hints
      await client.query('DELETE FROM hints WHERE problem_id = $1', [dbProblemId]);
      for (const hint of problem.hints) {
        await client.query(
          `INSERT INTO hints (problem_id, level, content)
           VALUES ($1, $2, $3)`,
          [dbProblemId, hint.level, hint.content]
        );
      }

      // 4. Refresh solution
      await client.query('DELETE FROM solutions WHERE problem_id = $1', [dbProblemId]);
      if (problem.solution?.code) {
        await client.query(
          `INSERT INTO solutions (problem_id, code, explanation)
           VALUES ($1, $2, $3)`,
          [dbProblemId, problem.solution.code, problem.solution.explanation || null]
        );
      }
    });
  }
}
