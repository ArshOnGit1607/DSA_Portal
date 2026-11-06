import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Problem, SubmissionResult, TestCase } from './types';

interface RunOptions {
  problem: Problem;
  userCode: string;
}

export function submitCode({ problem, userCode }: RunOptions): SubmissionResult {
  const results: SubmissionResult['results'] = [];
  let passed = 0;

  for (let i = 0; i < problem.testCases.length; i++) {
    const testResult = runSingleTestCase(problem, userCode, problem.testCases[i], i);
    results.push(testResult);
    if (testResult.passed) passed += 1;
  }

  return {
    problemId: problem.id,
    passed,
    total: problem.testCases.length,
    results,
  };
}

function runSingleTestCase(
  problem: Problem,
  userCode: string,
  tc: TestCase,
  index: number
): SubmissionResult['results'][number] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-exec-'));
  const tmpFile = path.join(tmpDir, 'solution.js');

  const wrapper = `
${userCode}

const input = ${JSON.stringify(tc.input)};
try {
  const result = solve(input);
  console.log(JSON.stringify({ result }));
} catch (e) {
  console.log(JSON.stringify({ error: String(e) }));
}
  `;

  fs.writeFileSync(tmpFile, wrapper);

  let output: string;
  try {
    output = execFileSync('node', [tmpFile], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
  } catch (err: any) {
    return {
      testCaseIndex: index,
      passed: false,
      expected: tc.expected,
      actual: `Execution error: ${err.message}`,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  let parsed: { result?: unknown; error?: string };
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    return {
      testCaseIndex: index,
      passed: false,
      expected: tc.expected,
      actual: `Unparseable output: ${output.trim()}`,
    };
  }

  if (parsed.error) {
    return {
      testCaseIndex: index,
      passed: false,
      expected: tc.expected,
      actual: `Runtime error: ${parsed.error}`,
    };
  }

  const passed = deepEqual(parsed.result, tc.expected);
  return {
    testCaseIndex: index,
    passed,
    expected: tc.expected,
    actual: parsed.result,
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
