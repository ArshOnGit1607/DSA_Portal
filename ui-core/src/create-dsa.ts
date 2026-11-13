import { createApiClient, type ApiClientConfig } from './api/client';
import { createHttpApi, type DsaApi } from './api/dsa-api';
import { browserRefresh } from './auth/refresh';
import {
  createAuthStore,
  createProblemStore,
  createSettingsStore,
  createStatsStore,
  createSubmissionStore,
  type AuthHooks,
} from './stores';
import type { StateStorage } from 'zustand/middleware';
import { createRealtime, type Realtime } from './realtime';

export interface DsaConfig extends AuthHooks {
  baseUrl: string;
  refresh?: ApiClientConfig['refresh'];
  fetch?: typeof fetch;
  retry?: ApiClientConfig['retry'];
  settingsStorage?: StateStorage;
  pollMs?: number;
  /** Desktop wraps the HTTP API to answer from its offline engine when there is no network. */
  wrapApi?: (http: DsaApi) => DsaApi;
  /** Socket.IO origin for live results ('' = same origin); omit to only poll. */
  realtimeUrl?: string;
  /** For tests: a Realtime instead of a real socket. */
  realtime?: Realtime;
}

/** With a live socket the poll is a slow safety net (5 s) that a pushed result cuts short. */
const SOCKET_SAFETY_POLL_MS = 5000;

/** One call per app: API client + typed API + all stores, wired together. */
export function createDsa(cfg: DsaConfig) {
  let onAuthLost = () => {};
  const client = createApiClient({
    baseUrl: cfg.baseUrl,
    refresh: cfg.refresh ?? browserRefresh(cfg.baseUrl, cfg.fetch),
    fetch: cfg.fetch,
    retry: cfg.retry,
    onAuthLost: () => onAuthLost(),
  });
  const http = createHttpApi(client);
  const api = cfg.wrapApi ? cfg.wrapApi(http) : http;
  const stats = createStatsStore(api);
  const realtime = cfg.realtime ?? (cfg.realtimeUrl !== undefined ? createRealtime(cfg.realtimeUrl, client.getAccessToken) : null);
  const pollMs = cfg.pollMs ?? 750;
  const waitBetweenPolls = (t: { submissionId: string; problemId: string }) =>
    realtime?.connected() ? realtime.waitForResult(t, SOCKET_SAFETY_POLL_MS) : new Promise((r) => setTimeout(r, pollMs));
  const stores = {
    auth: createAuthStore(api, client, cfg),
    problem: createProblemStore(api),
    submission: createSubmissionStore(api, { pollMs, waitBetweenPolls, onJudged: () => void stats.getState().load() }),
    stats,
    settings: createSettingsStore(cfg.settingsStorage),
  };
  onAuthLost = () => stores.auth.getState().sessionLost();
  return { client, api, stores, realtime };
}

export type Dsa = ReturnType<typeof createDsa>;
