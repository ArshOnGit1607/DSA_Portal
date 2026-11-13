import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyServerOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { ZodError } from 'zod';
import type { ProblemRepository, SubmissionRepository } from '@dsa-portal/core';
import { HttpError } from './lib/http';
import { InMemoryProblemRepository } from './modules/problems/in-memory-problem.repository';
import { InMemorySubmissionRepository } from './modules/submissions/in-memory-submission.repository';
import { problemRoutes } from './modules/problems/routes';
import { hintRoutes } from './modules/hints/routes';
import { solutionRoutes } from './modules/solutions/routes';
import { submissionRoutes, type Backpressure } from './modules/submissions/routes';
import { queueAdminRoutes } from './modules/submissions/admin-routes';
import { InMemorySubmissionQueue, type SubmissionQueue } from './modules/submissions/queue';
import { InMemoryAuthStore, type AuthStore } from './modules/auth/store';
import { authenticate } from './modules/auth/hooks';
import { authRoutes } from './modules/auth/routes';
import type { LoginThrottle } from './modules/auth/throttle';
import { adminRoutes } from './modules/admin/routes';
import { statsRoutes } from './modules/stats/routes';
import { InMemoryStatsRepository } from './modules/stats/in-memory-stats.repository';
import type { StatsStore } from './modules/stats/stats.service';
import { Cache } from './cache/cache';
import { CachedProblemRepository } from './cache/cached-problem.repository';
import { emptyLeaderboard, leaderboardRoutes, type LeaderboardStore } from './modules/leaderboard/routes';
import { dailyRoutes, noPinnedDaily, type DailyStore } from './modules/daily/routes';

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
  /** Users, sessions and roles (Person 3). */
  auth?: AuthStore;
  stats?: StatsStore;
  throttle?: LoginThrottle;
  /** Redis cache-aside for public data (Person 3, Day 7). Omitted = no cache. */
  cache?: Cache;
  leaderboard?: LeaderboardStore;
  daily?: DailyStore;
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
  const cache = opts.cache ?? new Cache(null);
  const problems = new CachedProblemRepository(opts.problems ?? new InMemoryProblemRepository(), cache);
  const deps = {
    problems,
    submissions,
    queue: opts.queue ?? new InMemorySubmissionQueue(submissions as InMemorySubmissionRepository),
    auth: opts.auth ?? new InMemoryAuthStore(),
    stats: opts.stats ?? new InMemoryStatsRepository(problems, submissions),
    throttle: opts.throttle,
    cache,
    leaderboard: opts.leaderboard ?? emptyLeaderboard,
    daily: opts.daily ?? noPinnedDaily,
    backpressure: {
      maxWaiting: Number(process.env.QUEUE_MAX_WAITING) || 500,
      retryAfterS: Number(process.env.QUEUE_RETRY_AFTER_S) || 10,
      ...opts.backpressure,
    },
  };

  app.register(fastifyCors);
  app.register(fastifyJwt, { secret: secret ?? 'dev-secret-change-me' });

  app.decorate('authenticate', authenticate);

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

  // Prometheus scrape target for the cache counters (outside /api/v1: not part of the public API).
  app.get('/metrics', async (_req, reply) => reply.type('text/plain; version=0.0.4').send(cache.renderMetrics()));

  app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok', service: 'dsa-portal-server' }));
      await api.register(problemRoutes, deps);
      await api.register(hintRoutes, deps);
      await api.register(solutionRoutes, deps);
      await api.register(submissionRoutes, deps);
      await api.register(queueAdminRoutes, deps);
      await api.register(authRoutes, deps);
      await api.register(adminRoutes, deps);
      await api.register(statsRoutes, deps);
      await api.register(leaderboardRoutes, deps);
      await api.register(dailyRoutes, deps);
    },
    { prefix: '/api/v1' }
  );

  return app;
}
