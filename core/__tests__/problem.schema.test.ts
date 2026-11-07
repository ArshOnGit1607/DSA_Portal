import { describe, expect, it } from '@jest/globals';
import { validateProblem, ProblemSchema } from '../src/problem.schema';
import type { Problem, Difficulty } from '../src/types';

describe('problem.schema', () => {
  const validProblem: Problem = {
    id: 'test-1',
    title: 'Test Problem',
    topic: 'Arrays',
    difficulty: 'Easy',
    description: 'A test problem.',
    starterCode: 'function solve(input) { return input; }',
    testCases: [{ input: 1, expected: 1 }],
    hints: [{ level: 1, content: 'Hint one' }],
    solution: { code: 'function solve(input) { return input; }' },
  };

  it('validates a well-formed problem', () => {
    const result = validateProblem(validProblem);
    expect(result.id).toBe('test-1');
  });

  it('rejects a problem missing required fields', () => {
    expect(() => validateProblem({})).toThrow();
  });

  it('rejects an invalid difficulty', () => {
    const bad = { ...validProblem, difficulty: 'SuperEasy' as unknown as Difficulty };
    expect(() => validateProblem(bad)).toThrow();
  });

  it('ProblemSchema parses and infers types', () => {
    const parsed = ProblemSchema.parse(validProblem);
    expect(parsed.title).toBe('Test Problem');
  });
});
