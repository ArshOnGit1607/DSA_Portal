// Runs in an Electron utility process: user code is judged away from the main process, so a
// crash or hang there can't take the app down. Each test still runs in core's own child process.
import { submitCodeSandboxAsync, type Problem } from '@dsa-portal/core';

process.parentPort.on('message', async (e) => {
  const { id, problem, code } = e.data as { id: number; problem: Problem; code: string };
  try {
    process.parentPort.postMessage({ id, result: await submitCodeSandboxAsync(problem, code) });
  } catch (err) {
    process.parentPort.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
