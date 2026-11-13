// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { createRealtime, type Realtime } from './realtime';
import { createDsa } from './create-dsa';
import type { DsaApi, Submission } from './api/dsa-api';

let io: Server;
let url = '';
const joins: unknown[] = [];

beforeAll(async () => {
  const http = createServer();
  io = new Server(http);
  io.on('connection', (s) => s.on('auth:join', (p) => joins.push(p)));
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(() => io.close());

const connected = (rt: Realtime) => vi.waitFor(() => expect(rt.connected()).toBe(true));

describe('realtime (Socket.IO)', () => {
  it('authenticates with auth:join and resolves a waiter on submission:result', async () => {
    const rt = createRealtime(url, () => 'tok-1');
    await connected(rt);
    await vi.waitFor(() => expect(joins).toContainEqual({ token: 'tok-1' }));
    const other = rt.waitForResult({ submissionId: 's2', problemId: 'p2' }, 200);
    const mine = rt.waitForResult({ submissionId: 's1', problemId: 'p1' }, 5000);
    io.emit('submission:result', { submissionId: 's1', problemId: 'p1', passed: 1, total: 1 });
    expect(await mine).toBe(true);
    expect(await other).toBe(false); // timed out: not its event
    rt.close();
  });

  it('matches by problemId while events carry no submissionId (CR-022)', async () => {
    const rt = createRealtime(url, () => null);
    await connected(rt);
    const w = rt.waitForResult({ submissionId: 's9', problemId: 'two-sum' }, 5000);
    io.emit('submission:result', { problemId: 'two-sum', passed: 0, total: 3 });
    expect(await w).toBe(true);
    rt.close();
  });

  it('a pushed result ends the wait at once; with the socket gone the store still polls', async () => {
    let polls = 0;
    const judged = { id: 's1', problemId: 'p', userId: 'u', status: 'judged', passed: 1, total: 1, createdAt: '' } as Submission;
    const api = {
      submit: async () => ({ submissionId: 's1', status: 'queued' }),
      submission: async () => (++polls >= 2 ? judged : { ...judged, status: 'queued' }),
      stats: async () => ({}),
      streak: async () => ({}),
    } as unknown as DsaApi;

    // Socket up: the safety poll is 5 s, so finishing fast proves the push woke it.
    const live = createDsa({ baseUrl: url, refresh: async () => null, wrapApi: () => api, realtimeUrl: url, pollMs: 60_000 });
    await connected(live.realtime!);
    const t0 = Date.now();
    const done = live.stores.submission.getState().submit('p', 'code');
    setTimeout(() => io.emit('submission:result', { submissionId: 's1', problemId: 'p', passed: 1, total: 1 }), 100);
    await done;
    expect(live.stores.submission.getState().status).toBe('done');
    expect(Date.now() - t0).toBeLessThan(2000);
    live.realtime!.close();

    // No socket: plain polling at pollMs.
    polls = 0;
    const offline = createDsa({ baseUrl: url, refresh: async () => null, wrapApi: () => api, pollMs: 5 });
    await offline.stores.submission.getState().submit('p', 'code');
    expect(offline.stores.submission.getState()).toMatchObject({ status: 'done', current: { status: 'judged' } });
  });

  it('forwards leaderboard:update and reports connection status', async () => {
    const rt = createRealtime(url, () => null);
    const status: boolean[] = [];
    rt.onStatus((c) => status.push(c));
    await connected(rt);
    const updated = new Promise<void>((r) => rt.onLeaderboardUpdate(() => r()));
    io.emit('leaderboard:update', { leaderboard: [] });
    await updated;
    io.disconnectSockets();
    await vi.waitFor(() => expect(status).toContain(false));
    rt.close();
  });
});
