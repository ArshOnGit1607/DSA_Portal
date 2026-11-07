import type { Problem, Hint } from './types';

/**
 * Progressive hint service. Hints are consumed level 1..n.
 * Returns null when a level does not exist.
 */
export class HintService {
  getHint(problem: Problem, level: number): Hint | null {
    return problem.hints.find((h) => h.level === level) ?? null;
  }

  getHintsUpTo(problem: Problem, maxLevel: number): Hint[] {
    return problem.hints.filter((h) => h.level >= 1 && h.level <= maxLevel);
  }

  getNextHintLevel(problem: Problem, currentLevel: number): number | null {
    const next = problem.hints.find((h) => h.level === currentLevel + 1);
    return next ? currentLevel + 1 : null;
  }

  hasMoreHints(problem: Problem, currentLevel: number): boolean {
    return problem.hints.some((h) => h.level > currentLevel);
  }
}
