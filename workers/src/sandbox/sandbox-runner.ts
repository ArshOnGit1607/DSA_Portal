import type { ExecutionResult, Problem } from '@dsa-portal/core';
import { submitCodeSandbox } from '@dsa-portal/core';

interface SubmissionJob {
  submissionId: string;
  problemId: string;
  userCode: string;
  problem?: Problem;
}

/**
 * Runs a submission inside the code-execution sandbox.
 * Used by the BullMQ worker to judge submissions asynchronously.
 * Returns an ExecutionResult compatible with the server's submission model.
 */
export async function runSubmissionSandbox(job: SubmissionJob): Promise<ExecutionResult> {
  const problem = job.problem;
  if (!problem) {
    return {
      problemId: job.problemId,
      status: 'error',
      perTest: [
        {
          id: 'setup',
          passed: false,
          expected: undefined,
          actual: undefined,
          runtimeMs: 0,
          error: `Problem ${job.problemId} not available for judging`,
        },
      ],
    };
  }

  return submitCodeSandbox(problem, job.userCode, {
    perTestTimeoutMs: 2000,
    totalTimeoutMs: 30000,
    memoryLimitMb: 64,
    outputCap: 50000,
  });
}
