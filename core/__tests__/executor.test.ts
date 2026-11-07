import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { submitCode } from '../src/executor';
import { loadProblems } from '../src/problem-loader';

const PROBLEMS_DIR = path.join(__dirname, '..', 'problems');

describe('executor', () => {
  const problems = loadProblems(PROBLEMS_DIR);
  const twoSum = problems.find((p) => p.id === 'two-sum')!;

  const correctCode = `
function solve(input) {
  const { nums, target } = input;
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement), i];
    map.set(nums[i], i);
  }
  return [];
}
`;

  const wrongCode = `function solve(input) { return [0, 0]; }`;

  const errorCode = `function solve(input) { throw new Error("boom"); }`;

  const objectCode = `function solve(input) { return input; }`;

  it('passes a correct submission', () => {
    const result = submitCode({ problem: twoSum, userCode: correctCode });
    expect(result.problemId).toBe('two-sum');
    expect(result.passed).toBe(result.total);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('fails an incorrect submission', () => {
    const result = submitCode({ problem: twoSum, userCode: wrongCode });
    expect(result.passed).toBeLessThan(result.total);
    expect(result.results.some((r) => !r.passed)).toBe(true);
  });

  it('catches runtime errors gracefully', () => {
    const result = submitCode({ problem: twoSum, userCode: errorCode });
    expect(result.passed).toBe(0);
    expect(result.results.every((r) => !r.passed && typeof r.actual === 'string')).toBe(true);
  });

  it('compares object results by deep equality', () => {
    const objProblem = {
      ...twoSum,
      id: 'obj-test',
      testCases: [
        { input: { a: 1, b: 2 }, expected: { a: 1, b: 2 } },
        { input: { a: 1, b: 2 }, expected: { a: 1, b: 3 } },
      ],
    };
    const result = submitCode({ problem: objProblem, userCode: objectCode });
    expect(result.passed).toBe(1);
    expect(result.total).toBe(2);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
  });
});
