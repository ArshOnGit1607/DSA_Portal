import { Queue, Worker } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };

export const submissionQueue = new Queue('submissions', { connection });

export const submissionWorker = new Worker(
  'submissions',
  async (job) => {
    // TODO: integrate with /core executor once storage (Person 2) is wired.
    console.log('Processing submission job', job.id, job.data);
    return { status: 'processed' };
  },
  { connection }
);

submissionWorker.on('completed', (job) => {
  console.log('Job completed', job.id);
});

submissionWorker.on('failed', (job, err) => {
  console.error('Job failed', job?.id, err);
});
