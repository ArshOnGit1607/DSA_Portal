import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  ExecutionResult,
  PerTestResult,
  Problem,
  TestCase,
} from './types';

export interface SandboxOptions {
  perTestTimeoutMs?: number;
  totalTimeoutMs?: number;
  memoryLimitMb?: number;
  outputCap?: number;
  /** Binary that runs the child. Desktop passes process.execPath + ELECTRON_RUN_AS_NODE so no Node install is needed (CR-018). */
  nodePath?: string;
  /** Extra env for the child. PATH and NODE_OPTIONS (the memory limit) cannot be overridden. */
  extraEnv?: Record<string, string>;
}

const execFileAsync = promisify(execFile);

const DEFAULTS: Required<SandboxOptions> = {
  perTestTimeoutMs: 2000,
  totalTimeoutMs: 30000,
  memoryLimitMb: 64,
  outputCap: 50000,
  nodePath: 'node',
  extraEnv: {},
};

/**
 * Path to the sandbox wrapper script executed inside each child process.
 * Lives next to this file in both src/ and dist/ (copied by tsc allowJs).
 */
const SANDBOX_EXEC_PATH = path.join(__dirname, 'sandbox-exec.js');

/**
 * Writes user code and input to their own temp files. User code is never pasted
 * into the wrapper's source, so it cannot break out into host-side code.
 */
function prepareTestFiles(userCode: string, input: unknown) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-sandbox-'));
  const codePath = path.join(tmpDir, 'code.js');
  const inputPath = path.join(tmpDir, 'input.json');
  fs.writeFileSync(codePath, userCode);
  fs.writeFileSync(inputPath, JSON.stringify(input));
  return {
    codePath,
    inputPath,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

/** node args + options for one sandboxed child. Shared by the sync and async runners. */
function childCommand(codePath: string, inputPath: string, options: Required<SandboxOptions>) {
  const args = [SANDBOX_EXEC_PATH, codePath, inputPath, String(options.outputCap)];
  const execOptions = {
    encoding: 'utf8' as const,
    timeout: options.perTestTimeoutMs,
    maxBuffer: options.outputCap + 4096,
    // Minimal env: never leak server secrets (JWT_SECRET, DATABASE_URL) or Jest IPC vars to untrusted code.
    env: {
      ...options.extraEnv,
      PATH: process.env.PATH,
      NODE_OPTIONS: `--max-old-space-size=${options.memoryLimitMb}`,
    },
  };
  return { args, execOptions };
}

/** Turns the child's stdout (or its failure) into one PerTestResult. */
function toPerTestResult(
  tc: TestCase,
  testId: string,
  options: Required<SandboxOptions>,
  stdout: string | undefined,
  err?: unknown,
  elapsedMs = 0
): PerTestResult {
  const base = { id: testId, passed: false, expected: tc.expected, actual: undefined as unknown, runtimeMs: 0 };
  if (err !== undefined) {
    // Measured, not guessed from exit codes: an out-of-memory crash or an oversized result
    // also kills the child, but long before the time limit.
    const timedOut = elapsedMs >= options.perTestTimeoutMs;
    const e = err as { message?: string; code?: unknown; signal?: string | null };
    // Plain messages for learners; raw errors would also show server file paths.
    const message = /maxBuffer|ENOBUFS/.test(`${e.code} ${e.message}`)
      ? 'Output too large'
      : e.signal
        ? `Crashed (${e.signal}), most likely out of memory`
        : (e.message ?? String(err));
    return { ...base, error: timedOut ? `Test timed out after ${options.perTestTimeoutMs}ms` : message };
  }
  const parsed = JSON.parse((stdout ?? '').trim());
  const result = { ...base, runtimeMs: parsed.runtimeMs ?? 0, actual: parsed.result, output: parsed.output };
  if (parsed.status === 'error' || parsed.error) return { ...result, error: parsed.error };
  const passed = deepEqual(parsed.result, tc.expected);
  return passed
    ? { ...result, passed }
    : { ...result, error: `Expected ${JSON.stringify(tc.expected)}, got ${JSON.stringify(parsed.result)}` };
}

function runSingleTest(
  userCode: string,
  tc: TestCase,
  options: Required<SandboxOptions>,
  testIndex: number
): PerTestResult {
  const testId = tc.id ?? `test-${testIndex}`;
  const { codePath, inputPath, cleanup } = prepareTestFiles(userCode, tc.input);
  const { args, execOptions } = childCommand(codePath, inputPath, options);
  const started = Date.now();
  try {
    // Drop child stderr so untrusted code (or an OOM crash dump) cannot flood the host's logs.
    const stdout = execFileSync(options.nodePath, args, { ...execOptions, stdio: ['ignore', 'pipe', 'ignore'] });
    return toPerTestResult(tc, testId, options, stdout);
  } catch (err) {
    return toPerTestResult(tc, testId, options, undefined, err, Date.now() - started);
  } finally {
    cleanup();
  }
}

/** Non-blocking variant: the worker can judge several submissions at once. */
async function runSingleTestAsync(
  userCode: string,
  tc: TestCase,
  options: Required<SandboxOptions>,
  testIndex: number
): Promise<PerTestResult> {
  const testId = tc.id ?? `test-${testIndex}`;
  const { codePath, inputPath, cleanup } = prepareTestFiles(userCode, tc.input);
  const { args, execOptions } = childCommand(codePath, inputPath, options);
  const started = Date.now();
  try {
    // execFile buffers stderr in memory (capped by maxBuffer); it never reaches the host's logs.
    const { stdout } = await execFileAsync(options.nodePath, args, execOptions);
    return toPerTestResult(tc, testId, options, stdout);
  } catch (err) {
    return toPerTestResult(tc, testId, options, undefined, err, Date.now() - started);
  } finally {
    cleanup();
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  ) {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every(
      (k) =>
        deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k]
        )
    );
  }
  return false;
}

const totalTimeoutResult = (tc: TestCase, i: number): PerTestResult => ({
  id: tc.id ?? `test-${i}`,
  passed: false,
  expected: tc.expected,
  actual: undefined,
  runtimeMs: 0,
  error: 'Total timeout exceeded',
});

/** Overall verdict: timeout > error (no result produced) > failed (wrong answer) > passed. */
function finish(problem: Problem, results: PerTestResult[]): ExecutionResult {
  const crashed = results.filter((r) => r.error && r.actual === undefined);
  let status: ExecutionResult['status'] = 'passed';
  if (crashed.some((r) => /timed out|Total timeout/.test(r.error ?? ''))) status = 'timeout';
  else if (crashed.length) status = 'error';
  else if (results.some((r) => !r.passed)) status = 'failed';
  return { problemId: problem.id, status, perTest: results };
}

/**
 * Runs user code against all test cases in isolated sandbox child processes.
 * Blocks the calling thread; used by the CLI. Result shape: { status, perTest: [...] }
 */
export function submitCodeSandbox(
  problem: Problem,
  userCode: string,
  options: SandboxOptions = {}
): ExecutionResult {
  const cfg = { ...DEFAULTS, ...options };
  const start = Date.now();
  const results = problem.testCases.map((tc, i) =>
    Date.now() - start >= cfg.totalTimeoutMs ? totalTimeoutResult(tc, i) : runSingleTest(userCode, tc, cfg, i)
  );
  return finish(problem, results);
}

/** Same as submitCodeSandbox but never blocks the event loop (used by the worker). */
export async function submitCodeSandboxAsync(
  problem: Problem,
  userCode: string,
  options: SandboxOptions = {}
): Promise<ExecutionResult> {
  const cfg = { ...DEFAULTS, ...options };
  const start = Date.now();
  const results: PerTestResult[] = [];
  for (const [i, tc] of problem.testCases.entries()) {
    results.push(
      Date.now() - start >= cfg.totalTimeoutMs ? totalTimeoutResult(tc, i) : await runSingleTestAsync(userCode, tc, cfg, i)
    );
  }
  return finish(problem, results);
}
