import { describe, expect, it } from 'vitest';
import { getProblem, getRandomProblem, listProblems, PROBLEMS } from '../src/problems';

describe('problem registry', () => {
  it('exposes three sample problems', () => {
    expect(PROBLEMS).toHaveLength(3);
    expect(listProblems().map((p) => p.id)).toEqual(['two-sum', 'palindrome-number', 'merge-two-sorted-lists']);
  });

  it('getProblem returns the correct problem by id', () => {
    const p = getProblem('two-sum');
    expect(p?.title).toBe('Two Sum');
    expect(p?.difficulty).toBe('Easy');
    expect(getProblem('does-not-exist')).toBeUndefined();
  });

  it('getRandomProblem returns a registered problem', () => {
    const p = getRandomProblem();
    expect(PROBLEMS.some((r) => r.id === p.id)).toBe(true);
  });
});
