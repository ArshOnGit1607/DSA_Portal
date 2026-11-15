// Builds the npm package: one bundled file (CLI + @dsa-portal/core + zod), so installing it needs no
// other package. Core finds its sandbox wrapper and problem bank relative to its own file
// (__dirname), so both are copied to where the bundle expects them: dist/sandbox-exec.js and problems/.
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
cpSync('../core/src/sandbox-exec.js', 'dist/sandbox-exec.js');
rmSync('problems', { recursive: true, force: true });
cpSync('../core/problems', 'problems', { recursive: true });
