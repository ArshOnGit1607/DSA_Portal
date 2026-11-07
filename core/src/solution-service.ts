import type { Problem, Solution } from './types';

/**
 * Solution service. Returns the reference solution for a problem.
 * The frontends decide when to unlock it (e.g. after the user solves).
 */
export class SolutionService {
  getSolution(problem: Problem): Solution {
    return problem.solution;
  }
}
