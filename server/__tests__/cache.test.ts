import type { Problem } from '@dsa-portal/core';
import { Cache, MemoryBackend, RedisBackend, type CacheBackend } from '../src/cache/cache';
import { CachedProblemRepository } from '../src/cache/cached-problem.repository';
import { InMemoryProblemRepository } from '../src/modules/problems/in-memory-problem.repository';
import { buildApp } from '../src/app';
import { dailyProblemId } from '../src/modules/daily/routes';

const counter = <T,>(value: T, ms = 0) => {
  const fn = jest.fn(async () => {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return value;
  });
  return fn;
};

describe('Cache (cache-aside)', () => {
  it('misses once, then hits; values round-trip as JSON', async () => {
    const cache = new Cache(new MemoryBackend());
    const load = counter({ a: [1, 2] });
    expect(await cache.getOrLoad('k', 60, load)).toEqual({ a: [1, 2] });
    expect(await cache.getOrLoad('k', 60, load)).toEqual({ a: [1, 2] });
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.metrics).toEqual({ hits: 1, misses: 1, errors: 0 });
  });

  it('caches "not found" (null) too, so missing ids do not hammer the database', async () => {
    const cache = new Cache(new MemoryBackend());
    const load = counter(null);
    await cache.getOrLoad('k', 60, load);
    expect(await cache.getOrLoad('k', 60, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('adds 0-10 % TTL jitter', async () => {
    for (const [jitter, ttl] of [[0, 100_000], [1, 110_000]] as const) {
      const b = new MemoryBackend();
      await new Cache(b, { jitter: () => jitter }).getOrLoad('k', 100, counter(1));
      expect(b.ttlOf('k')).toBeGreaterThan(ttl - 1000);
      expect(b.ttlOf('k')).toBeLessThanOrEqual(ttl);
    }
  });

  it('single flight: 50 concurrent misses in one process load once', async () => {
    const cache = new Cache(new MemoryBackend());
    const load = counter('v', 20);
    const all = await Promise.all(Array.from({ length: 50 }, () => cache.getOrLoad('hot', 60, load)));
    expect(new Set(all)).toEqual(new Set(['v']));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stampede lock: two processes sharing Redis load once; the other waits for the value', async () => {
    const shared = new MemoryBackend();
    const [p1, p2] = [new Cache(shared, { pollMs: 5 }), new Cache(shared, { pollMs: 5 })];
    const load1 = counter('from-1', 40);
    const load2 = counter('from-2', 40);
    expect(await Promise.all([p1.getOrLoad('hot', 60, load1), p2.getOrLoad('hot', 60, load2)])).toEqual(['from-1', 'from-1']);
    expect(load2).not.toHaveBeenCalled();
  });

  it('a waiter gives up after waitMs and loads by itself (leader died)', async () => {
    const shared = new MemoryBackend();
    await shared.setNx('dsa:v1:hot:lock', '1', 60_000); // a crashed leader's lock
    const load = counter('v');
    expect(await new Cache(shared, { pollMs: 5, waitMs: 30 }).getOrLoad('dsa:v1:hot', 60, load)).toBe('v');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('Redis down: every call is served from the loader and errors are counted', async () => {
    const down: CacheBackend = { get: () => Promise.reject(new Error('ECONNREFUSED')), set: () => Promise.reject(new Error('x')), setNx: () => Promise.reject(new Error('x')), del: () => Promise.reject(new Error('x')), incr: () => Promise.reject(new Error('x')) };
    const cache = new Cache(down);
    const load = counter(7);
    expect(await cache.getOrLoad('k', 60, load)).toBe(7);
    expect(await cache.getOrLoad('k', 60, load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.metrics.errors).toBeGreaterThan(0);
    await expect(cache.bumpGeneration('x')).resolves.toBeUndefined();
  });

  it('no backend (REDIS_URL unset) = no caching at all', async () => {
    const load = counter(1);
    const cache = new Cache(null);
    await cache.getOrLoad('k', 60, load);
    await cache.getOrLoad('k', 60, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('renders Prometheus counters', async () => {
    const cache = new Cache(new MemoryBackend());
    await cache.getOrLoad('k', 60, counter(1));
    expect(cache.renderMetrics()).toContain('dsa_cache_requests_total{result="miss"} 1');
  });
});

describe('CachedProblemRepository', () => {
  const setup = () => {
    const inner = new InMemoryProblemRepository();
    const spy = { findAll: jest.spyOn(inner, 'findAll'), findById: jest.spyOn(inner, 'findById') };
    return { repo: new CachedProblemRepository(inner, new Cache(new MemoryBackend())), spy };
  };

  it('caches lists per filter and problem detail', async () => {
    const { repo, spy } = setup();
    await repo.findAll({ topic: 'Arrays' });
    await repo.findAll({ topic: 'Arrays' });
    await repo.findAll();
    await repo.findById('two-sum');
    await repo.findById('two-sum');
    expect(spy.findAll).toHaveBeenCalledTimes(2);
    expect(spy.findById).toHaveBeenCalledTimes(1);
  });

  it('admin save/delete invalidate the problem and every list (new generation)', async () => {
    const { repo, spy } = setup();
    const p = (await repo.findById('two-sum')) as Problem;
    const before = (await repo.findAll()).length;
    await repo.save({ ...p, title: 'Two Sum v2' });
    expect((await repo.findById('two-sum'))?.title).toBe('Two Sum v2');
    await repo.delete('two-sum');
    expect(await repo.findById('two-sum')).toBeNull();
    expect((await repo.findAll()).length).toBe(before - 1);
    expect(spy.findAll).toHaveBeenCalledTimes(2);
  });
});

describe('leaderboard + daily challenge routes', () => {
  it('serve from the cache and count hits on /metrics', async () => {
    const backend = new MemoryBackend();
    const page = jest.fn(async () => [{ userId: 'u1', username: 'ada', solved: 3, totalScore: 6, rank: 1 }]);
    const app = buildApp({ logger: false, cache: new Cache(backend), leaderboard: { page } });
    await app.ready();
    const first = await app.inject({ url: '/api/v1/leaderboard?limit=1' });
    await app.inject({ url: '/api/v1/leaderboard?limit=1' });
    expect(first.json()).toEqual({ data: [{ userId: 'u1', username: 'ada', solved: 3, totalScore: 6, rank: 1 }], nextCursor: null });
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 2); // one extra row to know if there is a next page

    const token = app.jwt.sign({ sub: 'u1' });
    const daily = await app.inject({ url: '/api/v1/daily-challenge', headers: { authorization: `Bearer ${token}` } });
    expect(daily.json()).toMatchObject({ date: new Date().toISOString().slice(0, 10), problem: { id: daily.json().problemId } });

    const metrics = await app.inject({ url: '/metrics' });
    expect(metrics.headers['content-type']).toMatch(/^text\/plain/);
    expect(metrics.body).toMatch(/dsa_cache_requests_total\{result="hit"\} [1-9]/);
    await app.close();
  });

  it('daily challenge: pinned problem wins, otherwise a stable rotation by UTC day', async () => {
    const problems = new InMemoryProblemRepository();
    const ids = (await problems.findAll()).map((p) => p.id).sort();
    expect(await dailyProblemId('2026-11-13', { pinned: async () => 'pinned-one' }, problems)).toBe('pinned-one');
    const a = await dailyProblemId('2026-11-13', { pinned: async () => null }, problems);
    const b = await dailyProblemId('2026-11-14', { pinned: async () => null }, problems);
    expect(ids).toContain(a);
    expect(a).toBe(await dailyProblemId('2026-11-13', { pinned: async () => null }, problems));
    expect(b).toBe(ids[(ids.indexOf(a!) + 1) % ids.length]);
  });
});

/** Against a real Redis when one is configured: REDIS_TEST_URL=redis://localhost:6380 npx jest cache */
(process.env.REDIS_TEST_URL ? describe : describe.skip)('RedisBackend (real Redis)', () => {
  const backend = RedisBackend.fromUrl(process.env.REDIS_TEST_URL!);
  const ns = `test-${Date.now()}`;
  afterAll(() => backend.quit());

  it('does cache-aside, locking and generations on Redis', async () => {
    const [c1, c2] = [new Cache(backend, { prefix: ns, pollMs: 5 }), new Cache(backend, { prefix: ns, pollMs: 5 })];
    const load = counter({ n: 1 }, 30);
    const key = await c1.genKey('list', 'x');
    expect(await Promise.all([c1.getOrLoad(key, 5, load), c2.getOrLoad(key, 5, load)])).toEqual([{ n: 1 }, { n: 1 }]);
    expect(load).toHaveBeenCalledTimes(1);
    await c1.bumpGeneration('list');
    expect(await c1.genKey('list', 'x')).not.toBe(key);
    await c1.invalidate(key);
    expect(await backend.get(key)).toBeNull();
  });

  it('a dead Redis makes the cache a pass-through, not an outage', async () => {
    const dead = RedisBackend.fromUrl('redis://127.0.0.1:1');
    const cache = new Cache(dead);
    expect(await cache.getOrLoad('k', 5, counter('db'))).toBe('db');
    expect(cache.metrics.errors).toBeGreaterThan(0);
    dead.quit().catch(() => {});
  });
});
