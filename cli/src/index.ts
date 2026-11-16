import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  PROBLEMS,
  selectRandomProblem,
  submitCode,
  HintService,
  SolutionService,
  type Problem,
  type ExecutionResult,
  type Topic,
  type Difficulty,
} from '@dsa-portal/core';
import { DEFAULT_STATS_FILE, loadStats, recordSubmission, saveStats } from './stats';
import { c, clearScreen, leaveScreen, progressBar, readBlock, select, type Option } from './ui';

// Same validated problem set the server's in-memory mode uses (core/problems).
const problems: Problem[] = PROBLEMS;
const recentIds: string[] = [];
const MAX_RECENT = 5;
// Persisted to ~/.dsa-practice/stats.json after every submission, so progress survives restarts.
const loaded = loadStats();
let stats = loaded.stats;

const hintService = new HintService();
const solutionService = new SolutionService();

const DRAFTS_DIR = path.join(path.dirname(DEFAULT_STATS_FILE), 'drafts');
const EDITOR =
  process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
const difficultyColor = { Easy: c.green, Medium: c.yellow, Hard: c.red };
const colorDifficulty = (d: Difficulty) => difficultyColor[d](d);
// Colour line by line: the screen wraps and scrolls lines one at a time.
const code = (text: string) => text.split('\n').map(c.cyan).join('\n');
const isSolved = (p: Problem) => stats.solved.includes(p.id);

type HomeChoice = { topic: Topic } | { problem: Problem } | 'stats';

/** Home screen: topics with progress, stats, and a search over every problem. */
function home(): Promise<HomeChoice | null> {
  const topics = [...new Set(problems.map((p) => p.topic))];
  const rows: Option<HomeChoice>[] = topics.map((topic) => {
    const inTopic = problems.filter((p) => p.topic === topic);
    return {
      label: topic,
      value: { topic },
      hint: `${inTopic.filter(isSolved).length}/${inTopic.length} solved`,
    };
  });
  rows.push({ label: 'My stats', value: 'stats', hint: `${stats.submissions} submissions` });

  return select('Topics', rows, {
    tag: `${stats.solved.length}/${problems.length} solved`,
    back: 'Quit',
    search: {
      placeholder: 'Search problems…',
      find: (query) => {
        const q = query.toLowerCase();
        return problems
          .filter((p) => `${p.title} ${p.topic} ${p.difficulty}`.toLowerCase().includes(q))
          .map((p) => ({
            label: `${isSolved(p) ? '✓ ' : ''}${p.title}`,
            value: { problem: p },
            hint: `${p.difficulty} · ${p.topic}`,
          }));
      },
    },
  });
}

async function randomProblem(topic: Topic): Promise<Problem | null> {
  const inTopic = problems.filter((p) => p.topic === topic);
  const difficulties = [...new Set(inTopic.map((p) => p.difficulty))];
  const difficulty = await select<Difficulty>(
    topic,
    difficulties.map((d) => {
      const n = inTopic.filter((p) => p.difficulty === d).length;
      return { label: colorDifficulty(d), value: d, hint: `${n} problem${n === 1 ? '' : 's'}` };
    }),
    { tag: 'difficulty' }
  );
  if (!difficulty) return null;
  return selectRandomProblem(problems, { topic, difficulty, recentIds }) ?? null;
}

/** Opens the user's editor on a per-problem draft (kept between attempts). */
function editInEditor(p: Problem): { code: string } | { message: string } {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const file = path.join(DRAFTS_DIR, `${p.id}.js`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, p.starterCode + '\n');
  // shell: true so values like EDITOR="code -w" work.
  const r = spawnSync(`${EDITOR} "${file}"`, { stdio: 'inherit', shell: true });
  if (r.error || r.status !== 0) {
    return {
      message: c.red(`Could not run editor "${EDITOR}". Set $EDITOR, or use "Paste solution".`),
    };
  }
  const draft = fs.readFileSync(file, 'utf8');
  if (draft.trim() === p.starterCode.trim()) {
    return { message: c.yellow('Draft is still the starter code; nothing submitted.') };
  }
  return { code: draft };
}

async function pasteSolution(): Promise<{ code: string } | { message: string }> {
  clearScreen();
  console.log('\nPaste your JavaScript solution below.');
  console.log("Type 'END' on its own line when finished.");
  const pasted = await readBlock();
  return pasted === null
    ? { message: c.yellow('Cancelled; nothing submitted.') }
    : { code: pasted };
}

/** Runs the submission, records it in the stats, and returns the result as text for the screen. */
function judge(p: Problem, userCode: string): string {
  const result: ExecutionResult = submitCode({ problem: p, userCode });
  stats = recordSubmission(stats, p.id, result.status === 'passed');
  saveStats(stats);
  recentIds.unshift(p.id);
  if (recentIds.length > MAX_RECENT) recentIds.pop();

  const score = `${result.perTest.filter((r) => r.passed).length}/${result.perTest.length}`;
  const out: string[] = [];
  if (result.status === 'passed') out.push(c.green(`✅ All ${score} test cases passed!`));
  else if (result.status === 'timeout') {
    out.push(c.yellow(`⏱️  Submission timed out (${score} passed).`));
  } else if (result.status === 'error') out.push(c.red(`💥 Submission errored (${score} passed).`));
  else out.push(c.red(`❌ ${score} test cases passed.`));
  out.push('');
  result.perTest.forEach((r: ExecutionResult['perTest'][number], i: number) => {
    out.push(r.passed ? c.green(`✅ Test ${i + 1}: passed`) : c.red(`❌ Test ${i + 1}: failed`));
    if (!r.passed) {
      out.push(`   expected: ${JSON.stringify(r.expected)}`);
      out.push(`   actual:   ${JSON.stringify(r.actual)}`);
      if (r.error) out.push(`   error: ${r.error}`);
    }
  });
  return out.join('\n');
}

/** Stays on one problem until the user goes back, so they can read a hint and retry. */
async function solveProblem(p: Problem) {
  const header = `${c.bold(p.title)}  ${colorDifficulty(p.difficulty)}  ${c.dim(p.topic)}`;
  const statement = `${p.description}\n\n${c.dim('Starter code')}\n${code(p.starterCode)}`;
  const hints: string[] = [];
  let view = statement;
  for (;;) {
    const action = await select(
      'What next?',
      [
        {
          label: 'Write solution in editor',
          value: 'edit',
          hint: path.basename(EDITOR.split(' ')[0]),
        },
        { label: 'Paste solution', value: 'paste', hint: 'finish with END' },
        { label: 'Next hint', value: 'hint', hint: `${hints.length} shown` },
        { label: 'Reference solution', value: 'solution' },
        { label: 'Show problem', value: 'show' },
        { label: 'Back to topics', value: 'back' },
      ],
      { body: `${header}\n\n${view}`, tag: isSolved(p) ? 'solved' : undefined }
    );
    if (action === 'edit' || action === 'paste') {
      const r = action === 'edit' ? editInEditor(p) : await pasteSolution();
      view = 'code' in r ? judge(p, r.code) : r.message;
    } else if (action === 'hint') {
      const hint = hintService.getHint(p, hints.length + 1);
      if (hint) hints.push(hint.content);
      view =
        hints.map((h, i) => `${c.yellow(`Hint ${i + 1}:`)} ${h}`).join('\n\n') +
        (hint ? '' : c.dim('\n\nNo more hints.'));
    } else if (action === 'solution') {
      const sol = solutionService.getSolution(p);
      view = `${c.dim('Reference solution')}\n${code(sol.code)}`;
      if (sol.explanation) view += `\n\n${sol.explanation}`;
    } else if (action === 'show') view = statement;
    else return;
  }
}

function statsView(): string {
  const title = (id: string) => problems.find((p) => p.id === id)?.title ?? id;
  const unsolved = stats.attempted.filter((id) => !stats.solved.includes(id));
  return [
    `${c.bold('Your stats')}  ${progressBar(stats.solved.length, problems.length)}  ${stats.solved.length}/${problems.length}`,
    '',
    `Submissions: ${stats.submissions}`,
    `Solved (${stats.solved.length}): ${stats.solved.map(title).join(', ') || 'none yet'}`,
    `Attempted, not solved (${unsolved.length}): ${unsolved.map(title).join(', ') || 'none'}`,
  ].join('\n');
}

async function main() {
  const tty = process.stdin.isTTY; // on a terminal the full-screen UI would wipe the warning, so it is shown on exit
  if (loaded.warning && !tty) console.log(loaded.warning);

  for (;;) {
    const choice = await home();
    if (choice === null) break;
    if (choice === 'stats') {
      await select('Stats', [{ label: 'Back', value: true }], { body: statsView() });
    } else {
      const p = 'problem' in choice ? choice.problem : await randomProblem(choice.topic);
      if (p) await solveProblem(p);
    }
  }
  leaveScreen();
  if (loaded.warning && tty) console.log(c.yellow(loaded.warning));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    leaveScreen();
    console.error(err);
    process.exit(1);
  });
