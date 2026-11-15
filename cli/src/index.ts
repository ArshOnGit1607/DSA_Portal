import * as readline from 'readline';
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
import { loadStats, recordSubmission, saveStats } from './stats';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Same validated problem set the server's in-memory mode uses (core/problems).
const problems: Problem[] = PROBLEMS;
const recentIds: string[] = [];
const MAX_RECENT = 5;
// Persisted to ~/.dsa-practice/stats.json after every submission, so progress survives restarts.
const loaded = loadStats();
let stats = loaded.stats;

const hintService = new HintService();
const solutionService = new SolutionService();

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function listTopics(): string[] {
  return [...new Set(problems.map((p) => p.topic))];
}

function listDifficulties(): string[] {
  return [...new Set(problems.map((p) => p.difficulty))];
}

async function chooseProblem(): Promise<Problem | null> {
  console.log('\n--- Choose a problem ---');
  const topics = listTopics();
  topics.forEach((t, i) => console.log(`${i + 1}. ${t}`));
  const topicIdx = parseInt(await prompt('Select topic (number): '), 10) - 1;
  const topic = topics[topicIdx] as Topic;
  if (!topic) {
    console.log('Invalid topic.');
    return null;
  }

  const difficulties = listDifficulties();
  difficulties.forEach((d, i) => console.log(`${i + 1}. ${d}`));
  const diffIdx = parseInt(await prompt('Select difficulty (number): '), 10) - 1;
  const difficulty = difficulties[diffIdx] as Difficulty;
  if (!difficulty) {
    console.log('Invalid difficulty.');
    return null;
  }

  const problem = selectRandomProblem(problems, {
    topic,
    difficulty,
    recentIds,
  });

  if (!problem) {
    console.log('No problems match that topic/difficulty.');
    return null;
  }

  return problem;
}

function displayProblem(p: Problem) {
  console.log('\n========================================');
  console.log(`${p.title} — ${p.difficulty} — ${p.topic}`);
  console.log('========================================');
  console.log(p.description);
  console.log('\n--- Starter code ---');
  console.log(p.starterCode);
}

async function runSubmission(p: Problem) {
  console.log('\nPaste your JavaScript solution below.');
  console.log("Type 'END' on its own line when finished.");
  const lines: string[] = [];
  for (;;) {
    const line = await prompt('> ');
    if (line === 'END') break;
    lines.push(line);
  }
  const userCode = lines.join('\n');

  const result: ExecutionResult = submitCode({ problem: p, userCode });
  stats = recordSubmission(stats, p.id, result.status === 'passed');
  saveStats(stats);
  const passedCount = result.perTest.filter((r) => r.passed).length;
  if (result.status === 'passed') {
    console.log(`\n✅ All ${passedCount}/${result.perTest.length} test cases passed!`);
  } else if (result.status === 'timeout') {
    console.log(`\n⏱️  Submission timed out (${passedCount}/${result.perTest.length} passed).`);
  } else if (result.status === 'error') {
    console.log(`\n💥 Submission errored (${passedCount}/${result.perTest.length} passed).`);
  } else {
    console.log(`\n❌ ${passedCount}/${result.perTest.length} test cases passed.`);
  }
  result.perTest.forEach((r: ExecutionResult['perTest'][number], i: number) => {
    const status = r.passed ? '✅' : '❌';
    console.log(`${status} Test ${i + 1}: ${r.passed ? 'passed' : 'failed'}`);
    if (!r.passed) {
      console.log(`   expected: ${JSON.stringify(r.expected)}`);
      console.log(`   actual:   ${JSON.stringify(r.actual)}`);
      if (r.error) console.log(`   error: ${r.error}`);
    }
  });

  recentIds.unshift(p.id);
  if (recentIds.length > MAX_RECENT) recentIds.pop();
}

async function showHints(p: Problem) {
  console.log('\n--- Hints ---');
  for (let level = 1; ; level++) {
    const hint = hintService.getHint(p, level);
    if (!hint) break;
    console.log(`Level ${level}: ${hint.content}`);
  }
}

async function showSolution(p: Problem) {
  const sol = solutionService.getSolution(p);
  console.log('\n--- Reference Solution ---');
  console.log(sol.code);
  if (sol.explanation) console.log(`\n${sol.explanation}`);
}

function showStats() {
  const title = (id: string) => problems.find((p) => p.id === id)?.title ?? id;
  const unsolved = stats.attempted.filter((id) => !stats.solved.includes(id));
  console.log('\n--- Your stats ---');
  console.log(`Submissions: ${stats.submissions}`);
  console.log(
    `Solved (${stats.solved.length}): ${stats.solved.map(title).join(', ') || 'none yet'}`
  );
  console.log(
    `Attempted, not solved (${unsolved.length}): ${unsolved.map(title).join(', ') || 'none'}`
  );
}

async function main() {
  console.log('Welcome to DSA Practice CLI');
  if (loaded.warning) console.log(loaded.warning);

  for (;;) {
    console.log(
      `\nStats: ${stats.solved.length} solved / ${stats.attempted.length} attempted of ${problems.length} problems`
    );
    console.log('1. Choose & solve a problem');
    console.log('2. View my stats');
    console.log('3. Exit');
    const choice = await prompt('Select an option: ');

    if (choice === '1') {
      const p = await chooseProblem();
      if (p) {
        displayProblem(p);
        const action = await prompt('\n(s)ubmit code, (h)ints, (l) solution, (b)ack: ');
        if (action === 's') await runSubmission(p);
        else if (action === 'h') await showHints(p);
        else if (action === 'l') await showSolution(p);
        else if (action === 'b') {
          // back to main menu
        }
      }
    } else if (choice === '2') {
      showStats();
    } else if (choice === '3') {
      console.log('Goodbye!');
      break;
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
