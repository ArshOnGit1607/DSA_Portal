import { createStore } from 'zustand/vanilla';
import { toCssVars, type ThemeMode } from '@dsa-portal/ui-core';
import { dsa } from './platform';

/** The mode actually shown (system resolved): Monaco and the charts re-render when it changes. */
export const themeMode = createStore<{ mode: ThemeMode }>(() => ({ mode: 'light' }));

const media = window.matchMedia?.('(prefers-color-scheme: dark)');

/** Writes the design tokens for the chosen (or system) mode onto :root. */
function apply() {
  const pref = dsa.stores.settings.getState().theme;
  const mode: ThemeMode = pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(toCssVars(mode))) root.style.setProperty(k, v);
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  themeMode.setState({ mode });
}

export function startTheme() {
  apply();
  dsa.stores.settings.subscribe(apply);
  media?.addEventListener('change', apply);
}
