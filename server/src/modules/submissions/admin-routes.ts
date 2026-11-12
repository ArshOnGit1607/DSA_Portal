import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { User } from '@dsa-portal/core';
import { decodeCursor, encodeCursor, HttpError, notFound } from '../../lib/http';
import { IdParams, PageQuery } from '../problems/routes';
import type { FailedJob, SubmissionQueue } from './queue';

const toApiFailedJob = (j: FailedJob) => ({
  id: j.id,
  problemId: j.problemId,
  userId: j.userId,
  attempts: j.attempts,
  lastError: j.lastError,
  createdAt: j.createdAt.toISOString(),
  failedAt: j.failedAt?.toISOString() ?? null,
});

/** Dead-letter list for admins: see why jobs failed and put them back on the queue. */
export const queueAdminRoutes: FastifyPluginAsync<{
  queue: SubmissionQueue;
  users: { findById(id: string): Promise<User | null> };
}> = async (app, { queue, users }) => {
  // The access token only carries `sub`, so the role is read fresh: a demoted admin loses access at once.
  const requireAdmin = async (req: FastifyRequest) => {
    await app.authenticate(req);
    if ((await users.findById(req.user.sub))?.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Admin role required');
    }
  };

  app.get('/admin/queue/failed', { onRequest: requireAdmin }, async (req) => {
    const q = z.object(PageQuery).parse(req.query);
    const cursor = decodeCursor(q.cursor);
    let after: { failedAt: string; id: string } | undefined;
    if (cursor) {
      const [failedAt, id] = cursor.split('|');
      if (!z.string().uuid().safeParse(id).success || Number.isNaN(Date.parse(failedAt))) throw new HttpError(400, 'VALIDATION_ERROR', 'cursor is invalid');
      after = { failedAt, id };
    }
    const rows = await queue.listFailed(q.limit + 1, after); // one extra row tells us if there is a next page
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      data: page.map(toApiFailedJob),
      nextCursor: rows.length > q.limit && last.failedAt ? encodeCursor(`${last.failedAt.toISOString()}|${last.id}`) : null,
    };
  });

  app.post('/admin/queue/failed/:id/requeue', { onRequest: requireAdmin }, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await queue.requeue(id))) throw notFound('Failed submission');
    return reply.code(202).send({ submissionId: id, status: 'queued' });
  });
};
