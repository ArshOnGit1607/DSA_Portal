import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Dsa } from '../create-dsa';
import type { DailyChallenge, LeaderboardEntry } from '../api/dsa-api';

const DsaContext = createContext<Dsa | null>(null);

export function DsaProvider({ value, children }: { value: Dsa; children: ReactNode }) {
  return <DsaContext.Provider value={value}>{children}</DsaContext.Provider>;
}

export function useDsa(): Dsa {
  const dsa = useContext(DsaContext);
  if (!dsa) throw new Error('useDsa must be used inside <DsaProvider>');
  return dsa;
}

export const useAuth = () => useStore(useDsa().stores.auth);
export const useProblem = () => useStore(useDsa().stores.problem);
export const useSubmission = () => useStore(useDsa().stores.submission);

/** Submission state plus `live`: true while results arrive by socket, false while the hook falls back to polling. */
export function useSubmissionStatus() {
  const { realtime } = useDsa();
  const live = useSyncExternalStore(
    (cb) => realtime?.onStatus(cb) ?? (() => {}),
    () => realtime?.connected() ?? false
  );
  return { ...useSubmission(), live };
}

/** Today's challenge; `error` is set (e.g. offline or none today) rather than thrown. */
export function useDailyChallenge() {
  const { api } = useDsa();
  const [state, setState] = useState<{ daily: DailyChallenge | null; loading: boolean; error: string | null }>({ daily: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    api.dailyChallenge().then(
      (daily) => live && setState({ daily, loading: false, error: null }),
      (e: Error) => live && setState({ daily: null, loading: false, error: e.message })
    );
    return () => {
      live = false;
    };
  }, [api]);
  return state;
}
export const useSettings = () => useStore(useDsa().stores.settings);

/** Loads stats on mount (and when `reloadKey` changes, e.g. after a judged submission). */
export function useStats(reloadKey?: unknown) {
  const store = useDsa().stores.stats;
  const state = useStore(store);
  useEffect(() => {
    void store.getState().load();
  }, [store, reloadKey]);
  return state;
}

/** First page of the leaderboard; reloads when the server pushes `leaderboard:update`. */
export function useLeaderboard(limit = 20) {
  const { api, realtime } = useDsa();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ entries: LeaderboardEntry[]; loading: boolean; error: string | null }>({
    entries: [],
    loading: true,
    error: null,
  });
  useEffect(() => realtime?.onLeaderboardUpdate(() => setTick((t) => t + 1)), [realtime]);
  useEffect(() => {
    let live = true;
    api
      .leaderboard({ limit })
      .then((p) => live && setState({ entries: p.data, loading: false, error: null }))
      .catch((e: Error) => live && setState({ entries: [], loading: false, error: e.message }));
    return () => {
      live = false;
    };
  }, [api, limit, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
