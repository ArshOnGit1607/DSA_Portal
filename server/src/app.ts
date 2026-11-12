import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyServerOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { ZodError } from 'zod';
import type { ProblemRepository, SubmissionRepository, User } from '@dsa-portal/core';
import { HttpError } from './lib/http';
import { InMemoryProblemRepository } from './modules/problems/in-memory-problem.repository';
import { InMemorySubmissionRepository } from './modules/submissions/in-memory-submission.repository';
import { problemRoutes } from './modules/problems/routes';
import { hintRoutes } from './modules/hints/routes';
import { solutionRoutes } from './modules/solutions/routes';
import { submissionRoutes, type Backpressure } from './modules/submissions/routes';
import { queueAdminRoutes } from './modules/submissions/admin-routes';
import { InMemorySubmissionQueue, type SubmissionQueue } from './modules/submissions/queue';
import { InMemoryAuthStore } from './modules/auth/store';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  problems?: ProblemRepository;
  submissions?: SubmissionRepository;
  /** Queue depth + dead-letter actions. Defaults to one over the in-memory submissions. */
  queue?: SubmissionQueue;
  /** Role lookup for admin routes (Person 3's AuthStore fits). */
  users?: { findById(id: string): Promise<User | null> };
  backpressure?: Partial<Backpressure>;
}

export function buildApp(opts: AppOptions = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  const app = Fastify({
    logger: opts.logger ?? { level: process.env.LOG_LEVEL ?? 'info' },
    // pino binds reqId to every req.log line; clients/proxies may pass their own x-request-id.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  const submissions = opts.submissions ?? new InMemorySubmissionRepository();
  if (!opts.queue && !(submissions instanceof InMemorySubmissionRepository)) {
    throw new Error('Pass a queue (PostgresSubmissionQueue) together with a non-memory submission repository');
  }
  const deps = {
    problems: opts.problems ?? new InMemoryProblemRepository(),
    submissions,
    queue: opts.queue ?? new InMemorySubmissionQueue(submissions as InMemorySubmissionRepository),
    users: opts.users ?? new InMemoryAuthStore(),
    backpressure: {
      maxWaiting: Number(process.env.QUEUE_MAX_WAITING) || 500,
      retryAfterS: Number(process.env.QUEUE_RETRY_AFTER_S) || 10,
      ...opts.backpressure,
    },
  };

  app.register(fastifyCors);
  app.register(fastifyJwt, { secret: secret ?? 'dev-secret-change-me' });

  // TEMP STUB (Day 4): plain JWT check until Person 3's auth middleware from
  // /server/src/modules/auth is merged; then swap this decorator for theirs.
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid access token');
    }
    if (typeof req.user?.sub !== 'string' || !req.user.sub) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Token has no subject');
    }
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    let statusCode = 500;
    let error = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    if (err instanceof HttpError) {
      ({ statusCode, code: error, message } = err);
    } else if (err instanceof ZodError) {
      statusCode = 400;
      error = 'VALIDATION_ERROR';
      message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    } else if (err.statusCode && err.statusCode < 500) {
      // Fastify's own 4xx (bad JSON, body too large, wrong content-type).
      statusCode = err.statusCode;
      error = statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
      message = err.message;
    }
    if (statusCode >= 500) req.log.error({ err }, 'unhandled error');
    reply.code(statusCode).send({
      error,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.url.split('?')[0],
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${req.method} ${req.url.split('?')[0]} not found`,
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.url.split('?')[0],
    });
  });

  app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok', service: 'dsa-portal-server' }));
      await api.register(problemRoutes, deps);
      await api.register(hintRoutes, deps);
      await api.register(solutionRoutes, deps);
      await api.register(submissionRoutes, deps);
      await api.register(queueAdminRoutes, deps);
    },
    { prefix: '/api/v1' }
  );

  return app;
}
