import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { SolutionService } from '../src/solution-service';
import { loadProblems } from '../src/problem-loader';

const PROBLEMS_DIR = path.join(__dirname, '..', 'problems');

describe('solution-service', () => {
  const service = new SolutionService();
  const problems = loadProblems(PROBLEMS_DIR);
  const p = problems.find((x) => x.id === 'two-sum')!;

  it('returns the reference solution', () => {
    const sol = service.getSolution(p);
    expect(sol.code).toBeDefined();
    expect(sol.code.length).toBeGreaterThan(0);
  });
});
