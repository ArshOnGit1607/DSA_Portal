import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** What the CLI remembers between runs: which problems were attempted and solved, and how many submissions. */
export interface CliStats {
  attempted: string[];
  solved: string[];
  submissions: number;
}

export const DEFAULT_STATS_FILE = path.join(os.homedir(), '.dsa-practice', 'stats.json');

const empty = (): CliStats => ({ attempted: [], solved: [], submissions: 0 });

const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Reads the stats file. A missing file means a first run. A file that is not valid stats is moved
 * aside to `<file>.bak` (never overwritten) and the CLI starts fresh.
 */
export function loadStats(file = DEFAULT_STATS_FILE): { stats: CliStats; warning?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { stats: empty() };
  }
  try {
    const s = JSON.parse(raw) as Partial<CliStats>;
    if (isIdList(s.attempted) && isIdList(s.solved) && Number.isInteger(s.submissions)) {
      return { stats: { attempted: s.attempted, solved: s.solved, submissions: s.submissions! } };
    }
  } catch {
    // fall through: unreadable JSON is handled like invalid stats
  }
  fs.renameSync(file, `${file}.bak`);
  return {
    stats: empty(),
    warning: `Stats file was unreadable; moved it to ${file}.bak and started fresh.`,
  };
}

/** Writes to a temp file then renames it over the old one, so a crash mid-write never corrupts the stats. */
export function saveStats(stats: CliStats, file = DEFAULT_STATS_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stats, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/** Pure update for one judged submission. */
export function recordSubmission(stats: CliStats, problemId: string, passed: boolean): CliStats {
  const add = (ids: string[]) => (ids.includes(problemId) ? ids : [...ids, problemId]);
  return {
    attempted: add(stats.attempted),
    solved: passed ? add(stats.solved) : stats.solved,
    submissions: stats.submissions + 1,
  };
}
