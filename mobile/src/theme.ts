import { useColorScheme } from 'react-native';
import { tokens } from '@dsa-portal/ui-core';

/** The same design tokens as web/desktop; numbers are density-independent pixels here. */
export function useTheme() {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { mode, c: tokens.color[mode], space: tokens.space, radius: tokens.radius, font: tokens.font };
}

export const MONO = 'Menlo'; // iOS; Android maps unknown families to its default, so we pass 'monospace' there
