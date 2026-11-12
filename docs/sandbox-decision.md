# Sandbox Decision — Code Execution for DSA Portal

## Candidate approaches compared

| Criterion | child_process | worker_threads | vm (standalone) | isolated-vm |
|-----------|--------------|----------------|-----------------|-------------|
| Isolation / security | Separate OS process; can be killed from outside; no shared memory | Same process, separate V8 isolate; `terminate()` available | Same process, same event loop; **not a security boundary** per Node docs | Separate V8 isolate; native addon; not a full OS boundary |
| Memory limits | `--max-old-space-size` per process | `resourceLimits` (maxOldGenerationSizeMb) | None (inherits parent limit) | `memoryLimit` via isolate config |
| Timeouts | `execFileSync`/`spawn` timeout kills whole process | `setTimeout` + `worker.terminate()` | None (infinite loop blocks event loop) | None (infinite loop blocks isolate) |
| Performance | Process spawn overhead per run (~50–150 ms) | Faster spawn (isolate reuse) | Fastest (no spawn) | Fast (isolate reuse) |
| Windows/macOS/Linux | Excellent (Node core) | Good (Node core, some edge cases) | Excellent (Node core) | Fair (native addon must compile per platform) |
| Electron compatibility | Excellent (works in main/renderer) | Good (main process; renderer needs `nodeIntegration`/`contextBridge`) | Excellent | Poor (native addon rebuilds for Electron's Node version) |

## Why not the others

- **vm (standalone):** Node.js docs explicitly state `vm` is **not a security mechanism**. `process.exit`, `require`, infinite loops, and `while(true){}` block the parent process/event loop. Unsafe for untrusted user code.
- **isolated-vm:** Strong isolation but a native addon. Requires recompilation for every Electron runtime version and every platform (Windows/macOS/Linux), adding CI complexity and native build failures. Overkill for a 10-day MVP.
- **worker_threads:** Good middle ground but still shares the OS process. A native crash or `process.exit` in a thread can affect the parent. Electron renderer support requires extra configuration. Memory limits are weaker than OS-level process limits.

## Chosen: child_process + vm inside

Each test case runs in its own `child_process` (spawned `node sandbox-exec.js`). Inside that child:

1. `vm.Script` compiles and runs user code in a **sandbox context** with no `require`, `process`, `fs`, `network`, or `console` (we inject a capturing `console`).
2. `process.exit` is overridden to throw.
3. `execFileSync` `timeout` option is the hard backstop — kills the whole process on infinite loop.
4. `--max-old-space-size` enforces memory limit.
5. Captured stdout is truncated to an output-size cap.

**Trade-off:** Process spawn overhead per test (~50–150 ms). Acceptable for a DSA platform (few test cases per problem, low concurrency in MVP). Security and portability win over raw speed.
