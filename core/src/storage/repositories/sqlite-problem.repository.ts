import type {
  Problem,
  ProblemRepository,
  Topic,
  Difficulty,
  TestCase,
  Hint,
  Solution,
} from '../../types';
import type { DatabaseAdapter } from '../adapter';

interface ProblemRow {
  id: string;
  slug: string;
  title: string;
  topic: string;
  difficulty: string;
  description: string;
  starter_code: string;
  is_published: number;
}

interface TestCaseRow {
  sort_order: number;
  input: string;
  expected: string;
}

interface HintRow {
  level: number;
  content: string;
}

interface SolutionRow {
  code: string;
  explanation: string | null;
}

export class SqliteProblemRepository implements ProblemRepository {
  constructor(private adapter: DatabaseAdapter) {}

  async findById(idOrSlug: string): Promise<Problem | null> {
    const row = await this.adapter.queryOne<ProblemRow>(
      'SELECT * FROM problems WHERE slug = ? OR id = ? LIMIT 1',
      [idOrSlug, idOrSlug]
    );

    if (!row) return null;

    const [tcRows, hintRows, solRow] = await Promise.all([
      this.adapter.query<TestCaseRow>(
        'SELECT input, expected FROM test_cases WHERE problem_id = ? ORDER BY sort_order ASC',
        [row.id]
      ),
      this.adapter.query<HintRow>(
        'SELECT level, content FROM hints WHERE problem_id = ? ORDER BY level ASC',
        [row.id]
      ),
      this.adapter.queryOne<SolutionRow>(
        'SELECT code, explanation FROM solutions WHERE problem_id = ? LIMIT 1',
        [row.id]
      ),
    ]);

    const testCases: TestCase[] = tcRows.map((tc) => ({
      input: typeof tc.input === 'string' ? JSON.parse(tc.input) : tc.input,
      expected: typeof tc.expected === 'string' ? JSON.parse(tc.expected) : tc.expected,
    }));

    const hints: Hint[] = hintRows.map((h) => ({
      level: h.level,
      content: h.content,
    }));

    const solution: Solution = solRow
      ? { code: solRow.code, explanation: solRow.explanation || undefined }
      : { code: '' };

    return {
      id: row.slug,
      title: row.title,
      topic: row.topic as Topic,
      difficulty: row.difficulty as Difficulty,
      description: row.description,
      starterCode: row.starter_code,
      testCases,
      hints,
      solution,
    };
  }

  async findAll(filters?: { topic?: Topic; difficulty?: Difficulty }): Promise<Problem[]> {
    const conditions: string[] = ['is_published = 1'];
    const params: unknown[] = [];

    if (filters?.topic) {
      conditions.push('topic = ?');
      params.push(filters.topic);
    }
    if (filters?.difficulty) {
      conditions.push('difficulty = ?');
      params.push(filters.difficulty);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.adapter.query<ProblemRow>(
      `SELECT * FROM problems ${whereClause} ORDER BY created_at ASC`,
      params
    );

    return Promise.all(rows.map((r) => this.findById(r.slug))) as Promise<Problem[]>;
  }

  /** Soft delete (CR-015), same semantics as the PostgreSQL repository. */
  async delete(idOrSlug: string): Promise<boolean> {
    const row = await this.adapter.queryOne<{ id: string }>(
      'SELECT id FROM problems WHERE (slug = ? OR id = ?) AND is_published = 1 LIMIT 1',
      [idOrSlug, idOrSlug]
    );
    if (!row) return false;
    await this.adapter.execute('UPDATE problems SET is_published = 0 WHERE id = ?', [row.id]);
    return true;
  }

  async save(problem: Problem): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      // 1. Check if problem already exists
      const existing = await tx.queryOne<{ id: string }>(
        'SELECT id FROM problems WHERE slug = ? OR id = ? LIMIT 1',
        [problem.id, problem.id]
      );

      const problemId = existing ? existing.id : problem.id;

      if (existing) {
        await tx.execute(
          `UPDATE problems SET
            title = ?, topic = ?, difficulty = ?, description = ?, starter_code = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [
            problem.title,
            problem.topic,
            problem.difficulty,
            problem.description,
            problem.starterCode,
            problemId,
          ]
        );
      } else {
        await tx.execute(
          `INSERT INTO problems (id, slug, title, topic, difficulty, description, starter_code)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            problemId,
            problem.id,
            problem.title,
            problem.topic,
            problem.difficulty,
            problem.description,
            problem.starterCode,
          ]
        );
      }

      // 2. Refresh test cases
      await tx.execute('DELETE FROM test_cases WHERE problem_id = ?', [problemId]);
      for (let i = 0; i < problem.testCases.length; i++) {
        const tc = problem.testCases[i];
        await tx.execute(
          `INSERT INTO test_cases (id, problem_id, sort_order, input, expected, is_sample)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            `${problemId}-tc-${i}`,
            problemId,
            i,
            JSON.stringify(tc.input),
            JSON.stringify(tc.expected),
            i === 0 ? 1 : 0,
          ]
        );
      }

      // 3. Refresh hints
      await tx.execute('DELETE FROM hints WHERE problem_id = ?', [problemId]);
      for (const hint of problem.hints) {
        await tx.execute(
          `INSERT INTO hints (id, problem_id, level, content)
           VALUES (?, ?, ?, ?)`,
          [`${problemId}-hint-${hint.level}`, problemId, hint.level, hint.content]
        );
      }

      // 4. Refresh solution
      await tx.execute('DELETE FROM solutions WHERE problem_id = ?', [problemId]);
      if (problem.solution?.code) {
        await tx.execute(
          `INSERT INTO solutions (id, problem_id, code, explanation)
           VALUES (?, ?, ?, ?)`,
          [
            `${problemId}-sol`,
            problemId,
            problem.solution.code,
            problem.solution.explanation || null,
          ]
        );
      }
    });
  }
}
