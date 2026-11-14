import { PostgresProblemRepository } from '../src/db/repositories/problem.repository';
import { PostgresSubmissionRepository } from '../src/db/repositories/submission.repository';
import { PostgresUserRepository } from '../src/db/repositories/user.repository';
import { PostgresStatsRepository } from '../src/db/repositories/stats.repository';
import { pool, withTransaction } from '../src/db/pool';

jest.mock('../src/db/pool', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  };
  return {
    pool: mPool,
    query: jest.fn((text, params) => mPool.query(text, params)),
    getClient: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
    withTransaction: jest.fn(async (cb) => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 'mock-uuid-1' }] }),
      };
      return await cb(client);
    }),
    checkDbHealth: jest.fn().mockResolvedValue({ ok: true, latencyMs: 5 }),
    closePool: jest.fn(),
  };
});

describe('PostgresProblemRepository', () => {
  let repo: PostgresProblemRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PostgresProblemRepository();
  });

  it('findById returns full problem when found by slug', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-123',
            slug: 'two-sum',
            title: 'Two Sum',
            topic: 'Arrays',
            difficulty: 'Easy',
            description: 'Find two numbers',
            starter_code: 'function solve() {}',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ input: [2, 7], expected: [0, 1] }],
      })
      .mockResolvedValueOnce({
        rows: [{ level: 1, content: 'Use hash map' }],
      })
      .mockResolvedValueOnce({
        rows: [{ code: 'sol code', explanation: 'sol expl' }],
      });

    const result = await repo.findById('two-sum');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('two-sum');
    expect(result?.title).toBe('Two Sum');
    expect(result?.testCases).toHaveLength(1);
    expect(result?.hints).toHaveLength(1);
    expect(result?.solution.code).toBe('sol code');
  });

  it('findById returns null when problem not found', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    const result = await repo.findById('unknown-problem');
    expect(result).toBeNull();
  });

  it('save calls withTransaction to upsert problem and children', async () => {
    const mockProblem = {
      id: 'two-sum',
      title: 'Two Sum',
      topic: 'Arrays' as const,
      difficulty: 'Easy' as const,
      description: 'Desc',
      starterCode: 'code',
      testCases: [{ input: 1, expected: 2 }],
      hints: [{ level: 1, content: 'hint' }],
      solution: { code: 'sol' },
    };

    await repo.save(mockProblem);
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('PostgresSubmissionRepository', () => {
  let repo: PostgresSubmissionRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PostgresSubmissionRepository();
  });

  it('findById maps row correctly into Submission', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'sub-uuid',
          user_id: 'user-uuid',
          problem_slug: 'two-sum',
          code: 'function solve() {}',
          status: 'judged',
          passed: 2,
          total: 2,
          results: [{ testCaseIndex: 0, passed: true }],
          created_at: new Date('2026-01-01'),
        },
      ],
    });

    const sub = await repo.findById('sub-uuid');
    expect(sub).not.toBeNull();
    expect(sub?.id).toBe('sub-uuid');
    expect(sub?.problemId).toBe('two-sum');
    expect(sub?.status).toBe('judged');
    // results round-trip into core's ExecutionResult (perTest), testCaseIndex is storage-only
    expect(sub?.result?.perTest).toEqual([{ passed: true }]);
    expect(sub?.result?.status).toBe('passed');
  });

  it('findByUser returns list of user submissions', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'sub-1',
          user_id: 'user-uuid',
          problem_slug: 'two-sum',
          code: 'code',
          status: 'queued',
          passed: 0,
          total: 0,
          results: null,
          created_at: new Date(),
        },
      ],
    });

    const list = await repo.findByUser('user-uuid');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('sub-1');
  });
});

describe('PostgresUserRepository', () => {
  let repo: PostgresUserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PostgresUserRepository();
  });

  it('findById returns user when found', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          username: 'student',
          email: 'student@example.com',
          role: 'user',
        },
      ],
    });

    const user = await repo.findById('user-1');
    expect(user).not.toBeNull();
    expect(user?.username).toBe('student');
    expect(user?.role).toBe('user');
  });

  it('findByUsername returns null when not found', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    const user = await repo.findByUsername('nonexistent');
    expect(user).toBeNull();
  });
});

describe('PostgresStatsRepository', () => {
  let repo: PostgresStatsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PostgresStatsRepository();
  });

  it('getUserStats computes attempted, solved, and streak correctly', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ attempted: 5, solved: 3 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 10 }],
      })
      .mockResolvedValueOnce({
        rows: [{ solve_date: today }],
      });

    const stats = await repo.getUserStats('user-123');
    expect(stats.attempted).toBe(5);
    expect(stats.solved).toBe(3);
    expect(stats.totalProblems).toBe(10);
    expect(stats.streak).toBe(1);
  });

  it('getTopicStats aggregates per topic', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { topic: 'Arrays', attempted: 4, solved: 3 },
        { topic: 'Strings', attempted: 2, solved: 1 },
      ],
    });

    const topics = await repo.getTopicStats('user-123');
    expect(topics).toHaveLength(2);
    expect(topics[0].topic).toBe('Arrays');
    expect(topics[0].solved).toBe(3);
  });
});
