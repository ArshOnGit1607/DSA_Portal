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
import { leaderboardRoutes } from './modules/leaderboard/routes';
import { InMemoryLeaderboardStore, type LeaderboardStore } from './modules/leaderboard/store';
import { dailyRoutes } from './modules/daily/routes';
import { InMemoryDailyChallengeStore, type DailyChallengeStore } from './modules/daily/store';
import { attachRealtime, type EventSource } from './modules/realtime/gateway';

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
  /** Admin DELETE /admin/problems; the server passes unpublishProblem until ProblemRepository has delete (CR-015). */
  deleteProblem?: (id: string) => Promise<boolean>;
  throttle?: LoginThrottle;
  backpressure?: Partial<Backpressure>;
  leaderboard?: LeaderboardStore;
  daily?: DailyChallengeStore;
  /** Real-time events for Socket.IO (PostgresEventSource). No gateway without it. */
  events?: EventSource;
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
  const problems = opts.problems ?? new InMemoryProblemRepository();
  const auth = opts.auth ?? new InMemoryAuthStore();
  if (!opts.leaderboard && !(submissions instanceof InMemorySubmissionRepository)) {
    throw new Error('Pass a leaderboard store (PostgresLeaderboardStore) together with a non-memory submission repository');
  }
  const deps = {
    problems,
    submissions,
    queue: opts.queue ?? new InMemorySubmissionQueue(submissions as InMemorySubmissionRepository),
    auth,
    leaderboard: opts.leaderboard ?? new InMemoryLeaderboardStore(submissions as InMemorySubmissionRepository, problems, auth),
    daily: opts.daily ?? new InMemoryDailyChallengeStore(problems),
    stats: opts.stats ?? new InMemoryStatsRepository(problems, submissions),
    deleteProblem: opts.deleteProblem ?? (async () => false),
    throttle: opts.throttle,
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

  if (opts.events) attachRealtime(app, opts.events);
  return app;
}
