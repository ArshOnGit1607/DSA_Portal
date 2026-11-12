import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Dsa } from '../create-dsa';
import type { LeaderboardEntry } from '../api/dsa-api';

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

export function useLeaderboard(limit = 20) {
  const { api } = useDsa();
  const [state, setState] = useState<{ entries: LeaderboardEntry[]; loading: boolean; error: string | null }>({
    entries: [],
    loading: true,
    error: null,
  });
  useEffect(() => {
    let live = true;
    api
      .leaderboard({ limit })
      .then((p) => live && setState({ entries: p.data, loading: false, error: null }))
      .catch((e: Error) => live && setState({ entries: [], loading: false, error: e.message }));
    return () => {
      live = false;
    };
  }, [api, limit]);
  return state;
}
