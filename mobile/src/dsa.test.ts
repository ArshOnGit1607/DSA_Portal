import { ApiError, type DsaApi, type LocalStore, type Problem } from '@dsa-portal/ui-core';
import { withProblemCache } from './dsa';

const twoSum = { id: 'two-sum', title: 'Two Sum' } as Problem;

function memoryStore(): LocalStore & { saved: Problem[] } {
  const saved: Problem[] = [];
  return {
    saved,
    saveProblem: async (p) => void saved.push(p),
    getProblem: async (id) => saved.find((p) => p.id === id) ?? null,
    listProblems: async () => [],
  };
}

describe('withProblemCache', () => {
  it('caches problems that load, and serves them when the network is down', async () => {
    const local = memoryStore();
    let online = true;
    const http = {
      problem: async () => {
        if (!online) throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
        return twoSum;
      },
    } as unknown as DsaApi;
    const api = withProblemCache(http, async () => local);

    expect(await api.problem('two-sum')).toBe(twoSum);
    await new Promise((r) => setTimeout(r, 0));
    expect(local.saved).toEqual([twoSum]);

    online = false;
    expect(await api.problem('two-sum')).toEqual(twoSum);
    await expect(api.problem('other')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('does not hide real server errors behind the cache', async () => {
    const local = memoryStore();
    await local.saveProblem(twoSum);
    const http = { problem: async () => { throw new ApiError(404, 'NOT_FOUND', 'Problem not found'); } } as unknown as DsaApi;
    await expect(withProblemCache(http, async () => local).problem('two-sum')).rejects.toMatchObject({ status: 404 });
  });
});
