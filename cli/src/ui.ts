import * as readline from 'readline';

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const sgr = (code: number | string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  bold: sgr(1),
  dim: sgr(2),
  red: sgr(31),
  green: sgr(32),
  yellow: sgr(33),
  cyan: sgr(36),
  purple: sgr('38;5;141'),
  orange: sgr('38;5;215'),
};
const RESET = useColor ? '\x1b[0m' : '';
// eslint-disable-next-line no-control-regex
const SGR = /(\x1b\[[0-9;]*m)/;
/** Length as shown on screen (colour codes take no room). */
const visLen = (s: string) => s.split(SGR).reduce((n, part, i) => (i % 2 ? n : n + part.length), 0);

/** Pads or cuts `s` to exactly `w` visible characters, keeping colour codes intact. */
export function fit(s: string, w: number): string {
  const len = visLen(s);
  if (len <= w) return s + ' '.repeat(w - len);
  let out = '';
  let room = Math.max(0, w - 1);
  s.split(SGR).forEach((part, i) => {
    if (i % 2) out += part;
    else {
      out += part.slice(0, room);
      room -= Math.min(room, part.length);
    }
  });
  return `${out}…${RESET}`;
}

/** Word-wraps every line of `text` to `w` visible characters, keeping each line's indentation. */
export function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (visLen(line) <= w) {
      out.push(line);
      continue;
    }
    const indent = /^\s*/.exec(line)![0];
    let cur = '';
    for (const word of line.slice(indent.length).split(' ')) {
      if (cur && visLen(indent + cur) + 1 + visLen(word) > w) {
        out.push(indent + cur);
        cur = word;
      } else cur = cur ? `${cur} ${word}` : word;
    }
    out.push(indent + cur);
  }
  return out.map((l) => (visLen(l) > w ? fit(l, w) : l));
}

/** `left` and `right` pushed to the two ends of a `w`-wide row. */
const spread = (left: string, right: string, w: number) =>
  left + ' '.repeat(Math.max(1, w - visLen(left) - visLen(right))) + right;

const VERSION = process.env.DSA_CLI_VERSION ?? 'dev'; // set by build.mjs from package.json
const LOGO = [
  '██████╗ ███████╗ █████╗ ',
  '██╔══██╗██╔════╝██╔══██╗',
  '██║  ██║███████╗███████║',
  '██║  ██║╚════██║██╔══██║',
  '██████╔╝███████║██║  ██║',
  '╚═════╝ ╚══════╝╚═╝  ╚═╝',
];
const LOGO_W = LOGO[0].length;

// The UI runs in the terminal's alternate screen, so quitting gives the user their scrollback back.
let screenHooked = false;
export function leaveScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?25h\x1b[?1049l');
}
export function clearScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[H\x1b[J');
}

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
  /** Shown dim at the right edge of the row. */
  hint?: string;
}

export interface SelectOpts<T> {
  /** Text shown above the menu instead of the logo (a problem, results, stats). Scrolls with d/u if too long. */
  body?: string;
  /** Short status shown in the panel's top border. */
  tag?: string;
  /** Footer label for q. */
  back?: string;
  /** Adds a search box (press /): while there is a query, the rows are `find(query)`. */
  search?: { placeholder: string; find: (query: string) => Option<T>[] };
}

/**
 * Full-screen menu: up/down or j/k, Enter, 1-9 to jump, q/Esc to go back. Resolves null on "back".
 * When stdin is not a terminal it falls back to a numbered prompt, so the CLI can still be scripted.
 */
export async function select<T>(
  title: string,
  base: Option<T>[],
  o: SelectOpts<T> = {}
): Promise<T | null> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    if (o.body) console.log(`\n${o.body}`);
    console.log(`\n${title}`);
    base.forEach((opt, i) =>
      console.log(`${i + 1}. ${opt.label}${opt.hint ? `  (${opt.hint})` : ''}`)
    );
    stdout.write('Select (number): ');
    const line = await nextPipedLine();
    return base[parseInt(line ?? '', 10) - 1]?.value ?? null;
  }

  let options = base;
  let index = 0;
  let query: string | null = null; // null = search box not focused
  let scroll = 0;
  let maxScroll = 0;

  const draw = () => {
    const cols = stdout.columns || 80;
    const rows = stdout.rows || 24;
    const inner = Math.max(24, Math.min(64, cols - 2)) - 2;
    const pad = ' '.repeat(Math.max(0, (cols - inner - 2) >> 1));
    const boxed = (row: string) => `${pad}${c.dim('│')}${fit(row, inner)}${c.dim('│')}`;
    const edge = (l: string, r: string) => pad + c.dim(`${l}${'─'.repeat(inner)}${r}`);

    const panel: string[] = [];
    if (o.search) {
      const text = query === null ? c.dim(o.search.placeholder) : `${query}▏`;
      const keyHint = c.cyan(query === null ? '[ / ]' : '[ Esc ]');
      panel.push(
        edge('╭', '╮'),
        boxed(spread(` ${c.cyan('❯')} ${text}`, `${keyHint} `, inner)),
        edge('╰', '╯')
      );
    }
    const heading = query ? 'Results' : title;
    const tag = query ? `${options.length} found` : o.tag;
    const tail = tag ? ` ${c.cyan(`[ ${tag} ]`)} ${c.dim('─')}` : '';
    const fill = Math.max(0, inner - 5 - visLen(heading) - visLen(tail));
    panel.push(
      `${pad}${c.dim('╭─')} ${c.purple('✦')} ${c.bold(heading)} ${c.dim('─'.repeat(fill))}${tail}${c.dim('╮')}`
    );
    // Long lists show a window around the cursor.
    const optMax = Math.max(3, rows - panel.length - 3 - (o.body ? 6 : 2));
    const start = Math.max(0, Math.min(index - (optMax >> 1), options.length - optMax));
    options.slice(start, start + optMax).forEach((opt, i) => {
      const sel = start + i === index;
      const left = `  ${sel ? c.purple('❯') : c.dim('·')} ${sel ? c.bold(opt.label) : opt.label}`;
      panel.push(boxed(spread(left, opt.hint ? `${c.dim(opt.hint)} ` : '', inner)));
    });
    if (!options.length) panel.push(boxed(c.dim('  No matches')));
    panel.push(edge('╰', '╯'));

    const room = rows - 2 - panel.length; // rows above the panel; the footer takes the last two
    const top: string[] = [''];
    if (o.body) {
      const bw = Math.max(20, Math.min(cols - 4, 96));
      const bpad = ' '.repeat(Math.max(0, (cols - bw) >> 1));
      const body = wrap(o.body, bw).map((l) => bpad + l + RESET);
      const fitRows = Math.max(2, room - 2);
      if (body.length <= fitRows) {
        maxScroll = 0;
        top.push(...body);
      } else {
        const n = fitRows - 1;
        maxScroll = body.length - n;
        scroll = Math.min(scroll, maxScroll);
        const range = `lines ${scroll + 1}-${scroll + n} of ${body.length}`;
        top.push(...body.slice(scroll, scroll + n), bpad + c.dim(`── ${range} · d/u to scroll ──`));
      }
    } else if (room >= LOGO.length + 4 && cols >= LOGO_W + 2) {
      const lpad = ' '.repeat((cols - LOGO_W) >> 1);
      top.push(
        ...LOGO.map((l) => lpad + c.purple(l)),
        lpad + c.dim(`v${VERSION}`.padStart(LOGO_W)),
        ''
      );
    } else top.push(pad + c.bold(c.purple('DSA PRACTICE')));
    top.push('');

    const key = (k: string, label: string) => `${c.dim('[')}${c.orange(k)}${c.dim(']')} ${label}`;
    const keys = [
      key('↑↓', 'Move'),
      key('Enter', 'Select'),
      ...(o.search ? [key('/', 'Search')] : []),
      ...(maxScroll ? [key('d/u', 'Scroll')] : []),
      key('q', o.back ?? 'Back'),
    ].join('   ');
    const fpad = ' '.repeat(Math.max(0, (cols - visLen(keys)) >> 1));
    const lines = [...top, ...panel].slice(0, rows - 2).map((l) => `${l}\x1b[K`);
    stdout.write(`\x1b[H${lines.join('\n')}\x1b[J\x1b[${rows};1H${fpad}${keys}`);
  };

  if (!screenHooked) {
    screenHooked = true;
    process.once('exit', leaveScreen);
  }
  // Re-entered on every menu: an editor run in between switches back to the normal screen when it quits.
  stdout.write('\x1b[?1049h\x1b[?25l');
  draw();

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    const restore = () => {
      stdin.off('keypress', onKey);
      stdout.off('resize', draw);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\x1b[?25h');
    };
    const onKey = (
      s: string | undefined,
      key: { name?: string; ctrl?: boolean; sequence?: string }
    ) => {
      if (key.ctrl && key.name === 'c') {
        restore();
        process.exit(130);
      }
      const name = key.name ?? key.sequence ?? '';
      // Typing in the search box: every key is text except the ones that move or pick.
      if (query !== null && !['up', 'down', 'return', 'enter'].includes(name)) {
        if (name === 'escape') query = null;
        else if (name === 'backspace') query = query.slice(0, -1);
        else if (s && s.length === 1 && s >= ' ') query += s;
        options = query ? o.search!.find(query) : base;
        index = 0;
        return draw();
      }
      if (query === null) {
        if (o.search && s === '/') {
          query = '';
          return draw();
        }
        const dir = { d: 1, pagedown: 1, u: -1, pageup: -1 }[name];
        if (maxScroll && dir) {
          const step = Math.max(1, (stdout.rows || 24) >> 1);
          scroll = Math.max(0, Math.min(maxScroll, scroll + dir * step));
          return draw();
        }
      }
      if (!options.length) return;
      const r = handleKey(index, options.length, name);
      index = r.index;
      if (!r.done) return draw();
      restore();
      resolve(r.done === 'pick' ? options[index].value : null);
    };
    stdin.on('keypress', onKey);
    stdout.on('resize', draw);
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
