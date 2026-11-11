import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { submitCodeSandbox } from '@dsa-portal/core';
import type { ProblemRepository, Submission, SubmissionRepository } from '@dsa-portal/core';
import { decodeCursor, keysetPage, notFound } from '../../lib/http';
import { findProblemOr404, IdParams, PageQuery } from '../problems/routes';

const SubmissionCreate = z.object({
  problemId: z.string().min(1),
  code: z.string().min(1).max(100_000),
});

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
    const problem = await findProblemOr404(problems, body.problemId);
    const submission: Submission = {
      id: randomUUID(),
      problemId: problem.id,
      userId: req.user.sub,
      code: body.code,
      status: 'running',
      createdAt: new Date(),
    };
    await submissions.save(submission);

    // shortcut: judged synchronously and blocks the event loop while the sandbox runs; Day 5 moves this to a BullMQ worker.
    try {
      submission.result = submitCodeSandbox(problem, body.code);
      submission.status = 'judged';
    } catch (err) {
      req.log.error({ err, submissionId: submission.id }, 'sandbox run failed');
      submission.status = 'failed';
    }
    submission.judgedAt = new Date();
    await submissions.save(submission);
    req.log.info({ submissionId: submission.id, status: submission.result?.status }, 'submission judged');

    // 202 + id keeps the contract identical when Day 5 makes judging async.
    return reply.code(202).send({ submissionId: submission.id, status: submission.status });
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
