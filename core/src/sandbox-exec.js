'use strict';
const fs = require('fs');
const vm = require('vm');

const inputPath = process.argv[2];
const outputCap = parseInt(process.argv[3] || '50000', 10);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const output = [];
const log = (...args) => {
  const line = args.map(String).join(' ');
  output.push(line);
  if (output.join('\n').length > outputCap) {
    output.length = 0;
    output.push('[output truncated]');
  }
};

// Null-prototype sandbox to block prototype-chain escapes.
// Only safe built-ins are exposed — no require, process, fs, or network.
const sandboxObj = Object.create(null);
sandboxObj.console = { log, error: log, warn: log, info: log };
sandboxObj.JSON = JSON;
sandboxObj.Math = Math;
sandboxObj.Date = Date;
sandboxObj.RegExp = RegExp;
sandboxObj.Map = Map;
sandboxObj.Set = Set;
sandboxObj.Promise = Promise;
sandboxObj.String = String;
sandboxObj.Number = Number;
sandboxObj.Boolean = Boolean;
sandboxObj.Array = Array;
sandboxObj.Object = Object;
sandboxObj.setTimeout = setTimeout;
sandboxObj.clearTimeout = clearTimeout;
sandboxObj.setInterval = setInterval;
sandboxObj.clearInterval = clearInterval;
sandboxObj.isNaN = isNaN;
sandboxObj.isFinite = isFinite;
sandboxObj.parseInt = parseInt;
sandboxObj.parseFloat = parseFloat;
sandboxObj.encodeURI = encodeURI;
sandboxObj.decodeURI = decodeURI;
sandboxObj.encodeURIComponent = encodeURIComponent;
sandboxObj.decodeURIComponent = decodeURIComponent;

const context = vm.createContext(sandboxObj);

let solveFn = null;
let compileError = null;
try {
  // User code must define a top-level `solve(input)` function.
  solveFn = vm.runInContext(
    `(function() { __USER_CODE__ return solve; })()`,
    context,
    { filename: 'user.js' }
  );
} catch (e) {
  compileError = (e && e.message ? e.message : String(e));
}

let result;
let runtimeError;
let runtimeMs = 0;
if (!compileError && typeof solveFn === 'function') {
  const start = Date.now();
  try {
    result = solveFn(input);
  } catch (e) {
    runtimeError = (e && e.message ? e.message : String(e));
  }
  runtimeMs = Date.now() - start;
}

const status =
  compileError
    ? 'error'
    : typeof solveFn !== 'function'
      ? 'error'
      : runtimeError
        ? 'error'
        : 'ok';

process.stdout.write(
  JSON.stringify({
    status,
    result,
    error: compileError || runtimeError || undefined,
    output: output.join('\n'),
    runtimeMs,
  })
);
// Let the process exit naturally (no process.exit(0) so stdout flushes when piped).
