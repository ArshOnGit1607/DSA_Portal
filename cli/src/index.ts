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
import { c, progressBar, readBlock, select } from './ui';

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
const difficultyColor = { Easy: c.green, Medium: c.yellow, Hard: c.red };
const colorDifficulty = (d: Difficulty) => difficultyColor[d](d);

async function chooseProblem(): Promise<Problem | null> {
  const topics = [...new Set(problems.map((p) => p.topic))];
  const topic = await select<Topic>(
    'Topic',
    topics.map((t) => ({ label: t, value: t }))
  );
  if (!topic) return null;

  const difficulties = [
    ...new Set(problems.filter((p) => p.topic === topic).map((p) => p.difficulty)),
  ];
  const difficulty = await select<Difficulty>(
    'Difficulty',
    difficulties.map((d) => ({ label: colorDifficulty(d), value: d }))
  );
  if (!difficulty) return null;

  const problem = selectRandomProblem(problems, { topic, difficulty, recentIds });
  if (!problem) console.log('No problems match that topic/difficulty.');
  return problem ?? null;
}

function displayProblem(p: Problem) {
  const rule = c.dim('─'.repeat(48));
  console.log(`\n${rule}`);
  console.log(`${c.bold(p.title)}  ${colorDifficulty(p.difficulty)}  ${c.dim(p.topic)}`);
  console.log(rule);
  console.log(p.description);
  console.log(`\n${c.dim('Starter code')}`);
  console.log(c.cyan(p.starterCode));
}

/** Opens the user's editor on a per-problem draft (kept between attempts). Returns null if there is nothing to submit. */
function editInEditor(p: Problem): string | null {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const file = path.join(DRAFTS_DIR, `${p.id}.js`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, p.starterCode + '\n');
  const editor =
    process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
  // shell: true so values like EDITOR="code -w" work.
  const r = spawnSync(`${editor} "${file}"`, { stdio: 'inherit', shell: true });
  if (r.error || r.status !== 0) {
    console.log(c.red(`Could not run editor "${editor}". Set $EDITOR, or use "Paste solution".`));
    return null;
  }
  const code = fs.readFileSync(file, 'utf8');
  if (code.trim() === p.starterCode.trim()) {
    console.log(c.yellow('Draft is still the starter code; nothing submitted.'));
    return null;
  }
  return code;
}

function judge(p: Problem, userCode: string) {
  const result: ExecutionResult = submitCode({ problem: p, userCode });
  stats = recordSubmission(stats, p.id, result.status === 'passed');
  saveStats(stats);
  const passedCount = result.perTest.filter((r) => r.passed).length;
  const score = `${passedCount}/${result.perTest.length}`;
  if (result.status === 'passed') {
    console.log(c.green(`\n✅ All ${score} test cases passed!`));
  } else if (result.status === 'timeout') {
    console.log(c.yellow(`\n⏱️  Submission timed out (${score} passed).`));
  } else if (result.status === 'error') {
    console.log(c.red(`\n💥 Submission errored (${score} passed).`));
  } else {
    console.log(c.red(`\n❌ ${score} test cases passed.`));
  }
  result.perTest.forEach((r: ExecutionResult['perTest'][number], i: number) => {
    console.log(r.passed ? c.green(`✅ Test ${i + 1}: passed`) : c.red(`❌ Test ${i + 1}: failed`));
    if (!r.passed) {
      console.log(`   expected: ${JSON.stringify(r.expected)}`);
      console.log(`   actual:   ${JSON.stringify(r.actual)}`);
      if (r.error) console.log(`   error: ${r.error}`);
    }
  });

  recentIds.unshift(p.id);
  if (recentIds.length > MAX_RECENT) recentIds.pop();
}

async function pasteSolution(): Promise<string | null> {
  console.log('\nPaste your JavaScript solution below.');
  console.log("Type 'END' on its own line when finished.");
  const code = await readBlock();
  if (code === null) console.log(c.yellow('Cancelled; nothing submitted.'));
  return code;
}

/** Stays on one problem until the user goes back, so they can read a hint and retry. */
async function solveProblem(p: Problem) {
  displayProblem(p);
  let hintLevel = 0;
  for (;;) {
    const action = await select('What next?', [
      { label: 'Write solution in editor', value: 'edit' },
      { label: 'Paste solution', value: 'paste' },
      { label: 'Next hint', value: 'hint' },
      { label: 'Reference solution', value: 'solution' },
      { label: 'Show problem again', value: 'show' },
      { label: 'Back to main menu', value: 'back' },
    ]);
    if (action === 'edit' || action === 'paste') {
      const code = action === 'edit' ? editInEditor(p) : await pasteSolution();
      if (code !== null) judge(p, code);
    } else if (action === 'hint') {
      const hint = hintService.getHint(p, hintLevel + 1);
      if (hint) console.log(`\n${c.yellow(`Hint ${++hintLevel}:`)} ${hint.content}`);
      else console.log(c.dim('\nNo more hints.'));
    } else if (action === 'solution') showSolution(p);
    else if (action === 'show') displayProblem(p);
    else return;
  }
}

function showSolution(p: Problem) {
  const sol = solutionService.getSolution(p);
  console.log(`\n${c.bold('Reference solution')}`);
  console.log(c.cyan(sol.code));
  if (sol.explanation) console.log(`\n${sol.explanation}`);
}

function showStats() {
  const title = (id: string) => problems.find((p) => p.id === id)?.title ?? id;
  const unsolved = stats.attempted.filter((id) => !stats.solved.includes(id));
  console.log(`\n${c.bold('Your stats')}  ${progressBar(stats.solved.length, problems.length)}`);
  console.log(`Submissions: ${stats.submissions}`);
  console.log(
    `Solved (${stats.solved.length}): ${stats.solved.map(title).join(', ') || 'none yet'}`
  );
  console.log(
    `Attempted, not solved (${unsolved.length}): ${unsolved.map(title).join(', ') || 'none'}`
  );
}

async function main() {
  console.log(c.bold(c.cyan('\nDSA Practice CLI')));
  if (loaded.warning) console.log(c.yellow(loaded.warning));

  for (;;) {
    console.log(
      `\n${progressBar(stats.solved.length, problems.length)} ${stats.solved.length} solved / ${stats.attempted.length} attempted of ${problems.length} problems`
    );
    const choice = await select('Main menu', [
      { label: 'Choose & solve a problem', value: 'solve' },
      { label: 'View my stats', value: 'stats' },
      { label: 'Exit', value: 'exit' },
    ]);

    if (choice === 'solve') {
      const p = await chooseProblem();
      if (p) await solveProblem(p);
    } else if (choice === 'stats') {
      showStats();
    } else {
      console.log('Goodbye!');
      break;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
