import type { Problem, Topic, Difficulty } from './types';
import { filterProblems } from './problem-loader';

/**
 * Selects a random problem matching topic/difficulty filters.
 * Prefers problems the user has not seen recently (excludes recentIds),
 * falling back to the full eligible pool if everything was recently seen.
 */
export function selectRandomProblem(
  problems: Problem[],
  options: {
    topic?: Topic;
    difficulty?: Difficulty;
    recentIds?: string[];
  }
): Problem | null {
  const eligible = filterProblems(problems, {
    topic: options.topic,
    difficulty: options.difficulty,
  });

  if (eligible.length === 0) return null;

  const recent = new Set(options.recentIds || []);
  const unseen = eligible.filter((p) => !recent.has(p.id));
  const pool = unseen.length > 0 ? unseen : eligible;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
