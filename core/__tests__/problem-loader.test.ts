import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { loadProblems, loadProblemById, filterProblems } from '../src/problem-loader';

const PROBLEMS_DIR = path.join(__dirname, '..', 'problems');

describe('problem-loader', () => {
  it('loads all validated problem JSON files', () => {
    const problems = loadProblems(PROBLEMS_DIR);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.id === 'two-sum')).toBe(true);
    expect(problems.some((p) => p.id === 'palindrome-number')).toBe(true);
    expect(problems.some((p) => p.id === 'merge-two-sorted-lists')).toBe(true);
  });

  it('each loaded problem has required fields', () => {
    const problems = loadProblems(PROBLEMS_DIR);
    for (const p of problems) {
      expect(p.id).toBeDefined();
      expect(p.title).toBeDefined();
      expect(p.topic).toBeDefined();
      expect(p.difficulty).toBeDefined();
      expect(Array.isArray(p.testCases)).toBe(true);
      expect(p.testCases.length).toBeGreaterThan(0);
      expect(Array.isArray(p.hints)).toBe(true);
      expect(p.hints.length).toBeGreaterThan(0);
      expect(p.solution.code).toBeDefined();
    }
  });

  it('loadProblemById returns the correct problem', () => {
    const p = loadProblemById(PROBLEMS_DIR, 'two-sum');
    expect(p).not.toBeNull();
    expect(p?.title).toBe('Two Sum');
    expect(loadProblemById(PROBLEMS_DIR, 'does-not-exist')).toBeNull();
  });

  it('filterProblems filters by topic and difficulty', () => {
    const problems = loadProblems(PROBLEMS_DIR);
    const arrays = filterProblems(problems, { topic: 'Arrays' });
    expect(arrays.every((p) => p.topic === 'Arrays')).toBe(true);
    const easy = filterProblems(problems, { difficulty: 'Easy' });
    expect(easy.every((p) => p.difficulty === 'Easy')).toBe(true);
    const filtered = filterProblems(problems, { topic: 'Graphs', difficulty: 'Hard' });
    expect(filtered.length).toBe(0);
  });
});
