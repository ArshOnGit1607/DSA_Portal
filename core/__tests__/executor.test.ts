import { describe, expect, it } from 'vitest';
import { submitCode } from '../src/executor';
import { getProblem } from '../src/problems';

describe('executor', () => {
  it('passes a correct two-sum submission', () => {
    const problem = getProblem('two-sum')!;
    const userCode = 'function solve(input) { const { nums, target } = input; const map = new Map(); for (let i = 0; i < nums.length; i++) { const complement = target - nums[i]; if (map.has(complement)) return [map.get(complement), i]; map.set(nums[i], i); } return []; }';
    const result = submitCode({ problem, userCode });
    expect(result.passed).toBe(result.total);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('fails an incorrect submission', () => {
    const problem = getProblem('two-sum')!;
    const userCode = 'function solve(input) { return [0, 0]; }';
    const result = submitCode({ problem, userCode });
    expect(result.passed).toBeLessThan(result.total);
    expect(result.results.some((r) => !r.passed)).toBe(true);
  });

  it('catches runtime errors gracefully', () => {
    const problem = getProblem('two-sum')!;
    const userCode = 'function solve(input) { throw new Error("boom"); }';
    const result = submitCode({ problem, userCode });
    expect(result.passed).toBe(0);
    expect(result.results.every((r) => !r.passed && typeof r.actual === 'string')).toBe(true);
  });
});
