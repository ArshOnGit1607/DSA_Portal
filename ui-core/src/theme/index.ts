import tokens from './tokens.json';

export { tokens };
export type ThemeMode = 'light' | 'dark';
export type ColorName = keyof typeof tokens.color.light;

/**
 * Tokens as CSS custom properties for the web/desktop renderer, e.g. `--color-primary`, `--space-md: 12px`.
 * React Native imports `tokens` directly (numbers are density-independent pixels there).
 */
export function toCssVars(mode: ThemeMode): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens.color[mode])) vars[`--color-${k}`] = v;
  for (const [k, v] of Object.entries(tokens.space)) vars[`--space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(tokens.radius)) vars[`--radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(tokens.font.size)) vars[`--font-${k}`] = `${v}px`;
  vars['--font-body'] = tokens.font.family.body;
  vars['--font-mono'] = tokens.font.family.mono;
  return vars;
}

/** WCAG relative-luminance contrast ratio of two #rrggbb colours (AA body text needs >= 4.5). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
