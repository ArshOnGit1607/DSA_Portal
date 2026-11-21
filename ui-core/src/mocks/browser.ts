import { setupWorker } from 'msw/browser';
import { createMockApi } from './handlers';

/** Dev mode without a server: `VITE_MOCK=1 npm run dev -w web`. Needs public/mockServiceWorker.js (`npx msw init public`). */
export async function startMockWorker(baseUrl = '') {
  const mock = createMockApi(baseUrl);
  await setupWorker(...mock.handlers).start({ onUnhandledRequest: 'bypass' });
  return mock;
}
