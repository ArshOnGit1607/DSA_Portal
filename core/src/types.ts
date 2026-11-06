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

export interface Problem {
  id: string;
  title: string;
  topic: Topic;
  difficulty: Difficulty;
  description: string;
  starterCode: string;
  testCases: TestCase[];
  hints: string[];
  solution: string;
}

export interface SubmissionResult {
  problemId: string;
  passed: number;
  total: number;
  results: Array<{
    testCaseIndex: number;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
}
