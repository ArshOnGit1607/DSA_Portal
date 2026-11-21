import { defineConfig } from '@playwright/test';

/**
 * Electron smoke test. CI: `npm run test:e2e:ci -w desktop` builds first; on Linux run it under
 * `xvfb-run -a` (Electron needs a display). Retries once on CI, reports as GitHub annotations.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { trace: 'retain-on-failure' },
});
