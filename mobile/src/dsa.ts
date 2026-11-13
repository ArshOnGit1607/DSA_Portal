import { Platform } from 'react-native';
import { openDatabaseAsync } from 'expo-sqlite';
import { ApiError, createDsa, nativeRefresh, REFRESH_TOKEN_KEY, type DsaApi, type LocalStore } from '@dsa-portal/ui-core';
import { secureStorage } from './adapters';
import { sqliteLocalStore } from './local-store';

// The Android emulator reaches the host computer at 10.0.2.2.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000')).replace(/\/$/, '');

let store: Promise<LocalStore> | null = null;
const localStore = () => (store ??= openDatabaseAsync('dsa.db').then(sqliteLocalStore));

/**
 * Problems the user opens are cached in SQLite; when the network is down they can still be read.
 * Judging always needs the server (no local sandbox on mobile).
 */
export function withProblemCache(http: DsaApi, local: () => Promise<LocalStore>): DsaApi {
  const cached = async <T extends { id: string }>(load: () => Promise<T>, fallbackId?: string) => {
    try {
      const p = await load();
      void local().then((s) => s.saveProblem(p as never)).catch(() => {});
      return p;
    } catch (e) {
      const offline = e instanceof ApiError && e.status === 0;
      const hit = offline && fallbackId ? await (await local()).getProblem(fallbackId) : null;
      if (hit) return hit as unknown as T;
      throw e;
    }
  };
  return {
    ...http,
    problem: (id) => cached(() => http.problem(id), id),
    randomProblem: (q) => cached(() => http.randomProblem(q)),
  };
}

export const dsa = createDsa({
  baseUrl: API_URL,
  // No cookie jar we control: the refresh token lives in SecureStore and goes out as a Cookie header.
  refresh: nativeRefresh(API_URL, secureStorage),
  onTokens: (t) => secureStorage.set(REFRESH_TOKEN_KEY, t.refreshToken),
  async onLogout() {
    const token = await secureStorage.get(REFRESH_TOKEN_KEY);
    await secureStorage.remove(REFRESH_TOKEN_KEY);
    if (token) await fetch(`${API_URL}/api/v1/auth/logout`, { method: 'POST', headers: { cookie: `refresh_token=${token}` } }).catch(() => {});
  },
  wrapApi: (http) => withProblemCache(http, localStore),
});
