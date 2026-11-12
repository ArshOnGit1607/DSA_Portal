import type { ProblemRepository, StatsRepository, SubmissionRepository, Topic } from '@dsa-portal/core';

/**
 * Derives stats from the submission and problem repositories, for tests and running without a
 * database. PostgresStatsRepository (Person 2) reads the pre-aggregated user_problem_stats instead.
 */
export class InMemoryStatsRepository implements StatsRepository {
  constructor(
    private problems: ProblemRepository,
    private submissions: SubmissionRepository
  ) {}

  /** problemId → solved?, for every problem the user has a judged submission on. */
  private async perProblem(userId: string) {
    const map = new Map<string, boolean>();
    for (const s of await this.submissions.findByUser(userId)) {
      if (s.status !== 'judged') continue;
      map.set(s.problemId, map.get(s.problemId) === true || s.result?.status === 'passed');
    }
    return map;
  }

  // shortcut: streak is always 0 here; real streaks come from PostgresStatsRepository.
  async getUserStats(userId: string) {
    const per = await this.perProblem(userId);
    return {
      attempted: per.size,
      solved: [...per.values()].filter(Boolean).length,
      totalProblems: (await this.problems.findAll()).length,
      streak: 0,
    };
  }

  async getTopicStats(userId: string) {
    const per = await this.perProblem(userId);
    const topicOf = new Map((await this.problems.findAll()).map((p) => [p.id, p.topic]));
    const byTopic = new Map<Topic, { topic: Topic; attempted: number; solved: number }>();
    for (const [problemId, solved] of per) {
      const topic = topicOf.get(problemId);
      if (!topic) continue;
      const row = byTopic.get(topic) ?? { topic, attempted: 0, solved: 0 };
      row.attempted++;
      if (solved) row.solved++;
      byTopic.set(topic, row);
    }
    return [...byTopic.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  }
}
