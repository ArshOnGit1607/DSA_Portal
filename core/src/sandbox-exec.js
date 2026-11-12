'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS script run by `node` in the child */
// Runs ONE test case for untrusted code. Usage: node sandbox-exec.js <code.js> <input.json> <outputCap>
//
// Security model: the vm context gets NO host objects. console, input and the runner are all
// created inside the context, so `anything.constructor.constructor` only reaches the context's
// own Function, which cannot compile strings (codeGeneration.strings = false). Only primitives
// cross the boundary: strings/numbers in, one JSON string out. The child process itself adds
// the time, memory and env limits (see sandbox.ts).
const fs = require('fs');
const vm = require('vm');

const [codePath, inputPath, capArg] = process.argv.slice(2);
const userCode = fs.readFileSync(codePath, 'utf8');
const inputJson = fs.readFileSync(inputPath, 'utf8');
const outputCap = parseInt(capArg || '50000', 10);

const context = vm.createContext(Object.create(null), {
  codeGeneration: { strings: false, wasm: false },
});

// Built-ins are captured before user code runs, so user code cannot fake its own verdict
// by overriding JSON/Date/Object.
const makeRunner = vm.runInContext(
  `(function (inputJson, outputCap) {
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
    return function run(loadError, solve) {
      if (loadError) return report('error', undefined, loadError, 0);
      if (typeof solve !== 'function') return report('error', undefined, 'solve(input) is not defined', 0);
      var start = now();
      try {
        var result = solve(input);
        return report('ok', result, undefined, now() - start);
      } catch (e) {
        return report('error', undefined, String(e && e.message ? e.message : e), now() - start);
      }
    };
  })`,
  context
);
const run = makeRunner(inputJson, outputCap);

let loadError;
let solve;
try {
  vm.runInContext(userCode, context, { filename: 'user.js' });
  // Scripts in one context share top-level bindings, so this also finds `const solve = ...`.
  solve = vm.runInContext('typeof solve === "function" ? solve : undefined', context);
} catch (e) {
  loadError = String(e && e.message ? e.message : e);
}

let out;
try {
  out = run(loadError, solve);
} catch {
  out = undefined;
}
process.stdout.write(
  typeof out === 'string' ? out : JSON.stringify({ status: 'error', error: 'Result could not be serialized' })
);
// No process.exit(): let stdout flush when piped.
