import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { mockServer } from '../mocks/node';
import { MOCK_PASSWORD, mockUser } from '../mocks/fixtures';
import { createDsa } from '../create-dsa';
import { DsaProvider, useAuth, useLeaderboard, useProblem, useStats, useSubmission } from './index';

const BASE = 'http://api.test';
const { server } = mockServer(BASE);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

describe('hooks against the mock server', () => {
  const dsa = createDsa({ baseUrl: BASE, pollMs: 1 });
  const wrapper = ({ children }: { children: ReactNode }) => <DsaProvider value={dsa}>{children}</DsaProvider>;

  it('useAuth logs in and re-renders', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.login(mockUser.email, MOCK_PASSWORD));
    expect(result.current).toMatchObject({ status: 'authenticated', user: { username: 'demo' } });
  });

  it('useProblem + useSubmission solve a problem', async () => {
    const { result } = renderHook(() => ({ p: useProblem(), s: useSubmission() }), { wrapper });
    await act(() => result.current.p.load('two-sum'));
    expect(result.current.p.problem?.title).toBe('Two Sum');
    await act(() => result.current.s.submit('two-sum', 'function solve() { return [0, 1]; }'));
    expect(result.current.s).toMatchObject({ status: 'done', current: { passed: 2 } });
  });

  it('useStats loads on mount', async () => {
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.summary).toMatchObject({ solved: 1, attempted: 1 }));
    expect(result.current.streak?.currentStreak).toBe(1);
  });

  it('useLeaderboard loads entries', async () => {
    const { result } = renderHook(() => useLeaderboard(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('hooks outside the provider fail loudly', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/DsaProvider/);
  });
});
