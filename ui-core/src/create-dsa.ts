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

export interface DsaConfig extends AuthHooks {
  baseUrl: string;
  refresh?: ApiClientConfig['refresh'];
  fetch?: typeof fetch;
  retry?: ApiClientConfig['retry'];
  settingsStorage?: StateStorage;
  pollMs?: number;
  /** Desktop wraps the HTTP API to answer from its offline engine when there is no network. */
  wrapApi?: (http: DsaApi) => DsaApi;
}

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
  const stores = {
    auth: createAuthStore(api, client, cfg),
    problem: createProblemStore(api),
    submission: createSubmissionStore(api, { pollMs: cfg.pollMs, onJudged: () => void stats.getState().load() }),
    stats,
    settings: createSettingsStore(cfg.settingsStorage),
  };
  onAuthLost = () => stores.auth.getState().sessionLost();
  return { client, api, stores };
}

export type Dsa = ReturnType<typeof createDsa>;
