import { z } from 'zod';
import type { Topic, Difficulty, Problem } from './types';

export const TestCaseSchema = z.object({
  input: z.unknown(),
  expected: z.unknown(),
});

export const HintSchema = z.object({
  level: z.number().int().positive(),
  content: z.string().min(1),
});

export const SolutionSchema = z.object({
  code: z.string().min(1),
  explanation: z.string().optional(),
});

export const ProblemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.enum([
    'Arrays',
    'Strings',
    'LinkedList',
    'Trees',
    'Graphs',
    'Dynamic Programming',
    'Sorting',
    'Searching',
  ] as const) as z.ZodType<Topic>,
  difficulty: z.enum(['Easy', 'Medium', 'Hard'] as const) as z.ZodType<Difficulty>,
  description: z.string().min(1),
  starterCode: z.string().min(1),
  testCases: z.array(TestCaseSchema).min(1),
  hints: z.array(HintSchema).min(1),
  solution: SolutionSchema,
});

export type ProblemInput = z.infer<typeof ProblemSchema>;

export function validateProblem(input: unknown): Problem {
  return ProblemSchema.parse(input) as Problem;
}
