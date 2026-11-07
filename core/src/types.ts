export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type Topic =
  | 'Arrays'
  | 'Strings'
  | 'LinkedList'
  | 'Trees'
  | 'Graphs'
  | 'Dynamic Programming'
  | 'Sorting'
  | 'Searching';

export interface TestCase {
  input: unknown;
  expected: unknown;
}

export interface Hint {
  level: number;
  content: string;
}

export interface Solution {
  code: string;
  explanation?: string;
}

export interface Problem {
  id: string;
  title: string;
  topic: Topic;
  difficulty: Difficulty;
  description: string;
  starterCode: string;
  testCases: TestCase[];
  hints: Hint[];
  solution: Solution;
}

export interface ExecutionResult {
  problemId: string;
  passed: number;
  total: number;
  results: Array<{
    testCaseIndex: number;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
    error?: string;
  }>;
}

export interface Submission {
  id: string;
  problemId: string;
  userId: string;
  code: string;
  status: 'queued' | 'running' | 'judged' | 'failed';
  result?: ExecutionResult;
  createdAt: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
}

/**
 * Storage interfaces — Person 2 implements these for PostgreSQL and SQLite.
 * Do NOT implement here; core remains a pure library with no DB dependency.
 */
export interface ProblemRepository {
  findById(id: string): Promise<Problem | null>;
  findAll(filters?: { topic?: Topic; difficulty?: Difficulty }): Promise<Problem[]>;
  save(problem: Problem): Promise<void>;
}

export interface SubmissionRepository {
  save(submission: Submission): Promise<void>;
  findById(id: string): Promise<Submission | null>;
  findByUser(userId: string): Promise<Submission[]>;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface StatsRepository {
  getUserStats(userId: string): Promise<{
    attempted: number;
    solved: number;
    totalProblems: number;
    streak: number;
  }>;
  getTopicStats(userId: string): Promise<Array<{
    topic: Topic;
    attempted: number;
    solved: number;
  }>>;
}
