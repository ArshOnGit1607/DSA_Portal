import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { PROBLEMS } from '@dsa-portal/core';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(fastifyCors);
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
  });

  app.get('/api/v1/health', async () => ({
    status: 'ok',
    service: 'dsa-portal-server',
  }));

  app.get(
    '/api/v1/problems',
    {
      preHandler: async (req: any, reply: any) => {
        try {
          await req.jwtVerify();
        } catch (err) {
          reply.send(err);
        }
      },
    },
    async () => ({
      problems: PROBLEMS.map(({ id, title, topic, difficulty }) => ({
        id,
        title,
        topic,
        difficulty,
      })),
    })
  );

  return app;
}
