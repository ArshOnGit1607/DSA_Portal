import { io, type Socket } from 'socket.io-client';

/** `submission:result` per docs/websocket-events.md; `submissionId`/`status` are asked for in CR-022. */
export interface SubmissionResultEvent {
  submissionId?: string;
  problemId: string;
  passed: number;
  total: number;
}

export interface Realtime {
  connected(): boolean;
  /** Listen for connect/disconnect; returns unsubscribe. */
  onStatus(listener: (connected: boolean) => void): () => void;
  /** Resolves when the server announces a result for this submission (or false after timeoutMs). */
  waitForResult(target: { submissionId: string; problemId: string }, timeoutMs: number): Promise<boolean>;
  onLeaderboardUpdate(listener: () => void): () => void;
  close(): void;
}

/**
 * Socket.IO client for Person 1's events. Authenticates with `auth:join { token }` on every
 * (re)connect. Never required: if the socket is down, callers keep polling.
 */
export function createRealtime(url: string, getToken: () => string | null, connect: typeof io = io): Realtime {
  const socket: Socket = connect(url, { transports: ['websocket'], reconnectionDelayMax: 30_000 });
  const statusListeners = new Set<(c: boolean) => void>();
  const waiters = new Set<{ match(e: SubmissionResultEvent): boolean; done(ok: boolean): void }>();

  const status = (c: boolean) => statusListeners.forEach((l) => l(c));
  socket.on('connect', () => {
    socket.emit('auth:join', { token: getToken() });
    status(true);
  });
  socket.on('disconnect', () => status(false));
  socket.on('submission:result', (e: SubmissionResultEvent) => {
    for (const w of [...waiters]) if (w.match(e)) w.done(true);
  });

  return {
    connected: () => socket.connected,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => void statusListeners.delete(listener);
    },
    waitForResult({ submissionId, problemId }, timeoutMs) {
      return new Promise<boolean>((resolve) => {
        const w = {
          // Until events carry submissionId (CR-022), a result for the same problem wakes the poll; the poll then checks.
          match: (e: SubmissionResultEvent) => (e.submissionId ? e.submissionId === submissionId : e.problemId === problemId),
          done: (ok: boolean) => {
            clearTimeout(timer);
            waiters.delete(w);
            resolve(ok);
          },
        };
        const timer = setTimeout(() => w.done(false), timeoutMs);
        waiters.add(w);
      });
    },
    onLeaderboardUpdate(listener) {
      socket.on('leaderboard:update', listener);
      return () => void socket.off('leaderboard:update', listener);
    },
    close: () => void socket.close(),
  };
}
