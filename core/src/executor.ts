import type { ExecutionResult, Problem } from './types';
import { submitCodeSandbox } from './sandbox';

interface RunOptions {
  problem: Problem;
  userCode: string;
}

/**
 * Runs user JavaScript against a problem's predefined test cases in an
 * isolated sandbox child process. Delegates to submitCodeSandbox for
 * security (timeouts, memory limits, output caps, no dangerous globals).
 */
export function submitCode({ problem, userCode }: RunOptions): ExecutionResult {
  return submitCodeSandbox(problem, userCode);
}
