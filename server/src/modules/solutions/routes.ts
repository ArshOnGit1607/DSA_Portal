import type { FastifyPluginAsync } from 'fastify';
import { SolutionService } from '@dsa-portal/core';
import type { ProblemRepository, SubmissionRepository } from '@dsa-portal/core';
import { HttpError } from '../../lib/http';
import { findProblemOr404, IdParams } from '../problems/routes';

const solutionService = new SolutionService();

export const solutionRoutes: FastifyPluginAsync<{
  problems: ProblemRepository;
  submissions: SubmissionRepository;
}> = async (app, { problems, submissions }) => {
  app.get('/problems/:id/solution', { onRequest: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const problem = await findProblemOr404(problems, id);
    // Unlocked once the user has one submission that passed every test.
    const solved = (await submissions.findByUser(req.user.sub)).some(
      (s) => s.problemId === id && s.result?.status === 'passed'
    );
    if (!solved) {
      throw new HttpError(403, 'SOLUTION_LOCKED', 'Solve the problem first to unlock its solution');
    }
    return { solution: solutionService.getSolution(problem).code };
  });
};
