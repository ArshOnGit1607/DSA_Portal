import { setupServer } from 'msw/node';
import { createMockApi } from './handlers';

/** For tests (Vitest/Jest/jest-expo): `const { server, mock } = mockServer(); server.listen()`. */
export function mockServer(baseUrl = 'http://api.test') {
  const mock = createMockApi(baseUrl);
  return { server: setupServer(...mock.handlers), mock };
}
