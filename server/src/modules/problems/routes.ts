import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProblemSchema, selectRandomProblem } from '@dsa-portal/core';
import type { Problem, ProblemRepository } from '@dsa-portal/core';
import { decodeCursor, HttpError, keysetPage, notFound } from '../../lib/http';

export const TopicQuery = ProblemSchema.shape.topic.optional();
export const DifficultyQuery = ProblemSchema.shape.difficulty.optional();
export const PageQuery = {
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const IdParams = z.object({ id: z.string().min(1) });

export const toProblemSummary = ({ id, title, topic, difficulty }: Problem) => ({
  id,
  title,
  topic,
  difficulty,
});

/** Core Problem → OpenAPI Problem (test-case values are JSON strings, hints/solution are plain strings). */
export const toApiProblem = (p: Problem) => ({
  ...toProblemSummary(p),
  description: p.description,
  starterCode: p.starterCode,
  testCases: p.testCases.map((t) => ({
    input: JSON.stringify(t.input),
    expected: JSON.stringify(t.expected),
  })),
  hints: [...p.hints].sort((a, b) => a.level - b.level).map((h) => h.content),
  solution: p.solution.code,
});

export async function findProblemOr404(repo: ProblemRepository, id: string) {
  const problem = await repo.findById(id);
  if (!problem) throw notFound('Problem');
  return problem;
}

export const problemRoutes: FastifyPluginAsync<{ problems: ProblemRepository }> = async (
  app,
  { problems }
) => {
  app.get('/topics', async () => {
    const all = await problems.findAll();
    return { topics: [...new Set(all.map((p) => p.topic))].sort() };
  });

  app.get('/problems', { onRequest: app.authenticate }, async (req) => {
    const q = z
      .object({ ...PageQuery, topic: TopicQuery, difficulty: DifficultyQuery })
      .parse(req.query);
    const rows = (await problems.findAll({ topic: q.topic, difficulty: q.difficulty })).sort(
      (a, b) => a.id.localeCompare(b.id)
    );
    return keysetPage(rows, (p) => p.id, decodeCursor(q.cursor), q.limit, toProblemSummary);
  });

  app.get('/problems/random', { onRequest: app.authenticate }, async (req) => {
    const q = z.object({ topic: TopicQuery, difficulty: DifficultyQuery }).parse(req.query);
    const problem = selectRandomProblem(await problems.findAll(), q);
    if (!problem) throw new HttpError(404, 'NOT_FOUND', 'No problem matches these filters');
    return toApiProblem(problem);
  });

  app.get('/problems/:id', { onRequest: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    return toApiProblem(await findProblemOr404(problems, id));
  });
};
