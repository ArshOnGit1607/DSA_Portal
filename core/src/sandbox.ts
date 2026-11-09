import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  ExecutionResult,
  PerTestResult,
  Problem,
  TestCase,
} from './types';

interface SandboxOptions {
  perTestTimeoutMs?: number;
  totalTimeoutMs?: number;
  memoryLimitMb?: number;
  outputCap?: number;
}

const DEFAULTS: Required<SandboxOptions> = {
  perTestTimeoutMs: 2000,
  totalTimeoutMs: 30000,
  memoryLimitMb: 64,
  outputCap: 50000,
};

/**
 * Path to the sandbox wrapper script executed inside each child process.
 * Read from src/ at runtime so no template-literal escaping issues arise.
 */
const SANDBOX_EXEC_PATH = path.join(__dirname, 'sandbox-exec.js');

/**
 * Reads the sandbox wrapper and injects the user code at the __USER_CODE__
 * placeholder. Writes wrapper + input to temp files for the child process.
 */
function prepareTestFiles(userCode: string, input: unknown) {
  const wrapperSource = fs.readFileSync(SANDBOX_EXEC_PATH, 'utf8');
  const wrapperCode = wrapperSource.replace('__USER_CODE__', userCode + '\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-sandbox-'));
  const wrapperPath = path.join(tmpDir, 'wrapper.js');
  const inputPath = path.join(tmpDir, 'input.json');
  fs.writeFileSync(wrapperPath, wrapperCode);
  fs.writeFileSync(inputPath, JSON.stringify(input));
  return {
    wrapperPath,
    inputPath,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function runSingleTest(
  userCode: string,
  tc: TestCase,
  options: Required<SandboxOptions>,
  testIndex: number
): PerTestResult {
  const testId = tc.id ?? `test-${testIndex}`;
  const { wrapperPath, inputPath, cleanup } = prepareTestFiles(
      userCode,
      tc.input
  );

  let runtimeMs = 0;
  let passed = false;
  let actual: unknown = undefined;
  let error: string | undefined;
  let output: string | undefined;

  try {
    const stdout = execFileSync('node', [wrapperPath, inputPath, String(options.outputCap)], {
      encoding: 'utf8',
      timeout: options.perTestTimeoutMs,
      maxBuffer: options.outputCap + 4096,
      env: {
        ...process.env,
        NODE_OPTIONS: `--max-old-space-size=${options.memoryLimitMb}`,
      },
    });
    const parsed = JSON.parse(stdout.trim());
    runtimeMs = parsed.runtimeMs ?? 0;
    actual = parsed.result;
    output = parsed.output;

    if (parsed.status === 'error' || parsed.error) {
      error = parsed.error ?? `Runtime error: ${parsed.error}`;
    } else {
      passed = deepEqual(parsed.result, tc.expected);
      if (!passed) {
        error = `Expected ${JSON.stringify(tc.expected)}, got ${JSON.stringify(parsed.result)}`;
      }
    }
  } catch (err: unknown) {
    const e = err as Error & { killed?: boolean; signal?: string; code?: number | null };
    if (e.killed || e.signal === 'SIGTERM' || e.code === null) {
      error = `Test timed out after ${options.perTestTimeoutMs}ms`;
    } else {
      error = e.message ?? String(err);
    }
  } finally {
    cleanup();
  }

  return {
    id: testId,
    passed,
    expected: tc.expected,
    actual,
    runtimeMs,
    error,
    output,
  };
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

/**
 * Runs user code against all test cases in isolated sandbox child processes.
 * Result shape: { status, perTest: [...] }
 */
export function submitCodeSandbox(
  problem: Problem,
  userCode: string,
  options: SandboxOptions = {}
): ExecutionResult {
  const cfg = { ...DEFAULTS, ...options };
  const results: PerTestResult[] = [];
  let passedCount = 0;
  let hasSystemError = false;
  let hasTimeout = false;

  const startTotal = Date.now();

  for (let i = 0; i < problem.testCases.length; i++) {
    if (Date.now() - startTotal >= cfg.totalTimeoutMs) {
      results.push({
        id: problem.testCases[i].id ?? `test-${i}`,
        passed: false,
        expected: problem.testCases[i].expected,
        actual: undefined,
        runtimeMs: 0,
        error: 'Total timeout exceeded',
      });
      hasTimeout = true;
      continue;
    }

    const tc = problem.testCases[i];
    const result = runSingleTest(userCode, tc, cfg, i);
    results.push(result);

    // Distinguish system errors (no result produced) from wrong answers
    // (result produced but doesn't match expected).
    if (result.error && result.actual === undefined) {
      if (result.error.includes('timed out')) hasTimeout = true;
      else hasSystemError = true;
    }
    if (result.passed) passedCount += 1;
  }

  let status: ExecutionResult['status'] = 'passed';
  if (hasTimeout) status = 'timeout';
  else if (hasSystemError) status = 'error';
  else if (passedCount < results.length) status = 'failed';

  return {
    problemId: problem.id,
    status,
    perTest: results,
  };
}
