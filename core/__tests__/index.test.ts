import { describe, expect, it } from '@jest/globals';
import * as core from '../src/index';

describe('index barrel', () => {
  it('exports the core API surface', () => {
    expect(core).toHaveProperty('submitCode');
    expect(core).toHaveProperty('loadProblems');
    expect(core).toHaveProperty('selectRandomProblem');
    expect(core).toHaveProperty('HintService');
    expect(core).toHaveProperty('SolutionService');
    expect(core).toHaveProperty('getProblem');
    expect(core).toHaveProperty('getRandomProblem');
    expect(core).toHaveProperty('listProblems');
    expect(core).toHaveProperty('validateProblem');
    expect(core).toHaveProperty('ProblemSchema');
  });
});
