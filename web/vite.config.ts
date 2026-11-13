/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the same build also loads inside Electron (app:// protocol).
  base: './',
  server: {
    port: 5173,
    // Same origin in dev: the HttpOnly refresh cookie (SameSite=Strict, Path=/api/v1/auth) just works.
    proxy: { '/api': 'http://localhost:3000', '/socket.io': { target: 'ws://localhost:3000', ws: true } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], env: { VITE_API_URL: 'http://api.test', VITE_REALTIME: '0' }, setupFiles: ['src/test-setup.ts'] },
});
