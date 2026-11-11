import { filterProblems, PROBLEMS } from '@dsa-portal/core';
import type { Difficulty, Problem, ProblemRepository, Topic } from '@dsa-portal/core';

// TEMP FAKE (Day 4): replace with Person 2's PostgreSQL ProblemRepository from /server/src/db once merged.
export class InMemoryProblemRepository implements ProblemRepository {
  private problems = new Map<string, Problem>();

  constructor(seed: Problem[] = PROBLEMS) {
    seed.forEach((p) => this.problems.set(p.id, p));
  }

  async findById(id: string) {
    return this.problems.get(id) ?? null;
  }

  async findAll(filters?: { topic?: Topic; difficulty?: Difficulty }) {
    return filterProblems([...this.problems.values()], filters);
  }

  async save(problem: Problem) {
    this.problems.set(problem.id, problem);
  }
}
