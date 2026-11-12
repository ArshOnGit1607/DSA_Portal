import { submitCodeSandboxAsync } from '@dsa-portal/core';
import type { ProblemRepository, Submission, SubmissionRepository } from '@dsa-portal/core';

/** Hook for Person 3's stats service (streaks, caches). */
export interface StatsService {
  onSubmissionJudged(submission: Submission): Promise<void>;
}

// TEMP STUB (Day 5): replace with Person 3's stats service once merged.
// user_problem_stats is already updated by PostgresSubmissionRepository.save().
export const statsServiceStub: StatsService = {
  async onSubmissionJudged() {},
};

export interface JudgeDeps {
  problems: ProblemRepository;
  submissions: SubmissionRepository;
  stats: StatsService;
}

/**
 * Judges one submission and saves the result. Safe to call twice for the same id:
 * an already finished submission is returned unchanged (no double stats update).
 */
export async function judgeSubmission(id: string, deps: JudgeDeps): Promise<Submission> {
  const submission = await deps.submissions.findById(id);
  if (!submission) throw new Error(`Submission ${id} not found`);
  if (submission.status === 'judged' || submission.status === 'failed') return submission;

  const problem = await deps.problems.findById(submission.problemId);
  if (problem) {
    submission.result = await submitCodeSandboxAsync(problem, submission.code);
    submission.status = 'judged';
  } else {
    submission.status = 'failed';
  }
  submission.judgedAt = new Date();
  await deps.submissions.save(submission);
  if (submission.status === 'judged') await deps.stats.onSubmissionJudged(submission);
  return submission;
}
