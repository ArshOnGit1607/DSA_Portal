import type { Submission, SubmissionRepository } from '@dsa-portal/core';

// TEMP FAKE (Day 4): replace with Person 2's PostgreSQL SubmissionRepository from /server/src/db once merged.
export class InMemorySubmissionRepository implements SubmissionRepository {
  private submissions = new Map<string, Submission>();

  async save(submission: Submission) {
    this.submissions.set(submission.id, submission);
  }

  async findById(id: string) {
    return this.submissions.get(id) ?? null;
  }

  async findByUser(userId: string) {
    return [...this.submissions.values()].filter((s) => s.userId === userId);
  }

  async findByIdempotencyKey(userId: string, key: string) {
    return (await this.findByUser(userId)).find((s) => s.idempotencyKey === key) ?? null;
  }
}
