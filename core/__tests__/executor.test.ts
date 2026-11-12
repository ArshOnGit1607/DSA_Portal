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
    expect(result.status).toBe('passed');
    expect(result.perTest.every((r) => r.passed)).toBe(true);
  });

  it('fails an incorrect submission', () => {
    const result = submitCode({ problem: twoSum, userCode: wrongCode });
    expect(result.status).toBe('failed');
    expect(result.perTest.some((r) => !r.passed)).toBe(true);
  });

  it('catches runtime errors gracefully', () => {
    const result = submitCode({ problem: twoSum, userCode: errorCode });
    expect(result.status).toBe('error');
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
    expect(result.perTest.every((r) => typeof r.error === 'string')).toBe(true);
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
    expect(result.status).toBe('failed');
    expect(result.perTest.length).toBe(2);
    expect(result.perTest[0].passed).toBe(true);
    expect(result.perTest[1].passed).toBe(false);
  });

  it('returns the new result shape with perTest', () => {
    const result = submitCode({ problem: twoSum, userCode: correctCode });
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('perTest');
    expect(Array.isArray(result.perTest)).toBe(true);
    expect(result.perTest[0]).toHaveProperty('id');
    expect(result.perTest[0]).toHaveProperty('passed');
    expect(result.perTest[0]).toHaveProperty('expected');
    expect(result.perTest[0]).toHaveProperty('actual');
    expect(result.perTest[0]).toHaveProperty('runtimeMs');
  });
});
