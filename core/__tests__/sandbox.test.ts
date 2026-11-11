import { describe, expect, it } from '@jest/globals';
import { submitCodeSandbox } from '../src/sandbox';
import { loadProblems } from '../src/problem-loader';

import path from 'path';
const PROBLEMS_DIR = path.join(__dirname, '..', 'problems');

const problems = loadProblems(PROBLEMS_DIR);
const twoSum = problems.find((p) => p.id === 'two-sum')!;

const correctCode = `
function solve(input) {
  const { nums, target } = input;
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement), i];
    map.set(nums[i], i);
  }
  return [];
}
`;

const wrongCode = `function solve(input) { return [0, 0]; }`;

describe('sandbox — normal solution', () => {
  it('passes a correct two-sum submission', () => {
    const result = submitCodeSandbox(twoSum, correctCode, {
      perTestTimeoutMs: 2000,
      totalTimeoutMs: 10000,
      memoryLimitMb: 64,
      outputCap: 50000,
    });
    expect(result.problemId).toBe('two-sum');
    expect(result.status).toBe('passed');
    expect(result.perTest.length).toBe(twoSum.testCases.length);
    expect(result.perTest.every((r) => r.passed)).toBe(true);
    expect(result.perTest.every((r) => r.runtimeMs >= 0)).toBe(true);
  });

  it('fails an incorrect submission', () => {
    const result = submitCodeSandbox(twoSum, wrongCode, {
      perTestTimeoutMs: 2000,
      totalTimeoutMs: 10000,
      memoryLimitMb: 64,
      outputCap: 50000,
    });
    expect(result.status).toBe('failed');
    expect(result.perTest.some((r) => !r.passed)).toBe(true);
    expect(result.perTest.every((r) => r.error)).toBe(true);
  });

  it('captures expected and actual values on failure', () => {
    const result = submitCodeSandbox(twoSum, wrongCode, {
      perTestTimeoutMs: 2000,
      totalTimeoutMs: 10000,
      memoryLimitMb: 64,
      outputCap: 50000,
    });
    const failed = result.perTest.find((r) => !r.passed)!;
    expect(failed.expected).toBeDefined();
    expect(failed.actual).toBeDefined();
    expect(failed.error).toBeDefined();
  });
});

describe('sandbox — security (hostile samples must be contained)', () => {
  const shortTimeout = { perTestTimeoutMs: 1500, totalTimeoutMs: 10000, memoryLimitMb: 64, outputCap: 50000 };

  it('contains an infinite loop (timeout)', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { while (true) {} return 1; }`,
      shortTimeout
    );
    expect(result.status).toBe('timeout');
    expect(result.perTest.some((r) => r.error && r.error.includes('timed out'))).toBe(true);
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
  });

  it('contains a memory allocation bomb', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { const a = []; while (true) { a.push(new Array(1000000).fill('x')); } return 1; }`,
      { ...shortTimeout, memoryLimitMb: 32 }
    );
    // Should be contained: either timeout or error, never passed
    expect(result.status).not.toBe('passed');
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
  });

  it('contains process.exit (process not in sandbox)', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { process.exit(0); return 1; }`,
      shortTimeout
    );
    expect(result.status).toBe('error');
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
    expect(result.perTest.every((r) => r.error)).toBe(true);
  });

  it('contains require(\'fs\') (require not in sandbox)', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { require('fs'); return 1; }`,
      shortTimeout
    );
    expect(result.status).toBe('error');
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
    expect(result.perTest.every((r) => r.error)).toBe(true);
  });

  it('contains prototype pollution attempt', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { Object.prototype.polluted = true; return input; }`,
      shortTimeout
    );
    // Contained: child process isolated, pollution does not reach parent.
    // solve() returns input (not the two-sum answer), so it fails — but
    // crucially it is NOT an error/timeout, meaning the sandbox contained it.
    expect(result.status).toBe('failed');
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
  });

  it('contains huge console output (output cap)', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { for (let i = 0; i < 100000; i++) { console.log('x'); } return 1; }`,
      { ...shortTimeout, outputCap: 1000 }
    );
    // Should be contained — output truncated, not passed (wrong answer anyway)
    expect(result.status).not.toBe('passed');
    const truncated = result.perTest.some(
      (r) => r.output && r.output.includes('[output truncated]')
    );
    expect(truncated).toBe(true);
  });

  it('does not allow network access', () => {
    const result = submitCodeSandbox(
      twoSum,
      `function solve(input) { const http = require('http'); return 1; }`,
      shortTimeout
    );
    expect(result.status).toBe('error');
    expect(result.perTest.every((r) => !r.passed)).toBe(true);
  });
});

describe('sandbox — escape attempts (must never reach the real process)', () => {
  const shortTimeout = { perTestTimeoutMs: 1500, totalTimeoutMs: 10000, memoryLimitMb: 64, outputCap: 50000 };
  const tryEscape = (expr: string) =>
    `function solve(input) { try { const P = ${expr}; return P && typeof P.pid === 'number' ? 'ESCAPED' : 'contained'; } catch (e) { return 'contained'; } }`;

  it.each([
    ['host function constructor via console.log', "console.log.constructor('return process')()"],
    ['host function constructor via input object', "input.constructor.constructor('return process')()"],
    ['global object constructor', "this.constructor.constructor('return process')()"],
    ['context Function from a string', "(function(){}).constructor('return process')()"],
    ['an error object', "new Error().constructor.constructor('return process')()"],
  ])('blocks %s', (_name, expr) => {
    const result = submitCodeSandbox(twoSum, tryEscape(expr), shortTimeout);
    expect(result.perTest.map((r) => r.actual)).not.toContain('ESCAPED');
  });

  it('cannot break out of the wrapper source with a backtick', () => {
    const forge = "process.stdout.write(JSON.stringify({ status: 'ok', result: [0, 1] }));";
    const code = 'function solve() { return null; }`; ' + forge + ' process.exit(0); `';
    const result = submitCodeSandbox(twoSum, code, shortTimeout);
    expect(result.status).not.toBe('passed');
  });

  it('cannot forge a passing verdict by replacing JSON.stringify', () => {
    const code = `JSON.stringify = () => '{"status":"ok","result":[0,1]}'; function solve() { return null; }`;
    const result = submitCodeSandbox(twoSum, code, shortTimeout);
    expect(result.status).not.toBe('passed');
  });

  it("keeps user code containing $' and $& intact", () => {
    const result = submitCodeSandbox(twoSum, `const tag = "$' $&";\n${correctCode}`, shortTimeout);
    expect(result.status).toBe('passed');
  });

  it('keeps solutions declared with const working', () => {
    const result = submitCodeSandbox(twoSum, correctCode.replace('function solve(input)', 'const solve = (input) =>'), shortTimeout);
    expect(result.status).toBe('passed');
  });

  it('blocks eval / Function code generation inside the sandbox', () => {
    const result = submitCodeSandbox(twoSum, `function solve() { return Function('return 1')(); }`, shortTimeout);
    expect(result.perTest[0].error).toMatch(/Code generation from strings disallowed/);
  });

  it('cannot fake its own verdict through Object.prototype.toJSON', () => {
    const code = `Object.prototype.toJSON = function () { return { status: 'ok', result: [0, 1] }; }; function solve() { return null; }`;
    const result = submitCodeSandbox(twoSum, code, shortTimeout);
    expect(result.status).not.toBe('passed');
  });
});
