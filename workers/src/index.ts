import { Queue, Worker } from 'bullmq';
import type { ExecutionResult } from '@dsa-portal/core';
import { runSubmissionSandbox } from './sandbox/sandbox-runner';

const connection = { host: 'localhost', port: 6379 };

export const submissionQueue = new Queue('submissions', { connection });

interface SubmissionJobData {
  submissionId: string;
  problemId: string;
  userCode: string;
  problem?: any;
}

export const submissionWorker = new Worker<SubmissionJobData, ExecutionResult>(
  'submissions',
  async (job) => {
    const data = job.data;
    return runSubmissionSandbox({
      submissionId: data.submissionId,
      problemId: data.problemId,
      userCode: data.userCode,
      problem: data.problem,
    });
  },
  { connection }
);

submissionWorker.on('completed', (job) => {
  console.log('Job completed', job.id);
});

submissionWorker.on('failed', (job, err) => {
  console.error('Job failed', job?.id, err);
});
