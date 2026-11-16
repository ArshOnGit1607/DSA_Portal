import * as readline from 'readline';

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const sgr = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  bold: sgr(1),
  dim: sgr(2),
  red: sgr(31),
  green: sgr(32),
  yellow: sgr(33),
  cyan: sgr(36),
};

export function progressBar(done: number, total: number, width = 20): string {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  return c.green('█'.repeat(filled)) + c.dim('░'.repeat(width - filled));
}

/** Pure menu key handling: where the cursor goes, and whether the key ends the menu. */
export function handleKey(
  index: number,
  count: number,
  key: string
): { index: number; done?: 'pick' | 'back' } {
  if (key === 'up' || key === 'k') return { index: (index - 1 + count) % count };
  if (key === 'down' || key === 'j') return { index: (index + 1) % count };
  // 'enter' (\n) is what a typed-ahead Enter arrives as if it was pressed before raw mode was on.
  if (key === 'return' || key === 'enter') return { index, done: 'pick' };
  if (key === 'escape' || key === 'q') return { index, done: 'back' };
  const n = /^[1-9]$/.test(key) ? Number(key) : 0;
  if (n >= 1 && n <= count) return { index: n - 1, done: 'pick' };
  return { index };
}

// Piped stdin is read through one async iterator: it buffers lines, so none are lost between prompts.
let piped: AsyncIterableIterator<string> | undefined;
async function nextPipedLine(): Promise<string | null> {
  piped ??= readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  const r = await piped.next();
  return r.done ? null : r.value;
}

export interface Option<T> {
  label: string;
  value: T;
}

/**
 * Arrow-key menu (up/down or j/k, Enter, 1-9 to jump, q/Esc to go back). Resolves null on "back".
 * When stdin is not a terminal it falls back to a numbered prompt, so the CLI can still be scripted.
 */
export async function select<T>(title: string, options: Option<T>[]): Promise<T | null> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    console.log(`\n${title}`);
    options.forEach((o, i) => console.log(`${i + 1}. ${o.label}`));
    stdout.write('Select (number): ');
    const line = await nextPipedLine();
    return options[parseInt(line ?? '', 10) - 1]?.value ?? null;
  }

  let index = 0;
  const draw = (first: boolean) => {
    if (!first) stdout.write(`\x1b[${options.length}A\x1b[J`);
    options.forEach((o, i) =>
      stdout.write(i === index ? `${c.cyan('❯')} ${c.bold(o.label)}\n` : `  ${o.label}\n`)
    );
  };
  stdout.write(`\n${c.bold(title)} ${c.dim('(↑/↓ move, Enter select, q back)')}\n\x1b[?25l`);
  draw(true);

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    const restore = () => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\x1b[?25h');
    };
    const onKey = (_s: string, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
      if (key.ctrl && key.name === 'c') {
        restore();
        process.exit(130);
      }
      const r = handleKey(index, options.length, key.name ?? key.sequence ?? '');
      index = r.index;
      if (!r.done) return draw(false);
      restore();
      // Collapse the menu to one line showing what was chosen.
      stdout.write(`\x1b[${options.length + 1}A\x1b[J`);
      const picked = r.done === 'pick' ? options[index] : undefined;
      stdout.write(`${c.bold(title)} ${picked ? c.cyan(picked.label) : c.dim('back')}\n`);
      resolve(picked ? picked.value : null);
    };
    stdin.on('keypress', onKey);
  });
}

/** Reads pasted lines until a line that is exactly `end`. Resolves null if cancelled (Ctrl-C) or stdin ends first. */
export async function readBlock(end = 'END'): Promise<string | null> {
  const lines: string[] = [];
  if (!process.stdin.isTTY) {
    for (;;) {
      const line = await nextPipedLine();
      if (line === null) return null;
      if (line === end) return lines.join('\n');
      lines.push(line);
    }
  }
  // One interface for the whole paste: a pasted chunk holds many lines and a per-line interface would drop them.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(c.dim('> '));
  rl.prompt();
  return new Promise((resolve) => {
    let finished = false;
    rl.on('line', (line) => {
      if (line === end) {
        finished = true;
        rl.close();
      } else {
        lines.push(line);
        rl.prompt();
      }
    });
    rl.on('SIGINT', () => rl.close());
    rl.on('close', () => resolve(finished ? lines.join('\n') : null));
  });
}
