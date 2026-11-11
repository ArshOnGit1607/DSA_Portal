import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ProblemRepository, Submission, SubmissionRepository } from '@dsa-portal/core';
import { decodeCursor, HttpError, keysetPage, notFound } from '../../lib/http';
import { findProblemOr404, IdParams, PageQuery } from '../problems/routes';

const SubmissionCreate = z.object({
  problemId: z.string().min(1),
  code: z.string().min(1).max(100_000),
});
const IdempotencyKey = z.string().min(1).max(128).optional();

/** Core Submission → OpenAPI Submission. */
export function toApiSubmission(s: Submission) {
  const perTest = s.result?.perTest ?? [];
  return {
    id: s.id,
    problemId: s.problemId,
    userId: s.userId,
    status: s.status,
    passed: perTest.filter((t) => t.passed).length,
    total: perTest.length,
    results: perTest.map((t, i) => ({
      testCaseIndex: i,
      passed: t.passed,
      actual: JSON.stringify(t.actual),
      expected: JSON.stringify(t.expected),
    })),
    createdAt: s.createdAt.toISOString(),
    judgedAt: s.judgedAt?.toISOString() ?? null,
  };
}

// Newest first; id breaks ties so the cursor key is unique.
const sortKey = (s: Submission) => `${s.createdAt.toISOString()}|${s.id}`;

export const submissionRoutes: FastifyPluginAsync<{
  problems: ProblemRepository;
  submissions: SubmissionRepository;
}> = async (app, { problems, submissions }) => {
  app.post('/submissions', { onRequest: app.authenticate }, async (req, reply) => {
    const body = SubmissionCreate.parse(req.body);
    const key = IdempotencyKey.parse(req.headers['idempotency-key']);
    const userId = req.user.sub;

    // A retry with the same key returns the first submission instead of judging twice.
    // Returns data, never `reply`: Fastify's reply is thenable, so awaiting it would swallow it.
    const findReplay = async () => {
      const existing = key ? await submissions.findByIdempotencyKey(userId, key) : null;
      if (existing && (existing.problemId !== body.problemId || existing.code !== body.code)) {
        throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request body');
      }
      return existing;
    };
    const accepted = (s: Submission) => reply.code(202).send({ submissionId: s.id, status: s.status });

    const replay = await findReplay();
    if (replay) return accepted(replay);

    const problem = await findProblemOr404(problems, body.problemId);
    const submission: Submission = {
      id: randomUUID(),
      problemId: problem.id,
      userId,
      code: body.code,
      status: 'queued',
      createdAt: new Date(),
      idempotencyKey: key,
    };
    try {
      // The insert also wakes a worker (pg_notify trigger, migration 002).
      await submissions.save(submission);
    } catch (err) {
      // Two concurrent retries with one key: the unique index lets only one insert win.
      if (key && (err as { code?: string }).code === '23505') {
        const raced = await findReplay();
        if (raced) return accepted(raced);
      }
      throw err;
    }
    req.log.info({ submissionId: submission.id, problemId: problem.id }, 'submission queued');
    return accepted(submission);
  });

  app.get('/submissions', { onRequest: app.authenticate }, async (req) => {
    const q = z.object({ ...PageQuery, problemId: z.string().optional() }).parse(req.query);
    const rows = (await submissions.findByUser(req.user.sub))
      .filter((s) => !q.problemId || s.problemId === q.problemId)
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    return keysetPage(rows, sortKey, decodeCursor(q.cursor), q.limit, toApiSubmission);
  });

  app.get('/submissions/:id', { onRequest: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const submission = await submissions.findById(id);
    // Someone else's submission looks the same as a missing one: no id probing.
    if (!submission || submission.userId !== req.user.sub) throw notFound('Submission');
    return toApiSubmission(submission);
  });
};
