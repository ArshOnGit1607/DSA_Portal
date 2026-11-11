import { validateProblem } from '@dsa-portal/core';
import { SEED_PROBLEMS } from '../src/db/seeds/problems-data';

describe('Seed Problems Validation', () => {
  it('contains at least 40 problems', () => {
    expect(SEED_PROBLEMS.length).toBeGreaterThanOrEqual(40);
  });

  it('covers all 8 topics', () => {
    const topics = new Set(SEED_PROBLEMS.map((p) => p.topic));
    expect(topics.size).toBe(8);
    expect(topics).toContain('Arrays');
    expect(topics).toContain('Strings');
    expect(topics).toContain('LinkedList');
    expect(topics).toContain('Trees');
    expect(topics).toContain('Graphs');
    expect(topics).toContain('Dynamic Programming');
    expect(topics).toContain('Sorting');
    expect(topics).toContain('Searching');
  });

  it('covers all 3 difficulties (Easy, Medium, Hard)', () => {
    const difficulties = new Set(SEED_PROBLEMS.map((p) => p.difficulty));
    expect(difficulties).toContain('Easy');
    expect(difficulties).toContain('Medium');
    expect(difficulties).toContain('Hard');
  });

  it('every problem has at least 5 test cases and 3 progressive hints', () => {
    for (const problem of SEED_PROBLEMS) {
      expect(problem.testCases.length).toBeGreaterThanOrEqual(5);
      expect(problem.hints.length).toBeGreaterThanOrEqual(3);
      expect(problem.hints[0].level).toBe(1);
      expect(problem.hints[1].level).toBe(2);
      expect(problem.hints[2].level).toBe(3);
    }
  });

  it('every problem includes time and space complexity in explanation', () => {
    for (const problem of SEED_PROBLEMS) {
      expect(problem.solution.explanation).toBeDefined();
      expect(problem.solution.explanation).toMatch(/Time Complexity/i);
      expect(problem.solution.explanation).toMatch(/Space Complexity/i);
    }
  });

  it('every problem passes Zod validation from @dsa-portal/core', () => {
    for (const problem of SEED_PROBLEMS) {
      expect(() => validateProblem(problem)).not.toThrow();
    }
  });
});
