'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS script run by `node` in the child */
// Runs ALL test cases of one submission for untrusted code, each in a FRESH vm context.
// Usage: node sandbox-exec.js <code.js> <inputs.json> <outputCap> <perTestTimeoutMs>
// Prints one JSON line per test as soon as it finishes, so a crash in test k keeps tests 0..k-1.
//
// Security model: each context gets NO host objects. console, input and the runner are all
// created inside the context, so `anything.constructor.constructor` only reaches the context's
// own Function, which cannot compile strings (codeGeneration.strings = false). Only primitives
// cross the boundary: strings/numbers in, one JSON string out. V8 stops each test after
// perTestTimeoutMs (microtasks included); the host still kills the whole child as a backstop and
// adds the memory and env limits (see sandbox.ts). One process per submission instead of one per
// test: Node startup was most of the judging CPU (Day 9 load test).
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const [codePath, inputsPath, capArg, timeoutArg] = process.argv.slice(2);
const userCode = fs.readFileSync(codePath, 'utf8');
const inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));
const outputCap = parseInt(capArg || '50000', 10);
const timeout = parseInt(timeoutArg || '2000', 10);

// Built-ins are captured before user code runs, so user code cannot fake its own verdict
// by overriding JSON/Date/Object. The runner is installed under an unguessable, non-writable,
// non-configurable global name, so user code can neither predict nor replace it.
const RUNNER = `(function (key, inputJson, outputCap) {
    var stringify = JSON.stringify, parse = JSON.parse, now = Date.now, create = Object.create;
    var g = globalThis, lines = [], size = 0;
    var log = function () {
      if (size > outputCap) return;
      var line = '';
      for (var i = 0; i < arguments.length; i++) line += (i ? ' ' : '') + String(arguments[i]);
      size += line.length + 1;
      lines[lines.length] = size > outputCap ? '[output truncated]' : line;
    };
    g.console = { log: log, error: log, warn: log, info: log };
    var input = parse(inputJson);
    // Null-prototype object with explicit keys: an Object.prototype.toJSON added by user code never applies.
    var report = function (status, result, error, runtimeMs) {
      var o = create(null);
      o.status = status;
      o.result = result;
      o.error = error;
      o.runtimeMs = runtimeMs;
      o.output = lines.join('\\n');
      return stringify(o);
    };
    Object.defineProperty(g, key, { value: function (loadError) {
      if (loadError !== null) return report('error', undefined, loadError, 0);
      // Scripts in one context share top-level bindings, so this also finds \`const solve = ...\`.
      if (typeof solve !== 'function') return report('error', undefined, 'solve(input) is not defined', 0);
      var start = now();
      try {
        var result = solve(input);
        return report('ok', result, undefined, now() - start);
      } catch (e) {
        return report('error', undefined, String(e && e.message ? e.message : e), now() - start);
      }
    } });
  })`;

const isTimeout = (e) => e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
const TIMEOUT = JSON.stringify({ status: 'timeout' });
const UNSERIALIZABLE = JSON.stringify({ status: 'error', error: 'Result could not be serialized' });

function runOne(input) {
  // microtaskMode: promise jobs run inside the same timeout instead of after it, in the host's queue.
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: 'afterEvaluate',
  });
  const key = `__dsa_${crypto.randomBytes(8).toString('hex')}`;
  vm.runInContext(RUNNER, context)(key, JSON.stringify(input), outputCap);

  let loadError = null;
  try {
    vm.runInContext(userCode, context, { filename: 'user.js', timeout });
  } catch (e) {
    if (isTimeout(e)) return TIMEOUT;
    loadError = String(e && e.message ? e.message : e);
  }
  try {
    // Called from inside the context, so V8's timeout also covers solve().
    const out = vm.runInContext(`${key}(${JSON.stringify(loadError)})`, context, { timeout });
    return typeof out === 'string' ? out : UNSERIALIZABLE;
  } catch (e) {
    return isTimeout(e) ? TIMEOUT : UNSERIALIZABLE;
  }
}

for (const input of inputs) fs.writeSync(1, runOne(input) + '\n');
// No process.exit(): let stdout flush when piped.
