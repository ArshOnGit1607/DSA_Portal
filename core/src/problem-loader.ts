import * as fs from 'fs';
import * as path from 'path';
import type { Problem, Topic, Difficulty } from './types';
import { ProblemSchema } from './problem.schema';

/**
 * Loads and validates every *.json problem file in `dir`.
 * Throws on the first invalid file so bad data never reaches the engine.
 */
export function loadProblems(dir: string): Problem[] {
  const problems: Problem[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const filePath = path.join(dir, entry.name);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = ProblemSchema.parse(parsed) as Problem;
    problems.push(validated);
  }

  return problems;
}

export function loadProblemById(dir: string, id: string): Problem | null {
  return loadProblems(dir).find((p) => p.id === id) ?? null;
}

export function filterProblems(
  problems: Problem[],
  filters?: { topic?: Topic; difficulty?: Difficulty }
): Problem[] {
  return problems.filter((p) => {
    if (filters?.topic && p.topic !== filters.topic) return false;
    if (filters?.difficulty && p.difficulty !== filters.difficulty) return false;
    return true;
  });
}
